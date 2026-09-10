import { formatDateRange } from '../../utils/dateUtils';
import { formatInr, pluralize, toTitleCase } from '../../utils/formatters';
import Button from '../common/Button';

const STATUS_STYLES = {
  draft: 'bg-stone-200 text-ink-500',
  generating: 'bg-marigold-100 text-marigold-600',
  generated: 'bg-teal-100 text-teal-600',
  failed: 'bg-clay-100 text-clay-600',
};

export default function ItineraryHeader({ trip, onRegenerate, onDelete, isRegenerating }) {
  return (
    <div className="journal-sheet relative mb-6 overflow-hidden p-6 sm:p-8">
      <img src="/assets/ephemera/postcards.webp" alt="" className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rotate-12 object-contain opacity-20" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="relative">
          <p className="eyebrow">Journey cover / field notes</p>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{trip.tripName}</h1>
            <span className={`tag-chip !border-0 ${STATUS_STYLES[trip.status] || STATUS_STYLES.draft}`}>
              {toTitleCase(trip.status)}
            </span>
          </div>
          <p className="mt-2 text-ocean-700">
            {trip.origin} to {trip.destination}
          </p>
        </div>
        <div className="flex gap-2">
          {trip.status === 'failed' && (
            <Button onClick={onRegenerate} isLoading={isRegenerating}>
              Retry generation
            </Button>
          )}
          <Button variant="secondary" onClick={onDelete}>
            Delete trip
          </Button>
        </div>
      </div>
      <div className="relative mt-7 grid grid-cols-2 gap-4 border-t border-stone-200 pt-5 text-sm sm:grid-cols-4">
        <div>
          <p className="eyebrow !text-[0.6rem]">Dates</p>
          <p className="font-semibold">{formatDateRange(trip.startDate, trip.endDate)}</p>
        </div>
        <div>
          <p className="eyebrow !text-[0.6rem]">Duration</p>
          <p className="font-semibold">{pluralize(trip.numberOfDays, 'day')}</p>
        </div>
        <div>
          <p className="eyebrow !text-[0.6rem]">Budget</p>
          <p className="font-semibold">{trip.budget ? formatInr(trip.budget) : 'Not set'}</p>
        </div>
        <div>
          <p className="eyebrow !text-[0.6rem]">Travellers</p>
          <p className="font-semibold">
            {trip.travellers.adults} adult{trip.travellers.adults !== 1 ? 's' : ''}
            {trip.travellers.children ? `, ${trip.travellers.children} children` : ''}
          </p>
        </div>
      </div>
      {trip.generationError && trip.status === 'failed' && (
        <p className="mt-4 rounded-xs bg-clay-100 p-3 text-sm text-clay-600">{trip.generationError}</p>
      )}
    </div>
  );
}