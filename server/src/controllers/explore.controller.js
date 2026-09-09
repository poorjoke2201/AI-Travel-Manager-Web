const POI = require('../models/POI');
const Hotel = require('../models/Hotel');
const Restaurant = require('../models/Restaurant');
const { geocodeAddress } = require('../services/maps/geocoding.service');
const ApiError = require('../utils/apiError');

const DEFAULT_RADIUS_KM = 10;
const RESULT_CAP = 50;

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * GET /api/explore/search?query=Mysuru
 * Implements the flow from spec section 29: search text -> Google geocoding
 * -> coordinates -> MongoDB nearby search -> POI/hotel/restaurant records.
 * Hotels/restaurants often lack coordinates (dataset limitation - spec
 * section 32), so for them we additionally fall back to a city-name match
 * on the geocoded locality when the geo query comes back empty.
 */
async function search(req, res, next) {
  try {
    const { query } = req.query;
    if (!query || !query.trim()) {
      throw ApiError.badRequest('Query parameter "query" is required.');
    }

    const coords = await geocodeAddress(query);
    if (!coords) {
      const fallback = await findByText(query);
      return res.status(200).json({
        success: true,
        data: { coordinates: null, ...fallback },
        message: 'Location services are unavailable; showing dataset matches instead.',
      });
    }

    const radiusKm = parseNumber(req.query.radius, DEFAULT_RADIUS_KM);
    const cityGuess = query.split(',')[0].trim();

    const [pois, hotels, restaurants] = await Promise.all([
      findNearbyPOIs(coords, radiusKm),
      findHotelsNear(coords, radiusKm, cityGuess),
      findRestaurantsNear(coords, radiusKm, cityGuess),
    ]);

    res.status(200).json({ success: true, data: { coordinates: coords, pois, hotels, restaurants } });
  } catch (err) {
    next(err);
  }
}

/**
 * Keeps Explore useful when Google geocoding is unavailable or the API key
 * cannot use the Geocoding API. The query is capped and only searches the
 * indexed city/name fields; it never loads an entire collection.
 */
async function findByText(query) {
  const pattern = new RegExp(escapeRegExp(query.trim()), 'i');
  const [pois, hotels, restaurants] = await Promise.all([
    POI.find({ $or: [{ city: pattern }, { name: pattern }] }).sort({ googleRating: -1 }).limit(RESULT_CAP).lean(),
    Hotel.find({ $or: [{ city: pattern }, { name: pattern }] }).sort({ googleRating: -1 }).limit(RESULT_CAP).lean(),
    Restaurant.find({ $or: [{ city: pattern }, { name: pattern }] }).sort({ rating: -1 }).limit(RESULT_CAP).lean(),
  ]);
  return { pois, hotels, restaurants };
}

/** GET /api/explore/pois?city=&category=&minRating=&lat=&lng=&radius= */
async function browsePOIs(req, res, next) {
  try {
    const { city, category, minRating, lat, lng, radius } = req.query;
    const filter = {};
    if (city) filter.city = new RegExp(`^${escapeRegExp(city)}$`, 'i');
    if (category) filter.category = new RegExp(escapeRegExp(category), 'i');
    if (minRating) filter.googleRating = { $gte: parseNumber(minRating, 0) };

    let queryBuilder = POI.find(filter);
    if (lat && lng) {
      queryBuilder = POI.find({
        ...filter,
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [parseNumber(lng), parseNumber(lat)] },
            $maxDistance: parseNumber(radius, DEFAULT_RADIUS_KM) * 1000,
          },
        },
      });
    }

    const results = await queryBuilder.limit(RESULT_CAP).lean();
    res.status(200).json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

/** GET /api/explore/hotels?city=&maxPrice=&minRating= */
async function browseHotels(req, res, next) {
  try {
    const { city, maxPrice, minRating } = req.query;
    const filter = {};
    if (city) filter.city = new RegExp(`^${escapeRegExp(city)}$`, 'i');
    if (maxPrice) filter.pricePerNightInr = { $lte: parseNumber(maxPrice, Infinity) };
    if (minRating) filter.googleRating = { $gte: parseNumber(minRating, 0) };

    const results = await Hotel.find(filter).sort({ googleRating: -1 }).limit(RESULT_CAP).lean();
    res.status(200).json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

/** GET /api/explore/restaurants?city=&cuisine=&isPureVeg=&minRating= */
async function browseRestaurants(req, res, next) {
  try {
    const { city, cuisine, isPureVeg, minRating } = req.query;
    const filter = {};
    if (city) filter.city = new RegExp(`^${escapeRegExp(city)}$`, 'i');
    if (cuisine) filter.cuisine = new RegExp(escapeRegExp(cuisine), 'i');
    if (isPureVeg !== undefined) filter.isPureVeg = isPureVeg === 'true';
    if (minRating) filter.rating = { $gte: parseNumber(minRating, 0) };

    // Restaurant collection is the large one - always filtered + capped, never scanned in full.
    const results = await Restaurant.find(filter).sort({ rating: -1 }).limit(RESULT_CAP).lean();
    res.status(200).json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

/** GET /api/explore/nearby?lat=&lng=&radius=&type=poi|hotel|restaurant */
async function nearby(req, res, next) {
  try {
    const { lat, lng, radius, type } = req.query;
    if (!lat || !lng) throw ApiError.badRequest('Query parameters "lat" and "lng" are required.');

    const coords = { lat: parseNumber(lat), lng: parseNumber(lng) };
    const radiusKm = parseNumber(radius, DEFAULT_RADIUS_KM);

    if (type === 'hotel') {
      return res.status(200).json({ success: true, data: await findHotelsNear(coords, radiusKm) });
    }
    if (type === 'restaurant') {
      return res.status(200).json({ success: true, data: await findRestaurantsNear(coords, radiusKm) });
    }
    return res.status(200).json({ success: true, data: await findNearbyPOIs(coords, radiusKm) });
  } catch (err) {
    next(err);
  }
}

async function findNearbyPOIs(coords, radiusKm) {
  return POI.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] },
        $maxDistance: radiusKm * 1000,
      },
    },
  })
    .limit(RESULT_CAP)
    .lean();
}

/** Geo-query first (only matches hotels that have been geocoded), city-name fallback otherwise. */
async function findHotelsNear(coords, radiusKm, cityFallback) {
  const geoResults = await Hotel.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] },
        $maxDistance: radiusKm * 1000,
      },
    },
  })
    .limit(RESULT_CAP)
    .lean();

  if (geoResults.length || !cityFallback) return geoResults;

  return Hotel.find({ city: new RegExp(`^${escapeRegExp(cityFallback)}$`, 'i') })
    .sort({ googleRating: -1 })
    .limit(RESULT_CAP)
    .lean();
}

async function findRestaurantsNear(coords, radiusKm, cityFallback) {
  const geoResults = await Restaurant.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] },
        $maxDistance: radiusKm * 1000,
      },
    },
  })
    .limit(RESULT_CAP)
    .lean();

  if (geoResults.length || !cityFallback) return geoResults;

  return Restaurant.find({ city: new RegExp(`^${escapeRegExp(cityFallback)}$`, 'i') })
    .sort({ rating: -1 })
    .limit(RESULT_CAP)
    .lean();
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { search, browsePOIs, browseHotels, browseRestaurants, nearby };