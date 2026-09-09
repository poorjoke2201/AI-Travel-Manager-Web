import Input from '../common/Input';
import { TRIP_TYPES, TRAVEL_STYLES, PACE_OPTIONS } from '../../constants/categories';

function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div>
      <span className="mb-2 block text-sm font-semibold text-ink-700">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
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

export default function TravellerPreferences({ values, onChange }) {
  function set(field, value) {
    onChange({ ...values, [field]: value });
  }
  function setTraveller(field, value) {
    onChange({ ...values, travellers: { ...values.travellers, [field]: value } });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Adults"
          type="number"
          min="1"
          value={values.travellers.adults}
          onChange={(e) => setTraveller('adults', Math.max(1, Number(e.target.value)))}
        />
        <Input
          label="Children"
          type="number"
          min="0"
          value={values.travellers.children}
          onChange={(e) => setTraveller('children', Math.max(0, Number(e.target.value)))}
        />
      </div>
      <SegmentedControl label="Trip type" options={TRIP_TYPES} value={values.tripType} onChange={(v) => set('tripType', v)} />
      <SegmentedControl label="Travel style" options={TRAVEL_STYLES} value={values.travelStyle} onChange={(v) => set('travelStyle', v)} />
      <SegmentedControl label="Pace" options={PACE_OPTIONS} value={values.pace} onChange={(v) => set('pace', v)} />
      <Input
        label="Daily travel tolerance (km, optional)"
        type="number"
        min="0"
        placeholder="e.g. 25"
        value={values.dailyTravelToleranceKm ?? ''}
        onChange={(e) => set('dailyTravelToleranceKm', e.target.value ? Number(e.target.value) : null)}
        hint="Maximum local travel you're comfortable with each day."
      />
    </div>
  );
}