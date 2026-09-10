import { Link } from 'react-router-dom';
import { formatDateRange } from '../../utils/dateUtils';
import { formatInr, pluralize, toTitleCase } from '../../utils/formatters';

const STATUS_STYLES = {
  draft: 'bg-stone-200 text-ink-500',
  generating: 'bg-marigold-100 text-marigold-600',
  generated: 'bg-teal-100 text-teal-600',
  failed: 'bg-clay-100 text-clay-600',
};

export default function TripCard({ trip }) {
  return (
    <Link
      to={`/trip/${trip._id}`}
      className="card block transition-shadow hover:shadow-elevated"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-ink">{trip.tripName}</h3>
        <span className={`tag-chip !border-0 ${STATUS_STYLES[trip.status] || STATUS_STYLES.draft}`}>
          {toTitleCase(trip.status)}
        </span>
      </div>
      <p className="text-sm text-ink-500">
        {trip.origin} → {trip.destination}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-y-2 text-sm text-ink-500">
        <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
        <span className="text-right">{pluralize(trip.numberOfDays, 'day')}</span>
        <span>{trip.budget ? formatInr(trip.budget) : 'No budget set'}</span>
        <span className="text-right">{toTitleCase(trip.transportPreference)}</span>
        <span className="col-span-2 border-t border-stone-200 pt-2 text-xs text-ink-400">
          Created {new Date(trip.createdAt).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}