const axios = require('axios');
const { env } = require('../../config/env');
const logger = require('../../utils/logger');

const client = axios.create({
  baseURL: 'https://api.geoapify.com/v1',
  timeout: 8000,
});

const placesClient = axios.create({
  baseURL: 'https://api.geoapify.com/v2',
  timeout: 8000,
});

/**
 * Geocodes a free-text query using Geoapify.
 * Returns { lat, lng, formattedAddress } or null on any failure.
 * Used as the fallback when Google Maps geocoding is unavailable.
 */
async function geoapifyGeocode(query) {
  if (!env.geoapifyGeocodingApiKey || env.geoapifyGeocodingApiKey.startsWith('<')) return null;
  if (!query || !query.trim()) return null;

  try {
    const { data } = await client.get('/geocode/search', {
      params: {
        text: query,
        filter: 'countrycode:in', // restrict to India
        limit: 1,
        apiKey: env.geoapifyGeocodingApiKey,
      },
    });

    const feature = data.features && data.features[0];
    if (!feature) return null;

    const [lng, lat] = feature.geometry.coordinates;
    return { lat, lng, formattedAddress: feature.properties.formatted };
  } catch (err) {
    logger.warn(`Geoapify geocode failed for "${query}"`, err.message);
    return null;
  }
}

/** Searches Geoapify Places around a coordinate using one or more categories. */
async function searchGeoapifyPlaces({ lat, lng, radiusKm = 10, categories }) {
  if (!env.geoapifyPlacesApiKey || env.geoapifyPlacesApiKey.startsWith('<')) return [];
  if (typeof lat !== 'number' || typeof lng !== 'number' || !categories?.length) return [];

  try {
    const { data } = await placesClient.get('/places', {
      params: {
        categories: categories.join(','),
        filter: `circle:${lng},${lat},${Math.round(radiusKm * 1000)}`,
        limit: 50,
        apiKey: env.geoapifyPlacesApiKey,
      },
    });
    return Array.isArray(data.features) ? data.features : [];
  } catch (err) {
    logger.warn('Geoapify Places search failed', err.message);
    return [];
  }
}

/**
 * Gets a street route for an ordered set of points using Geoapify Routing.
 * Geoapify returns GeoJSON coordinates as [lng, lat], so normalize them to
 * the [lat, lng] shape used by Leaflet throughout the application.
 */
async function getGeoapifyRoute(origin, destination, waypoints = [], mode = 'drive') {
  if (!env.geoapifyRoutingApiKey || env.geoapifyRoutingApiKey.startsWith('<')) return null;

  const locations = [origin, ...waypoints, destination]
    .map((point) => `${point.lat},${point.lng}`)
    .join('|');

  try {
    const { data } = await client.get('/routing', {
      params: {
        waypoints: locations,
        mode: mode === 'walking' ? 'walk' : mode === 'bicycling' ? 'bicycle' : 'drive',
        apiKey: env.geoapifyRoutingApiKey,
      },
    });

    const feature = data.features && data.features[0];
    const rawCoordinates = feature && feature.geometry && feature.geometry.coordinates;
    if (!Array.isArray(rawCoordinates) || !rawCoordinates.length) return null;

    const coordinates = feature.geometry.type === 'MultiLineString'
      ? rawCoordinates.flat()
      : rawCoordinates;

    return {
      provider: 'geoapify',
      distanceKm: feature.properties?.distance ? feature.properties.distance / 1000 : null,
      durationMinutes: feature.properties?.time ? Math.round(feature.properties.time / 60) : null,
      distanceText: feature.properties?.distance ? `${(feature.properties.distance / 1000).toFixed(1)} km` : null,
      durationText: feature.properties?.time ? `${Math.round(feature.properties.time / 60)} min` : null,
      geometry: coordinates.map(([lng, lat]) => [lat, lng]),
      steps: [],
    };
  } catch (err) {
    logger.warn('Geoapify routing failed', err.message);
    return null;
  }
}

/**
 * Fetches the richer details for a Geoapify Places result. The place ID must
 * come from the Places API and is stored as POI.sourceRef.
 */
async function getGeoapifyPlaceDetails(placeId) {
  if (!env.geoapifyPlaceDetailsApiKey || env.geoapifyPlaceDetailsApiKey.startsWith('<')) return null;
  if (!placeId) return null;

  try {
    const { data } = await placesClient.get('/place-details', {
      params: { id: placeId, apiKey: env.geoapifyPlaceDetailsApiKey },
    });
    const feature = data.features && data.features[0];
    if (!feature) return null;

    const properties = feature.properties || {};
    return {
      address: properties.formatted || properties.address_line1 || null,
      website: properties.website || properties.url || null,
      phone: properties.contact?.phone || properties.phone || null,
      imageUrl: properties.datasource?.raw?.image || properties.image || null,
      description: properties.description || null,
      openingTime: properties.opening_hours || null,
      sourceRef: properties.place_id || placeId,
    };
  } catch (err) {
    logger.warn(`Geoapify place details failed for "${placeId}"`, err.message);
    return null;
  }
}

/**
 * Orders a day's stops as a closed accommodation loop. Route Planner returns
 * the optimized waypoint order; detailed road geometry is still requested
 * separately from the Routing API for display and leg distances.
 */
async function planGeoapifyRoute(accommodation, stops, mode = 'drive') {
  if (!env.geoapifyRoutePlannerApiKey || env.geoapifyRoutePlannerApiKey.startsWith('<')) return null;
  if (!accommodation || !stops?.length) return null;

  const jobs = stops.map((stop, index) => ({
    id: `stop-${index}`,
    location: [stop.lng, stop.lat],
    duration: Math.max(0, Number(stop.duration || 0)) * 60,
    priority: 100 - index,
  }));

  try {
    const { data } = await client.post('/routeplanner', {
      mode,
      agents: [{
        id: 'accommodation-loop',
        start_location: [accommodation.lng, accommodation.lat],
        end_location: [accommodation.lng, accommodation.lat],
        time_windows: [[0, 86400]],
      }],
      jobs,
    }, {
      params: { apiKey: env.geoapifyRoutePlannerApiKey },
      headers: { 'Content-Type': 'application/json' },
    });

    const plan = data.features?.[0];
    const waypoints = plan?.properties?.waypoints;
    if (!Array.isArray(waypoints) || waypoints.length < 2) return null;

    const ordered = waypoints
      .map((waypoint) => {
        const jobAction = waypoint.actions?.find((action) => action.job_id || action.job_index != null);
        const jobId = jobAction?.job_id || (jobAction?.job_index != null ? `stop-${jobAction.job_index}` : null);
        return jobId ? stops[Number(jobId.replace('stop-', ''))] : null;
      })
      .filter(Boolean);

    if (ordered.length !== stops.length) return null;
    return {
      provider: 'geoapify-route-planner',
      orderedStops: ordered,
      geometry: plan.geometry || null,
      distanceKm: plan.properties?.distance ? plan.properties.distance / 1000 : null,
      durationMinutes: plan.properties?.time ? Math.round(plan.properties.time / 60) : null,
    };
  } catch (err) {
    logger.warn('Geoapify route planner failed', err.message);
    return null;
  }
}

module.exports = { geoapifyGeocode, searchGeoapifyPlaces, getGeoapifyRoute, getGeoapifyPlaceDetails, planGeoapifyRoute };
