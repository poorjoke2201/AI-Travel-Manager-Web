import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import EmptyState from '../common/EmptyState';
import ErrorMessage from '../common/ErrorMessage';
import Modal from '../common/Modal';
import { formatInr, pluralize } from '../../utils/formatters';
import {
  filterAndSortJourneys,
  formatJourneyDateRange,
  getJourneyDays,
  getJourneyStatus,
} from '../../utils/savedJourneys';
import * as tripService from '../../services/tripService';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'draft', label: 'Draft' },
];

const STATUS_LABELS = {
  upcoming: 'Upcoming',
  completed: 'Completed',
  draft: 'Draft',
};

function inputDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function duplicatePayload(trip) {
  const baseName = `${String(trip.tripName || 'Trip').slice(0, 93)} (copy)`;
  return {
    tripName: baseName.slice(0, 100),
    origin: trip.origin,
    destination: trip.destination,
    startDate: inputDate(trip.startDate),
    endDate: inputDate(trip.endDate),
    budget: trip.budget > 0 ? trip.budget : null,
    travellers: trip.travellers || { adults: 1, children: 0 },
    transportPreference: trip.transportPreference || 'any',
    placePreferences: trip.placePreferences || [],
    foodPreferences: trip.foodPreferences || [],
    travelStyle: trip.travelStyle || 'moderate',
    tripType: trip.tripType || 'solo',
    pace: trip.pace || 'balanced',
    accommodationPreference: trip.accommodationPreference || 'any',
    dailyTravelToleranceKm: trip.dailyTravelToleranceKm ?? null,
    selectedHotelId: trip.selectedHotelId ?? null,
    selectedTransportMode: trip.selectedTransportMode ?? null,
    selectedPlaces: trip.selectedPlaces || [],
    discoveredCandidates: trip.discoveredCandidates,
    isPublic: false,
    groupMembers: [],
  };
}

function journeyEditValues(trip) {
  return {
    tripName: trip.tripName || '',
    origin: trip.origin || '',
    destination: trip.destination || '',
    startDate: inputDate(trip.startDate),
    endDate: inputDate(trip.endDate),
    budget: trip.budget == null ? '' : String(trip.budget),
  };
}

