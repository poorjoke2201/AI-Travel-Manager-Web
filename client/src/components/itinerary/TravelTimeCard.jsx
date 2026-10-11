export default function TravelTimeCard({ activity }) {
  if (!activity) return null;
  const distance = activity.distanceKm != null
    ? Number(activity.distanceKm).toFixed(1)
    : String(activity.notes || '').match(/(\d+(?:\.\d+)?)\s*km/i)?.[1];
  const modeIcon = { bus: '🚌', train: '🚆', flight: '✈️', bike: '🚲', car: '🚗' }[activity.travelMode] || '🚗';
  const minutes = Number(activity.duration);
  const duration = Number.isFinite(minutes) && minutes > 0
    ? minutes >= 60
      ? `~${(minutes / 60).toFixed(1)} hr`
      : `~${minutes} min`
    : null;

  return (
    <div className="flex items-center gap-2 py-2 pl-1 text-xs text-ink-400">
      <span className="h-5 w-px bg-stone-300" aria-hidden="true" />
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true">{modeIcon}</span>
        {duration || 'Travel time unavailable'}
        {distance && <span>· {distance} km</span>}
        {!distance && duration && <span>· distance unavailable</span>}
        {activity.isEstimated && <span>· estimated</span>}
      </span>
    </div>
  );
}