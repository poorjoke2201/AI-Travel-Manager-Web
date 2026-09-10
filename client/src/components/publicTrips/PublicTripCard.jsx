import { Link } from 'react-router-dom';
import { formatInr, pluralize } from '../../utils/formatters';

export default function PublicTripCard({ trip }) {
  const owner = trip.userId; // populated { username, avatar } by publicTrip.controller.js
  return (
    <Link to={`/public-trips/${trip._id}`} className="card block transition-shadow hover:shadow-elevated">
      <h3 className="mb-1 font-display text-lg font-semibold">{trip.tripName}</h3>
      <p className="mb-3 text-sm text-ink-500">
        {trip.origin} → {trip.destination}
      </p>
      <div className="mb-3 flex gap-4 text-sm text-ink-500">
        <span>{pluralize(trip.numberOfDays, 'day')}</span>
        <span>{trip.budget ? formatInr(trip.budget) : 'No budget set'}</span>
      </div>
      {owner?.username && (
        <div className="flex items-center gap-2 border-t border-stone-200 pt-3 text-sm text-ink-500">
          <span aria-hidden="true">{owner.avatar || '🧭'}</span>
          {owner.username}
        </div>
      )}
    </Link>
  );
}