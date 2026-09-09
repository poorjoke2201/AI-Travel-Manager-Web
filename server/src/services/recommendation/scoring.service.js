const { haversineDistanceKm } = require('../../utils/haversine');

/**
 * Generic 0-1 normalized scoring so POI/hotel/restaurant recommendation
 * services can all combine "how good is this candidate" the same way
 * before handing a ranked top-N to Gemini (spec section 46: candidate
 * scoring considers preference match, rating, budget, distance, weather).
 */

function normalizeRating(rating, max = 5) {
  if (typeof rating !== 'number') return 0.5; // unknown rating - neutral, not penalized
  return Math.max(0, Math.min(1, rating / max));
}

/** Closer = higher score; falls off smoothly, floors at 0 beyond decayKm. */
function proximityScore(distanceKm, decayKm = 15) {
  if (!Number.isFinite(distanceKm)) return 0.5; // unknown location - neutral
  return Math.max(0, 1 - distanceKm / decayKm);
}

/** Fraction of preference keywords found across the candidate's searchable text fields. */
function preferenceMatchScore(preferences, searchableFields) {
  if (!preferences.length) return 0.5; // no stated preference - neutral
  const haystack = searchableFields.filter(Boolean).join(' ').toLowerCase();
  const hits = preferences.filter((p) => haystack.includes(p.toLowerCase())).length;
  return hits / preferences.length;
}

/** Cheaper-than-budget scores higher; over budget is penalized but not zeroed (still shown, deprioritized). */
function budgetScore(price, budgetCeiling) {
  if (!budgetCeiling || typeof price !== 'number') return 0.5;
  if (price <= budgetCeiling) return 1 - (price / budgetCeiling) * 0.3; // cheaper within budget nudges slightly higher
  const overBy = (price - budgetCeiling) / budgetCeiling;
  return Math.max(0, 0.5 - overBy);
}

/**
 * @param {object} weights e.g. { preference: 0.4, rating: 0.3, proximity: 0.2, budget: 0.1 }
 * @param {object} components matching keys with 0-1 scores
 */
function weightedScore(weights, components) {
  let total = 0;
  let weightSum = 0;
  for (const key of Object.keys(weights)) {
    if (components[key] === undefined) continue;
    total += weights[key] * components[key];
    weightSum += weights[key];
  }
  return weightSum > 0 ? total / weightSum : 0;
}

function distanceFromOrigin(origin, candidate) {
  if (!origin || typeof candidate.latitude !== 'number' || typeof candidate.longitude !== 'number') {
    return Infinity;
  }
  return haversineDistanceKm(origin, { lat: candidate.latitude, lng: candidate.longitude });
}

module.exports = {
  normalizeRating,
  proximityScore,
  preferenceMatchScore,
  budgetScore,
  weightedScore,
  distanceFromOrigin,
};