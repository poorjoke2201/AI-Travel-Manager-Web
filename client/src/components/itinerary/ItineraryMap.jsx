import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { getActivityCategory, getActivityCategoryLegend, getActivityPhotos, getActivityStopId, getActivityTags } from '../../utils/activityCategory';
import { buildPoi3DViewUrl } from '../../utils/poi3dView';
import { getPlaceTypeLabel } from '../../mapIcons/getPlaceTypeLabel';
import { createMarkerIcon, INDIA_CENTER } from '../../utils/mapUtils';
import api from '../../services/api';

export default function ItineraryMap({
  days = [],
  selectedDay = 1,
  onSelectDay = null,
  accommodation = null,
  selectedStopId,
  onSelectStop,
  onOpenPhotos,
  destination,
  backTo = '/explore',
}) {
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [localSelectedStopId, setLocalSelectedStopId] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');

  useEffect(() => {
    if (!days?.length) return;
    const idx = days.findIndex((day) => day.day === selectedDay);
    setSelectedDayIdx(idx >= 0 ? idx : 0);
  }, [days, selectedDay]);

  const day = days[selectedDayIdx];
  const requestedStopId = selectedStopId === undefined ? localSelectedStopId : selectedStopId;

  const routePoints = useMemo(() => {
    const activities = (day?.activities || [])
      .map((activity, activityIndex) => ({ activity, activityIndex }))
      .filter(({ activity }) => {
        const location = activity.location || activity.coordinates || activity.coords || activity.position;
        return location && typeof location.lat === 'number' && typeof location.lng === 'number';
      });

    const mappedStops = activities
      .filter(({ activity }) => ['poi', 'restaurant', 'hotel', 'attraction', 'place'].includes(activity.type))
      .map(({ activity, activityIndex }, index) => ({
        ...activity,
        ...activity.location,
        name: activity.name || 'Unnamed place',
        category: activity.category || activity.poiType || activity.type || 'place',
        poiType: activity.poiType || null,
        order: index + 1,
        startTime: activity.startTime,
        day: day.day,
        activity,
        stopId: getActivityStopId(activity, day.day, activityIndex),
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
      activity: {
        name: accommodation.name || 'Accommodation',
        type: 'hotel',
        category: 'hotel',
        location: { lat: accommodation.latitude, lng: accommodation.longitude },
      },
      stopId: `accommodation-${day.day}-start`,
    };
    return [hotel, ...mappedStops.map((stop, index) => ({ ...stop, order: index + 2 })), {
      ...hotel,
      order: mappedStops.length + 2,
      stopId: `accommodation-${day.day}-end`,
    }];
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

  const defaultSelectedPoint = displayPoints.find((point) => !point.stopId.startsWith('accommodation-')) || displayPoints[0] || null;
  const activeStopId = displayPoints.some((point) => point.stopId === requestedStopId)
    ? requestedStopId
    : defaultSelectedPoint?.stopId || null;
  const selectedPoint = displayPoints.find((point) => point.stopId === activeStopId) || null;
  const center = displayPoints.length ? displayPoints[0] : INDIA_CENTER;
  const pointKey = routePoints.map((point) => `${point.lat},${point.lng}`).join('|');
  const legendCategories = getActivityCategoryLegend();
  const cartoKey = import.meta.env.VITE_CARTO_API_KEY?.trim();
  const tileUrl = cartoKey
    ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution = cartoKey
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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

  function selectStop(stopId) {
    if (onSelectStop) onSelectStop(stopId);
    else setLocalSelectedStopId(stopId);
  }

  function focusStop(point) {
    setFocusRequest((current) => ({ point, sequence: (current?.sequence || 0) + 1 }));
  }

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
                if (onSelectStop) onSelectStop(null);
                else setLocalSelectedStopId(null);
              }}
              className={`rounded-full border border-transparent px-3 py-1 text-sm transition-colors ${
                idx === selectedDayIdx
                  ? 'bg-ocean text-white'
                  : 'bg-stone-100 text-ink-600 hover:bg-stone-200'
              }`}
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
          <div className="relative">
            <MapContainer key={selectedDayIdx} center={[center.lat, center.lng]} zoom={13} style={{ height: '420px', borderRadius: '12px' }}>
              <FitRouteBounds points={displayPoints} />
              <FocusSelectedStop request={focusRequest} />
              <TileLayer
                attribution={tileAttribution}
                url={tileUrl}
              />
              {displayPoints.map((point) => {
                const category = getActivityCategory(point);
                const icon = createMarkerIcon(point.type, point.order, {
                  selected: point.stopId === activeStopId,
                  poi: point,
                  badge: point.order,
                  badgeColor: '#ffffff',
                  color: category.color,
                });

                return (
                  <Marker
                    key={point.stopId}
                    position={[point.displayLat, point.displayLng]}
                    icon={icon}
                    eventHandlers={{ click: () => selectStop(point.stopId) }}
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
                  pathOptions={{ color: '#245DA8', weight: routeGeometry.length ? 5 : 2, dashArray: routeGeometry.length ? undefined : '6 4' }}
                />
              )}
            </MapContainer>
            {legendCategories.length > 0 && (
              <div className="absolute right-3 top-3 z-[1000] max-w-44 rounded-xl border border-stone-200 bg-white/95 p-3 shadow-lg">
                <p className="mb-2 text-xs font-bold text-ink">Map legend</p>
                <ul className="space-y-1.5">
                  {legendCategories.map((category) => (
                    <li key={category.label} className="flex items-center gap-2 text-xs text-ink-600">
                      <span className="grid h-5 w-5 place-items-center rounded-full text-[0.65rem] text-white" style={{ backgroundColor: category.color }}>
                        {category.icon}
                      </span>
                      {category.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {selectedPoint && (
            <SelectedActivityPanel
              point={selectedPoint}
              destination={destination}
              backTo={backTo}
              onOpenPhotos={onOpenPhotos}
              onViewOnMap={() => focusStop(selectedPoint)}
            />
          )}
        </>
      )}
    </div>
  );
}

function SelectedActivityPanel({ point, destination, backTo, onOpenPhotos, onViewOnMap }) {
  const previewRef = useRef(null);
  const activity = point.activity || point;
  const category = getActivityCategory(activity);
  const tags = getActivityTags(activity);
  const photos = getActivityPhotos(activity);
  const view3DUrl = buildPoi3DViewUrl({
    latitude: activity.location?.lat ?? point.lat,
    longitude: activity.location?.lng ?? point.lng,
    name: activity.name,
    city: activity.city,
    destination,
    backTo,
  });
  const embedded3DUrl = view3DUrl ? `${view3DUrl}&embed=1&height=120&pitch=55` : null;

  return (
    <section className="mt-4 grid gap-4 rounded-xl border border-stone-200 bg-white p-4 md:grid-cols-[minmax(12rem,0.9fr)_minmax(0,1.1fr)]">
      <div ref={previewRef} className="cesium-preview-shell relative h-60 min-h-60 overflow-hidden rounded-xl bg-ink-900">
        {embedded3DUrl ? (
          <iframe
            title={`Photorealistic 3D view of ${activity.name}`}
            src={embedded3DUrl}
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <div className="grid h-60 place-items-center text-white/70">3D coordinates unavailable</div>
        )}
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink/80 px-3 py-1 text-xs font-semibold text-white">3D View</span>
        <button
          type="button"
          onClick={() => previewRef.current?.requestFullscreen?.()}
          aria-label="Expand 3D preview"
          className="absolute right-3 top-3 z-[2] rounded-lg bg-white/90 px-2.5 py-1.5 text-sm font-semibold text-ink hover:bg-white"
        >
          ⛶
        </button>
        {view3DUrl && <Link to={view3DUrl} className="absolute bottom-3 right-3 z-[2] rounded-lg bg-white px-3 py-2 text-xs font-semibold text-ocean-700 shadow">Open full 3D view</Link>}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${category.style}`}>
              <span aria-hidden="true">{category.icon}</span> {category.label}
            </span>
            <h3 className="mt-2 font-display text-xl font-semibold text-ink">{activity.name}</h3>
            <p className="mt-1 text-xs text-ink-500">
              {activity.startTime && activity.endTime
                ? `${formatLocalTime(activity.startTime)} – ${formatLocalTime(activity.endTime)}`
                : activity.startTime
                  ? formatLocalTime(activity.startTime)
                  : 'Time not set'}
              {activity.city && ` · ${activity.city}`}
            </p>
          </div>
          <button type="button" onClick={onViewOnMap} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-ocean-700 hover:bg-sky-50">View on Map</button>
        </div>

        {activity.description && <p className="mt-3 text-sm leading-relaxed text-ink-500">{activity.description}</p>}
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => <span key={tag} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-800">{tag}</span>)}
          </div>
        )}

        <div className="mt-4 border-t border-stone-100 pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">Photos ({photos.length})</p>
            {photos.length > 0 && onOpenPhotos && (
              <button type="button" onClick={() => onOpenPhotos(activity)} className="text-xs font-semibold text-ocean-700 hover:underline">View All</button>
            )}
          </div>
          {photos.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto">
              {photos.slice(0, 6).map((photo, index) => (
                <button
                  key={`${photo}-${index}`}
                  type="button"
                  onClick={() => onOpenPhotos?.(activity, index)}
                  className="h-14 w-16 shrink-0 overflow-hidden rounded-lg border-2 border-stone-200 hover:border-ocean"
                  aria-label={`Open photo ${index + 1}`}
                >
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-400">No photos available yet.</p>
          )}
        </div>
      </div>
    </section>
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

function FocusSelectedStop({ request }) {
  const map = useMap();

  useEffect(() => {
    if (!request?.point) return;
    map.setView([request.point.displayLat, request.point.displayLng], Math.max(15, map.getZoom()), { animate: true });
  }, [map, request]);

  return null;
}

function formatLocalTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}
