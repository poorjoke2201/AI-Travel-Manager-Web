const axios = require('axios');
const POI = require('../../models/POI');
const Restaurant = require('../../models/Restaurant');
const { geocodeAddress } = require('../maps/geocoding.service');
const { searchGeoapifyPlaces } = require('../maps/geoapify.service');
const logger = require('../../utils/logger');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MAX_BACKFILL_SEARCHES = 3;

function needsBackfill({ availablePOIs, targetPOIs, availableRestaurants, requiredRestaurants }) {
  return availablePOIs < targetPOIs || availableRestaurants < requiredRestaurants;
}

async function backfillCandidates(trip, { poiCount = 0, restaurantCount = 0 } = {}) {
  if (poiCount <= 0 && restaurantCount <= 0) return { pois: [], restaurants: [], searches: 0 };
  const coordinates = await geocodeAddress(`${trip.destination}, India`);
  if (!coordinates) return { pois: [], restaurants: [], searches: 0 };

  let pois = [];
  let restaurants = [];
  let searches = 0;
  if (poiCount > 0) {
    searches += 1;
    pois = await discoverGeoapify(coordinates, 'poi', trip.destination);
  }
  if (restaurantCount > 0) {
    searches += 1;
    restaurants = await discoverGeoapify(coordinates, 'restaurant', trip.destination);
  }
  if (pois.length < poiCount || restaurants.length < restaurantCount) {
    searches += 1;
    const fallback = await discoverOverpass(coordinates, trip.destination);
    pois = mergeUnique(pois, fallback.pois);
    restaurants = mergeUnique(restaurants, fallback.restaurants);
  }

  return {
    pois: pois.slice(0, poiCount),
    restaurants: restaurants.slice(0, restaurantCount),
    searches: Math.min(MAX_BACKFILL_SEARCHES, searches),
  };
}

async function discoverGeoapify(coordinates, type, city) {
  const categories = type === 'restaurant'
    ? ['catering.restaurant', 'catering.cafe', 'catering.fast_food', 'catering.food_court']
    : ['tourism.sights', 'tourism.attraction', 'tourism.museum', 'leisure.park', 'leisure.garden', 'religion.place_of_worship'];
  const features = await searchGeoapifyPlaces({ ...coordinates, radiusKm: 25, categories });
  const results = [];

  for (const feature of features.slice(0, 50)) {
    const candidate = type === 'restaurant'
      ? normalizeRestaurant(feature, null, city)
      : normalizePoi(feature, null, city);
    if (!candidate) continue;
    const saved = type === 'restaurant' ? await persistRestaurant(candidate) : await persistPoi(candidate);
    results.push(type === 'restaurant' ? restaurantCandidate(saved) : poiCandidate(saved));
  }
  return results;
}

async function discoverOverpass(coordinates, city) {
  const radius = 25000;
  const query = `[out:json][timeout:60];(
    nwr(around:${radius},${coordinates.lat},${coordinates.lng})[tourism~"museum|gallery|attraction|viewpoint|theme_park|zoo|aquarium"];
    nwr(around:${radius},${coordinates.lat},${coordinates.lng})[historic~"monument|memorial|castle|ruins|archaeological_site"];
    nwr(around:${radius},${coordinates.lat},${coordinates.lng})[amenity~"place_of_worship|theatre|cinema|restaurant|cafe|fast_food|food_court"];
    nwr(around:${radius},${coordinates.lat},${coordinates.lng})[leisure~"park|nature_reserve|garden"];
  );out center tags;`;

  try {
    const { data } = await axios.post(OVERPASS_URL, new URLSearchParams({ data: query }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'TravelManagerApp/1.0' },
      timeout: 90000,
    });
    const pois = [];
    const restaurants = [];
    for (const element of data.elements || []) {
      const tags = element.tags || {};
      const name = (tags.name || tags['name:en'] || '').trim();
      const point = element.type === 'node'
        ? { lat: element.lat, longitude: element.lon }
        : element.center ? { lat: element.center.lat, longitude: element.center.lon } : null;
      if (name.length < 3 || !point) continue;
      const sourceRef = `overpass-${element.type}-${element.id}`;
      if (/restaurant|cafe|fast_food|food_court/i.test(tags.amenity || '')) {
        const hours = parseOpeningHours(tags.opening_hours);
        const saved = await persistRestaurant({ sourceRef, name, city, latitude: point.lat, longitude: point.longitude, cuisine: tags.cuisine ? tags.cuisine.split(/[;,]/).map((item) => item.trim()).filter(Boolean) : [], openingTime: hours.openingTime, closingTime: hours.closingTime, description: tags.description || null, source: 'overpass' });
        restaurants.push(restaurantCandidate(saved));
      } else {
        const hours = parseOpeningHours(tags.opening_hours);
        const saved = await persistPoi({ sourceRef, name, city, latitude: point.lat, longitude: point.longitude, category: poiCategory(tags), poiType: tags.tourism || tags.historic || tags.leisure || tags.amenity || null, tags: [tags.tourism, tags.historic, tags.leisure, tags.amenity].filter(Boolean), openingTime: hours.openingTime, closingTime: hours.closingTime, description: tags.description || null, source: 'overpass' });
        pois.push(poiCandidate(saved));
      }
    }
    return { pois, restaurants };
  } catch (err) {
    logger.warn('Overpass enrichment failed', err.message);
    return { pois: [], restaurants: [] };
  }
}

