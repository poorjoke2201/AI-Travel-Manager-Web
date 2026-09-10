import { useEffect, useState } from 'react';
import PublicTripGrid from '../components/publicTrips/PublicTripGrid';
import Loader from '../components/common/Loader';
import ErrorMessage from '../components/common/ErrorMessage';
import Button from '../components/common/Button';
import * as publicTripService from '../services/publicTripService';

const PAGE_SIZE = 12;

export default function PublicTripsPage() {
  const [trips, setTrips] = useState([]);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  async function loadPage(nextSkip) {
    setIsLoading(true);
    setError(null);
    try {
      const page = await publicTripService.listPublicTrips({ limit: PAGE_SIZE, skip: nextSkip });
      setTrips((prev) => (nextSkip === 0 ? page : [...prev, ...page]));
      setHasMore(page.length === PAGE_SIZE);
      setSkip(nextSkip + page.length);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="relative mb-10 overflow-hidden border-b border-stone-300 pb-8">
        <img src="/assets/ephemera/postcards.webp" alt="" className="pointer-events-none absolute -right-8 -top-16 h-64 w-80 rotate-6 object-contain opacity-20" />
        <div className="relative">
          <p className="eyebrow">The community wall / shared pages</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Journeys worth passing on.</h1>
          <p className="mt-3 max-w-xl text-ink-500">Browse trips other travellers have opened up for inspiration, shortcuts, and the occasional beautiful detour.</p>
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => loadPage(0)} />}
      {isLoading && trips.length === 0 ? (
        <Loader label="Loading public trips..." />
      ) : (
        <>
          <PublicTripGrid trips={trips} />
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={() => loadPage(skip)} isLoading={isLoading}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}