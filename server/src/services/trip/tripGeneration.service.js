const Trip = require('../../models/Trip');
const Hotel = require('../../models/Hotel');
const POI = require('../../models/POI');
const Restaurant = require('../../models/Restaurant');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');
const mongoose = require('mongoose');

const { geocodeAddress, cityFallbackCoords } = require('../maps/geocoding.service');
const { getRoute } = require('../maps/routing.service');
const { haversineDistanceKm } = require('../../utils/haversine');
const { GOOGLE_MAPS_ROUTABLE_MODES } = require('../../constants/transport');

const { recommendPOIs } = require('../recommendation/poiRecommendation.service');
const { recommendHotels } = require('../recommendation/hotelRecommendation.service');
const { recommendRestaurants } = require('../recommendation/restaurantRecommendation.service');
const { poiCoverageTarget } = require('../recommendation/candidate.service');
const { canonicalizeCityName } = require('../recommendation/candidate.service');
const { backfillCandidates, needsBackfill } = require('../recommendation/webSearchEnrichment.service');

const { buildPreTripPrompt, buildTransportPrompt, buildItineraryPrompt } = require('../ai/geminiPrompts');
const { generateValidatedJson } = require('../ai/gemini.service');
const { validatePreTrip, validateTransport, validateItinerary } = require('../ai/geminiValidator');
const { buildDeterministicItinerary } = require('../itinerary/itineraryOptimizer.service');
const { planItineraryRoutes } = require('../itinerary/routePlanner.service');
const { getGeoapifyPlaceDetails } = require('../maps/geoapify.service');
const { getWeatherForecast } = require('../weather/openMeteo.service');
const { optimizeItineraryForTrip } = require('../engine/v2Optimizer.service');

const INTERCITY_MODES = ['flight', 'train', 'bus', 'car'];

/**
 * Runs the full generation pipeline described in spec sections 13 and 45,
 * end to end, and persists the result onto the given draft trip. The trip
 * document's `status` field tracks progress so the frontend's loading
 * experience (spec section 40) can poll /api/trips/:id while this runs.
 *
 * Never throws for a Gemini failure - always falls back to deterministic
 * output per spec section 47, so the trip always ends up `generated` unless
 * something in the core pipeline (DB, validation) itself is broken.
 */
