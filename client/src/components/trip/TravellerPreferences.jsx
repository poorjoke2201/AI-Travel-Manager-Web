import { useState } from 'react';
import Input from '../common/Input';
import { TRIP_TYPES, TRAVEL_STYLES, PACE_OPTIONS } from '../../constants/categories';
import { FEATURE_FLAGS } from '../../config/features';

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
  const [inviteInput, setInviteInput] = useState('');
  const totalTravelers = (Number(values.travellers?.adults) || 0) + (Number(values.travellers?.children) || 0);
  const isGroupTripPrompt = FEATURE_FLAGS.FEATURE_GROUP_TRIPS && (totalTravelers > 1 || values.isGroupTrip);

  function set(field, value) {
    onChange({ ...values, [field]: value });
  }

  function setTraveller(field, value) {
    onChange({ ...values, travellers: { ...values.travellers, [field]: value } });
  }

  function addInvite() {
    const raw = inviteInput.trim();
    if (!raw) return;

    const normalized = raw.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    if (!normalized) return;

    const nextMembers = [...(values.groupMembers || [])];
    const alreadyAdded = nextMembers.some((member) => {
      const target = member?.phoneNumber || member;
      return String(target).toLowerCase() === normalized.toLowerCase();
    });

    if (alreadyAdded) {
      setInviteInput('');
      return;
    }

    nextMembers.push({ phoneNumber: normalized, name: null, status: 'invited', role: 'member' });
    onChange({ ...values, groupMembers: nextMembers, isGroupTrip: true });
    setInviteInput('');
  }

  function removeInvite(index) {
    const nextMembers = [...(values.groupMembers || [])];
    nextMembers.splice(index, 1);
    onChange({ ...values, groupMembers: nextMembers, isGroupTrip: nextMembers.length > 0 || values.isGroupTrip });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Adults"
          type="number"
          min="1"
          value={values.travellers.adults}
          onChange={(e) => setTraveller('adults', Math.max(1, Number(e.target.value) || 1))}
        />
        <Input
          label="Children"
          type="number"
          min="0"
          value={values.travellers.children}
          onChange={(e) => setTraveller('children', Math.max(0, Number(e.target.value) || 0))}
        />
      </div>

      {isGroupTripPrompt && (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Is this a group trip?</p>
              <p className="text-xs text-ink-500">Invite travellers by phone number to join the itinerary.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(values.isGroupTrip)}
              onClick={() => set('isGroupTrip', !values.isGroupTrip)}
              className={`h-7 w-12 rounded-full transition-colors ${values.isGroupTrip ? 'bg-ocean' : 'bg-stone-300'}`}
            >
              <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${values.isGroupTrip ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {(values.isGroupTrip || values.groupMembers?.length) && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="Add +91 phone number"
                  className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm placeholder:text-ink-400 focus:border-ocean focus:outline-none"
                />
                <button type="button" onClick={addInvite} className="rounded-xl bg-clay px-3 py-2 text-sm font-medium text-white hover:bg-clay-600">
                  Add
                </button>
              </div>

              {values.groupMembers?.length ? (
                <div className="flex flex-wrap gap-2">
                  {values.groupMembers.map((member, index) => (
                    <span key={`${member.phoneNumber ?? member.name ?? index}`} className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-stone-300">
                      {member.phoneNumber || member.name || 'Traveller'}
                      <button type="button" onClick={() => removeInvite(index)} className="text-ink-400 hover:text-clay">×</button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-500">No invitees added yet.</p>
              )}
            </div>
          )}
        </div>
      )}

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