const Hotel = require('../../models/Hotel');
const POI = require('../../models/POI');
const Restaurant = require('../../models/Restaurant');
const { geocodeAddress, cityFallbackCoords } = require('../maps/geocoding.service');
const { haversineDistanceKm } = require('../../utils/haversine');

const FALLBACK_HOTEL_NAMES = ['City Center Stay', 'Heritage Base Hotel', 'Local Comfort Inn'];
const FALLBACK_PLACE_NAMES = ['Heritage walk', 'Market street', 'Panorama viewpoint'];
const FALLBACK_RESTAURANT_NAMES = ['Local food house', 'Street food lane', 'Town cafe'];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePrice(value, fallback) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

async function persistHotelCandidate({ city, name, pricePerNightInr, googleRating, description }) {
  const safeCity = city?.trim();
  const safeName = name?.trim();
  if (!safeCity || !safeName) return null;

  const existing = await Hotel.findOne({
    city: new RegExp(`^${escapeRegex(safeCity)}$`, 'i'),
    name: new RegExp(`^${escapeRegex(safeName)}$`, 'i'),
  }).lean();

  if (existing) return existing;

  const coords = await geocodeAddress(`${safeName}, ${safeCity}, India`) || cityFallbackCoords(safeCity);
  const hotel = await Hotel.create({
    sourceId: Math.abs(Number(`${Date.now()}${Math.random().toString().slice(2, 8)}`)),
    name: safeName,
    city: safeCity,
    googleRating: normalizePrice(googleRating, 4.1),
    pricePerNightInr: normalizePrice(pricePerNightInr, 1800),
    conditionLabel: 'Web-discovered stay',
    description: description || 'Web-discovered stay added during trip discovery.',
    source: 'web-discovery',
    location: coords ? { type: 'Point', coordinates: [coords.lng, coords.lat] } : undefined,
  });

  return hotel;
}

async function persistPoiCandidate({ city, name, category = 'Points of Interest', description }) {
  const safeCity = city?.trim();
  const safeName = name?.trim();
  if (!safeCity || !safeName) return null;

  const existing = await POI.findOne({
    city: new RegExp(`^${escapeRegex(safeCity)}$`, 'i'),
    name: new RegExp(`^${escapeRegex(safeName)}$`, 'i'),
  }).lean();

  if (existing) return existing;

  const coords = await geocodeAddress(`${safeName}, ${safeCity}, India`) || cityFallbackCoords(safeCity);
  const poi = await POI.create({
    sourceId: Math.abs(Number(`${Date.now()}${Math.random().toString().slice(2, 8)}`)),
    name: safeName,
    city: safeCity,
    country: 'India',
    category,
    description: description || 'Web-discovered place added during trip discovery.',
    source: 'web-discovery',
    sourceRef: `web-${Date.now()}`,
    latitude: coords ? coords.lat : null,
    longitude: coords ? coords.lng : null,
    location: coords ? { type: 'Point', coordinates: [coords.lng, coords.lat] } : undefined,
  });

  return poi;
}

async function persistRestaurantCandidate({ city, name, cuisine = ['local'], description }) {
  const safeCity = city?.trim();
  const safeName = name?.trim();
  if (!safeCity || !safeName) return null;

  const existing = await Restaurant.findOne({
    city: new RegExp(`^${escapeRegex(safeCity)}$`, 'i'),
    name: new RegExp(`^${escapeRegex(safeName)}$`, 'i'),
  }).lean();

  if (existing) return existing;

  const coords = await geocodeAddress(`${safeName}, ${safeCity}, India`) || cityFallbackCoords(safeCity);
  const restaurant = await Restaurant.create({
    sourceId: Math.abs(Number(`${Date.now()}${Math.random().toString().slice(2, 8)}`)),
    name: safeName,
    city: safeCity,
    cuisine,
    rating: 4.2,
    description: description || 'Web-discovered restaurant added during trip discovery.',
    source: 'web-discovery',
    location: coords ? { type: 'Point', coordinates: [coords.lng, coords.lat] } : undefined,
  });

  return restaurant;
}

function buildTravelOption(mode, summary, approxPriceInr, approxDurationHrs, distanceKm = null) {
  return {
    mode,
    summary,
    approxPriceInr: approxPriceInr == null ? null : Math.round(approxPriceInr),
    approxDurationHrs: approxDurationHrs == null ? null : Number(approxDurationHrs.toFixed(1)),
    distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(1)),
    isLiveAvailability: false,
    source: 'web-discovery',
  };
}

