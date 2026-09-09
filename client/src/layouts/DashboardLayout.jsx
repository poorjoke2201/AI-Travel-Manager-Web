import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

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
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="font-display text-xl font-semibold text-ink">
            Travel Manager
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-ink-500">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'text-indigo' : 'hover:text-ink')}
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
    </div>
  );
}