import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { createMarkerIcon, INDIA_CENTER } from '../../utils/mapUtils';

/**
 * Google Maps handles routing/distance elsewhere in the app (spec section
 * 30) - this map's job is pure visualization via Leaflet + OpenStreetMap.
 * The polyline drawn here connects activities in itinerary order as a
 * straight-line approximation, not an actual road route.
 */
export default function ItineraryMap({ days = [] }) {
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const day = days[selectedDayIdx];

  const points = (day?.activities || [])
    .filter((a) => a.location && typeof a.location.lat === 'number' && typeof a.location.lng === 'number')
    .map((a) => ({ ...a.location, name: a.name, type: a.type }));

  const center = points.length ? points[0] : INDIA_CENTER;

  return (
    <div className="card">
      {days.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {days.map((d, idx) => (
            <button
              key={d.day}
              type="button"
              onClick={() => setSelectedDayIdx(idx)}
              className={`tag-chip ${idx === selectedDayIdx ? 'tag-chip-active' : ''}`}
            >
              Day {d.day}
            </button>
          ))}
        </div>
      )}

      {points.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-500">No mapped locations for this day yet.</p>
      ) : (
        <MapContainer center={[center.lat, center.lng]} zoom={12} style={{ height: '420px', borderRadius: '12px' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points.map((point, idx) => (
            // eslint-disable-next-line react/no-array-index-key
            <Marker key={idx} position={[point.lat, point.lng]} icon={createMarkerIcon(point.type)}>
              <Popup>{point.name}</Popup>
            </Marker>
          ))}
          {points.length > 1 && (
            <Polyline positions={points.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#2B3A67', weight: 3, dashArray: '6 6' }} />
          )}
        </MapContainer>
      )}
    </div>
  );
}