import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import TravelAssistant from '../components/assistant/TravelAssistant';
import GlobalSearch from '../components/common/GlobalSearch';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/create-trip', label: 'Create trip' },
  { to: '/explore', label: 'Explore' },
  { to: '/public-trips', label: 'Public trips' },
  { to: '/profile', label: 'Profile' },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-stone">
      <header className="relative z-40 border-b border-stone-300 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="font-handwritten text-4xl font-bold leading-none text-ink">
            Travel Manager
          </Link>
          <GlobalSearch />
          <nav className="flex items-center gap-1 text-sm font-medium text-ink-500">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'rounded-full bg-ocean-100 px-3 py-2 text-ocean-700' : 'rounded-full px-3 py-2 hover:bg-stone-200 hover:text-ink')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-500">{user?.username}</span>
            <button type="button" onClick={handleLogout} className="btn-secondary !px-4 !py-2">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
      <TravelAssistant />
    </div>
  );
}