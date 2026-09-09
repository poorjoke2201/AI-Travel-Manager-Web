/**
 * Purely a visual connector between two ActivityCards. `durationMinutes` is
 * the buffer itineraryOptimizer.service.js inserts between stops (20 min by
 * default) when no real Google Maps travel time was available for that leg -
 * shown as an estimate, matching the app's rule of never implying a
 * verified travel time it doesn't have.
 */
export default function TravelTimeCard({ durationMinutes = 20, isEstimate = true }) {
  return (
    <div className="flex items-center gap-3 py-1 pl-2.5 text-xs text-ink-300">
      <span className="h-6 w-px bg-stone-300" aria-hidden="true" />
      <span>
        ~{durationMinutes} min to next stop{isEstimate ? ' (estimate)' : ''}
      </span>
    </div>
  );
}