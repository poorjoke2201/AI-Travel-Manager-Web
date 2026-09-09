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
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="mb-2 font-display text-3xl font-semibold">Public trips</h1>
      <p className="mb-6 text-ink-500">Trips other travellers have chosen to share for inspiration.</p>

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