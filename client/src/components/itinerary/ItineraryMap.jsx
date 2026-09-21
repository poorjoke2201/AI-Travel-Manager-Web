import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { FEATURE_FLAGS } from '../../config/features';
import { getPlaceTypeLabel } from '../../mapIcons/getPlaceTypeLabel';
import { createMarkerIcon, INDIA_CENTER } from '../../utils/mapUtils';
import api from '../../services/api';

export default function ItineraryMap({ days = [], selectedDay = 1, onSelectDay = null, accommodation = null }) {
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');

  useEffect(() => {
    if (!days?.length) return;
    const idx = days.findIndex((day) => day.day === selectedDay);
    setSelectedDayIdx(idx >= 0 ? idx : 0);
  }, [days, selectedDay]);

  const day = days[selectedDayIdx];

  const routePoints = useMemo(() => {
    const activities = (day?.activities || []).filter((activity) => {
      const location = activity.location || activity.coordinates || activity.coords || activity.position;
      return location && typeof location.lat === 'number' && typeof location.lng === 'number';
    });

    const mappedStops = activities
      .filter((activity) => ['poi', 'restaurant', 'hotel', 'attraction', 'place'].includes(activity.type))
      .map((activity, index) => ({
        ...activity.location,
        name: activity.name || 'Unnamed place',
        type: activity.type || 'poi',
        category: activity.category || activity.poiType || activity.type || 'place',
        poiType: activity.poiType || null,
        order: index + 1,
        startTime: activity.startTime,
        day: day.day,
      }));

    if (!accommodation || typeof accommodation.latitude !== 'number' || typeof accommodation.longitude !== 'number') {
      return mappedStops;
    }

    const hotel = {
      lat: accommodation.latitude,
      lng: accommodation.longitude,
      name: accommodation.name || 'Accommodation',
      type: 'hotel',
      category: 'hotel',
      order: 1,
      startTime: null,
      day: day.day,
    };
    return [hotel, ...mappedStops.map((stop, index) => ({ ...stop, order: index + 2 })), { ...hotel, order: mappedStops.length + 2 }];
  }, [accommodation, day]);

  const displayPoints = useMemo(() => {
    const points = routePoints.map((point, index, allPoints) => {
      const sameLocationBefore = allPoints.slice(0, index).filter((other) => other.lat === point.lat && other.lng === point.lng).length;
      const angle = sameLocationBefore * (Math.PI / 3);
      const offset = sameLocationBefore ? 0.00035 : 0;
      return {
        ...point,
        displayLat: point.lat + Math.sin(angle) * offset,
        displayLng: point.lng + Math.cos(angle) * offset,
      };
    });
    return points;
  }, [routePoints]);

  const center = displayPoints.length ? displayPoints[0] : INDIA_CENTER;
  const pointKey = routePoints.map((point) => `${point.lat},${point.lng}`).join('|');

  useEffect(() => {
    let isCurrent = true;

    async function loadRoute() {
      if (routePoints.length < 2) {
        setRouteGeometry([]);
        setRouteError('');
        return;
      }

      setRouteLoading(true);
      setRouteError('');
      try {
        const { data } = await api.post('/maps/route', {
          origin: routePoints[0],
          destination: routePoints[routePoints.length - 1],
          waypoints: routePoints.slice(1, -1),
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
  }, [routePoints, pointKey]);

  return (
    <div className="card">
      {days.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {days.map((d, idx) => (
            <button
              key={d.day}
              type="button"
              onClick={() => {
                setSelectedDayIdx(idx);
                if (onSelectDay) onSelectDay(d.day);
              }}
              className={`tag-chip ${idx === selectedDayIdx ? 'tag-chip-active' : ''}`}
            >
              Day {d.day}
            </button>
          ))}
        </div>
      )}

      {displayPoints.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-500">No mapped locations for this day yet.</p>
      ) : (
        <>
          {routeLoading && <p className="mb-2 text-sm text-ink-500">Finding the best street route...</p>}
          {routeError && <p className="mb-2 text-sm text-clay">{routeError}</p>}
          <MapContainer key={selectedDayIdx} center={[center.lat, center.lng]} zoom={13} style={{ height: '420px', borderRadius: '12px' }}>
            <FitRouteBounds points={displayPoints} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {displayPoints.map((point) => {
              const icon = FEATURE_FLAGS.FEATURE_PLACE_PINS
                ? createMarkerIcon(point.type, point.order, { poi: point, badge: point.order, badgeColor: '#2F3F60' })
                : createMarkerIcon(point.type, point.order, { poi: point });

              return (
                <Marker
                  key={`${point.day}-${point.order}-${point.lat}-${point.lng}`}
                  position={[point.displayLat, point.displayLng]}
                  icon={icon}
                >
                  <Popup>
                    <div className="min-w-[200px] max-w-[240px] font-sans">
                      <div className="mb-1 font-semibold text-ink">{point.name || 'Unnamed place'}</div>
                      <div className="mb-1 text-xs text-ink-500">{getPlaceTypeLabel(point)}</div>
                      <div className="text-xs text-ink-500">Day {point.day} · Stop {point.order}</div>
                      {point.startTime && <div className="mt-1 text-xs text-ink-500">{point.startTime}</div>}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            {routePoints.length > 1 && (
              <Polyline
                positions={routeGeometry.length ? routeGeometry : routePoints.map((p) => [p.lat, p.lng])}
                pathOptions={{ color: '#2B3A67', weight: routeGeometry.length ? 5 : 2, dashArray: routeGeometry.length ? undefined : '6 4' }}
              />
            )}
          </MapContainer>
        </>
      )}
    </div>
  );
}

function FitRouteBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points.length < 2) return;
    const bounds = points.map((point) => [point.lat, point.lng]);
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
  }, [map, points]);

  return null;
}