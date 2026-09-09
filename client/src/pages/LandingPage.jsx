import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="mx-auto max-w-4xl px-6 py-24 text-center">
      <h1 className="font-display text-5xl font-semibold leading-tight text-ink">
        Plan a trip that actually fits how you travel
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-ink-500">
        Tell us your interests, your budget, and your pace. We'll build a day-by-day plan grounded in
        real places, real distances, and honest guidance about what's estimated versus confirmed.
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <Link to={isAuthenticated ? '/create-trip' : '/register'} className="btn-primary">
          Start planning
        </Link>
        <Link to="/explore" className="btn-secondary">
          Explore destinations
        </Link>
      </div>
    </div>
  );
}