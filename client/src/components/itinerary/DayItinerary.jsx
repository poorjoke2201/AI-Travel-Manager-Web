import ActivityCard from './ActivityCard';
import TravelTimeCard from './TravelTimeCard';
import { formatDate } from '../../utils/dateUtils';

export default function DayItinerary({ day }) {
  return (
    <div className="card">
      <div className="mb-4">
        <h3 className="font-display text-lg font-semibold">
          Day {day.day} - {formatDate(day.date)}
        </h3>
        {day.summary && <p className="text-sm text-ink-500">{day.summary}</p>}
        {day.weatherContext && <p className="mt-1 text-xs text-marigold-600">{day.weatherContext}</p>}
      </div>
      <div>
        {day.activities.map((activity, idx) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={`${day.day}-${idx}`}>
            <ActivityCard activity={activity} />
            {idx < day.activities.length - 1 && <TravelTimeCard />}
          </div>
        ))}
      </div>
    </div>
  );
}