async function generateTrip(tripId, userId) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw ApiError.notFound('Trip not found.');
  if (String(trip.userId) !== String(userId)) throw ApiError.forbidden('You do not have access to this trip.');

  trip.status = 'generating';
  await trip.save();

  try {
    // 0. Geocode the destination (best-effort; provider chain uses LocationIQ first).
    const destinationCoords = await geocodeAddress(`${trip.destination}, India`)
      || cityFallbackCoords(trip.destination);
    if (destinationCoords) {
      trip.destinationLocation = { lat: destinationCoords.lat, lng: destinationCoords.lng };
    }

    // 2-4. Candidate retrieval: POIs, hotels, restaurants (dataset-filtered + ranked, capped sets only).
    const snapshot = trip.discoveredCandidates || null;
    const rawHotels = snapshot?.stays?.length ? snapshot.stays : await recommendHotels(trip);
    const selectedHotel = rawHotels.find((hotel) => String(hotel.id) === String(trip.selectedHotelId)) || rawHotels[0];
    const accommodationPoint = selectedHotel?.latitude != null
      ? { lat: selectedHotel.latitude, lng: selectedHotel.longitude }
      : destinationCoords;
    let [rawPois, rawRestaurants] = snapshot?.places?.length || snapshot?.restaurants?.length
      ? [snapshot?.places || [], snapshot?.restaurants || []]
      : await Promise.all([
        recommendPOIs(trip, destinationCoords, accommodationPoint),
        recommendRestaurants(trip),
      ]);
    const { targetPOIs } = poiCoverageTarget(trip);
    const mealsRequired = Math.max(1, trip.numberOfDays) * 3;
    if (needsBackfill({
      availablePOIs: rawPois.length,
      targetPOIs,
      availableRestaurants: rawRestaurants.length,
      requiredRestaurants: mealsRequired,
    })) {
      const enriched = await backfillCandidates(trip, {
        poiCount: Math.max(0, targetPOIs - rawPois.length),
        restaurantCount: Math.max(0, mealsRequired - rawRestaurants.length),
      });
      rawPois = [...rawPois, ...enriched.pois];
      rawRestaurants = [...rawRestaurants, ...enriched.restaurants];
    }
    if (trip.selectedHotelId && !rawHotels.some((hotel) => String(hotel.id) === String(trip.selectedHotelId))) {
      const selectedHotel = await Hotel.findById(trip.selectedHotelId).lean();
      if (selectedHotel) {
        rawHotels.unshift({
          id: String(selectedHotel._id),
          name: selectedHotel.name,
          googleRating: selectedHotel.googleRating,
          pricePerNightInr: selectedHotel.pricePerNightInr,
          conditionLabel: selectedHotel.conditionLabel,
          amenities: selectedHotel.amenities,
          description: selectedHotel.description,
          latitude: selectedHotel.location?.coordinates?.[1] ?? null,
          longitude: selectedHotel.location?.coordinates?.[0] ?? null,
          label: 'Selected accommodation',
          source: selectedHotel.source || 'dataset',
        });
      }
    }
    // Candidate coordinates are a hard destination boundary. A bad geocoder or
    // broad backfill must never turn a city itinerary into an intercity tour.
    const destinationPois = filterCandidatesToDestination(rawPois, destinationCoords, trip.destination);
    const destinationHotels = filterCandidatesToDestination(rawHotels, destinationCoords, trip.destination);
    const destinationRestaurants = filterCandidatesToDestination(rawRestaurants, destinationCoords, trip.destination);
    const pois = filterCandidatesToTripAvailability(destinationPois, trip, [11 * 60, 9 * 60, 14 * 60]);
    const hotels = destinationHotels;
    const restaurants = filterCandidatesToTripAvailability(destinationRestaurants, trip, [8 * 60, 12 * 60 + 30, 19 * 60 + 30]);

    const selectedCandidates = await loadSelectedCandidates(trip.selectedPlaces, { pois, hotels, restaurants });
    filterCandidatesToDestination(selectedCandidates.pois, destinationCoords, trip.destination).forEach((candidate) => {
      if (!pois.some((item) => item.id === candidate.id)) pois.unshift(candidate);
    });
    filterCandidatesToDestination(selectedCandidates.restaurants, destinationCoords, trip.destination).forEach((candidate) => {
      if (!restaurants.some((item) => item.id === candidate.id)) restaurants.unshift(candidate);
    });

    if (hotels.length) {
      const h = hotels.find((hotel) => String(hotel.id) === String(trip.selectedHotelId)) || hotels[0];
      trip.recommendedHotel = {
        hotelId: h.source === 'dataset' ? h.id : null,
        label: 'Recommended accommodation',
        name: h.name,
        googleRating: h.googleRating ?? null,
        pricePerNightInr: h.pricePerNightInr ?? null,
        conditionLabel: h.conditionLabel ?? null,
        latitude: h.latitude ?? null,
        longitude: h.longitude ?? null,
      };
    }

    // 5. Pre-trip generation (packing/weather/tips) - Gemini with deterministic fallback.
    trip.preTrip = await generatePreTripSection(trip);

    // 6. Transport recommendations - Gemini estimate + Geoapify road distance for car/bike.
    const transportResult = await generateTransportSection(trip);
    trip.transport = transportResult.transport;
    trip.intercityTransport = transportResult.intercityTransport;
    trip.intracityTransport = transportResult.intracityTransport;

    trip.overview = buildTripOverview(trip, trip.recommendedHotel?.name || hotels[0]?.name || null);
    trip.budgetSummary = buildBudgetSummary(trip, hotels, trip.intercityTransport, trip.intracityTransport);

    // 7. Itinerary - Gemini reasoning over the ranked candidates, validated, with deterministic fallback.
    const rawItinerary = await generateItinerarySection(trip, { pois, hotels, restaurants });

    // 8. Prepend Day 1 travel leg (origin -> destination arrival + 1hr buffer)
    trip.itinerary = await prependTravelLeg(trip, rawItinerary);
    trip.itinerary = await anchorDaysToAccommodation(trip, trip.itinerary);

    trip.status = 'generated';
    trip.generationError = null;
    await trip.save();
    return trip;
  } catch (err) {
    logger.error(`Trip generation failed for trip ${tripId}`, err);
    trip.status = 'failed';
    trip.generationError = err.message || 'Unknown error during generation.';
    await trip.save();
    throw ApiError.internal('Trip generation failed. The trip has been saved in a failed state - you can retry.');
  }
}

