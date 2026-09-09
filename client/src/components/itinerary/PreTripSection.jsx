import PackingChecklist from './PackingChecklist';
import WeatherAdvice from './WeatherAdvice';
import EmptyState from '../common/EmptyState';

export default function PreTripSection({ preTrip }) {
  if (!preTrip || (!preTrip.packingChecklist && !preTrip.weatherAdvice)) {
    return <EmptyState title="No pre-trip guidance yet" description="This will appear once your trip is generated." />;
  }

  return (
    <div className="space-y-6">
      <WeatherAdvice advice={preTrip.weatherAdvice} />

      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">Packing checklist</h2>
        <PackingChecklist checklist={preTrip.packingChecklist} />
      </div>

      {preTrip.travelTips?.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-lg font-semibold">Travel tips</h2>
          <ul className="space-y-1.5 text-sm text-ink-500">
            {preTrip.travelTips.map((tip) => (
              <li key={tip} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}