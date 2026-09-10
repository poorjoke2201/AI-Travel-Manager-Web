const { getCandidateRestaurants } = require('./candidate.service');
const { normalizeRating, budgetScore, preferenceMatchScore, weightedScore } = require('./scoring.service');
const { geocodeCandidates } = require('../maps/geocoding.service');
const logger = require('../../utils/logger');

const TOP_N_RETURNED = 20; // itineraryOptimizer picks specific ones per day from this shortlist
const GEOCODE_TOP_N = 6;

const WEIGHTS = { preference: 0.4, rating: 0.4, budget: 0.2 };

function scoreRestaurant(restaurant, trip, budgetCeiling) {
  const preference = preferenceMatchScore(trip.foodPreferences, [
    (restaurant.cuisine || []).join(' '),
    restaurant.isPureVeg ? 'vegetarian' : 'non-vegetarian',
  ]);
  const rating = normalizeRating(restaurant.rating);
  const budget = budgetScore(restaurant.avgPriceForTwo, budgetCeiling);
  return weightedScore(WEIGHTS, { preference, rating, budget });
}

/**
 * Returns a ranked shortlist: [{ id, name, area, cuisine, rating,
 * isPureVeg, avgPriceForTwo, latitude, longitude, source }]. This is the
 * ONLY function anywhere in the app that reads from the restaurants
 * collection for trip generation, and it always goes through
 * candidate.service's capped/indexed query - never a full collection scan.
 */
async function recommendRestaurants(trip) {
  const budgetCeiling = trip.budget ? (trip.budget / Math.max(trip.numberOfDays, 1)) * 0.15 : null;
  const rawCandidates = await getCandidateRestaurants(trip);

  const ranked = rawCandidates
    .map((r) => ({ r, score: scoreRestaurant(r, trip, budgetCeiling) }))
    .sort((a, b) => b.score - a.score)
    .map(({ r }) => r)
    .slice(0, TOP_N_RETURNED);

  const toGeocode = ranked.slice(0, GEOCODE_TOP_N).map((r) => ({
    _id: r._id,
    name: r.name,
    city: r.city,
    address: r.area,
  }));

  let coordsById = new Map();
  try {
    coordsById = await geocodeCandidates(toGeocode);
  } catch (err) {
    logger.warn('Restaurant geocoding failed - continuing without coordinates', err.message);
  }

  return ranked.map((r) => {
    const coords = coordsById.get(String(r._id));
    return {
      id: String(r._id),
      name: r.name,
      area: r.area,
      cuisine: r.cuisine,
      rating: r.rating,
      isPureVeg: r.isPureVeg,
      avgPriceForTwo: r.avgPriceForTwo,
      latitude: coords ? coords.lat : r.location?.coordinates?.[1] ?? null,
      longitude: coords ? coords.lng : r.location?.coordinates?.[0] ?? null,
      openingTime: r.openingTime,
      closingTime: r.closingTime,
      description: r.description || null,
      source: 'dataset',
    };
  });
}

module.exports = { recommendRestaurants };