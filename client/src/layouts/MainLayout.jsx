import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import TravelAssistant from '../components/assistant/TravelAssistant';
import GlobalSearch from '../components/common/GlobalSearch';

export default function MainLayout() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-300/80 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <Link to="/" className="flex items-center gap-3 text-ink">
            <span className="grid h-8 w-8 place-items-center rounded-full border border-ocean text-sm">+</span>
            <span>
              <span className="block font-display text-xl font-semibold leading-none">Travel Manager</span>
              <span className="eyebrow mt-1 block !text-[0.58rem]">Field notes</span>
            </span>
          </Link>
          <GlobalSearch />
          <nav className="flex items-center gap-5 text-sm font-medium text-ink-500">
            <Link to="/explore" className="hover:text-ink">Explore</Link>
            <Link to="/public-trips" className="hover:text-ink">Public trips</Link>
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn-primary !px-4 !py-2">My journal</Link>
            ) : (
              <Link to="/login" className="btn-primary !px-4 !py-2">Log in</Link>
            )}
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      {isAuthenticated && <TravelAssistant />}
    </div>
  );
}