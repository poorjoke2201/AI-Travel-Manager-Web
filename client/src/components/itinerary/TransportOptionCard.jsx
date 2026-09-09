import { toTitleCase } from '../../utils/formatters';
import { formatInr } from '../../utils/formatters';

const MODE_ICON = { flight: '✈️', train: '🚆', bus: '🚌', car: '🚗', bike: '🏍️' };

export default function TransportOptionCard({ option }) {
  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 font-semibold text-ink">
          <span aria-hidden="true">{MODE_ICON[option.mode] || '🧭'}</span>
          {toTitleCase(option.mode)}
        </span>
        <span className="tag-chip !border-marigold-100 bg-marigold-100 text-marigold-600">
          {option.source === 'google_maps' ? 'Google Maps distance' : 'AI estimate'}
        </span>
      </div>
      <p className="mb-3 text-sm text-ink-500">{option.summary}</p>
      <div className="flex gap-6 text-sm">
        {option.approxDurationHrs != null && (
          <span>
            <span className="text-ink-500">Duration: </span>
            <span className="font-semibold">{option.approxDurationHrs.toFixed(1)} hrs</span>
          </span>
        )}
        {option.approxPriceInr != null && (
          <span>
            <span className="text-ink-500">Est. price: </span>
            <span className="font-semibold">{formatInr(option.approxPriceInr)}</span>
          </span>
        )}
        {option.distanceKm != null && (
          <span>
            <span className="text-ink-500">Distance: </span>
            <span className="font-semibold">{Math.round(option.distanceKm)} km</span>
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-300">Not live availability - this app does not book travel.</p>
    </div>
  );
}