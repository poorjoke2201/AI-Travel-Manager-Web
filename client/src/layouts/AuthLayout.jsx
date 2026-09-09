import { Link, Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 block text-center font-display text-2xl font-semibold text-ink">
          Travel Manager
        </Link>
        <div className="card">
          <Outlet />
        </div>
      </div>
    </div>
  );
}