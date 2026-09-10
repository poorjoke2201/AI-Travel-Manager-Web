import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTrips } from '../hooks/useTrips';
import TripGrid from '../components/dashboard/TripGrid';
import Loader from '../components/common/Loader';

export default function ProfilePage() {
  const { user } = useAuth();
  const { trips, isLoading, refreshTrips } = useTrips();

  useEffect(() => {
    refreshTrips();
  }, [refreshTrips]);

  return (
    <div>
      <div className="journal-sheet relative mb-10 overflow-hidden p-6 sm:p-8">
        <img src="/assets/ephemera/passport-stamp.webp" alt="" className="pointer-events-none absolute -right-5 -top-8 h-36 w-36 rotate-12 opacity-20" />
        <div className="relative flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ocean bg-ocean-100 text-3xl">
          {user?.avatar || '🧭'}
        </span>
        <div>
          <p className="eyebrow">Traveler passport</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">{user?.username}</h1>
          <p className="text-ink-500">{user?.phoneNumber}</p>
        </div>
        </div>
        <div className="relative mt-6 flex items-center gap-3 border-t border-stone-200 pt-4 text-xs uppercase tracking-[0.16em] text-ink-500"><span className="h-px w-10 bg-clay" />Personal routes and saved pages</div>
      </div>

      <div className="mb-4"><p className="eyebrow">Your archive</p><h2 className="mt-1 text-2xl font-semibold">Saved journeys</h2></div>
      {isLoading ? <Loader label="Loading your trips..." /> : <TripGrid trips={trips} />}
    </div>
  );
}