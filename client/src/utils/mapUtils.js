import L from 'leaflet';
import { resolveIcon } from '../mapIcons/resolveIcon';

const COLORS = {
  poi: '#2B3A67',
  hotel: '#E8A33D',
  restaurant: '#C1502E',
  destination: '#3D8577',
  start: '#0F766E',
  end: '#7C2D12',
  generic: '#6B7280',
};

const markerCache = new Map();

function makeBodyHtml(color, label = '', selected = false, dimmed = false, badgeColor = '#111827') {
  const size = selected ? 30 : 24;
  const opacity = dimmed ? 0.45 : 1;
  const displayLabel = label || '•';
  return `
    <div class="travel-pin ${selected ? 'travel-pin--selected' : ''} ${dimmed ? 'travel-pin--dimmed' : ''}" style="--travel-pin-color:${color}; --travel-badge-color:${badgeColor};">
      <span class="travel-pin__body" style="width:${size}px;height:${size}px;opacity:${opacity};">${displayLabel}</span>
    </div>
  `;
}

export function createMarkerIcon(type = 'poi', order = null, { selected = false, dimmed = false, poi = null, badge = null, badgeColor = '#111827' } = {}) {
  const resolved = poi ? resolveIcon(poi) : { color: COLORS[type] || COLORS.poi, iconKey: type };
  const color = resolved.color || COLORS[type] || COLORS.poi;
  const label = badge != null ? String(badge) : order != null ? String(order) : '';
  const key = `${resolved.iconKey || type}|${label}|${selected ? 'selected' : 'normal'}|${dimmed ? 'dimmed' : 'plain'}|${badgeColor}`;
  if (markerCache.has(key)) return markerCache.get(key);

  const icon = L.divIcon({
    className: 'travel-manager-marker',
    html: makeBodyHtml(color, label, selected, dimmed, badgeColor),
    iconSize: [selected ? 32 : 26, selected ? 40 : 34],
    iconAnchor: [selected ? 16 : 13, selected ? 40 : 34],
    popupAnchor: [0, -26],
  });
  markerCache.set(key, icon);
  return icon;
}

export const INDIA_CENTER = { lat: 22.3511148, lng: 78.6677428 };
export const INDIA_DEFAULT_ZOOM = 5;

export function toLatLng(point) {
  if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return null;
  return [point.lat, point.lng];
}