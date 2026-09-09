import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import HeroSection from '../components/dashboard/HeroSection';
import TripGrid from '../components/dashboard/TripGrid';
import Loader from '../components/common/Loader';
import ErrorMessage from '../components/common/ErrorMessage';
import { useTrips } from '../hooks/useTrips';

export default function DashboardPage() {
  const { trips, isLoading, error, refreshTrips } = useTrips();

  useEffect(() => {
    refreshTrips();
  }, [refreshTrips]);

  const recentTrips = trips.slice(0, 3);

  return (
    <div>
      <HeroSection />

      {isLoading && <Loader label="Loading your trips..." />}
      {error && <ErrorMessage message={error} onRetry={refreshTrips} />}

      {!isLoading && !error && (
        <>
          {trips.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-4 text-xl font-semibold">Recent trips</h2>
              <TripGrid trips={recentTrips} />
            </section>
          )}

          <section className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">My trips</h2>
            </div>
            <TripGrid trips={trips} />
          </section>

          <section className="card flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-semibold text-ink">Not sure where to go yet?</h3>
              <p className="text-sm text-ink-500">Browse destinations on the map before you commit to a plan.</p>
            </div>
            <Link to="/explore" className="btn-secondary">
              Explore destinations
            </Link>
          </section>
        </>
      )}
    </div>
  );
}