function normalizePoi(feature, details, city) {
  const properties = feature.properties || {};
  const [longitude, latitude] = feature.geometry?.coordinates || [];
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  return {
    sourceRef: properties.place_id || `geoapify-${latitude}-${longitude}`,
    name: properties.name || properties.address_line1 || properties.formatted || null,
    city, latitude, longitude, category: properties.categories?.[0] || 'Points of Interest',
    poiType: properties.categories?.[0] || null, tags: properties.categories || [],
    googleRating: properties.datasource?.raw?.rating ?? null,
    ...parseOpeningHours(details?.openingTime || properties.opening_hours),
    description: details?.description || properties.description || null,
    website: details?.website || properties.website || null,
    phone: details?.phone || properties.contact?.phone || properties.phone || null,
    source: 'geoapify',
  };
}

function normalizeRestaurant(feature, details, city) {
  const properties = feature.properties || {};
  const [longitude, latitude] = feature.geometry?.coordinates || [];
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  return {
    sourceRef: properties.place_id || `geoapify-${latitude}-${longitude}`,
    name: properties.name || properties.address_line1 || properties.formatted || null,
    city, latitude, longitude,
    cuisine: properties.catering?.cuisine ? [properties.catering.cuisine] : [],
    rating: properties.datasource?.raw?.rating ?? null,
    ...parseOpeningHours(details?.openingTime || properties.opening_hours),
    description: details?.description || properties.description || null,
    website: details?.website || properties.website || null,
    phone: details?.phone || properties.contact?.phone || properties.phone || null,
    source: 'geoapify',
  };
}

async function persistPoi(candidate) {
  if (!candidate?.name) return null;
  return persistCandidate(POI, { sourceRef: candidate.sourceRef }, candidate, { lastUpdated: new Date() }, { country: 'India' });
}

async function persistRestaurant(candidate) {
  if (!candidate?.name) return null;
  return persistCandidate(Restaurant, { city: candidate.city, name: candidate.name }, candidate, { geocodedAt: new Date() });
}

async function persistCandidate(Model, filter, candidate, timestamp, insertDefaults = {}) {
  const location = { type: 'Point', coordinates: [candidate.longitude, candidate.latitude] };
  const update = (sourceId) => ({
    $set: { ...candidate, location, ...timestamp },
    $setOnInsert: { ...insertDefaults, sourceId },
  });
  let sourceId = stableSourceId(candidate.sourceRef);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await Model.findOneAndUpdate(filter, update(sourceId), {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }).lean();
    } catch (error) {
      if (error.code !== 11000 || !/sourceId_1/.test(error.message)) throw error;
      const collision = await Model.findOne({ sourceId }).select('_id').lean();
      const existing = await Model.findOne(filter).lean();
      if (existing) return existing;
      if (!collision) throw error;
      sourceId = sourceId >= 2147483646 ? 1 : sourceId + 1;
    }
  }

  throw new Error(`Could not allocate a unique restaurant sourceId for "${candidate.name}".`);
}

function poiCandidate(poi) {
  return { id: String(poi._id), name: poi.name, category: poi.category, poiType: poi.poiType, googleRating: poi.googleRating, visitDurationHrs: poi.visitDurationHrs, latitude: poi.latitude, longitude: poi.longitude, openingTime: poi.openingTime, closingTime: poi.closingTime, weeklyOff: poi.weeklyOff, description: poi.description, website: poi.website, phone: poi.phone, sourceRef: poi.sourceRef, source: poi.source || 'geoapify' };
}

function restaurantCandidate(restaurant) {
  return { id: String(restaurant._id), name: restaurant.name, cuisine: restaurant.cuisine || [], rating: restaurant.rating, latitude: restaurant.latitude ?? restaurant.location?.coordinates?.[1] ?? null, longitude: restaurant.longitude ?? restaurant.location?.coordinates?.[0] ?? null, openingTime: restaurant.openingTime || null, closingTime: restaurant.closingTime || null, description: restaurant.description, website: restaurant.website, phone: restaurant.phone, source: restaurant.source || 'geoapify' };
}

function poiCategory(tags) {
  if (tags.amenity === 'place_of_worship') return 'Religious & Spiritual Pilgrimages';
  if (tags.historic || tags.tourism === 'museum') return 'Cultural & Heritage Sites';
  if (tags.leisure) return 'Natural Landscapes & Wildlife';
  return 'Points of Interest';
}

function parseOpeningHours(value) {
  const match = String(value || '').match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  return match ? { openingTime: match[1], closingTime: match[2] } : { openingTime: null, closingTime: null };
}

function stableSourceId(value) {
  let hash = 0;
  for (const character of String(value || 'unknown')) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return (Math.abs(hash) % 2147483646) + 1;
}

function mergeUnique(existing, additions) {
  const result = [...existing];
  const names = new Set(result.map((item) => item.name.toLowerCase()));
  additions.forEach((item) => {
    if (item?.name && !names.has(item.name.toLowerCase())) {
      names.add(item.name.toLowerCase());
      result.push(item);
    }
  });
  return result;
}

module.exports = { backfillCandidates, needsBackfill, MAX_BACKFILL_SEARCHES };
