const TYPE_ICON = { poi: '📍', restaurant: '🍽️', hotel: '🏨', travel: '🚕', break: '☕' };

export default function ActivityCard({ activity }) {
  return (
    <div className="flex gap-4 rounded-xs border border-stone-300 bg-white p-4">
      <div className="w-16 shrink-0 text-sm font-semibold text-ink-500">{activity.startTime || '--:--'}</div>
      <div className="flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span aria-hidden="true">{TYPE_ICON[activity.type] || '📍'}</span>
          <h4 className="font-semibold text-ink">{activity.name}</h4>
          {activity.source === 'gemini' && (
            <span className="tag-chip !border-indigo-100 bg-indigo-100 text-xs text-indigo-700">AI-suggested</span>
          )}
        </div>
        {activity.notes && <p className="text-sm text-ink-500">{activity.notes}</p>}
        {activity.duration && <p className="mt-1 text-xs text-ink-300">{activity.duration} min</p>}
      </div>
    </div>
  );
}