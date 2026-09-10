import ActivityCard from './ActivityCard';
import TravelTimeCard from './TravelTimeCard';
import { formatDate } from '../../utils/dateUtils';

export default function DayItinerary({ day, onReplaceActivity }) {
  return (
    <div className="journal-sheet overflow-hidden p-6 sm:p-8">
      <div className="mb-6 flex items-start justify-between gap-5 border-b border-stone-200 pb-5">
        <div>
          <p className="eyebrow">Day {String(day.day).padStart(2, '0')} / route notes</p>
          <h3 className="mt-2 font-display text-2xl font-semibold">{formatDate(day.date)}</h3>
          {day.summary && <p className="mt-1 max-w-xl text-sm text-ink-500">{day.summary}</p>}
          {day.weatherContext && <p className="mt-2 text-xs font-semibold text-marigold-600">{day.weatherContext}</p>}
        </div>
        <img src="/assets/illustrations/location.svg" alt="" className="h-10 w-10 opacity-60" />
      </div>
      <div className="relative pl-1 before:absolute before:bottom-4 before:left-[4.25rem] before:top-4 before:border-l before:border-dashed before:border-ocean/50">
        {day.activities.map((activity, idx) => (
          <div key={`${day.day}-${idx}`} className="relative">
            {activity.type === 'travel'
              ? <TravelTimeCard activity={activity} />
              : <ActivityCard activity={activity} day={day.day} activityIndex={idx} onReplace={onReplaceActivity} />}
          </div>
        ))}
      </div>
    </div>
  );
}