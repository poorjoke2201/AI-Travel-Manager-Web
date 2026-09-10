import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { createMarkerIcon, INDIA_CENTER } from '../../utils/mapUtils';
import api from '../../services/api';

export default function ItineraryMap({ days = [] }) {
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const day = days[selectedDayIdx];

  // Keep activities in itinerary order, only include mappable types with valid coords
  const routeActivities = (day?.activities || [])
    .filter((activity) => activity.type === 'travel' && activity.location
      && typeof activity.location.lat === 'number'
      && typeof activity.location.lng === 'number');
  const baseStart = routeActivities.find((activity) => activity.name === 'Stay base → first stop')?.location;
  const baseEnd = [...routeActivities].reverse().find((activity) => activity.name === 'Return to accommodation')?.location;
  const places = (day?.activities || [])
    .map((a, idx) => ({ ...a, originalIndex: idx }))
    .filter((a) => ['poi', 'restaurant', 'hotel'].includes(a.type)
      && a.location
      && typeof a.location.lat === 'number'
      && typeof a.location.lng === 'number')
    .map((a, visitOrder) => ({ ...a.location, name: a.name, type: a.type, order: visitOrder + 1, startTime: a.startTime }));
  const points = baseStart
    ? [{ ...baseStart, name: 'Accommodation', type: 'hotel', order: 1 }, ...places.map((point, index) => ({ ...point, order: index + 2 })), ...(baseEnd ? [{ ...baseEnd, name: 'Accommodation', type: 'hotel', order: places.length + 2 }] : [])]
    : places;

  const center = points.length ? points[0] : INDIA_CENTER;
  const pointKey = points.map((point) => `${point.lat},${point.lng}`).join('|');

  useEffect(() => {
    let isCurrent = true;

    async function loadRoute() {
      if (points.length < 2) {
        setRouteGeometry([]);
        setRouteError('');
        return;
      }

      setRouteLoading(true);
      setRouteError('');
      try {
        const { data } = await api.post('/maps/route', {
          origin: points[0],
          destination: points[points.length - 1],
          waypoints: points.slice(1, -1),
          mode: 'driving',
        });
        if (!isCurrent) return;
        if (data.data?.geometry?.length) {
          setRouteGeometry(data.data.geometry);
        } else {
          setRouteGeometry([]);
          setRouteError('Street route unavailable. Showing direct connections instead.');
        }
      } catch (err) {
        if (!isCurrent) return;
        setRouteGeometry([]);
        setRouteError(err.message || 'Street route unavailable. Showing direct connections instead.');
      } finally {
        if (isCurrent) setRouteLoading(false);
      }
    }

    loadRoute();
    return () => {
      isCurrent = false;
    };
  }, [pointKey]);

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
        <>
          {routeLoading && <p className="mb-2 text-sm text-ink-500">Finding the best street route...</p>}
          {routeError && <p className="mb-2 text-sm text-clay">{routeError}</p>}
          <MapContainer key={selectedDayIdx} center={[center.lat, center.lng]} zoom={13} style={{ height: '420px', borderRadius: '12px' }}>
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
              positions={routeGeometry.length ? routeGeometry : points.map((p) => [p.lat, p.lng])}
              pathOptions={{ color: '#2B3A67', weight: routeGeometry.length ? 5 : 2, dashArray: routeGeometry.length ? undefined : '6 4' }}
            />
          )}
          </MapContainer>
        </>
      )}
    </div>
  );
}