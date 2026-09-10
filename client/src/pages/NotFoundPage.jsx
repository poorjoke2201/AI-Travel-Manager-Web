import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone px-6 text-center">
      <img src="/assets/illustrations/compass.svg" alt="" className="h-16 w-16 opacity-60" />
      <p className="eyebrow">Wrong turn</p>
      <h1 className="font-display text-4xl font-semibold">This page is off the map.</h1>
      <p className="text-ink-500">The page you're looking for doesn't exist or has moved.</p>
      <Link to="/" className="btn-primary">
        Back to home
      </Link>
    </div>
  );
}