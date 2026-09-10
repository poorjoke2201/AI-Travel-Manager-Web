const Trip = require('../../models/Trip');
const Hotel = require('../../models/Hotel');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');

const { geocodeAddress, cityFallbackCoords } = require('../maps/geocoding.service');
const { getRoute } = require('../maps/routing.service');
const { haversineDistanceKm } = require('../../utils/haversine');
const { GOOGLE_MAPS_ROUTABLE_MODES } = require('../../constants/transport');

const { recommendPOIs } = require('../recommendation/poiRecommendation.service');
const { recommendHotels } = require('../recommendation/hotelRecommendation.service');
const { recommendRestaurants } = require('../recommendation/restaurantRecommendation.service');

const { buildPreTripPrompt, buildTransportPrompt, buildItineraryPrompt } = require('../ai/geminiPrompts');
const { generateValidatedJson } = require('../ai/gemini.service');
const { validatePreTrip, validateTransport, validateItinerary } = require('../ai/geminiValidator');
const { buildDeterministicItinerary } = require('../itinerary/itineraryOptimizer.service');
const { planItineraryRoutes } = require('../itinerary/routePlanner.service');
const { enrichCityDataIfNeeded } = require('../scraper/cityData.service');
const { getGeoapifyPlaceDetails } = require('../maps/geoapify.service');

const MAX_DESTINATION_DISTANCE_KM = 100;

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
    // 0. Enrich destination data from OSM if the city has too few POIs
    await enrichCityDataIfNeeded(trip.destination);

    // 1. Geocode the destination (best-effort; itinerary/clustering still works without it).
    const destinationCoords = await geocodeAddress(`${trip.destination}, India`)
      || cityFallbackCoords(trip.destination);
    if (destinationCoords) {
      trip.destinationLocation = { lat: destinationCoords.lat, lng: destinationCoords.lng };
    }

    // 2-4. Candidate retrieval: POIs, hotels, restaurants (dataset-filtered + ranked, capped sets only).
    const [rawPois, rawHotels, rawRestaurants] = await Promise.all([
      recommendPOIs(trip, destinationCoords),
      recommendHotels(trip),
      recommendRestaurants(trip),
    ]);
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
    const pois = filterCandidatesToDestination(rawPois, destinationCoords);
    const hotels = filterCandidatesToDestination(rawHotels, destinationCoords);
    const restaurants = filterCandidatesToDestination(rawRestaurants, destinationCoords);

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

    // 6. Transport recommendations - Gemini estimate + Google Maps road distance for car/bike.
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
  const prompt = buildPreTripPrompt(serializeTripForPrompt(trip));
  const result = await generateValidatedJson(prompt, validatePreTrip);

  if (result.ok) {
    return { ...result.data, generatedBy: result.provider || 'gemini', isAiEstimate: true };
  }

  logger.warn(`Pre-trip AI generation failed for trip ${trip._id}, using fallback`, result.errors);
  return {
    packingChecklist: {
      essentials: ['ID proof', 'Phone charger', 'Power bank', 'Basic medicines', 'Face masks'],
      clothing: ['Comfortable walking shoes', 'Weather-appropriate clothing', 'Light jacket'],
      destinationSpecific: ['Reusable water bottle', 'Sunscreen'],
    },
    weatherAdvice: 'Weather guidance is unavailable right now - check a forecast closer to your travel date.',
    travelTips: ['Keep digital and physical copies of your ID.', 'Carry some cash alongside digital payments.'],
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

  // For car/bike, layer in real road distance from Google Maps where possible (spec section 17).
  const wantsRoadDistance = GOOGLE_MAPS_ROUTABLE_MODES.includes(trip.selectedTransportMode || trip.transportPreference);
  if (wantsRoadDistance) {
    const originCoords = await geocodeAddress(`${trip.origin}, India`);
    const destCoords = trip.destinationLocation?.lat ? trip.destinationLocation : await geocodeAddress(`${trip.destination}, India`);
    if (originCoords && destCoords) {
      const route = await getRoute(originCoords, destCoords, 'driving');
      if (route) {
        options = options.map((o) =>
          GOOGLE_MAPS_ROUTABLE_MODES.includes(o.mode)
            ? { ...o, distanceKm: route.distanceKm, approxDurationHrs: route.durationMinutes / 60, source: 'google_maps' }
            : o
        );
      }
    }
  }

  const intercityTransport = options.filter((o) => ['flight', 'train', 'bus', 'car'].includes(o.mode));
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
    intercityTransport: intercityTransport.length ? intercityTransport : options,
    intracityTransport,
  };
}

async function generateItinerarySection(trip, { pois, hotels, restaurants }) {
  const candidateIds = new Set(
    [...pois, ...hotels, ...restaurants].filter((c) => c.source === 'dataset').map((c) => c.id)
  );

  const prompt = buildItineraryPrompt({
    trip: serializeTripForPrompt(trip),
    candidatePOIs: pois,
    candidateHotels: hotels,
    candidateRestaurants: restaurants,
    weatherContext: trip.preTrip?.weatherAdvice || null,
  });

  const result = await generateValidatedJson(prompt, (json) => validateItinerary(json, { trip, candidateIds }), { maxRetries: 1 });

  if (result.ok) {
    const days = await mapGeminiItineraryToTripDays(result.data, {
      pois, hotels, restaurants, destination: trip.destination, destinationCoords: trip.destinationLocation,
    });
    return planItineraryRoutes(days, { accommodation: accommodationPoint(trip) });
  }

  logger.warn(`Itinerary AI generation failed for trip ${trip._id}, using deterministic fallback`, result.errors);
  const deterministicDays = buildDeterministicItinerary(trip, { pois, hotels, restaurants });
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
 * (Google Maps → Geoapify → static city fallback). Mutates in place.
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
      if (existing && isNearDestination(existing, destinationCoords)) continue;
      // eslint-disable-next-line no-await-in-loop
      const coords = await geocodeAddress(`${activity.name}, ${destination}, India`);
      if (coords && isNearDestination(coords, destinationCoords)) {
        activity.location = { lat: coords.lat, lng: coords.lng };
      } else if (!existing || !isNearDestination(existing, destinationCoords)) {
        activity.location = { lat: null, lng: null };
      }
    }
  }
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

function isNearDestination(point, destinationCoords) {
  if (!destinationCoords || !point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return true;
  return haversineDistanceKm(destinationCoords, point) <= MAX_DESTINATION_DISTANCE_KM;
}

function filterCandidatesToDestination(candidates, destinationCoords) {
  if (!destinationCoords) return candidates;
  return candidates.filter((candidate) => isNearDestination({ lat: candidate.latitude, lng: candidate.longitude }, destinationCoords));
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
};