import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { acceptTripInvite, listTrips } from '../../services/tripService';

const PRIVATE_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/create-trip', label: 'Create trip', end: true },
  { to: '/explore', label: 'Explore' },
  { to: '/public-trips', label: 'Public trips' },
  { to: '/profile', label: 'Profile', end: true },
];
const PUBLIC_NAV_ITEMS = [
  { to: '/explore', label: 'Explore' },
  { to: '/public-trips', label: 'Public trips' },
];

export default function TravelHeader({ user, isAuthenticated, onLogout }) {
  const navigate = useNavigate();
  const navItems = isAuthenticated ? PRIVATE_NAV_ITEMS : PUBLIC_NAV_ITEMS;

  return (
    <header className="relative z-40 border-b border-stone-300/80 bg-stone-50/95 backdrop-blur">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
        <div className="flex min-h-[58px] items-center justify-between gap-3">
          <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex shrink-0 items-center gap-2 text-ink" aria-label="Travel Manager home">
            <span className="font-handwritten text-2xl font-bold leading-none sm:text-3xl">Travel Manager</span>
            <svg aria-hidden="true" viewBox="0 0 46 24" className="hidden h-6 w-11 text-ocean sm:block">
              <path d="M2 19c11-13 19 8 31-8" fill="none" stroke="currentColor" strokeDasharray="2 3" strokeLinecap="round" />
              <path d="m31 11 4-1-1-4 10-5-5 10-4-1-2 4-2-3-4 1z" fill="currentColor" />
            </svg>
          </Link>

          {isAuthenticated && (
            <div className="hidden flex-1 justify-center sm:flex">
              <TripSearch onNavigate={(tripId) => navigate(`/trip/${tripId}`)} />
            </div>
          )}

          <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (
                  `shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors xl:px-3 xl:text-sm ${
                    isActive ? 'bg-ocean-100 text-ocean-700' : 'text-ink-600 hover:bg-stone-200'
                  }`
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {isAuthenticated && <NotificationBell onAccept={(tripId) => navigate(`/trip/${tripId}`)} />}
            {isAuthenticated ? (
              <>
                <Link to="/profile" className="max-w-28 truncate text-sm font-medium text-ink-700 hover:text-ocean sm:max-w-40">{user?.username || user?.name}</Link>
                <button type="button" onClick={onLogout} className="rounded-md border border-stone-400 px-3 py-1.5 text-xs font-medium text-ink hover:border-ocean hover:text-ocean sm:px-4 sm:text-sm">Log out</button>
              </>
            ) : (
              <Link to="/login" className="rounded-md border border-stone-400 px-3 py-1.5 text-sm font-medium text-ink hover:border-ocean hover:text-ocean">Log in</Link>
            )}
          </div>
        </div>

        {isAuthenticated && (
          <div className="flex justify-center pb-2 sm:hidden">
            <TripSearch onNavigate={(tripId) => navigate(`/trip/${tripId}`)} compact />
          </div>
        )}

        <nav aria-label="Main navigation" className="-mx-1 flex gap-1 overflow-x-auto pb-2 lg:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (
                `shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                  isActive ? 'bg-ocean-100 text-ocean-700' : 'text-ink-600 hover:bg-stone-200'
                }`
              )}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

function TripSearch({ onNavigate, compact = false }) {
  const [query, setQuery] = useState('');
  const [trips, setTrips] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const wrapperRef = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    function onPointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) setIsOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  async function openSearch() {
    setIsOpen(true);
    if (loadedRef.current || isLoading) return;
    setIsLoading(true);
    setError('');
    try {
      setTrips(await listTrips());
      loadedRef.current = true;
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  const matches = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase();
    if (!clean) return trips.slice(0, 6);
    return trips.filter((trip) => `${trip.tripName || ''} ${trip.destination || ''}`.toLocaleLowerCase().includes(clean)).slice(0, 6);
  }, [query, trips]);

  return (
    <div ref={wrapperRef} className="relative">
      <div className={`flex items-center rounded-full border border-ocean/30 bg-stone-50 shadow-paper ${isOpen ? 'w-[min(20rem,calc(100vw-2rem))]' : compact ? 'w-10' : 'w-10'} transition-[width]`}>
        {isOpen && (
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your trips"
            aria-label="Search your trips by name or destination"
            className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm text-ink outline-none placeholder:text-ink-400"
          />
        )}
        <button
          type="button"
          onClick={() => (isOpen ? setIsOpen(false) : openSearch())}
          aria-label={isOpen ? 'Close trip search' : 'Search your trips'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ocean text-white hover:bg-ocean-700"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="10.8" cy="10.8" r="6.6" />
            <path d="m16 16 4.5 4.5" />
          </svg>
        </button>
      </div>
      {isOpen && (
        <div className="absolute right-0 top-12 z-50 max-h-80 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-stone-300 bg-stone-50 p-2 shadow-elevated">
          {isLoading && <p className="px-3 py-2 text-sm text-ink-500" role="status">Loading your trips…</p>}
          {error && <p className="px-3 py-2 text-sm text-clay" role="alert">{error}</p>}
          {!isLoading && !error && matches.length === 0 && <p className="px-3 py-2 text-sm text-ink-500">No trips match.</p>}
          {matches.map((trip) => (
            <button
              key={trip._id}
              type="button"
              onClick={() => {
                setIsOpen(false);
                setQuery('');
                onNavigate(trip._id);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-ocean-100"
            >
              <span className="block truncate text-sm font-medium text-ink">{trip.tripName}</span>
              <span className="block truncate text-xs text-ink-500">{trip.destination}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationBell({ onAccept }) {
  const [invitations, setInvitations] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [acceptingId, setAcceptingId] = useState('');

  async function loadInvitations() {
    setIsLoading(true);
    setError('');
    try {
      const { data } = await api.get('/trips/invites/pending');
      setInvitations(data.data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadInvitations();
  }, []);

  async function handleAccept(invitation) {
    setAcceptingId(invitation._id);
    setError('');
    try {
      await acceptTripInvite(invitation._id);
      setInvitations((current) => current.filter((item) => item._id !== invitation._id));
      setIsOpen(false);
      onAccept(invitation._id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAcceptingId('');
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => !current);
          if (!isOpen) loadInvitations();
        }}
        aria-label={`Notifications${invitations.length ? `, ${invitations.length} pending trip invitations` : ''}`}
        aria-expanded={isOpen}
        className="relative grid h-9 w-9 place-items-center rounded-full text-ink-700 hover:bg-stone-200"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {invitations.length > 0 && <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-stone-50 bg-red-600" />}
      </button>
      {isOpen && (
        <section aria-label="Notifications" className="absolute right-0 top-11 z-50 w-[min(21rem,calc(100vw-2rem))] rounded-xl border border-stone-300 bg-stone-50 p-3 shadow-elevated">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-ink">Notifications</h2>
            <span className="text-xs text-ink-500">{invitations.length} pending</span>
          </div>
          {isLoading && <p className="py-4 text-sm text-ink-500" role="status">Checking invitations…</p>}
          {error && <p className="mt-2 rounded-md bg-clay/10 p-2 text-sm text-clay" role="alert">{error}</p>}
          {!isLoading && !error && invitations.length === 0 && <p className="py-4 text-sm text-ink-500">You have no pending trip invitations.</p>}
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {invitations.map((invitation) => (
              <article key={invitation._id} className="rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-sm font-medium text-ink">{invitation.tripName}</p>
                <p className="mt-0.5 text-xs text-ink-500">{invitation.origin} → {invitation.destination}</p>
                <button type="button" disabled={Boolean(acceptingId)} onClick={() => handleAccept(invitation)} className="mt-2 text-xs font-semibold text-ocean hover:underline disabled:opacity-50">
                  {acceptingId === invitation._id ? 'Accepting…' : 'Accept invitation'}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
