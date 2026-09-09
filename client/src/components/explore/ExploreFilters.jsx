import { POI_CATEGORIES } from '../../constants/categories';

const TYPES = [
  { value: 'poi', label: 'POIs' },
  { value: 'hotel', label: 'Hotels' },
  { value: 'restaurant', label: 'Restaurants' },
];

export default function ExploreFilters({ activeType, onTypeChange, category, onCategoryChange, minRating, onMinRatingChange }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onTypeChange(t.value)}
            className={`tag-chip ${activeType === t.value ? 'tag-chip-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeType === 'poi' && (
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="input-field w-auto py-2 text-sm"
        >
          <option value="">All categories</option>
          {POI_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}

      <select
        value={minRating}
        onChange={(e) => onMinRatingChange(e.target.value)}
        className="input-field w-auto py-2 text-sm"
      >
        <option value="">Any rating</option>
        <option value="3">3+ stars</option>
        <option value="4">4+ stars</option>
        <option value="4.5">4.5+ stars</option>
      </select>
    </div>
  );
}