async function discoverWebOptions({ destination, origin, travelStyle, budget, placePreferences = [], foodPreferences = [] }) {
  const destinationKey = destination?.trim();
  const originKey = origin?.trim();
  const destCoords = destinationKey ? (await geocodeAddress(`${destinationKey}, India`)) || cityFallbackCoords(destinationKey) : null;
  const originCoords = originKey ? (await geocodeAddress(`${originKey}, India`)) || cityFallbackCoords(originKey) : null;
  const travelKm = originCoords && destCoords ? haversineDistanceKm(originCoords, destCoords) : 220;
  const dailyBudget = Number(budget) || 20000;

  const stayNames = [
    `${destinationKey || 'Destination'} Heritage Stay`,
    `${destinationKey || 'Destination'} Central Hotel`,
    `${destinationKey || 'Destination'} Local Comfort Inn`,
  ];

  const placeNames = [
    ...(placePreferences.length ? placePreferences.slice(0, 2) : []),
    ...FALLBACK_PLACE_NAMES,
  ].slice(0, 3);

  const restaurantNames = [
    ...(foodPreferences.length ? foodPreferences.slice(0, 2) : []),
    ...FALLBACK_RESTAURANT_NAMES,
  ].slice(0, 3);

  const stays = [];
  const places = [];
  const restaurants = [];

  for (const [index, stayName] of stayNames.entries()) {
    const hotel = await persistHotelCandidate({
      city: destinationKey,
      name: stayName,
      pricePerNightInr: Math.max(1200, Math.round((dailyBudget * 0.12) + index * 400)),
      googleRating: 4.1 + index * 0.3,
      description: `Web-discovered stay in ${destinationKey} for a ${travelStyle || 'balanced'} trip.`,
    });
    if (hotel) {
      stays.push({
        id: String(hotel._id),
        name: hotel.name,
        googleRating: hotel.googleRating,
        pricePerNightInr: hotel.pricePerNightInr,
        conditionLabel: hotel.conditionLabel,
        amenities: ['Web-discovered stay'],
        latitude: hotel.location?.coordinates?.[1] ?? null,
        longitude: hotel.location?.coordinates?.[0] ?? null,
        label: 'Web-discovered stay',
        source: 'web-discovery',
      });
    }
  }

  for (const [index, placeName] of placeNames.entries()) {
    const poi = await persistPoiCandidate({
      city: destinationKey,
      name: placeName,
      category: index === 0 ? 'Cultural & Heritage Sites' : 'Points of Interest',
      description: `${placeName} is a suggested local stop for your ${destinationKey} plan.`,
    });
    if (poi) {
      places.push({
        id: String(poi._id),
        name: poi.name,
        googleRating: poi.googleRating ?? 4.2,
        category: poi.category,
        latitude: poi.latitude,
        longitude: poi.longitude,
        source: 'web-discovery',
      });
    }
  }

  for (const [index, restaurantName] of restaurantNames.entries()) {
    const restaurant = await persistRestaurantCandidate({
      city: destinationKey,
      name: restaurantName,
      cuisine: foodPreferences.length ? foodPreferences.slice(0, 2) : ['local', 'street food'],
      description: `${restaurantName} is a suggested food stop in ${destinationKey}.`,
    });
    if (restaurant) {
      restaurants.push({
        id: String(restaurant._id),
        name: restaurant.name,
        cuisine: restaurant.cuisine,
        rating: restaurant.rating,
        latitude: restaurant.location?.coordinates?.[1] ?? null,
        longitude: restaurant.location?.coordinates?.[0] ?? null,
        source: 'web-discovery',
      });
    }
  }

  const transport = [
    buildTravelOption('train', `Train is usually the most practical option from ${originKey || 'your origin'} to ${destinationKey}.`, Math.max(600, dailyBudget * 0.12), Math.max(6, travelKm / 40), travelKm),
    buildTravelOption('bus', `Coach or bus is a good value option if you want a lower-cost trip.`, Math.max(450, dailyBudget * 0.08), Math.max(7, travelKm / 35), travelKm),
    buildTravelOption('car', `Road trip keeps your timing flexible and is useful for local movement.`, Math.max(1200, dailyBudget * 0.18), Math.max(5, travelKm / 60), travelKm),
  ];

  const intracity = [
    buildTravelOption('bus', `Local bus is the most budget-friendly option for daily city movement.`, Math.max(80, dailyBudget * 0.006), 1.5, 8),
    buildTravelOption('car', `Cab is fastest for short hops and airport or station transfers.`, Math.max(240, dailyBudget * 0.012), 1.0, 6),
    buildTravelOption('bike', `Bike or scooter is practical for nearby stops in compact city areas.`, Math.max(160, dailyBudget * 0.008), 0.8, 4),
  ];

  return { destination: destCoords, places, stays, restaurants, transport, intracityTransport: intracity };
}

module.exports = { discoverWebOptions, persistHotelCandidate, persistPoiCandidate, persistRestaurantCandidate };
