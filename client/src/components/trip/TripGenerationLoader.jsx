import { useEffect, useState } from 'react';

const STEPS = [
  'Reading your preferences',
  'Finding destinations',
  'Selecting places',
  'Finding accommodation',
  'Finding restaurants',
  'Preparing travel recommendations',
  'Analyzing weather context',
  'Optimizing your itinerary',
  'Finalizing your trip',
];

const STEP_INTERVAL_MS = 1400;

/**
 * Generation currently runs as a single synchronous request (see
 * tripGeneration.service.js on the backend) rather than a backgrounded job
 * with real progress events, so this checklist advances on a timer purely
 * to avoid a blank screen during the wait (spec section 40) - it's a
 * perceived-progress indicator, not a live status feed. A future version
 * could replace this with SSE/polling against the trip's real `status`
 * once generation is split into persisted per-step state.
 */
export default function TripGenerationLoader() {
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    if (completedCount >= STEPS.length - 1) return undefined;
    const timer = setTimeout(() => setCompletedCount((c) => c + 1), STEP_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [completedCount]);

  return (
    <div className="mx-auto max-w-sm py-10">
      <h2 className="mb-6 text-center font-display text-xl font-semibold">Creating your personalized journey...</h2>
      <ul className="space-y-3">
        {STEPS.map((step, idx) => {
          const isDone = idx < completedCount;
          const isCurrent = idx === completedCount;
          return (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                  isDone
                    ? 'bg-teal text-white'
                    : isCurrent
                      ? 'animate-pulse bg-marigold text-white'
                      : 'bg-stone-200 text-ink-300'
                }`}
              >
                {isDone ? '✓' : ''}
              </span>
              <span className={isDone ? 'text-ink' : isCurrent ? 'font-semibold text-ink' : 'text-ink-300'}>
                {step}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}