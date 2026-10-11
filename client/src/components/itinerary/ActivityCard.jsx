import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildPoi3DViewUrl } from '../../utils/poi3dView';
import { getActivityCategory, getActivityPhotos, getActivityStopId, getActivityTags } from '../../utils/activityCategory';

export default function ActivityCard({
  activity,
  day,
  activityIndex,
  onReplace,
  onSelectActivity,
  onOpenPhotos,
  backTo = '/dashboard',
  destination,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const category = getActivityCategory(activity);
  const tags = getActivityTags(activity);
  const photos = getActivityPhotos(activity);
  const cardImageUrl = activity.imageUrl || photos[0] || null;
  const stopId = getActivityStopId(activity, day, activityIndex);
  const view3DUrl = ['poi', 'restaurant', 'hotel', 'attraction', 'place'].includes(activity.type)
    ? buildPoi3DViewUrl({
      latitude: activity.location?.lat,
      longitude: activity.location?.lng,
      name: activity.name,
      city: activity.city,
      destination,
      backTo,
    })
    : null;

  useEffect(() => {
    setImageFailed(false);
  }, [cardImageUrl]);

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
    <article className="my-2 grid gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_8rem]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ${category.style}`}>
            <span aria-hidden="true">{category.icon}</span>
            {category.label}
          </span>
          {activity.source === 'gemini' && (
            <span className="tag-chip !border-indigo-100 bg-indigo-50 !px-2 !py-0.5 text-[0.68rem] text-indigo-700">AI-suggested</span>
          )}
        </div>

        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 text-left"
          onClick={() => {
            setIsExpanded(!isExpanded);
            onSelectActivity?.(stopId, day);
          }}
          aria-expanded={isExpanded}
        >
          <h4 className="font-display text-lg font-semibold leading-snug text-ink">{activity.name}</h4>
          <span className={`shrink-0 pt-1 text-sm text-ink-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
        </button>

        <p className="mt-1 text-xs text-ink-500">
          {activity.startTime && activity.endTime
            ? `${formatLocalTime(activity.startTime)} – ${formatLocalTime(activity.endTime)}`
            : activity.startTime
              ? formatLocalTime(activity.startTime)
              : activity.duration
                ? `${activity.duration} min`
                : 'Time not set'}
          {(activity.city || destination) && ` · ${activity.city || destination}`}
        </p>

        {activity.description && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-ink-500">{activity.description}</p>}

        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full bg-sky-50 px-2 py-1 text-[0.65rem] font-medium text-sky-800">{tag}</span>
            ))}
          </div>
        )}

        {isExpanded && (
          <div className="mt-3 border-t border-stone-100 pt-3 text-xs text-ink-500">
            {activity.notes && <p>{activity.notes}</p>}
            {activity.phone && <p className="mt-1">Phone: {activity.phone}</p>}
            {activity.website && (
              <a className="mt-2 inline-block font-semibold text-indigo hover:underline" href={activity.website} target="_blank" rel="noreferrer">
                Visit place website
              </a>
            )}
            {activity.location?.lat != null && <p className="mt-1 text-ink-400">Mapped location available</p>}
            {onReplace && ['poi', 'restaurant', 'hotel'].includes(activity.type) && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isReplacing}
                  onClick={() => replace('nearby')}
                  className="rounded-full bg-stone-100 px-2.5 py-1.5 font-semibold text-ink-600 transition-colors hover:bg-ocean-100 hover:text-ocean-700 disabled:opacity-50"
                >
                  {isReplacing ? 'Finding…' : '↻ Nearby alternative'}
                </button>
                <button
                  type="button"
                  disabled={isReplacing}
                  onClick={() => replace('farther')}
                  className="rounded-full bg-stone-100 px-2.5 py-1.5 font-semibold text-ink-600 transition-colors hover:bg-ocean-100 hover:text-ocean-700 disabled:opacity-50"
                >
                  ↗ Farther alternative
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:content-start">
        {cardImageUrl && !imageFailed ? (
          <img
            src={cardImageUrl}
            alt={`Photo of ${activity.name}`}
            onError={() => setImageFailed(true)}
            className="col-span-2 h-24 w-full rounded-lg object-cover"
          />
        ) : (
          <div className="col-span-2 grid h-24 w-full place-items-center rounded-lg bg-stone-100" aria-label={`No photo available for ${activity.name}`}>
            <img src="/assets/places/placeholder.svg" alt="" className="h-full w-full object-cover" />
          </div>
        )}
        {view3DUrl && (
          <Link
            to={view3DUrl}
            className="inline-flex min-w-0 items-center justify-center gap-1 rounded-lg border border-sky-100 bg-sky-50 px-1.5 py-2 text-[0.68rem] font-semibold text-sky-800 transition-colors hover:bg-sky-100"
          >
            <span aria-hidden="true">◈</span> View 3D
          </Link>
        )}
        {onOpenPhotos && (
          <button
            type="button"
            onClick={() => onOpenPhotos(activity)}
            className="inline-flex min-w-0 items-center justify-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-1.5 py-2 text-[0.68rem] font-semibold text-ink-600 transition-colors hover:bg-stone-100"
          >
            <span aria-hidden="true">▧</span> Photos
          </button>
        )}
      </div>
    </article>
  );
}

function formatLocalTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}
