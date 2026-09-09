import { formatInr, formatRating, toTitleCase } from '../../utils/formatters';

export default function LocationPopup({ item, type, onAddToTrip }) {
  return (
    <div className="min-w-[200px] max-w-[240px] font-sans">
      <h4 className="mb-1 font-semibold text-ink">{item.name}</h4>
      {(item.category || item.cuisine) && (
        <p className="mb-1 text-xs text-ink-500">
          {item.category || (item.cuisine || []).map(toTitleCase).join(', ')}
        </p>
      )}
      {(item.googleRating != null || item.rating != null) && (
        <p className="mb-1 text-xs text-ink-500">{formatRating(item.googleRating ?? item.rating)}</p>
      )}
      {item.pricePerNightInr != null && <p className="mb-1 text-xs text-ink-500">{formatInr(item.pricePerNightInr)}/night</p>}
      {item.avgPriceForTwo != null && <p className="mb-1 text-xs text-ink-500">{formatInr(item.avgPriceForTwo)} for two</p>}
      {item.description && <p className="mb-2 text-xs text-ink-500 line-clamp-3">{item.description}</p>}
      <p className="mb-2 text-xs text-ink-300">Source: {item.source || 'dataset'}</p>
      {onAddToTrip && (
        <button
          type="button"
          onClick={() => onAddToTrip(item, type)}
          className="text-xs font-semibold text-indigo hover:underline"
        >
          Add to trip
        </button>
      )}
    </div>
  );
}