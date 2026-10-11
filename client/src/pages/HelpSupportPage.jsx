import { Link } from 'react-router-dom';

const helpItems = [
  {
    title: 'What is Travel Manager?',
    description: 'Travel Manager supports trip planning, itinerary generation, expense tracking, POI discovery, and saved journal memories for a trip.',
  },
  {
    title: 'How do I create a trip?',
    description: 'Use the Create trip page to set a destination, travel preferences, and trip dates. The planner then generates an itinerary and budget.',
  },
  {
    title: 'Where are my saved memories?',
    description: 'Open the profile page and use My Travel Journal to add, edit, or view photos and notes for individual places or trips.',
  },
  {
    title: 'How do I manage trip visibility?',
    description: 'Trip visibility is controlled on each trip record. Public trips are marked individually rather than through a global profile toggle.',
  },
];

export default function HelpSupportPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Help &amp; support</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Support centre</h1>
        </div>
        <Link to="/profile" className="text-sm font-medium text-ocean hover:text-ocean-700">← Back to profile</Link>
      </div>

      <div className="card p-6">
        <div className="space-y-4">
          {helpItems.map((item) => (
            <div key={item.title} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <h2 className="font-display text-xl font-semibold text-ink">{item.title}</h2>
              <p className="mt-2 text-sm text-ink-600">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
