const Trip = require('../../models/Trip');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');

const { geocodeAddress, cityFallbackCoords } = require('../maps/geocoding.service');
const { getRoute } = require('../maps/routing.service');
const { GOOGLE_MAPS_ROUTABLE_MODES } = require('../../constants/transport');

const { recommendPOIs } = require('../recommendation/poiRecommendation.service');
const { recommendHotels } = require('../recommendation/hotelRecommendation.service');
const { recommendRestaurants } = require('../recommendation/restaurantRecommendation.service');

const { buildPreTripPrompt, buildTransportPrompt, buildItineraryPrompt } = require('../ai/geminiPrompts');
const { generateValidatedJson } = require('../ai/gemini.service');
const { validatePreTrip, validateTransport, validateItinerary } = require('../ai/geminiValidator');
const { buildDeterministicItinerary } = require('../itinerary/itineraryOptimizer.service');

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
    // 1. Geocode the destination (best-effort; itinerary/clustering still works without it).
    const destinationCoords = await geocodeAddress(`${trip.destination}, India`)
      || cityFallbackCoords(trip.destination);
    if (destinationCoords) {
      trip.destinationLocation = { lat: destinationCoords.lat, lng: destinationCoords.lng };
    }

    // 2-4. Candidate retrieval: POIs, hotels, restaurants (dataset-filtered + ranked, capped sets only).
    const [pois, hotels, restaurants] = await Promise.all([
      recommendPOIs(trip, destinationCoords),
      recommendHotels(trip),
      recommendRestaurants(trip),
    ]);

    if (hotels.length) {
      const h = hotels[0];
      trip.recommendedHotel = {
        hotelId: h.source === 'dataset' ? h.id : null,
        label: 'Recommended accommodation',
        name: h.name,
        googleRating: h.googleRating ?? null,
        pricePerNightInr: h.pricePerNightInr ?? null,
        conditionLabel: h.conditionLabel ?? null,
      };
    }

    // 5. Pre-trip generation (packing/weather/tips) - Gemini with deterministic fallback.
    trip.preTrip = await generatePreTripSection(trip);

    // 6. Transport recommendations - Gemini estimate + Google Maps road distance for car/bike.
    trip.transport = await generateTransportSection(trip);

    // 7. Itinerary - Gemini reasoning over the ranked candidates, validated, with deterministic fallback.
    trip.itinerary = await generateItinerarySection(trip, { pois, hotels, restaurants });

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
    options = [
      {
        mode: trip.transportPreference === 'any' ? 'car' : trip.transportPreference,
        summary: 'Recommendation unavailable right now - please check directly with providers closer to your trip.',
        approxDurationHrs: null,
        approxPriceInr: null,
        isLiveAvailability: false,
        source: 'gemini',
      },
    ];
  }

  // For car/bike, layer in real road distance from Google Maps where possible (spec section 17).
  const wantsRoadDistance = GOOGLE_MAPS_ROUTABLE_MODES.includes(trip.transportPreference);
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

  return options;
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

  const result = await generateValidatedJson(prompt, (json) => validateItinerary(json, { trip, candidateIds }), { maxRetries: 0 });

  if (result.ok) {
    return mapGeminiItineraryToTripDays(result.data, { pois, restaurants, destination: trip.destination });
  }

  logger.warn(`Itinerary AI generation failed for trip ${trip._id}, using deterministic fallback`, result.errors);
  const deterministicDays = buildDeterministicItinerary(trip, { pois, hotels, restaurants });
  await geocodeMissingActivityCoords(deterministicDays, trip.destination);
  return deterministicDays;
}

/** Converts Gemini's validated day/activity shape into the Trip model's day schema, resolving refIds and coordinates. */
async function mapGeminiItineraryToTripDays(itineraryData, { pois, restaurants, destination }) {
  const poiById = new Map(pois.map((p) => [p.id, p]));
  const restaurantById = new Map(restaurants.map((r) => [r.id, r]));

  // Build days with whatever coords we already have from the dataset
  const days = itineraryData.days.map((day) => ({
    day: day.day,
    date: day.date,
    summary: day.summary || null,
    weatherContext: day.weatherContext || null,
    activities: day.activities.map((activity) => {
      const dataset =
        activity.type === 'poi'
          ? poiById.get(String(activity.datasetId))
          : restaurantById.get(String(activity.datasetId));

      return {
        type: activity.type,
        refId: activity.source === 'dataset' && dataset ? dataset.id : null,
        name: activity.name,
        startTime: activity.startTime || null,
        duration: activity.duration || null,
        notes: activity.notes || null,
        location: {
          lat: dataset?.latitude ?? null,
          lng: dataset?.longitude ?? null,
        },
        source: activity.source,
      };
    }),
  }));

  // Geocode any mappable activity that still has null coords
  await geocodeMissingActivityCoords(days, destination);

  return days;
}

/**
 * For every poi/restaurant/hotel activity that has no coordinates yet,
 * attempt to geocode "<name>, <destination>" via the geocoding chain
 * (Google Maps → Geoapify → static city fallback). Mutates in place.
 * Runs sequentially to stay within API rate limits.
 */
async function geocodeMissingActivityCoords(days, destination) {
  const MAPPABLE = ['poi', 'restaurant', 'hotel'];
  for (const day of days) {
    for (const activity of day.activities) {
      if (!MAPPABLE.includes(activity.type)) continue;
      if (typeof activity.location.lat === 'number' && typeof activity.location.lng === 'number') continue;
      // eslint-disable-next-line no-await-in-loop
      const coords = await geocodeAddress(`${activity.name}, ${destination}, India`);
      if (coords) {
        activity.location = { lat: coords.lat, lng: coords.lng };
      }
    }
  }
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
    transportPreference: trip.transportPreference,
  };
}

module.exports = { generateTrip };