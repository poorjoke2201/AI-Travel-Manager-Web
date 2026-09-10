import { formatInr, formatRating, toTitleCase } from '../../utils/formatters';
import EmptyState from '../common/EmptyState';

export default function ExploreResults({ activeType, results, onAddToTrip }) {
  const items = results[activeType === 'poi' ? 'pois' : `${activeType}s`] || [];

  if (!items.length) {
    return <EmptyState title="No results yet" description="Search a destination or adjust your filters." />;
  }

  return (
    <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
      {items.map((item) => (
        <div key={item._id} className="rounded-xs border border-stone-300 bg-white p-4">
          <h4 className="font-semibold text-ink">{item.name}</h4>
          <p className="text-sm text-ink-500">
            {item.category || (item.cuisine || []).map(toTitleCase).join(', ') || item.city}
          </p>
          <div className="mt-1 flex gap-3 text-xs text-ink-500">
            {(item.googleRating != null || item.rating != null) && <span>{formatRating(item.googleRating ?? item.rating)}</span>}
            {item.pricePerNightInr != null && <span>{formatInr(item.pricePerNightInr)}/night</span>}
            {item.avgPriceForTwo != null && <span>{formatInr(item.avgPriceForTwo)} for two</span>}
          </div>
          {onAddToTrip && (
            <button type="button" className="mt-3 text-xs font-semibold text-indigo hover:underline" onClick={() => onAddToTrip(item, activeType)}>
              Add to trip
            </button>
          )}
        </div>
      ))}
    </div>
  );
}