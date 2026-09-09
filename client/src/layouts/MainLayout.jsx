import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function MainLayout() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-display text-xl font-semibold text-ink">
            Travel Manager
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-ink-500">
            <Link to="/explore" className="hover:text-ink">Explore</Link>
            <Link to="/public-trips" className="hover:text-ink">Public trips</Link>
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn-primary !px-4 !py-2">Dashboard</Link>
            ) : (
              <Link to="/login" className="btn-primary !px-4 !py-2">Log in</Link>
            )}
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}