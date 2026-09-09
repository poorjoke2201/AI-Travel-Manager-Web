import { PLACE_INTERESTS } from '../../constants/preferences';

export default function PlacePreferences({ values, onChange }) {
  function toggle(interest) {
    if (values.includes(interest)) {
      onChange(values.filter((v) => v !== interest));
    } else {
      onChange([...values, interest]);
    }
  }

  return (
    <div>
      <span className="mb-2 block text-sm font-semibold text-ink-700">What kind of places interest you?</span>
      <div className="flex flex-wrap gap-2">
        {PLACE_INTERESTS.map((interest) => {
          const active = values.includes(interest);
          return (
            <button
              key={interest}
              type="button"
              onClick={() => toggle(interest)}
              aria-pressed={active}
              className={`tag-chip ${active ? 'tag-chip-active' : ''}`}
            >
              {interest}
            </button>
          );
        })}
      </div>
    </div>
  );
}