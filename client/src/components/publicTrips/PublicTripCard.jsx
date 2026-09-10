import { Link } from 'react-router-dom';
import { formatInr, pluralize } from '../../utils/formatters';

const POSTCARD_IMAGES = [
  '/assets/places/place-01.webp',
  '/assets/places/place-02.webp',
  '/assets/places/place-03.webp',
];

export default function PublicTripCard({ trip, imageIndex = 0 }) {
  const owner = trip.userId; // populated { username, avatar } by publicTrip.controller.js
  return (
    <Link to={`/public-trips/${trip._id}`} className="journal-sheet group block overflow-hidden transition-all hover:-translate-y-1 hover:shadow-elevated">
      <div className="relative h-40 overflow-hidden bg-ocean">
        <img src={POSTCARD_IMAGES[imageIndex % POSTCARD_IMAGES.length]} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-ink/25" />
        <span className="absolute right-3 top-3 border border-stone-50/70 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-widest text-stone-50">Shared</span>
        <span className="absolute bottom-3 left-4 font-display text-sm text-stone-50">Postcard / {String(imageIndex + 1).padStart(2, '0')}</span>
      </div>
      <div className="p-5">
        <h3 className="mb-1 font-display text-2xl font-semibold">{trip.tripName}</h3>
        <p className="mb-4 text-sm text-ocean-700">
          {trip.origin} to {trip.destination}
        </p>
        <div className="mb-4 flex gap-4 border-t border-stone-200 pt-3 text-sm text-ink-500">
          <span>{pluralize(trip.numberOfDays, 'day')}</span>
          <span>{trip.budget ? formatInr(trip.budget) : 'No budget set'}</span>
        </div>
        {owner?.username && (
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <span aria-hidden="true">{owner.avatar || 'compass'}</span>
            <span>Shared by {owner.username}</span>
          </div>
        )}
      </div>
    </Link>
  );
}