import { ACCOMMODATION_PREFERENCES } from '../../constants/categories';

export default function AccommodationPreferences({ value, onChange }) {
  return (
    <div>
      <span className="mb-2 block text-sm font-semibold text-ink-700">Accommodation preference</span>
      <div className="flex flex-wrap gap-2">
        {ACCOMMODATION_PREFERENCES.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={`tag-chip ${value === opt.value ? 'tag-chip-active' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}