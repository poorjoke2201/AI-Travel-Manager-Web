import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone px-6 text-center">
      <h1 className="font-display text-4xl font-semibold">Page not found</h1>
      <p className="text-ink-500">The page you're looking for doesn't exist or has moved.</p>
      <Link to="/" className="btn-primary">
        Back to home
      </Link>
    </div>
  );
}