import ActivityCard from './ActivityCard';
import TravelTimeCard from './TravelTimeCard';
import { formatDate } from '../../utils/dateUtils';

export default function DayItinerary({
  day,
  onReplaceActivity,
  onSelectActivity,
  onOpenPhotos,
  backTo = '/dashboard',
  destination,
}) {
  const dayLabel = `Day ${day.day} in ${destination || 'your destination'}`;
  const hasSummary = day.summary && day.summary.trim().toLowerCase() !== dayLabel.toLowerCase();

  return (
    <div className="journal-sheet overflow-hidden p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-5 border-b border-stone-200 pb-5">
        <div className="min-w-0">
          <p className="eyebrow">Day {String(day.day).padStart(2, '0')} / route notes</p>
          <h3 className="mt-2 font-display text-2xl font-semibold">{formatDate(day.date)}</h3>
          <p className="mt-1 text-sm text-ink-500">{dayLabel}</p>
          {hasSummary && <p className="mt-1 max-w-xl text-sm text-ink-500">{day.summary}</p>}
          {day.weatherContext && <p className="mt-2 text-xs text-ink-500">{day.weatherContext}</p>}
        </div>
        {day.weather && (
          <div className="shrink-0 rounded-xl bg-sky-50 px-3 py-2 text-right text-xs text-sky-900" title={`Daily forecast high; provided by ${day.weather.source}.`}>
            <p className="font-semibold">{weatherIcon(day.weather.weather)} {day.weather.maxC != null ? `${Math.round(day.weather.maxC)}°C` : 'Forecast'} · {day.weather.weather || 'Conditions unavailable'}</p>
            {day.weather.minC != null && <p className="mt-1 text-sky-700">Low {Math.round(day.weather.minC)}°C</p>}
            <a href="https://open-meteo.com/en/licence" target="_blank" rel="noreferrer" className="mt-1 inline-block text-[0.65rem] underline">Weather by Open-Meteo</a>
          </div>
        )}
      </div>
      <div className="relative pl-1 before:absolute before:bottom-4 before:left-5 before:top-4 before:border-l before:border-dashed before:border-ocean/50">
        {day.activities.map((activity, idx) => (
          <div key={`${day.day}-${idx}`} className="relative">
            {activity.type === 'travel'
              ? <TravelTimeCard activity={activity} />
              : (
                <ActivityCard
                  activity={activity}
                  day={day.day}
                  activityIndex={idx}
                  onReplace={onReplaceActivity}
                  onSelectActivity={onSelectActivity}
                  onOpenPhotos={onOpenPhotos}
                  backTo={backTo}
                  destination={destination}
                />
              )}
          </div>
        ))}
      </div>
    </div>
  );
}

function weatherIcon(condition = '') {
  if (/rain|drizzle|thunder/i.test(condition)) return '🌧️';
  if (/snow/i.test(condition)) return '❄️';
  if (/fog|mist/i.test(condition)) return '🌫️';
  if (/clear/i.test(condition)) return '☀️';
  return '⛅';
}