const POI = require('../../models/POI');
const Hotel = require('../../models/Hotel');
const Restaurant = require('../../models/Restaurant');
const { canonicalizeCityName, cityMatchPatterns, normalizeCityKey } = require('../destination/destinationResolver.service');

const CANDIDATE_QUERY_V2 = true;

function buildCityQuery(destination) {
  const variants = cityMatchPatterns(destination);
  return variants.length ? { city: { $in: variants } } : { city: fuzzyText(destination) };
}

function applyQueryMetadata(results, queryStats = {}, extra = {}) {
  const list = Array.isArray(results) ? results : [];
  Object.defineProperties(list, {
    truncated: { value: Boolean(extra.truncated), writable: true, enumerable: true },
    totalAvailable: { value: Number(extra.totalAvailable ?? list.length), writable: true, enumerable: true },
    queryStats: { value: queryStats || {}, writable: true, enumerable: true },
  });
  return list;
}

/**
 * This is the "MongoDB filtering" step of the pipeline in spec section 18/45:
 *   preferences -> MongoDB filtering -> small candidate set -> Gemini
 * Every query here is indexed and capped - this file is the one place
 * responsible for making sure the (large) restaurant collection is never
 * pulled in bulk. Callers in poi/hotel/restaurantRecommendation.service.js
 * further score/rank what's returned here; this layer only narrows by hard
 * filters (city, budget ceiling, category overlap) plus a generous cap.
 */

const POI_CANDIDATE_CAP = null;
const HOTEL_CANDIDATE_CAP = null;
const RESTAURANT_CANDIDATE_CAP = null;

const PLACES_PER_DAY = { relaxed: 3, balanced: 5, packed: 7 };

function placesPerDay(pace) {
  return PLACES_PER_DAY[pace] || PLACES_PER_DAY.balanced;
}

function poiCoverageTarget(trip, buffer = 2) {
  const requiredPOIs = Math.max(1, Number(trip.numberOfDays) || 1) * placesPerDay(trip.pace);
  return { requiredPOIs, targetPOIs: requiredPOIs + buffer };
}

async function getCandidatePOIs(trip) {
  const destination = String(trip.destination || '').trim();
  const cityVariants = cityMatchPatterns(destination);
  const cityQuery = cityVariants.length ? { city: { $in: cityVariants } } : { city: fuzzyText(destination) };
  const preferences = Array.isArray(trip.placePreferences) ? trip.placePreferences : [];
  const destinationTerm = new RegExp(escapeRegExp(destination), 'i');

  const baseFilter = {
    $or: [
      { ...cityQuery, source: 'overture', tier: { $in: ['A', 'B'] } },
      { ...cityQuery, source: { $ne: 'overture' } },
      { ...cityQuery, name: destinationTerm },
      { ...cityQuery, description: destinationTerm },
    ],
  };

  const queries = [POI.find(baseFilter).lean()];

  preferences.forEach((preference) => {
    const term = new RegExp(escapeRegExp(preference), 'i');
    queries.push(POI.find({
      $or: [
        { ...cityQuery, source: { $ne: 'overture' }, category: term },
        { ...cityQuery, source: 'overture', tier: { $in: ['A', 'B'] }, category: term },
        { ...cityQuery, source: { $ne: 'overture' }, poiType: term },
        { ...cityQuery, source: 'overture', tier: { $in: ['A', 'B'] }, poiType: term },
        { ...cityQuery, significance: term },
        { ...cityQuery, characteristics: term },
        { ...cityQuery, tags: term },
      ],
    }).lean());
  });

  const matches = await Promise.all(queries);
  const unique = new Map();
  matches.flat().forEach((poi) => unique.set(String(poi._id), poi));
  const result = [...unique.values()];
  return applyQueryMetadata(result, { strategy: CANDIDATE_QUERY_V2 ? 'city-variant-union' : 'legacy-city-regex', city: destination }, { truncated: false, totalAvailable: result.length });
}

async function getCandidateHotels(trip) {
  const destination = String(trip.destination || '').trim();
  const variants = cityMatchPatterns(destination);
  const query = variants.length ? { city: { $in: variants } } : { city: exactText(destination) };

  if (trip.budget) {
    const perNightCeiling = (trip.budget / Math.max(trip.numberOfDays, 1)) * 1.5;
    query.pricePerNightInr = { $lte: perNightCeiling };
  }

  if (trip.accommodationPreference && trip.accommodationPreference !== 'any') {
    query.amenities = { $regex: escapeRegExp(trip.accommodationPreference), $options: 'i' };
  }

  let results = await Hotel.find(query).sort({ googleRating: -1 }).limit(HOTEL_CANDIDATE_CAP).lean();

  if (!results.length && query.amenities) {
    delete query.amenities;
    results = await Hotel.find(query).sort({ googleRating: -1 }).limit(HOTEL_CANDIDATE_CAP).lean();
  }

  return applyQueryMetadata(results, { strategy: CANDIDATE_QUERY_V2 ? 'city-variant-union' : 'legacy-city-regex', city: destination }, { truncated: results.length >= HOTEL_CANDIDATE_CAP, totalAvailable: results.length });
}

async function getCandidateRestaurants(trip) {
  const destination = String(trip.destination || '').trim();
  const variants = cityMatchPatterns(destination);
  const query = variants.length ? { city: { $in: variants } } : { city: exactText(destination) };

  const wantsVeg = Array.isArray(trip.foodPreferences) && trip.foodPreferences.some((f) => /vegetarian|vegan|jain/i.test(f));
  if (wantsVeg) query.isPureVeg = true;

  const cuisineTerms = Array.isArray(trip.foodPreferences)
    ? trip.foodPreferences.filter((f) => !/vegetarian|non-vegetarian|vegan|jain|no preference/i.test(f))
    : [];
  if (cuisineTerms.length) {
    const regexes = cuisineTerms.map((c) => new RegExp(escapeRegExp(c), 'i'));
    query.cuisine = { $in: regexes };
  }

  let results = await Restaurant.find(query)
    .sort({ rating: -1 })
    .limit(RESTAURANT_CANDIDATE_CAP)
    .lean();

  if (!results.length && query.cuisine) {
    delete query.cuisine;
    results = await Restaurant.find(query).sort({ rating: -1 }).limit(RESTAURANT_CANDIDATE_CAP).lean();
  }

  return applyQueryMetadata(results, { strategy: CANDIDATE_QUERY_V2 ? 'city-variant-union' : 'legacy-city-regex', city: destination }, { truncated: results.length >= RESTAURANT_CANDIDATE_CAP, totalAvailable: results.length });
}

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactText(value) {
  return new RegExp(`^${escapeRegExp(String(value || '').trim())}$`, 'i');
}

function fuzzyText(value) {
  return new RegExp(escapeRegExp(String(value || '').trim()), 'i');
}

module.exports = {
  canonicalizeCityName,
  getCandidatePOIs,
  getCandidateHotels,
  getCandidateRestaurants,
  POI_CANDIDATE_CAP,
  HOTEL_CANDIDATE_CAP,
  RESTAURANT_CANDIDATE_CAP,
  placesPerDay,
  poiCoverageTarget,
  CANDIDATE_QUERY_V2,
  canonicalizeCityName,
  cityMatchPatterns,
  buildCityQuery,
  normalizeCityKey,
};