import { Link } from 'react-router-dom';

export default function PrivacySecurityPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Privacy &amp; security</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Your account and trip visibility</h1>
        </div>
        <Link to="/profile" className="text-sm font-medium text-ocean hover:text-ocean-700">← Back to profile</Link>
      </div>

      <div className="card p-6 space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Password policy</h2>
          <p className="mt-2 text-sm text-ink-600">Passwords are stored as hashed values on the server. OTP login remains available as a fallback for accounts that have not set a password yet.</p>
        </div>

        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Trip visibility</h2>
          <p className="mt-2 text-sm text-ink-600">Public visibility is handled per trip by the existing trip settings. Your profile does not expose a separate global visibility switch.</p>
        </div>

        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Private content</h2>
          <p className="mt-2 text-sm text-ink-600">Profile phone numbers, journal entries, and activity feeds remain owner-only. Other users do not see them unless the trip itself is made public.</p>
        </div>
      </div>
    </div>
  );
}
