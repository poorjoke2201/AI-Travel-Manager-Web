import { formatInr, formatRating, toTitleCase } from '../../utils/formatters';
import EmptyState from '../common/EmptyState';

export default function ExploreResults({ activeType, results, onAddToTrip, onPlanAround }) {
  const items = results[activeType === 'poi' ? 'pois' : `${activeType}s`] || [];

  if (!items.length) {
    return <EmptyState title="No results yet" description="Search a destination or adjust your filters." />;
  }

  return (
    <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
      {items.map((item) => (
        <div key={item._id} className="journal-sheet relative p-4 transition-transform hover:-translate-y-0.5">
          <span className="absolute right-3 top-3 font-display text-xs text-clay">PINNED</span>
          <h4 className="pr-16 font-display text-lg font-semibold text-ink">{item.name}</h4>
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
              Add to journal
            </button>
          )}
          {onPlanAround && activeType === 'poi' && item._id && (
            <button type="button" className="ml-3 mt-3 text-xs font-semibold text-teal hover:underline" onClick={() => onPlanAround(item)}>
              Plan around it
            </button>
          )}
        </div>
      ))}
    </div>
  );
}