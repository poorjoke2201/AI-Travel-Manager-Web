import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function HeroSection() {
  const { user } = useAuth();
  return (
    <section className="relative mb-10 overflow-hidden border-b border-stone-300 pb-8 pt-2">
      <img src="/assets/illustrations/journal.svg" alt="" className="pointer-events-none absolute right-8 top-0 h-28 w-28 opacity-20" />
      <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Journal index / 2026</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Welcome back, {user?.username}</h1>
          <p className="mt-2 max-w-md text-ink-500">Where will the next page take you?</p>
        </div>
        <Link to="/create-trip" className="btn-primary">
          Start a new journey
        </Link>
      </div>
      <div className="mt-7 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-ink-500">
        <span className="h-px w-16 bg-clay" />
        <span>Plans, places, and possibilities</span>
      </div>
    </section>
  );
}