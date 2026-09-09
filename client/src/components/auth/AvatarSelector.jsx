const PRESET_AVATARS = ['🧭', '🏔️', '🏖️', '🗺️', '🎒', '⛰️', '🚆', '🛶'];

export default function AvatarSelector({ value, onChange }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink-700">Choose an avatar</span>
      <div className="flex flex-wrap gap-2">
        {PRESET_AVATARS.map((avatar) => (
          <button
            key={avatar}
            type="button"
            onClick={() => onChange(avatar)}
            aria-pressed={value === avatar}
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-xl transition-colors ${
              value === avatar ? 'border-indigo bg-indigo-100' : 'border-stone-300 hover:border-ink-300'
            }`}
          >
            {avatar}
          </button>
        ))}
      </div>
    </div>
  );
}