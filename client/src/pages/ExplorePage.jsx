import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExploreSearch from '../components/explore/ExploreSearch';
import ExploreFilters from '../components/explore/ExploreFilters';
import ExploreMap from '../components/explore/ExploreMap';
import ExploreResults from '../components/explore/ExploreResults';
import ErrorMessage from '../components/common/ErrorMessage';
import { useExplore } from '../hooks/useExplore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTrips } from '../hooks/useTrips';
import api from '../services/api';

export default function ExplorePage() {
  const { results, isLoading, error, search } = useExplore();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { trips, refreshTrips } = useTrips();
  const [activeType, setActiveType] = useState('poi');
  const [category, setCategory] = useState('');
  const [minRating, setMinRating] = useState('');
  const [planPoi, setPlanPoi] = useState(null);
  const [planTripId, setPlanTripId] = useState('');
  const [planDay, setPlanDay] = useState(1);
  const [planPreview, setPlanPreview] = useState(null);
  const [planError, setPlanError] = useState(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const query = searchParams.get('query');
    if (query) handleSearch(query);
  }, [searchParams]);

  async function handleSearch(query) {
    try {
      await search(query, 10);
    } catch {
      // error state already surfaced via useExplore
    }
  }

  const filteredResults = applyClientFilters(results, activeType, { category, minRating });
  function handleAddToTrip() {
    navigate('/create-trip');
  }

  async function openPlanAround(poi) {
    setPlanPoi(poi);
    setPlanPreview(null);
    setPlanError(null);
    if (isAuthenticated && !trips.length) await refreshTrips();
  }

  async function submitPlanAround(event) {
    event.preventDefault();
    try {
      const { data } = await api.post(`/trips/${planTripId}/plan-around`, { placeId: planPoi._id, day: planDay });
      setPlanPreview(data.data);
    } catch (err) {
      setPlanError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="relative mb-8 overflow-hidden border-b border-stone-300 pb-7">
        <img src="/assets/maps/atlas-background.webp" alt="" className="pointer-events-none absolute -right-10 -top-24 h-64 w-96 object-cover opacity-20" />
        <div className="relative">
          <p className="eyebrow">The atlas / explore</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Find somewhere to follow.</h1>
          <p className="mt-3 max-w-xl text-ink-500">Search a city and collect points of interest, stays, and places to eat for the next page of your journey.</p>
        </div>
      </div>

      <div className="mb-5 journal-sheet p-4 sm:p-5">
        <ExploreSearch onSearch={handleSearch} isLoading={isLoading} />
      </div>

      <ExploreFilters
        activeType={activeType}
        onTypeChange={setActiveType}
        category={category}
        onCategoryChange={setCategory}
        minRating={minRating}
        onMinRatingChange={setMinRating}
      />

      {error && <ErrorMessage message={error} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="journal-sheet overflow-hidden p-2 sm:p-3">
          <ExploreMap activeType={activeType} results={filteredResults} searchedCoordinates={results.coordinates} onAddToTrip={handleAddToTrip} />
        </div>
        <div className="journal-sheet p-4 sm:p-5">
          <ExploreResults activeType={activeType} results={filteredResults} onAddToTrip={handleAddToTrip} onPlanAround={isAuthenticated ? openPlanAround : null} />
        </div>

        {planPoi && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-ink/30 p-4">
            <section className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal">Plan around this</p><h2 className="mt-1 text-xl font-semibold">{planPoi.name}</h2></div><button type="button" onClick={() => setPlanPoi(null)} aria-label="Close">×</button></div>
              {!planPreview ? <form onSubmit={submitPlanAround} className="mt-5 space-y-3"><select required value={planTripId} onChange={(event) => setPlanTripId(event.target.value)} className="w-full rounded-md border border-stone-300 px-3 py-2"><option value="">Choose a trip</option>{trips.map((trip) => <option key={trip._id} value={trip._id}>{trip.tripName} · {trip.destination}</option>)}</select><input required type="number" min="1" value={planDay} onChange={(event) => setPlanDay(Number(event.target.value))} className="w-full rounded-md border border-stone-300 px-3 py-2" placeholder="Day" /><button className="btn-primary w-full">Find nearby plan</button>{planError && <p className="text-sm text-clay">{planError}</p>}</form> : <div className="mt-5 space-y-3"><p className="text-sm text-ink-500">{planPreview.note}</p><p className="font-semibold">Nearby stops</p>{[...planPreview.nearbyPois, ...planPreview.nearbyRestaurants].map((item) => <div key={item.id} className="rounded-md bg-stone-50 p-2 text-sm">{item.name}</div>)}<button type="button" onClick={() => setPlanPoi(null)} className="btn-secondary w-full">Done</button></div>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/** Category/rating filters are applied client-side over the already-fetched search radius results. */
function applyClientFilters(results, activeType, { category, minRating }) {
  const key = activeType === 'poi' ? 'pois' : `${activeType}s`;
  let items = results[key] || [];

  if (activeType === 'poi' && category) {
    items = items.filter((i) => i.category === category);
  }
  if (minRating) {
    const threshold = Number(minRating);
    items = items.filter((i) => (i.googleRating ?? i.rating ?? 0) >= threshold);
  }

  return { ...results, [key]: items };
}