import { useState } from 'react';

const TYPE_ICON = { poi: '📍', restaurant: '🍽️', hotel: '🏨', travel: '🚕', break: '☕' };

export default function ActivityCard({ activity, day, activityIndex, onReplace }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);

  async function replace(strategy) {
    if (!onReplace) return;
    setIsReplacing(true);
    try {
      await onReplace(day, activityIndex, strategy);
    } finally {
      setIsReplacing(false);
    }
  }

  return (
    <div className="border-b border-stone-200 py-3 last:border-b-0">
      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setIsExpanded(!isExpanded)} aria-expanded={isExpanded}>
      <div className="w-16 shrink-0 text-sm font-semibold text-ink-500">{activity.startTime || '--:--'}</div>
      <div className="flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span aria-hidden="true">{TYPE_ICON[activity.type] || '📍'}</span>
          <h4 className="font-semibold text-ink">{activity.name}</h4>
          {activity.source === 'gemini' && (
            <span className="tag-chip !border-indigo-100 bg-indigo-100 text-xs text-indigo-700">AI-suggested</span>
          )}
        </div>
        <p className="text-xs text-ink-400">
          {activity.startTime && activity.endTime ? `${formatLocalTime(activity.startTime)} - ${formatLocalTime(activity.endTime)}` : activity.duration ? `${activity.duration} min` : 'Details'}
          {' · '}{isExpanded ? 'Hide details' : 'View details'}
        </p>
      </div>
      <span className="text-ink-400" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
      </button>
      {isExpanded && (
        <div className="ml-16 mt-3 rounded-xs bg-stone-50 p-3 text-sm text-ink-500">
          {activity.notes && <p>{activity.notes}</p>}
          {activity.description && <p className="mt-1">{activity.description}</p>}
          {activity.phone && <p className="mt-1 text-xs">Phone: {activity.phone}</p>}
          {activity.website && (
            <a className="mt-2 inline-block text-xs font-semibold text-indigo hover:underline" href={activity.website} target="_blank" rel="noreferrer">
              Visit place website
            </a>
          )}
          {activity.location?.lat != null && <p className="mt-1 text-xs text-ink-400">Mapped location available</p>}
          {onReplace && ['poi', 'restaurant', 'hotel'].includes(activity.type) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={isReplacing} onClick={() => replace('nearby')} className="text-xs font-semibold text-indigo hover:underline">
                {isReplacing ? 'Finding...' : 'Find nearby alternative'}
              </button>
              <button type="button" disabled={isReplacing} onClick={() => replace('farther')} className="text-xs font-semibold text-indigo hover:underline">
                Find farther alternative
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatLocalTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}