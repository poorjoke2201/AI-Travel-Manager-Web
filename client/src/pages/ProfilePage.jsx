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
      <div className="card mb-8 flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-3xl">
          {user?.avatar || '🧭'}
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold">{user?.username}</h1>
          <p className="text-ink-500">{user?.phoneNumber}</p>
        </div>
      </div>

      <h2 className="mb-4 text-xl font-semibold">Your trips</h2>
      {isLoading ? <Loader label="Loading your trips..." /> : <TripGrid trips={trips} />}
    </div>
  );
}