export default function TravelTimeCard({ activity }) {
  if (!activity) return null;
  const label = activity.notes || null;
  const duration = activity.duration || null;

  return (
    <div className="flex items-center gap-3 py-1 pl-2.5 text-xs text-ink-300">
      <span className="h-6 w-px bg-stone-300" aria-hidden="true" />
      <span className="flex items-center gap-1">
        <span>🚗</span>
        {duration ? `~${duration} min` : 'Travel'}
        {label && <span className="text-ink-200"> · {label}</span>}
      </span>
    </div>
  );
}