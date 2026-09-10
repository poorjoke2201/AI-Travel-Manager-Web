const { getCandidatePOIs } = require('./candidate.service');
const { normalizeRating, preferenceMatchScore, weightedScore } = require('./scoring.service');
const { haversineDistanceKm } = require('../../utils/haversine');
const { generateJson } = require('../ai/gemini.service');
const logger = require('../../utils/logger');

const MIN_ACCEPTABLE_CANDIDATES = 5;
const TOP_N_FOR_GEMINI = 25; // how many ranked candidates actually get sent to the itinerary prompt

const WEIGHTS = { preference: 0.5, rating: 0.35, proximity: 0.15 };

function scorePoi(poi, trip, destinationCoords) {
  const preference = preferenceMatchScore(trip.placePreferences, [
    poi.category,
    poi.poiType,
    poi.significance,
    poi.characteristics,
    (poi.tags || []).join(' '),
  ]);
  const rating = normalizeRating(poi.googleRating);
  // Proximity to destination centroid, not any specific hotel (hotel isn't chosen yet at this stage).
  let proximity = 0.5;
  if (destinationCoords && typeof poi.latitude === 'number' && typeof poi.longitude === 'number') {
    const distanceKm = haversineDistanceKm(destinationCoords, { lat: poi.latitude, lng: poi.longitude });
    const tolerance = Number(trip.dailyTravelToleranceKm) || 30;
    proximity = Number.isFinite(distanceKm) ? Math.max(0, 1 - distanceKm / tolerance) : 0.5;
  }
  return weightedScore(WEIGHTS, { preference, rating, proximity });
}

/** Asks Gemini for a handful of additional POI suggestions when the dataset is thin for this city. */
async function fetchGeminiFallbackPOIs(trip, existingNames) {
  const prompt = `
Suggest up to 8 real, well-known points of interest in ${trip.destination}, India that would suit a
traveller interested in: ${trip.placePreferences.join(', ') || 'general sightseeing'}.
Do not repeat any of these already-known places: ${existingNames.join(', ') || 'none'}.
Return STRICT JSON only, no markdown, in exactly this shape:
{ "pois": [ { "name": "string", "category": "string", "description": "one sentence" } ] }
`.trim();

  try {
    const json = await generateJson(prompt);
    const list = Array.isArray(json.pois) ? json.pois : [];
    return list.slice(0, 8).map((p, idx) => ({
      id: `gemini-poi-${idx}`,
      name: p.name,
      category: p.category || null,
      description: p.description || null,
      googleRating: null,
      visitDurationHrs: null,
      latitude: null,
      longitude: null,
      source: 'gemini',
    }));
  } catch (err) {
    logger.warn('Gemini POI fallback failed - continuing with dataset candidates only', err.message);
    return [];
  }
}

/**
 * Returns a ranked, capped candidate list ready to hand to the Gemini
 * itinerary prompt: [{ id, name, category, googleRating, visitDurationHrs,
 * latitude, longitude, source }]. Mixes in Gemini-suggested extras (clearly
 * tagged source:'gemini') only when the dataset is too thin (spec section 22).
 */
async function recommendPOIs(trip, destinationCoords) {
  const rawCandidates = await getCandidatePOIs(trip);

  const ranked = rawCandidates
    .map((poi) => ({ poi, score: scorePoi(poi, trip, destinationCoords) }))
    .sort((a, b) => b.score - a.score)
    .map(({ poi }) => ({
      id: String(poi._id),
      name: poi.name,
      category: poi.category,
      poiType: poi.poiType,
      googleRating: poi.googleRating,
      visitDurationHrs: poi.visitDurationHrs,
      entryFeeInr: poi.entryFeeInr,
      latitude: poi.latitude,
      longitude: poi.longitude,
      openingTime: poi.openingTime,
      closingTime: poi.closingTime,
      weeklyOff: poi.weeklyOff,
      indoorOutdoor: poi.indoorOutdoor,
      bestTimeToVisit: poi.bestTimeToVisit,
      description: poi.description,
      website: poi.website,
      phone: poi.phone,
      wikipedia: poi.wikipedia,
      imageUrl: poi.imageUrl,
      sourceRef: poi.sourceRef,
      sourceProvider: poi.source,
      source: 'dataset',
    }));

  let finalList = ranked.slice(0, TOP_N_FOR_GEMINI);

  if (finalList.length < MIN_ACCEPTABLE_CANDIDATES) {
    const extras = await fetchGeminiFallbackPOIs(
      trip,
      finalList.map((p) => p.name)
    );
    finalList = [...finalList, ...extras];
  }

  return finalList;
}

module.exports = { recommendPOIs };