import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTrips } from '../hooks/useTrips';
import TripGrid from '../components/dashboard/TripGrid';
import Loader from '../components/common/Loader';
import { acceptTripInvite } from '../services/tripService';

export default function ProfilePage() {
  const { user } = useAuth();
  const { trips, isLoading, refreshTrips } = useTrips();
  const [pendingInviteIds, setPendingInviteIds] = useState({});

  const pendingInvites = useMemo(() => {
    if (!Array.isArray(trips) || !user?.phoneNumber) return [];
    const normalizedPhone = user.phoneNumber.replace(/\D/g, '');
    return trips.filter((trip) => {
      if (!trip.groupMembers?.length) return false;
      return trip.groupMembers.some((member) => {
        const memberPhone = (member.phoneNumber || '').replace(/\D/g, '');
        return memberPhone && memberPhone === normalizedPhone && ['pending', 'invited'].includes(member.status || 'pending');
      });
    });
  }, [trips, user?.phoneNumber]);

  useEffect(() => {
    refreshTrips();
  }, [refreshTrips]);

  async function handleAcceptInvite(tripId) {
    try {
      setPendingInviteIds((current) => ({ ...current, [tripId]: true }));
      await acceptTripInvite(tripId);
      await refreshTrips();
    } finally {
      setPendingInviteIds((current) => ({ ...current, [tripId]: false }));
    }
  }

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

      {pendingInvites.length ? (
        <div className="mb-8 card space-y-3">
          <p className="eyebrow">Trip invites awaiting approval</p>
          {pendingInvites.map((trip) => (
            <div key={trip._id} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3">
              <div>
                <p className="font-semibold text-ink">{trip.tripName}</p>
                <p className="text-xs text-ink-500">{trip.origin} → {trip.destination}</p>
              </div>
              <button type="button" disabled={pendingInviteIds[trip._id]} onClick={() => handleAcceptInvite(trip._id)} className="btn-primary !px-3 !py-2 text-sm">
                {pendingInviteIds[trip._id] ? 'Accepting...' : 'Approve invite'}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-4"><p className="eyebrow">Your archive</p><h2 className="mt-1 text-2xl font-semibold">Saved journeys</h2></div>
      {isLoading ? <Loader label="Loading your trips..." /> : <TripGrid trips={trips} />}
    </div>
  );
}