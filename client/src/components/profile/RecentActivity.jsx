import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as activityService from '../../services/activityService';

const ACTIVITY_PRESENTATION = {
  trip_created: { icon: '✈', message: (meta) => `Created ${meta.tripName || 'a trip'}${meta.destination ? ` to ${meta.destination}` : ''}` },
  place_added: { icon: '📍', message: (meta) => `Added ${meta.placeName || 'a place'}${meta.tripName ? ` to ${meta.tripName}` : ''}` },
  place_replaced: { icon: '↻', message: (meta) => `Replaced ${meta.previousPlaceName || 'a place'} with ${meta.placeName || 'another place'}${meta.tripName ? ` in ${meta.tripName}` : ''}` },
  preferences_updated: { icon: '⚙', message: () => 'Updated travel preferences' },
  '3d_view_opened': { icon: '◉', message: (meta) => `Opened the 3D view for ${meta.placeName || 'a place'}` },
};

function relativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Time unavailable';
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (elapsedSeconds < 60) return formatter.format(-elapsedSeconds, 'second');
  if (elapsedSeconds < 3600) return formatter.format(-Math.floor(elapsedSeconds / 60), 'minute');
  if (elapsedSeconds < 86_400) return formatter.format(-Math.floor(elapsedSeconds / 3600), 'hour');
  return formatter.format(-Math.floor(elapsedSeconds / 86_400), 'day');
}

export default function RecentActivity() {
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadActivities() {
    setError('');
    setIsLoading(true);
    try {
      setActivities(await activityService.listRecentActivity());
    } catch (loadError) {
      setError(loadError.message || 'Recent activity could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadActivities();
    const refresh = () => loadActivities();
    window.addEventListener('travel-activity-updated', refresh);
    return () => window.removeEventListener('travel-activity-updated', refresh);
  }, []);

  return (
    <section aria-labelledby="recent-activity-title" className="card">
      <p className="eyebrow">The trail so far</p>
      <h2 id="recent-activity-title" className="mt-1 font-display text-2xl font-semibold">Recent activity</h2>
      {isLoading ? (
        <div role="status" aria-label="Loading recent activity" className="mt-5 space-y-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded bg-stone-100" />)}
        </div>
      ) : error ? (
        <div className="mt-4 text-sm text-clay-700">
          <p role="alert">{error}</p>
          <button type="button" onClick={loadActivities} className="mt-2 font-semibold underline">Try again</button>
        </div>
      ) : activities.length ? (
        <ol className="mt-4 divide-y divide-stone-200">
          {activities.map((activity) => {
            const presentation = ACTIVITY_PRESENTATION[activity.type];
            if (!presentation) return null;
            const message = presentation.message(activity.meta || {});
            const item = (
              <div className="flex min-w-0 items-start gap-3 py-3">
                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ocean-100 text-ocean-700">{presentation.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm text-ink">{message}</p>
                  <time dateTime={activity.createdAt} className="mt-1 block text-xs text-ink-500">{relativeTime(activity.createdAt)}</time>
                </div>
              </div>
            );
            return <li key={activity._id}>{activity.tripId ? <Link to={`/trip/${activity.tripId}`} className="block hover:bg-stone-100/60">{item}</Link> : item}</li>;
          })}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-ink-500">No recent activity.</p>
      )}
    </section>
  );
}