function JourneyCard({ trip, onEdit, onDuplicate, onToggleVisibility, onDelete, busy }) {
  const [coverImage, setCoverImage] = useState(trip.coverImageUrl || null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverError, setCoverError] = useState('');
  const status = getJourneyStatus(trip);
  const days = getJourneyDays(trip.startDate, trip.endDate);

  useEffect(() => {
    setCoverImage(trip.coverImageUrl || null);
    setCoverError('');
  }, [trip.coverImageUrl]);

  useEffect(() => {
    if (trip.coverImageUrl || trip.coverImageResolvedAt) return undefined;
    let active = true;
    setCoverLoading(true);
    tripService.getTripCoverImage(trip._id)
      .then((imageUrl) => {
        if (active) setCoverImage(imageUrl);
      })
      .catch((error) => {
        if (active) setCoverError(error.message || 'The destination image could not be resolved.');
      })
      .finally(() => {
        if (active) setCoverLoading(false);
      });
    return () => { active = false; };
  }, [trip._id, trip.coverImageResolvedAt, trip.coverImageUrl]);

  function closeMenu(event) {
    event.currentTarget.closest('details')?.removeAttribute('open');
  }

  return (
    <article className="journal-sheet relative min-w-0 overflow-visible">
      <div className="relative h-44 overflow-hidden bg-stone-200">
        <img
          src={coverImage || '/assets/places/placeholder.svg'}
          alt=""
          className="h-full w-full object-cover"
          onError={(event) => {
            if (event.currentTarget.src.endsWith('/placeholder.svg')) return;
            setCoverImage(null);
            setCoverError('The destination image could not be loaded.');
          }}
        />
        {status ? (
          <span className="absolute right-12 top-3 rounded-full bg-stone-50 px-3 py-1 text-xs font-semibold capitalize text-ink shadow-paper">
            {STATUS_LABELS[status]}
          </span>
        ) : null}
        <details className="group absolute right-3 top-3 z-20">
          <summary
            aria-label={`More actions for ${trip.tripName}`}
            className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full bg-stone-50 text-xl leading-none text-ink shadow-paper marker:hidden"
          >
            ⋮
          </summary>
          <div className="absolute right-0 mt-2 w-48 border border-stone-300 bg-stone-50 p-1 shadow-elevated">
            <Link className="block px-3 py-2 text-sm hover:bg-ocean-100" to={`/trip/${trip._id}`} onClick={closeMenu}>View</Link>
            <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-ocean-100" onClick={(event) => { closeMenu(event); onEdit(trip); }}>Edit</button>
            <button type="button" disabled={busy} className="block w-full px-3 py-2 text-left text-sm hover:bg-ocean-100 disabled:opacity-50" onClick={(event) => { closeMenu(event); onDuplicate(trip); }}>Duplicate</button>
            <button type="button" disabled={busy} className="block w-full px-3 py-2 text-left text-sm hover:bg-ocean-100 disabled:opacity-50" onClick={(event) => { closeMenu(event); onToggleVisibility(trip); }}>
              Make {trip.isPublic ? 'private' : 'public'}
            </button>
            <button type="button" disabled={busy} className="block w-full px-3 py-2 text-left text-sm text-clay-600 hover:bg-clay-100 disabled:opacity-50" onClick={(event) => { closeMenu(event); onDelete(trip); }}>Delete</button>
          </div>
        </details>
        {coverLoading ? <span className="absolute bottom-2 left-3 rounded bg-stone-50/90 px-2 py-1 text-xs text-ink-500">Finding destination image...</span> : null}
        {coverError ? <span title={coverError} role="img" aria-label={`Destination image unavailable: ${coverError}`} className="absolute bottom-2 left-3 max-w-[70%] truncate rounded bg-stone-50/90 px-2 py-1 text-xs text-ink-500">Destination image unavailable</span> : null}
        {trip.status === 'generating' ? (
          <span className="absolute bottom-2 right-3 rounded bg-stone-50/90 px-2 py-1 text-xs font-medium text-ink-700">Trip generation in progress</span>
        ) : null}
      </div>

      <div className="min-w-0 p-5">
        <h3 className="break-words font-display text-2xl font-semibold text-ink">{trip.tripName}</h3>
        <p className="mt-1 break-words text-sm text-ocean-700">{trip.origin} → {trip.destination}</p>
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-stone-200 pt-4 text-sm text-ink-500">
          <span>{formatJourneyDateRange(trip.startDate, trip.endDate) || 'Dates unavailable'}</span>
          <span className="text-right">{days ? pluralize(days, 'day') : 'Day count unavailable'}</span>
          <span className="col-span-2" title="Planned trip budget; this is not recorded expense spending.">
            Trip budget: {trip.budget > 0 ? formatInr(trip.budget) : 'Not set'}
          </span>
        </div>
        <Link to={`/trip/${trip._id}`} className="mt-4 inline-flex items-center gap-1 font-semibold text-ocean-700 hover:text-ink">
          View trip <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export default function SavedJourneys({ trips, isLoading, error, onRetry, onRefresh }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('latest');
  const [visibleCount, setVisibleCount] = useState(8);
  const [busyTripId, setBusyTripId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [editTrip, setEditTrip] = useState(null);
  const [editValues, setEditValues] = useState(null);
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const matchingTrips = useMemo(
    () => filterAndSortJourneys(trips, { query, filter, sort }),
    [trips, query, filter, sort]
  );
  const visibleTrips = matchingTrips.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(8);
  }, [query, filter, sort]);

  async function performAction(trip, action) {
    setActionError('');
    setBusyTripId(trip._id);
    try {
      await action();
    } catch (error) {
      setActionError(error.message || 'The trip action could not be completed.');
    } finally {
      setBusyTripId(null);
    }
  }

  function openEdit(trip) {
    setEditTrip(trip);
    setEditValues(journeyEditValues(trip));
    setEditError('');
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (new Date(editValues.endDate).getTime() < new Date(editValues.startDate).getTime()) {
      setEditError('The end date must be on or after the start date.');
      return;
    }
    setIsSavingEdit(true);
    setEditError('');
    try {
      const updates = {
        ...editValues,
        budget: editValues.budget === '' ? null : Number(editValues.budget),
      };
      await tripService.updateTrip(editTrip._id, updates);
      await onRefresh();
      setEditTrip(null);
    } catch (error) {
      setEditError(error.message || 'The trip could not be updated.');
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function duplicateTrip(trip) {
    await performAction(trip, async () => {
      const created = await tripService.createTrip(duplicatePayload(trip));
      await onRefresh();
      navigate(`/trip/${created._id}`);
    });
  }

  async function toggleVisibility(trip) {
    await performAction(trip, async () => {
      await tripService.updateTrip(trip._id, { isPublic: !trip.isPublic });
      await onRefresh();
    });
  }

  async function deleteTrip(trip) {
    if (!window.confirm(`Delete "${trip.tripName}"? This action cannot be undone.`)) return;
    await performAction(trip, async () => {
      await tripService.deleteTrip(trip._id);
      await onRefresh();
    });
  }

  return (
    <section aria-labelledby="saved-journeys-title" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Your archive</p>
          <h2 id="saved-journeys-title" className="mt-1 font-display text-3xl font-semibold">Saved journeys</h2>
          <p className="mt-1 text-sm text-ink-500">Your trip budgets are planned amounts, separate from recorded expenses.</p>
        </div>
        <label className="sr-only" htmlFor="journey-search">Search trips</label>
        <input
          id="journey-search"
          type="search"
          placeholder="Search trips..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="input-field w-full sm:max-w-xs"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label="Filter saved journeys">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={`tag-chip ${filter === option.value ? 'tag-chip-active' : 'bg-stone-50 text-ink-500'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-500">
          Sort by
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="input-field !w-auto !py-2">
            <option value="latest">Latest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name A–Z</option>
            <option value="budget">Budget high to low</option>
          </select>
        </label>
      </div>

      {actionError ? <p role="alert" className="border border-clay-300 bg-clay-100/60 p-3 text-sm text-clay-700">{actionError}</p> : null}
      {error ? <ErrorMessage message={error} onRetry={onRetry} /> : null}
      {isLoading ? (
        <div role="status" aria-label="Loading saved journeys" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="journal-sheet h-80 animate-pulse bg-stone-100" />)}
        </div>
      ) : error && !trips.length ? null : matchingTrips.length ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleTrips.map((trip) => (
              <JourneyCard
                key={trip._id}
                trip={trip}
                busy={busyTripId === trip._id}
                onEdit={openEdit}
                onDuplicate={duplicateTrip}
                onToggleVisibility={toggleVisibility}
                onDelete={deleteTrip}
              />
            ))}
          </div>
          {visibleTrips.length < matchingTrips.length ? (
            <button type="button" className="btn-secondary" onClick={() => setVisibleCount((count) => count + 8)}>
              Load more trips
            </button>
          ) : null}
        </>
      ) : trips.length ? (
        <EmptyState title="No trips match" description="Try changing the search text or selected filter." />
      ) : (
        <EmptyState title="No trips yet" description="Trips you plan will appear here." />
      )}

      <Modal isOpen={Boolean(editTrip)} onClose={() => setEditTrip(null)} title="Edit trip details">
        {editValues ? (
          <form className="space-y-4" onSubmit={saveEdit}>
            <label className="block text-sm font-medium">Trip name
              <input required maxLength={100} minLength={2} value={editValues.tripName} onChange={(event) => setEditValues({ ...editValues, tripName: event.target.value })} className="input-field mt-1" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Origin
                <input required minLength={2} value={editValues.origin} onChange={(event) => setEditValues({ ...editValues, origin: event.target.value })} className="input-field mt-1" />
              </label>
              <label className="block text-sm font-medium">Destination
                <input required minLength={2} value={editValues.destination} onChange={(event) => setEditValues({ ...editValues, destination: event.target.value })} className="input-field mt-1" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Start date
                <input type="date" required value={editValues.startDate} onChange={(event) => setEditValues({ ...editValues, startDate: event.target.value })} className="input-field mt-1" />
              </label>
              <label className="block text-sm font-medium">End date
                <input type="date" required value={editValues.endDate} onChange={(event) => setEditValues({ ...editValues, endDate: event.target.value })} className="input-field mt-1" />
              </label>
            </div>
            <label className="block text-sm font-medium">Trip budget (₹)
              <input type="number" min="0.01" step="0.01" value={editValues.budget} onChange={(event) => setEditValues({ ...editValues, budget: event.target.value })} className="input-field mt-1" />
            </label>
            {editError ? <p role="alert" className="text-sm text-clay-700">{editError}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditTrip(null)}>Cancel</button>
              <button type="submit" disabled={isSavingEdit} className="btn-primary">{isSavingEdit ? 'Saving...' : 'Save changes'}</button>
            </div>
          </form>
        ) : null}
      </Modal>
    </section>
  );
}
