import { TRANSPORT_MODES, TRANSPORT_DISCLAIMER } from '../../constants/transport';

export default function TransportPreferences({ value, onChange }) {
  return (
    <div>
      <span className="mb-2 block text-sm font-semibold text-ink-700">How would you like to get there?</span>
      <div className="flex flex-wrap gap-2">
        {TRANSPORT_MODES.map((mode) => {
          const active = value === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => onChange(mode.value)}
              aria-pressed={active}
              className={`tag-chip ${active ? 'tag-chip-active' : ''}`}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-500">{TRANSPORT_DISCLAIMER} - this app doesn't book travel.</p>
    </div>
  );
}