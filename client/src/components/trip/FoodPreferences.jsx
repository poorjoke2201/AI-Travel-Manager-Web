import { FOOD_PREFERENCES } from '../../constants/preferences';

export default function FoodPreferences({ values, onChange }) {
  function toggle(pref) {
    if (values.includes(pref)) {
      onChange(values.filter((v) => v !== pref));
    } else {
      onChange([...values, pref]);
    }
  }

  return (
    <div>
      <span className="mb-2 block text-sm font-semibold text-ink-700">Food preferences</span>
      <div className="flex flex-wrap gap-2">
        {FOOD_PREFERENCES.map((pref) => {
          const active = values.includes(pref);
          return (
            <button
              key={pref}
              type="button"
              onClick={() => toggle(pref)}
              aria-pressed={active}
              className={`tag-chip ${active ? 'tag-chip-active' : ''}`}
            >
              {pref}
            </button>
          );
        })}
      </div>
    </div>
  );
}