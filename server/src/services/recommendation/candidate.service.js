const POI = require('../../models/POI');
const Hotel = require('../../models/Hotel');
const Restaurant = require('../../models/Restaurant');

/**
 * This is the "MongoDB filtering" step of the pipeline in spec section 18/45:
 *   preferences -> MongoDB filtering -> small candidate set -> Gemini
 * Every query here is indexed and capped - this file is the one place
 * responsible for making sure the (large) restaurant collection is never
 * pulled in bulk. Callers in poi/hotel/restaurantRecommendation.service.js
 * further score/rank what's returned here; this layer only narrows by hard
 * filters (city, budget ceiling, category overlap) plus a generous cap.
 */

const POI_CANDIDATE_CAP = 60;
const HOTEL_CANDIDATE_CAP = 25;
const RESTAURANT_CANDIDATE_CAP = 40;

async function getCandidatePOIs(trip) {
  const query = { city: exactText(trip.destination) };

  if (trip.placePreferences.length) {
    // Match on category, poiType, significance, or tags - datasets don't
    // guarantee interest keywords land in exactly one field.
    const regexes = trip.placePreferences.map((p) => new RegExp(escapeRegExp(p), 'i'));
    query.$or = [
      { category: { $in: regexes } },
      { poiType: { $in: regexes } },
      { significance: { $in: regexes } },
      { tags: { $in: regexes } },
    ];
  }

  return POI.find(query)
    .sort({ googleRating: -1 })
    .limit(POI_CANDIDATE_CAP)
    .lean();
}

async function getCandidateHotels(trip) {
  const query = { city: exactText(trip.destination) };

  if (trip.budget) {
    // Rough per-night ceiling: whole-trip budget split across nights,
    // generously capped since hotel spend is only one part of the budget.
    const perNightCeiling = (trip.budget / Math.max(trip.numberOfDays, 1)) * 1.5;
    query.pricePerNightInr = { $lte: perNightCeiling };
  }

  if (trip.accommodationPreference && trip.accommodationPreference !== 'any') {
    query.amenities = { $regex: escapeRegExp(trip.accommodationPreference), $options: 'i' };
  }

  let results = await Hotel.find(query).sort({ googleRating: -1 }).limit(HOTEL_CANDIDATE_CAP).lean();

  // If the accommodation-preference filter over-narrowed (common - amenities
  // text rarely says "luxury" literally), fall back to city+budget only.
  if (!results.length && query.amenities) {
    delete query.amenities;
    results = await Hotel.find(query).sort({ googleRating: -1 }).limit(HOTEL_CANDIDATE_CAP).lean();
  }

  return results;
}

async function getCandidateRestaurants(trip) {
  const query = { city: exactText(trip.destination) };

  const wantsVeg = trip.foodPreferences.some((f) => /vegetarian|vegan|jain/i.test(f));
  if (wantsVeg) query.isPureVeg = true;

  const cuisineTerms = trip.foodPreferences.filter(
    (f) => !/vegetarian|non-vegetarian|vegan|jain|no preference/i.test(f)
  );
  if (cuisineTerms.length) {
    const regexes = cuisineTerms.map((c) => new RegExp(escapeRegExp(c), 'i'));
    query.cuisine = { $in: regexes };
  }

  let results = await Restaurant.find(query)
    .sort({ rating: -1 })
    .limit(RESTAURANT_CANDIDATE_CAP)
    .lean();

  // Cuisine filter over-narrowed -> drop it but keep the veg constraint.
  if (!results.length && query.cuisine) {
    delete query.cuisine;
    results = await Restaurant.find(query).sort({ rating: -1 }).limit(RESTAURANT_CANDIDATE_CAP).lean();
  }

  return results;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactText(value) {
  return new RegExp(`^${escapeRegExp(String(value || '').trim())}$`, 'i');
}

module.exports = {
  getCandidatePOIs,
  getCandidateHotels,
  getCandidateRestaurants,
  POI_CANDIDATE_CAP,
  HOTEL_CANDIDATE_CAP,
  RESTAURANT_CANDIDATE_CAP,
};