import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { createMarkerIcon, INDIA_CENTER } from '../../utils/mapUtils';

export default function ItineraryMap({ days = [] }) {
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const day = days[selectedDayIdx];

  // Keep activities in itinerary order, only include mappable types with valid coords
  const points = (day?.activities || [])
    .map((a, idx) => ({ ...a, originalIndex: idx }))
    .filter((a) => ['poi', 'restaurant', 'hotel'].includes(a.type)
      && a.location
      && typeof a.location.lat === 'number'
      && typeof a.location.lng === 'number')
    .map((a, visitOrder) => ({ ...a.location, name: a.name, type: a.type, order: visitOrder + 1, startTime: a.startTime }));

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
        <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height: '420px', borderRadius: '12px' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points.map((point) => (
            <Marker
              key={`${point.order}-${point.lat}-${point.lng}`}
              position={[point.lat, point.lng]}
              icon={createMarkerIcon(point.type, point.order)}
            >
              <Popup>
                <span className="font-semibold">{point.order}. {point.name}</span>
                {point.startTime && <><br /><span className="text-xs text-gray-500">{point.startTime}</span></>}
              </Popup>
            </Marker>
          ))}
          {points.length > 1 && (
            <Polyline
              positions={points.map((p) => [p.lat, p.lng])}
              pathOptions={{ color: '#2B3A67', weight: 2, dashArray: '6 4' }}
            />
          )}
        </MapContainer>
      )}
    </div>
  );
}