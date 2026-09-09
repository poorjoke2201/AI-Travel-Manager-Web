import L from 'leaflet';

const COLORS = {
  poi: '#2B3A67', // indigo
  hotel: '#E8A33D', // marigold
  restaurant: '#C1502E', // clay
  destination: '#3D8577', // teal
};

/**
 * Builds a small circular divIcon instead of relying on Leaflet's default
 * marker PNGs, which require extra bundler config to resolve correctly
 * under Vite. Colors map to the app's Tailwind design tokens so map markers
 * feel consistent with the rest of the UI (indigo=POI, marigold=hotel,
 * clay=restaurant, teal=searched destination).
 */
export function createMarkerIcon(type = 'poi') {
  const color = COLORS[type] || COLORS.poi;
  return L.divIcon({
    className: 'travel-manager-marker',
    html: `<span style="
      display:block;width:16px;height:16px;border-radius:50%;
      background:${color};border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    "></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

/** India-centered default view for the Explore page before any search (spec section 29). */
export const INDIA_CENTER = { lat: 22.3511148, lng: 78.6677428 };
export const INDIA_DEFAULT_ZOOM = 5;

export function toLatLng(point) {
  if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return null;
  return [point.lat, point.lng];
}