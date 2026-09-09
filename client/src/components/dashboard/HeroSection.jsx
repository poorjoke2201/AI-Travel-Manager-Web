import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function HeroSection() {
  const { user } = useAuth();
  return (
    <section className="mb-8 flex flex-col items-start justify-between gap-4 rounded-card bg-indigo px-8 py-10 text-white sm:flex-row sm:items-center">
      <div>
        <h1 className="font-display text-3xl font-semibold">Welcome back, {user?.username}</h1>
        <p className="mt-1 text-indigo-100">Where's your next trip taking you?</p>
      </div>
      <Link to="/create-trip" className="rounded-xs bg-marigold px-5 py-2.5 font-semibold text-ink hover:bg-marigold-600">
        Create trip
      </Link>
    </section>
  );
}