async function generatePreTripSection(trip) {
  const weather = await getWeatherForecast({
    latitude: trip.destinationLocation?.lat,
    longitude: trip.destinationLocation?.lng,
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  const prompt = buildPreTripPrompt({ ...serializeTripForPrompt(trip), weatherContext: weather });
  const result = await generateValidatedJson(prompt, validatePreTrip);

  if (result.ok) {
    return { ...result.data, generatedBy: result.provider || 'gemini', isAiEstimate: true };
  }

  logger.warn(`Pre-trip AI generation failed for trip ${trip._id}, using fallback`, result.errors);
  return buildPreTripFallback(weather);
}

function buildPreTripFallback(weather = null) {
  const days = weather?.days || [];
  const maxTemps = days.map((day) => day.maxC).filter(Number.isFinite);
  const minTemps = days.map((day) => day.minC).filter(Number.isFinite);
  const maxRainChance = Math.max(0, ...days.map((day) => day.rainChance).filter(Number.isFinite));
  const maxUv = Math.max(0, ...days.map((day) => day.uv).filter(Number.isFinite));
  const maxTemp = maxTemps.length ? Math.max(...maxTemps) : null;
  const minTemp = minTemps.length ? Math.min(...minTemps) : null;
  const clothing = ['Comfortable walking shoes', 'Weather-appropriate clothing'];
  const destinationSpecific = ['Reusable water bottle'];
  const travelTips = [
    'Keep digital and physical copies of your ID.',
    'Carry some cash alongside digital payments.',
  ];

  if (maxTemp >= 30) {
    clothing.push('Breathable cotton layers');
    destinationSpecific.push('Sunscreen', 'Wide-brim hat');
    travelTips.push('Stay hydrated and take breaks from direct sun.');
  }
  if (minTemp != null && minTemp <= 18) clothing.push('Light jacket or warm layer');
  if (maxRainChance >= 40) {
    clothing.push('Quick-dry clothes');
    destinationSpecific.push('Compact umbrella or rain jacket', 'Water-resistant footwear');
    travelTips.push('Keep electronics and spare clothes in a waterproof bag.');
  }
  if (maxUv >= 6 && !destinationSpecific.includes('Sunscreen')) {
    destinationSpecific.push('Sunscreen', 'Sunglasses');
  }

  return {
    packingChecklist: {
      essentials: ['ID proof', 'Phone charger', 'Power bank', 'Basic medicines', 'Face masks'],
      clothing,
      destinationSpecific,
    },
    weatherAdvice: weather?.summary
      ? `${weather.summary}. Use this as planning guidance and check the forecast again closer to departure.`
      : 'Weather guidance is unavailable right now - check a forecast closer to your travel date.',
    travelTips,
    generatedBy: 'fallback',
    isAiEstimate: true,
  };
}

async function generateTransportSection(trip) {
  let options = [];

  const prompt = buildTransportPrompt(serializeTripForPrompt(trip));
  const result = await generateValidatedJson(prompt, validateTransport);

  if (result.ok) {
    options = result.data.options.map((o) => ({ ...o, source: 'gemini' }));
  } else {
    logger.warn(`Transport AI generation failed for trip ${trip._id}, using fallback`, result.errors);
    const selectedMode = trip.selectedTransportMode || (trip.transportPreference === 'any' ? 'train' : trip.transportPreference);
    options = [{
      mode: selectedMode,
      summary: `${selectedMode[0].toUpperCase()}${selectedMode.slice(1)} is the selected intercity option. Check the operator for current schedules and fares.`,
      approxDurationHrs: null,
      approxPriceInr: null,
      isLiveAvailability: false,
      source: 'gemini',
    }];
  }

  if (trip.selectedTransportMode) {
    options.sort((a, b) => Number(b.mode === trip.selectedTransportMode) - Number(a.mode === trip.selectedTransportMode));
  }

  // For car/bike, layer in real road distance from Geoapify where possible.
  const selectedRoadMode = trip.selectedTransportMode || trip.transportPreference;
  const wantsRoadDistance = Boolean(selectedRoadMode) && GOOGLE_MAPS_ROUTABLE_MODES.includes(selectedRoadMode);
  if (wantsRoadDistance) {
    const originCoords = await geocodeAddress(`${trip.origin}, India`);
    const destCoords = trip.destinationLocation?.lat ? trip.destinationLocation : await geocodeAddress(`${trip.destination}, India`);
    if (originCoords && destCoords) {
      const route = await getRoute(originCoords, destCoords, 'driving');
      if (route) {
        options = options.map((o) =>
          GOOGLE_MAPS_ROUTABLE_MODES.includes(o.mode)
            ? { ...o, distanceKm: route.distanceKm, approxDurationHrs: route.durationMinutes / 60, source: 'geoapify' }
            : o
        );
      }
    }
  }

  const intercityTransport = ensureIntercityTransportOptions(trip, options);
  const intracityTransport = [
    {
      mode: 'bus',
      summary: 'Local bus is the lowest-cost option for movement between accommodation and nearby stops.',
      approxDurationHrs: 1.5,
      approxPriceInr: Math.max(150, (trip.budget || 25000) * 0.01),
      isLiveAvailability: false,
      source: 'gemini',
    },
    {
      mode: 'car',
      summary: 'Cab or local hire for short hops between neighbourhoods.',
      approxDurationHrs: 1,
      approxPriceInr: Math.max(300, (trip.budget || 25000) * 0.015),
      isLiveAvailability: false,
      source: 'gemini',
    },
  ];

  return {
    transport: options,
    intercityTransport,
    intracityTransport,
  };
}

function ensureIntercityTransportOptions(trip, options = []) {
  const intercityOptions = options.filter((option) => INTERCITY_MODES.includes(option.mode));
  const selectedMode = INTERCITY_MODES.includes(trip.selectedTransportMode)
    ? trip.selectedTransportMode
    : 'train';

  const summaries = {
    flight: 'Flight is the fastest intercity option when an airport route is available. Check the operator for current schedules and fares.',
    train: 'Train is a practical intercity option with an estimated fare. Check the operator for current schedules and fares.',
    bus: 'Bus is a lower-cost intercity option. Check the operator for current schedules and fares.',
    car: 'Car is a flexible intercity option. Check the operator for current schedules and fares.',
  };
  const existingModes = new Set(intercityOptions.map((option) => option.mode));

  for (const mode of INTERCITY_MODES) {
    if (!existingModes.has(mode)) {
      intercityOptions.push({
        mode,
        summary: summaries[mode],
        approxDurationHrs: null,
        approxPriceInr: estimateIntercityPrice(trip, mode),
        isLiveAvailability: false,
        source: 'gemini',
      });
    }
  }

  intercityOptions.sort((a, b) => Number(b.mode === selectedMode) - Number(a.mode === selectedMode));

  return intercityOptions.map((option) => ({
    ...option,
    approxPriceInr: Number.isFinite(option.approxPriceInr) && option.approxPriceInr > 0
      ? option.approxPriceInr
      : estimateIntercityPrice(trip, option.mode),
  }));
}

function estimateIntercityPrice(trip, mode) {
  const budget = Number(trip.budget) || 25000;
  const rates = { flight: 0.35, train: 0.12, bus: 0.08, car: 0.18 };
  return Math.max(mode === 'flight' ? 1500 : 450, Math.round(budget * (rates[mode] || rates.train)));
}

async function generateItinerarySection(trip, { pois, hotels, restaurants }) {
  const engineMode = (process.env.VALIDATION_ENGINE || process.env.ITINERARY_ENGINE || 'legacy').toLowerCase();

  if (engineMode === 'v2') {
    try {
      const optimizedDays = await optimizeItineraryForTrip(trip, { pois, hotels, restaurants });
      if (optimizedDays?.length) {
        logger.info(`Using v2 itinerary optimizer for trip ${trip._id}`);
        return planItineraryRoutes(optimizedDays, { accommodation: accommodationPoint(trip), reorder: true });
      }
    } catch (err) {
      logger.warn(`v2 itinerary optimizer failed for trip ${trip._id}; falling back to legacy`, err.message);
    }
  }

  if (engineMode === 'shadow') {
    try {
      const optimizedDays = await optimizeItineraryForTrip(trip, { pois, hotels, restaurants });
      logger.info(`Shadow v2 itinerary generated for trip ${trip._id}`, { dayCount: optimizedDays?.length || 0 });
    } catch (err) {
      logger.warn(`Shadow v2 itinerary optimizer failed for trip ${trip._id}`, err.message);
    }
  }

  const candidateIds = new Set(
    [...pois, ...hotels, ...restaurants].map((c) => c.id)
  );

  const prompt = buildItineraryPrompt({
    trip: serializeTripForPrompt(trip),
    candidatePOIs: pois,
    candidateHotels: hotels,
    candidateRestaurants: restaurants,
    mandatoryPlaces: trip.selectedPlaces || [],
    weatherContext: trip.preTrip?.weatherAdvice || null,
  });

  const result = await generateValidatedJson(prompt, (json) => validateItinerary(json, { trip, candidateIds }), { maxRetries: 1 });

  if (result.ok) {
    const days = await mapGeminiItineraryToTripDays(result.data, {
      pois, hotels, restaurants, destination: trip.destination, destinationCoords: trip.destinationLocation,
    });
    return planItineraryRoutes(dedupeItineraryDays(days), { accommodation: accommodationPoint(trip) });
  }

  logger.warn(`Itinerary AI generation failed for trip ${trip._id}, using deterministic fallback`, result.errors);
  const deterministicDays = dedupeItineraryDays(buildDeterministicItinerary(trip, { pois, hotels, restaurants }));
  await geocodeMissingActivityCoords(deterministicDays, trip.destination, trip.destinationLocation);
    return planItineraryRoutes(deterministicDays, { accommodation: accommodationPoint(trip) });
}

/** Converts Gemini's validated day/activity shape into the Trip model's day schema, resolving refIds and coordinates. */
async function mapGeminiItineraryToTripDays(itineraryData, { pois, hotels, restaurants, destination, destinationCoords }) {
  const poiById = new Map(pois.map((p) => [p.id, p]));
  const hotelById = new Map(hotels.map((h) => [h.id, h]));
  const restaurantById = new Map(restaurants.map((r) => [r.id, r]));

  // Build days with whatever coords we already have from the dataset
  const days = [];
  for (const day of itineraryData.days) {
    const activities = [];
    for (const activity of day.activities) {
      const dataset = activity.type === 'poi'
        ? poiById.get(String(activity.datasetId))
        : activity.type === 'hotel'
          ? hotelById.get(String(activity.datasetId))
          : restaurantById.get(String(activity.datasetId));

      let details = null;
      if (activity.type === 'poi' && dataset?.sourceRef && dataset.sourceProvider === 'geoapify') {
        // eslint-disable-next-line no-await-in-loop
        details = await getGeoapifyPlaceDetails(dataset.sourceRef);
      }

      activities.push({
        type: activity.type,
        refId: activity.source === 'dataset' && dataset ? dataset.id : null,
        name: activity.name,
        startTime: activity.startTime || null,
        duration: activity.duration || null,
        notes: activity.notes || null,
        description: details?.description ?? dataset?.description ?? null,
        category: dataset?.category ?? dataset?.poiType ?? (activity.type === 'restaurant' ? 'restaurant' : activity.type),
        poiType: dataset?.poiType ?? null,
        website: details?.website ?? dataset?.website ?? null,
        phone: details?.phone ?? dataset?.phone ?? null,
        imageUrl: details?.imageUrl ?? dataset?.imageUrl ?? null,
        sourceRef: details?.sourceRef ?? dataset?.sourceRef ?? null,
        location: {
          lat: dataset?.latitude ?? null,
          lng: dataset?.longitude ?? null,
        },
        openingTime: dataset?.openingTime ?? null,
        closingTime: dataset?.closingTime ?? null,
        weeklyOff: dataset?.weeklyOff ?? null,
        source: activity.source,
      });
    }

    days.push({
      day: day.day,
      date: day.date,
      summary: day.summary || null,
      weatherContext: day.weatherContext || null,
      activities,
    });
  }

  // Geocode any mappable activity that still has null coords
  await geocodeMissingActivityCoords(days, destination, destinationCoords);

  return days;
}

/**
 * For every poi/restaurant/hotel activity that has no coordinates yet,
 * attempt to geocode "<name>, <destination>" via the geocoding chain
 * (Geoapify → LocationIQ → static city fallback). Mutates in place.
 * Runs sequentially to stay within API rate limits.
 */
async function geocodeMissingActivityCoords(days, destination, destinationCoords = null) {
  const MAPPABLE = ['poi', 'restaurant', 'hotel'];
  for (const day of days) {
    for (const activity of day.activities) {
      if (!MAPPABLE.includes(activity.type)) continue;
      const existing = typeof activity.location.lat === 'number' && typeof activity.location.lng === 'number'
        ? activity.location
        : null;
      if (existing) continue;
      // eslint-disable-next-line no-await-in-loop
      const coords = await geocodeAddress(`${activity.name}, ${destination}, India`);
      if (coords) {
        activity.location = { lat: coords.lat, lng: coords.lng };
      } else {
        activity.location = { lat: null, lng: null };
      }
    }
  }
}

function itineraryActivityKey(activity) {
  return String(activity.refId || activity.sourceRef || activity.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeItineraryDays(days = []) {
  const seen = new Set();
  return days.map((day) => ({
    ...day,
    activities: (day.activities || []).filter((activity) => {
      if (!['poi', 'restaurant'].includes(activity.type)) return true;
      const key = itineraryActivityKey(activity);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  }));
}

function buildTripOverview(trip, hotelName = null) {
  const placeTheme = trip.placePreferences?.length ? trip.placePreferences.slice(0, 3).join(', ') : 'local discovery';
  const foodTheme = trip.foodPreferences?.length ? trip.foodPreferences.slice(0, 2).join(', ') : 'local food';
  const stayLabel = hotelName ? ` based around ${hotelName}` : '';
  return `${trip.destination} is a ${placeTheme.toLowerCase()} trip${stayLabel}, with ${foodTheme.toLowerCase()} woven through the days. The plan balances relaxed sightseeing, practical local movement, and a realistic daily cost around your ${trip.travelStyle || 'moderate'} travel style.`;
}

function buildBudgetSummary(trip, hotels, intercityOptions = [], intracityOptions = []) {
  const legacyTransportShape = !intracityOptions.length && intercityOptions.some((option) => ['bus', 'bike', 'car'].includes(option.mode));
  if (legacyTransportShape) {
    intracityOptions = intercityOptions.filter((option) => ['bus', 'bike', 'car'].includes(option.mode));
    intercityOptions = intercityOptions.filter((option) => ['flight', 'train'].includes(option.mode));
  }
  const selectedHotel = hotels?.find((hotel) => String(hotel.id) === String(trip.selectedHotelId));
  const accommodation = selectedHotel?.pricePerNightInr ?? trip.recommendedHotel?.pricePerNightInr ?? hotels?.[0]?.pricePerNightInr ?? null;
  const accommodationInr = accommodation && trip.numberOfDays ? accommodation * trip.numberOfDays : null;
  const selectedIntercity = intercityOptions.find((option) => option.mode === trip.selectedTransportMode) || intercityOptions[0];
  const intercityInr = selectedIntercity?.approxPriceInr || 0;
  const localOption = intracityOptions.find((option) => option.mode === 'bus') || intracityOptions[0];
  const intracityInr = localOption?.approxPriceInr
    ? localOption.approxPriceInr * (legacyTransportShape ? 1 : Math.max(1, trip.numberOfDays || 1))
    : 0;
  const foodInr = trip.budget ? Math.max(0, Math.round((trip.budget || 0) * 0.2)) : null;
  const totalEstimatedInr = [accommodationInr, intercityInr, intracityInr, foodInr].filter((value) => typeof value === 'number').reduce((sum, value) => sum + value, 0);
  return {
    accommodationInr,
    intercityInr: intercityInr || null,
    intracityInr: intracityInr || null,
    foodInr: foodInr || null,
    totalEstimatedInr: totalEstimatedInr || null,
    perDayInr: totalEstimatedInr && trip.numberOfDays ? Math.round(totalEstimatedInr / trip.numberOfDays) : null,
  };
}

async function anchorDaysToAccommodation(trip, days) {
  if (!days?.length || !trip.destinationLocation) return days;
  const base = accommodationPoint(trip) || trip.destinationLocation;

  for (const day of days) {
    const mappedActivities = day.activities || [];
    const firstPlace = mappedActivities.find((activity) => ['poi', 'restaurant', 'hotel'].includes(activity.type));
    const lastPlace = [...mappedActivities].reverse().find((activity) => ['poi', 'restaurant', 'hotel'].includes(activity.type));

    if (firstPlace && firstPlace.location?.lat != null && firstPlace.location?.lng != null) {
      // eslint-disable-next-line no-await-in-loop
      const routeToFirst = await getRoute(base, firstPlace.location, [], 'driving');
      day.activities = [{
        type: 'travel',
        refId: null,
        name: 'Stay base → first stop',
        startTime: '09:00',
        endTime: addMinutesToTime(firstPlace.startTime, -(routeToFirst?.durationMinutes || 20)),
        duration: routeToFirst?.durationMinutes || 20,
        notes: routeToFirst?.distanceKm != null ? `${routeToFirst.distanceKm.toFixed(1)} km` : 'Travel',
        location: { lat: base.lat, lng: base.lng },
        source: 'gemini',
      }, ...day.activities];
    }

    if (lastPlace && lastPlace.location?.lat != null && lastPlace.location?.lng != null) {
      // eslint-disable-next-line no-await-in-loop
      const routeHome = await getRoute(lastPlace.location, base, [], 'driving');
      day.activities = [...day.activities, {
        type: 'travel',
        refId: null,
        name: 'Return to accommodation',
        startTime: '21:00',
        endTime: addMinutesToTime('21:00', routeHome?.durationMinutes || 20),
        duration: routeHome?.durationMinutes || 20,
        notes: routeHome?.distanceKm != null ? `${routeHome.distanceKm.toFixed(1)} km` : 'Travel',
        location: { lat: base.lat, lng: base.lng },
        source: 'gemini',
      }];
    }
  }

  return days;
}

function accommodationPoint(trip) {
  if (typeof trip.recommendedHotel?.latitude === 'number' && typeof trip.recommendedHotel?.longitude === 'number') {
    return { lat: trip.recommendedHotel.latitude, lng: trip.recommendedHotel.longitude };
  }
  return trip.destinationLocation || null;
}

function addMinutesToTime(time, minutes) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [hours, mins] = time.split(':').map(Number);
  const total = Math.max(0, hours * 60 + mins + minutes);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function loadSelectedCandidates(selectedPlaces = [], { pois, hotels, restaurants }) {
  const selected = Array.isArray(selectedPlaces) ? selectedPlaces : [];
  const missingPois = selected.filter((place) => place.type === 'poi' && !pois.some((candidate) => candidate.id === String(place.refId)));
  const missingRestaurants = selected.filter((place) => place.type === 'restaurant' && !restaurants.some((candidate) => candidate.id === String(place.refId)));
  const missingPoiIds = missingPois
    .map((place) => String(place.refId))
    .filter((refId) => mongoose.isValidObjectId(refId));
  const missingRestaurantIds = missingRestaurants
    .map((place) => String(place.refId))
    .filter((refId) => mongoose.isValidObjectId(refId));
  const [poiDocs, restaurantDocs] = await Promise.all([
    missingPoiIds.length ? POI.find({ _id: { $in: missingPoiIds } }).lean() : [],
    missingRestaurantIds.length ? Restaurant.find({ _id: { $in: missingRestaurantIds } }).lean() : [],
  ]);

  const selectedPoiCandidates = poiDocs.map((poi) => ({
    id: String(poi._id), name: poi.name, city: poi.city, category: poi.category, poiType: poi.poiType,
    significance: poi.significance, characteristics: poi.characteristics, tags: poi.tags,
    googleRating: poi.googleRating, visitDurationHrs: poi.visitDurationHrs,
    latitude: poi.latitude, longitude: poi.longitude, openingTime: poi.openingTime,
    closingTime: poi.closingTime, weeklyOff: poi.weeklyOff, description: poi.description,
    source: 'dataset',
  }));
  const selectedRestaurantCandidates = restaurantDocs.map((restaurant) => ({
    id: String(restaurant._id), name: restaurant.name, city: restaurant.city, cuisine: restaurant.cuisine,
    rating: restaurant.rating, avgPriceForTwo: restaurant.avgPriceForTwo,
    latitude: restaurant.latitude ?? restaurant.location?.coordinates?.[1] ?? null,
    longitude: restaurant.longitude ?? restaurant.location?.coordinates?.[0] ?? null,
    openingTime: restaurant.openingTime, closingTime: restaurant.closingTime, source: 'dataset',
  }));
  return {
    pois: [...selected.filter((place) => place.type === 'poi').map((place) => pois.find((candidate) => candidate.id === String(place.refId))).filter(Boolean), ...selectedPoiCandidates],
    hotels: selected.filter((place) => place.type === 'hotel').map((place) => hotels.find((candidate) => candidate.id === String(place.refId))).filter(Boolean),
    restaurants: [...selected.filter((place) => place.type === 'restaurant').map((place) => restaurants.find((candidate) => candidate.id === String(place.refId))).filter(Boolean), ...selectedRestaurantCandidates],
  };
}

function filterCandidatesToDestination(candidates, destinationCoords, destination) {
  if (!destinationCoords || typeof destinationCoords.lat !== 'number' || typeof destinationCoords.lng !== 'number') return candidates;
  const MAX_DESTINATION_RADIUS_KM = 120;
  const destinationCity = canonicalizeCityName(destination) || null;
  return candidates.filter((candidate) => {
    if (candidate.city && destinationCity && canonicalizeCityName(candidate.city) !== destinationCity) return false;
    const latitude = Number(candidate.latitude);
    const longitude = Number(candidate.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    return haversineDistanceKm(destinationCoords, { lat: latitude, lng: longitude }) <= MAX_DESTINATION_RADIUS_KM;
  });
}

function filterCandidatesToTripAvailability(candidates, trip, candidateStartTimes) {
  return candidates.filter((candidate) => {
    const duration = candidate.visitDurationHrs ? Math.round(candidate.visitDurationHrs * 60) : 60;
    return Array.from({ length: Math.max(1, trip.numberOfDays) }, (_, dayIndex) => {
      const date = new Date(trip.startDate);
      date.setDate(date.getDate() + dayIndex);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      if (candidate.weeklyOff?.toLowerCase().includes(dayName.toLowerCase())) return false;
      return candidateStartTimes.some((start) => {
        const parse = (value) => {
          if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
          const [hours, minutes] = value.split(':').map(Number);
          return hours * 60 + minutes;
        };
        const opening = parse(candidate.openingTime);
        const closing = parse(candidate.closingTime);
        return (opening == null || start >= opening) && (closing == null || start + duration <= closing);
      });
    }).some(Boolean);
  });
}

/** Plain-object view of the fields prompts/scoring actually need, decoupled from the Mongoose document. */
function serializeTripForPrompt(trip) {
  return {
    destination: trip.destination,
    origin: trip.origin,
    startDate: trip.startDate.toISOString().slice(0, 10),
    endDate: trip.endDate.toISOString().slice(0, 10),
    numberOfDays: trip.numberOfDays,
    travellers: trip.travellers,
    tripType: trip.tripType,
    travelStyle: trip.travelStyle,
    pace: trip.pace,
    budget: trip.budget,
    placePreferences: trip.placePreferences,
    foodPreferences: trip.foodPreferences,
    accommodationPreference: trip.accommodationPreference,
    dailyTravelToleranceKm: trip.dailyTravelToleranceKm,
    transportPreference: trip.transportPreference,
  };
}

/**
 * Builds the Day 1 travel activity: origin -> destination journey.
 * Estimates arrival time from transport options, adds 1hr check-in buffer,
 * then shifts all Day 1 activities to start after the buffer.
 */
async function prependTravelLeg(trip, itinerary) {
  if (!itinerary.length) return itinerary;

  // Estimate travel duration from transport section
  const transportOption = (trip.transport || []).find((t) => t.approxDurationHrs != null);
  const travelHrs = transportOption?.approxDurationHrs ?? estimateTravelHrs(trip.origin, trip.destination);
  const departureMinutes = 6 * 60; // assume 06:00 departure
  const arrivalMinutes = departureMinutes + Math.round(travelHrs * 60);
  const bufferMinutes = 60; // 1hr check-in/settle buffer
  const firstActivityStart = arrivalMinutes + bufferMinutes;

  // Shift all Day 1 activities to start after arrival + buffer
  const day1 = itinerary[0];
  const originalFirstStart = timeToMinutes(day1.activities[0]?.startTime) ?? 9 * 60;
  const shift = Math.max(0, firstActivityStart - originalFirstStart);

  if (shift > 0) {
    day1.activities = day1.activities.map((a) => ({
      ...a,
      startTime: a.startTime ? minutesToTime(timeToMinutes(a.startTime) + shift) : a.startTime,
    }));
  }

  // Prepend travel activity to Day 1
  const originCoords = await geocodeAddress(`${trip.origin}, India`) || cityFallbackCoords(trip.origin);
  const travelActivity = {
    type: 'travel',
    refId: null,
    name: `${trip.origin} → ${trip.destination}`,
    startTime: minutesToTime(departureMinutes),
    duration: Math.round(travelHrs * 60),
    notes: `Approx. ${travelHrs.toFixed(1)} hrs travel. Arrive ~${minutesToTime(arrivalMinutes)}. Allow 1 hr to check in and settle.`,
    location: originCoords ? { lat: originCoords.lat, lng: originCoords.lng } : { lat: null, lng: null },
    source: 'gemini',
  };

  day1.activities = [travelActivity, ...day1.activities];
  return itinerary;
}

/**
 * Rough travel time estimate using haversine distance when no transport
 * option with a duration is available. Assumes ~60 km/h average.
 */
function estimateTravelHrs(origin, destination) {
  const originCoords = cityFallbackCoords(origin);
  const destCoords = cityFallbackCoords(destination);
  if (!originCoords || !destCoords) return 3; // safe default
  const km = haversineDistanceKm(originCoords, destCoords);
  return Math.max(0.5, km / 60);
}

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

module.exports = {
  generateTrip,
  buildTripOverview,
  buildBudgetSummary,
  anchorDaysToAccommodation,
  ensureIntercityTransportOptions,
  buildPreTripFallback,
};