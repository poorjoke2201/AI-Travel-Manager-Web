import { Link } from 'react-router-dom';
import { formatDateRange } from '../../utils/dateUtils';
import { formatInr, pluralize, toTitleCase } from '../../utils/formatters';

const STATUS_STYLES = {
  draft: 'bg-stone-200 text-ink-500',
  generating: 'bg-marigold-100 text-marigold-600',
  generated: 'bg-teal-100 text-teal-600',
  failed: 'bg-clay-100 text-clay-600',
};

const PLACE_IMAGES = [
  '/assets/places/place-01.webp',
  '/assets/places/place-02.webp',
  '/assets/places/place-03.webp',
];

export default function TripCard({ trip, imageIndex = 0 }) {
  return (
    <Link
      to={`/trip/${trip._id}`}
      className="journal-sheet group block overflow-hidden transition-all hover:-translate-y-1 hover:shadow-elevated"
    >
      <div className="relative h-36 overflow-hidden bg-ocean">
        <img src={PLACE_IMAGES[imageIndex % PLACE_IMAGES.length]} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-ink/20" />
        <span className={`absolute right-3 top-3 tag-chip !border-0 ${STATUS_STYLES[trip.status] || STATUS_STYLES.draft}`}>
          {toTitleCase(trip.status)}
        </span>
        <span className="absolute bottom-3 left-4 font-display text-sm text-stone-50">Field note</span>
      </div>
      <div className="p-5">
        <h3 className="font-display text-2xl font-semibold text-ink">{trip.tripName}</h3>
        <p className="mt-1 text-sm text-ocean-700">
          {trip.origin} to {trip.destination}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-y-2 border-t border-stone-200 pt-4 text-sm text-ink-500">
          <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
          <span className="text-right">{pluralize(trip.numberOfDays, 'day')}</span>
          <span>{trip.budget ? formatInr(trip.budget) : 'No budget set'}</span>
          <span className="text-right">{toTitleCase(trip.transportPreference)}</span>
        </div>
      </div>
    </Link>
  );
}