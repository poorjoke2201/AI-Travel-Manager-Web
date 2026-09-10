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
              <div className="mb-4 flex items-end justify-between">
                <div><p className="eyebrow">Recently opened</p><h2 className="mt-1 text-2xl font-semibold">Your latest pages</h2></div>
                <span className="hidden font-display text-sm italic text-ink-500 sm:block">Keep following the thread.</span>
              </div>
              <TripGrid trips={recentTrips} />
            </section>
          )}

          <section className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <div><p className="eyebrow">The archive</p><h2 className="mt-1 text-2xl font-semibold">All journeys</h2></div>
            </div>
            <TripGrid trips={trips} />
          </section>

          <section className="journal-sheet relative flex flex-col items-start justify-between gap-5 overflow-hidden p-6 sm:flex-row sm:items-center sm:p-8">
            <img src="/assets/ephemera/map.webp" alt="" className="absolute -right-4 -top-10 h-48 w-48 rotate-12 object-contain opacity-20" />
            <div className="relative max-w-lg">
              <p className="eyebrow">Before the next page</p>
              <h3 className="mt-2 font-display text-2xl text-ink">Not sure where to go yet?</h3>
              <p className="mt-2 text-sm leading-6 text-ink-500">Browse the atlas and collect a few possibilities before you commit to a plan.</p>
            </div>
            <Link to="/explore" className="btn-secondary relative">
              Open the atlas
            </Link>
          </section>
        </>
      )}
    </div>
  );
}