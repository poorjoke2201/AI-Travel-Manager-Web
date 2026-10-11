const MAPILLARY_API_URL = 'https://graph.mapillary.com/images';
const SEARCH_RADIUS_METERS = 100;
const MAX_IMAGES_PER_REQUEST = 2000;

function distanceMeters(a, b) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(b.lat - a.lat);
  const longitudeDelta = radians(b.lng - a.lng);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a.lat))
      * Math.cos(radians(b.lat))
      * Math.sin(longitudeDelta / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function isValidCoordinatePair(latitude, longitude) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

function buildSearchBounds({ lat, lng }) {
  const latitudeDelta = SEARCH_RADIUS_METERS / 111320;
  const longitudeDelta = SEARCH_RADIUS_METERS / (111320 * Math.cos((lat * Math.PI) / 180));

  return [
    lng - longitudeDelta,
    lat - latitudeDelta,
    lng + longitudeDelta,
    lat + latitudeDelta,
  ].join(',');
}

export async function fetchMapillaryPhotos({ latitude, longitude }, { signal } = {}) {
  const token = import.meta.env.VITE_MAPILLARY_TOKEN?.trim();
  if (!token) return { status: 'unconfigured', photos: [] };
  if (!isValidCoordinatePair(latitude, longitude)) return { status: 'invalid-location', photos: [] };

  const center = { lat: latitude, lng: longitude };
  const params = new URLSearchParams({
    bbox: buildSearchBounds(center),
    fields: 'id,computed_geometry,captured_at,thumb_1024_url',
    limit: String(MAX_IMAGES_PER_REQUEST),
  });
  let nextUrl = `${MAPILLARY_API_URL}?${params}`;
  const images = [];
  while (nextUrl) {
    const parsedUrl = new URL(nextUrl);
    if (parsedUrl.origin !== 'https://graph.mapillary.com') {
      throw new Error('Mapillary returned an unexpected pagination URL.');
    }
    const response = await fetch(nextUrl, {
      headers: { Authorization: `OAuth ${token}` },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Mapillary image search failed (${response.status}).`);
    }
    const payload = await response.json();
    images.push(...(Array.isArray(payload.data) ? payload.data : []));
    nextUrl = payload.paging?.next || null;
  }

  const photos = images
    .map((image) => {
      const coordinates = image.computed_geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
      const [lng, lat] = coordinates;
      if (!isValidCoordinatePair(lat, lng)) return null;

      const distance = distanceMeters(center, { lat, lng });
      const url = image.thumb_1024_url;
      if (!url || distance > SEARCH_RADIUS_METERS) return null;

      return {
        url,
        source: 'mapillary',
        pageUrl: `https://www.mapillary.com/app/?pKey=${encodeURIComponent(image.id)}`,
        capturedAt: Number.isFinite(image.captured_at) ? image.captured_at : null,
        distanceMeters: Math.round(distance),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return { status: 'loaded', photos };
}
