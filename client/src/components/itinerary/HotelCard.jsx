import { formatInr, formatRating } from '../../utils/formatters';

export default function HotelCard({ hotel }) {
  if (!hotel) return null;
  return (
    <div className="rounded-xs border border-marigold-100 bg-white p-4">
      <p className="mb-1 text-xs font-semibold text-marigold-600">{hotel.label || 'Recommended accommodation'}</p>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-ink">{hotel.name}</h4>
        {hotel.googleRating != null && <span className="text-sm text-ink-500">{formatRating(hotel.googleRating)}</span>}
      </div>
      {hotel.pricePerNightInr != null && (
        <p className="mt-1 text-sm text-ink-500">{formatInr(hotel.pricePerNightInr)} / night (estimate)</p>
      )}
      {hotel.conditionLabel && <p className="mt-1 text-sm text-ink-500">{hotel.conditionLabel}</p>}
    </div>
  );
}