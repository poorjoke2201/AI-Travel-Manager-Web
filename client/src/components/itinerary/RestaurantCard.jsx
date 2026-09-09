import { formatInr, formatRating, toTitleCase } from '../../utils/formatters';

export default function RestaurantCard({ restaurant }) {
  return (
    <div className="rounded-xs border border-stone-300 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h4 className="font-semibold text-ink">{restaurant.name}</h4>
        <span className="text-sm text-ink-500">{formatRating(restaurant.rating)}</span>
      </div>
      <p className="text-sm text-ink-500">
        {(restaurant.cuisine || []).map(toTitleCase).join(', ') || 'Cuisine not listed'}
        {restaurant.isPureVeg ? ' - Pure veg' : ''}
      </p>
      {restaurant.avgPriceForTwo != null && (
        <p className="mt-1 text-sm text-ink-500">Approx. {formatInr(restaurant.avgPriceForTwo)} for two</p>
      )}
    </div>
  );
}