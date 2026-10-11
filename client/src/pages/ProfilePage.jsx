import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTrips } from '../hooks/useTrips';
import { acceptTripInvite } from '../services/tripService';
import SavedJourneys from '../components/profile/SavedJourneys';
import TravelPreferencesCard from '../components/profile/TravelPreferencesCard';
import MyTravelJournal from '../components/profile/MyTravelJournal';
import * as profileService from '../services/profileService';
import ErrorMessage from '../components/common/ErrorMessage';
import RecentActivity from '../components/profile/RecentActivity';
import ProfileDrawer from '../components/profile/ProfileDrawer';
import Input from '../components/common/Input';
import Button from '../components/common/Button';

const formatCurrency = (amountInPaise) => {
  const value = Number(amountInPaise || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

export default function ProfilePage() {
  const { user } = useAuth();
  const { trips, isLoading, error, refreshTrips } = useTrips();
  const [pendingInviteIds, setPendingInviteIds] = useState({});
  const [profile, setProfile] = useState(null);
  const [profileIsLoading, setProfileIsLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [summary, setSummary] = useState({ totalTripsPlanned: 0, placesExplored: 0, totalTravelDays: 0, totalExpenditurePaise: 0 });
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ name: '', email: '', city: '', country: '', tagline: '' });
  const [profileSaveState, setProfileSaveState] = useState({ isSaving: false, error: '' });

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

  useEffect(() => {
    let active = true;
    profileService.getProfile()
      .then((data) => {
        if (active) {
          setProfile(data);
          setProfileDraft({
            name: data?.name || '',
            email: data?.email || '',
            city: data?.location?.city || '',
            country: data?.location?.country || '',
            tagline: data?.tagline || '',
          });
        }
      })
      .catch((loadError) => {
        if (active) setProfileError(loadError.message || 'Profile data could not be loaded.');
      })
      .finally(() => {
        if (active) setProfileIsLoading(false);
      });

    profileService.getProfileSummary()
      .then((data) => { if (active) setSummary(data); })
      .catch(() => { /* summary fallback remains zero */ });

    return () => { active = false; };
  }, []);

  async function handleAcceptInvite(tripId) {
    try {
      setPendingInviteIds((current) => ({ ...current, [tripId]: true }));
      await acceptTripInvite(tripId);
      await refreshTrips();
    } finally {
      setPendingInviteIds((current) => ({ ...current, [tripId]: false }));
    }
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    setProfileSaveState({ isSaving: true, error: '' });
    try {
      const nextProfile = await profileService.updateProfile({
        name: profileDraft.name || null,
        email: profileDraft.email || null,
        location: { city: profileDraft.city || null, country: profileDraft.country || null },
        tagline: profileDraft.tagline || null,
      });
      setProfile(nextProfile);
      setIsProfileEditorOpen(false);
    } catch (error) {
      setProfileSaveState({ isSaving: false, error: error.message || 'Unable to save profile.' });
      return;
    }
    setProfileSaveState({ isSaving: false, error: '' });
  }

  const heroInitials = (profile?.displayName || user?.username || 'TR')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'TR';

  return (
    <div className="space-y-8">
      {pendingInvites.length ? (
        <div className="card space-y-3 p-4">
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

      <section className="journal-sheet relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 rounded-full border border-ocean/20 bg-ocean-100/30" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-20 w-20 -translate-x-1/2 rounded-full border border-clay/20 bg-clay/10" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-ocean bg-ocean-100 text-3xl font-semibold text-ocean-700">
              {profile?.avatarUrl ? <img src={profile.avatarUrl} alt={profile.displayName || user?.username || 'Traveler'} className="h-full w-full rounded-full object-cover" /> : heroInitials}
            </div>
            <div>
              <p className="eyebrow text-[10px] uppercase tracking-[0.2em]">Traveler passport</p>
              <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{profile?.displayName || user?.username || 'Traveler'}</h1>
              <div className="mt-2 space-y-1 text-sm text-ink-600">
                <p>{profile?.phoneNumber || user?.phoneNumber}</p>
                <p>{profile?.location?.city || user?.location?.city || 'Location not set'}, {profile?.location?.country || user?.location?.country || 'Country not set'}</p>
                <p>{profile?.email || user?.email || 'Email not set'}</p>
                <p className="italic text-ocean-700">{profile?.tagline || 'Explore every route as a new story.'}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-stone-300 bg-stone-50 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-ink-500">Member since {new Date(profile?.createdAt || user?.createdAt || Date.now()).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</div>
            <button type="button" onClick={() => setIsProfileEditorOpen(true)} className="btn-primary !px-4 !py-2">Edit Profile</button>
          </div>
        </div>

        <div className="relative mt-8 border-t border-stone-200 pt-5">
          <div className="flex items-center justify-center">
            <div className="rounded-full border border-ocean/30 bg-stone-50 px-5 py-2 text-center text-xs uppercase tracking-[0.32em] text-ocean-700">Same sky, different destinations.</div>
          </div>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.8fr_1fr]">
        <div className="space-y-8">
          <div className="card p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-ink-500">Total trips planned</p>
                <p className="mt-2 text-3xl font-semibold text-ink">{summary.totalTripsPlanned}</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-ink-500">Places explored</p>
                <p className="mt-2 text-3xl font-semibold text-ink">{summary.placesExplored}</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-ink-500">Travel days</p>
                <p className="mt-2 text-3xl font-semibold text-ink">{summary.totalTravelDays}</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-ink-500">Total expenditure</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{formatCurrency(summary.totalExpenditurePaise)}</p>
              </div>
            </div>
          </div>

          <SavedJourneys
            trips={trips}
            isLoading={isLoading}
            error={error}
            onRetry={refreshTrips}
            onRefresh={refreshTrips}
          />

          <div className="grid gap-8 lg:grid-cols-2">
            <MyTravelJournal />
            <RecentActivity />
          </div>
        </div>

        <aside className="space-y-8">
          <div className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="eyebrow">Next stop?</p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-ink">Let’s plan your next adventure!</h2>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ocean-100 text-3xl">✈️</div>
            </div>
            <Link to="/create-trip" className="mt-5 inline-flex w-full justify-center rounded-xl bg-ocean px-4 py-3 text-sm font-semibold text-white hover:bg-ocean-700">Create New Trip</Link>
          </div>

          <div className="card p-5">
            <TravelPreferencesCard
              profile={profile}
              isLoading={profileIsLoading}
              onUpdated={setProfile}
            />
          </div>

          <div className="card overflow-hidden p-0">
            <div className="bg-ocean-100 px-5 py-4 text-center text-lg font-medium italic text-ocean-700">“Not all those who wander are lost.”</div>
          </div>

          <div className="card p-5">
            <h3 className="font-display text-xl font-semibold">Quick links</h3>
            <div className="mt-4 space-y-2">
              <Link to="/account-settings" className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-sm font-medium text-ink hover:bg-stone-50">Account Settings <span aria-hidden="true">→</span></Link>
              <button type="button" className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-sm font-medium text-ink-400" disabled>Notification Preferences <span aria-hidden="true">Coming soon</span></button>
              <Link to="/help-support" className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-sm font-medium text-ink hover:bg-stone-50">Help &amp; Support <span aria-hidden="true">→</span></Link>
              <Link to="/privacy-security" className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-sm font-medium text-ink hover:bg-stone-50">Privacy &amp; Security <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </aside>
      </div>

      <ProfileDrawer isOpen={isProfileEditorOpen} onClose={() => setIsProfileEditorOpen(false)} title="Edit profile">
        <form className="space-y-4" onSubmit={handleProfileSave}>
          <Input label="Display name" value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} maxLength={80} />
          <Input label="Email address" type="email" value={profileDraft.email} onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="City" value={profileDraft.city} onChange={(event) => setProfileDraft((current) => ({ ...current, city: event.target.value }))} maxLength={100} />
            <Input label="Country" value={profileDraft.country} onChange={(event) => setProfileDraft((current) => ({ ...current, country: event.target.value }))} maxLength={100} />
          </div>
          <Input label="Tagline" value={profileDraft.tagline} onChange={(event) => setProfileDraft((current) => ({ ...current, tagline: event.target.value }))} maxLength={80} />
          {profileSaveState.error ? <ErrorMessage message={profileSaveState.error} /> : null}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setIsProfileEditorOpen(false)} className="btn-secondary !px-4 !py-2">Cancel</button>
            <Button type="submit" isLoading={profileSaveState.isSaving}>Save changes</Button>
          </div>
        </form>
      </ProfileDrawer>
    </div>
  );
}