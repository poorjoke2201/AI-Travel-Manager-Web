const { geocodeAddress, cityFallbackCoords } = require('../maps/geocoding.service');
const { getRoute } = require('../maps/routing.service');
const { enrichCityDataIfNeeded } = require('../scraper/cityData.service');
const { recommendPOIs } = require('../recommendation/poiRecommendation.service');
const { recommendHotels } = require('../recommendation/hotelRecommendation.service');
const { recommendRestaurants } = require('../recommendation/restaurantRecommendation.service');
const { buildTransportPrompt } = require('../ai/geminiPrompts');
const { generateValidatedJson } = require('../ai/gemini.service');
const { validateTransport } = require('../ai/geminiValidator');
const { haversineDistanceKm } = require('../../utils/haversine');
const { discoverWebOptions } = require('../webDiscovery/webDiscovery.service');

const DESTINATION_RADIUS_KM = 100;

function computeNumberOfDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0)) / 86400000) + 1;
}

function nearDestination(candidate, destinationCoords) {
  if (!destinationCoords || typeof candidate.latitude !== 'number' || typeof candidate.longitude !== 'number') return true;
  return haversineDistanceKm(destinationCoords, { lat: candidate.latitude, lng: candidate.longitude }) <= DESTINATION_RADIUS_KM;
}

function serializeTrip(payload, destinationCoords) {
  return {
    ...payload,
    numberOfDays: computeNumberOfDays(payload.startDate, payload.endDate),
    destinationLocation: destinationCoords,
  };
}

function mergeTransportOptions(...optionLists) {
  const merged = [];
  const byMode = new Map();

  for (const options of optionLists) {
    for (const option of Array.isArray(options) ? options : []) {
      if (!option?.mode) continue;
      const existingIndex = byMode.get(option.mode);
      if (existingIndex == null) {
        byMode.set(option.mode, merged.length);
        merged.push(option);
      } else if (Number.isFinite(option.distanceKm) && !Number.isFinite(merged[existingIndex].distanceKm)) {
        merged[existingIndex] = option;
      }
    }
  }

  return merged;
}

function mergeDiscoveryResults(baseOptions = {}, webOptions = {}) {
  const merged = {
    destination: baseOptions.destination || webOptions.destination || null,
    places: [...(Array.isArray(baseOptions.places) ? baseOptions.places : []), ...(Array.isArray(webOptions.places) ? webOptions.places : [])],
    stays: [...(Array.isArray(baseOptions.stays) ? baseOptions.stays : []), ...(Array.isArray(webOptions.stays) ? webOptions.stays : [])],
    restaurants: [...(Array.isArray(baseOptions.restaurants) ? baseOptions.restaurants : []), ...(Array.isArray(webOptions.restaurants) ? webOptions.restaurants : [])],
    transport: mergeTransportOptions(baseOptions.transport, webOptions.transport),
    intracityTransport: [...(Array.isArray(baseOptions.intracityTransport) ? baseOptions.intracityTransport : []), ...(Array.isArray(webOptions.intracityTransport) ? webOptions.intracityTransport : [])],
  };

  return merged;
}

async function discoverTripOptions(payload) {
  await enrichCityDataIfNeeded(payload.destination);
  const destinationCoords = await geocodeAddress(`${payload.destination}, India`) || cityFallbackCoords(payload.destination);
  const trip = serializeTrip(payload, destinationCoords);
  const [pois, hotels, restaurants] = await Promise.all([
    recommendPOIs(trip, destinationCoords),
    recommendHotels(trip),
    recommendRestaurants(trip),
  ]);

  const originCoords = await geocodeAddress(`${payload.origin}, India`);
  let roadRoute = null;
  if (originCoords && destinationCoords) {
    roadRoute = await getRoute(originCoords, destinationCoords, [], 'driving');
  }

  const transportResult = await generateValidatedJson(buildTransportPrompt(trip), validateTransport);
  const transport = transportResult.ok
    ? transportResult.data.options.map((option) => ({ ...option, source: 'gemini', isLiveAvailability: false }))
    : [];
  if (roadRoute) {
    transport.push({
      mode: 'car',
      summary: `Road route via ${roadRoute.provider || 'maps'} from ${payload.origin} to ${payload.destination}.`,
      approxDurationHrs: roadRoute.durationMinutes ? roadRoute.durationMinutes / 60 : null,
      approxPriceInr: null,
      distanceKm: roadRoute.distanceKm ?? null,
      isLiveAvailability: false,
      source: roadRoute.provider === 'geoapify' ? 'geoapify' : 'google_maps',
    });
  }

  const webDiscovery = await discoverWebOptions({
    destination: payload.destination,
    origin: payload.origin,
    travelStyle: payload.travelStyle,
    budget: payload.budget,
    placePreferences: payload.placePreferences || [],
    foodPreferences: payload.foodPreferences || [],
  });

  const merged = mergeDiscoveryResults({
    destination: destinationCoords,
    places: pois.filter((item) => nearDestination(item, destinationCoords)).slice(0, 12),
    stays: hotels.filter((item) => nearDestination(item, destinationCoords)).slice(0, 8),
    restaurants: restaurants.filter((item) => nearDestination(item, destinationCoords)).slice(0, 8),
    transport,
  }, {
    destination: webDiscovery.destination,
    places: webDiscovery.places,
    stays: webDiscovery.stays,
    restaurants: webDiscovery.restaurants,
    transport: webDiscovery.transport,
    intracityTransport: webDiscovery.intracityTransport,
  });

  const intercityDistance = roadRoute?.distanceKm
    || (originCoords && destinationCoords ? haversineDistanceKm(originCoords, destinationCoords) : null);
  if (intercityDistance >= 500 && !merged.transport.some((option) => option.mode === 'flight')) {
    const budget = Number(payload.budget) || 25000;
    merged.transport.push({
      mode: 'flight',
      summary: `Flight is a time-saving option for this long intercity route. Check the operator for current schedules and fares.`,
      approxDurationHrs: Math.max(1, intercityDistance / 700),
      approxPriceInr: Math.max(1500, Math.round(budget * 0.35)),
      distanceKm: intercityDistance,
      isLiveAvailability: false,
      source: 'gemini',
    });
  }

  return {
    ...merged,
    intracityTransport: merged.intracityTransport.length ? merged.intracityTransport : transport,
  };
}

module.exports = { discoverTripOptions, mergeDiscoveryResults, mergeTransportOptions };
