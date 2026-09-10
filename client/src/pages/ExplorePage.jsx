import { useState } from 'react';
import ExploreSearch from '../components/explore/ExploreSearch';
import ExploreFilters from '../components/explore/ExploreFilters';
import ExploreMap from '../components/explore/ExploreMap';
import ExploreResults from '../components/explore/ExploreResults';
import ErrorMessage from '../components/common/ErrorMessage';
import { useExplore } from '../hooks/useExplore';
import { useNavigate } from 'react-router-dom';

export default function ExplorePage() {
  const { results, isLoading, error, search } = useExplore();
  const navigate = useNavigate();
  const [activeType, setActiveType] = useState('poi');
  const [category, setCategory] = useState('');
  const [minRating, setMinRating] = useState('');

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

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="mb-2 font-display text-3xl font-semibold">Explore destinations</h1>
      <p className="mb-6 text-ink-500">Search a city to see points of interest, hotels, and restaurants on the map.</p>

      <div className="mb-4">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ExploreMap activeType={activeType} results={filteredResults} searchedCoordinates={results.coordinates} onAddToTrip={handleAddToTrip} />
        </div>
        <div>
          <ExploreResults activeType={activeType} results={filteredResults} onAddToTrip={handleAddToTrip} />
        </div>
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