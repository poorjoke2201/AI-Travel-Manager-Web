import { useState } from 'react';
import { ACCOMMODATION_PREFERENCES, PACE_OPTIONS, TRAVEL_STYLES } from '../../constants/categories';
import { FOOD_PREFERENCES, PLACE_INTERESTS } from '../../constants/preferences';
import { TRANSPORT_MODES } from '../../constants/transport';
import * as profileService from '../../services/profileService';
import ProfileDrawer from './ProfileDrawer';

const DEFAULT_PREFERENCES = {
  placePreferences: [],
  foodPreferences: [],
  travelStyle: 'moderate',
  pace: 'balanced',
  transportPreference: 'any',
  accommodationPreference: 'any',
};

function humanize(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ToggleChips({ label, options, selected, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const value = typeof option === 'string' ? option : option.value;
          const text = typeof option === 'string' ? option : option.label;
          const active = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? selected.filter((item) => item !== value) : [...selected, value])}
              className={`tag-chip ${active ? 'tag-chip-active' : 'bg-stone-50'}`}
            >
              {text}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function PreferenceSelect({ label, value, options, onChange }) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input-field mt-1">
        {options.map(({ value: optionValue, label: optionLabel }) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

export default function TravelPreferencesCard({ profile, isLoading, onUpdated }) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_PREFERENCES);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  function openDrawer() {
    setDraft({ ...DEFAULT_PREFERENCES, ...(profile?.preferences || {}) });
    setError('');
    setIsOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const updated = await profileService.updateProfile({ preferences: draft });
      onUpdated(updated);
      window.dispatchEvent(new Event('travel-activity-updated'));
      setIsOpen(false);
    } catch (saveError) {
      setError(saveError.message || 'Travel preferences could not be saved.');
    } finally {
      setIsSaving(false);
    }
  }

  const preferences = { ...DEFAULT_PREFERENCES, ...(profile?.preferences || {}) };
  const visibleInterests = preferences.placePreferences.slice(0, 3);

  return (
    <>
      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">How you travel</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Travel preferences</h2>
          </div>
          <button type="button" onClick={openDrawer} disabled={isLoading} className="text-sm font-semibold text-ocean-700 underline underline-offset-4 disabled:opacity-50">Edit</button>
        </div>
        {isLoading ? <div role="status" className="mt-5 h-28 animate-pulse rounded-card bg-stone-100" /> : (
          <div className="mt-5 space-y-4 text-sm">
            <div>
              <p className="mb-2 font-semibold text-ink">Interests</p>
              <div className="flex flex-wrap gap-2">
                {visibleInterests.length ? visibleInterests.map((interest) => <span className="tag-chip" key={interest}>{interest}</span>) : <span className="text-ink-500">Not set</span>}
                {preferences.placePreferences.length > 3 ? <span className="tag-chip">+{preferences.placePreferences.length - 3}</span> : null}
              </div>
            </div>
            <PreferenceRow label="Budget style" value={humanize(preferences.travelStyle)} />
            <PreferenceRow label="Travel pace" value={humanize(preferences.pace)} />
            <PreferenceRow label="Preferred transport" value={humanize(preferences.transportPreference)} />
            <PreferenceRow label="Accommodation" value={humanize(preferences.accommodationPreference)} />
            <PreferenceRow label="Dietary preference" value={preferences.foodPreferences.length ? preferences.foodPreferences.join(', ') : 'Not set'} />
          </div>
        )}
      </section>

      <ProfileDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} title="Edit travel preferences">
        <form className="space-y-6" onSubmit={save}>
          <ToggleChips label="Interests" options={PLACE_INTERESTS} selected={draft.placePreferences} onChange={(placePreferences) => setDraft({ ...draft, placePreferences })} />
          <PreferenceSelect label="Budget style" value={draft.travelStyle} options={TRAVEL_STYLES} onChange={(travelStyle) => setDraft({ ...draft, travelStyle })} />
          <PreferenceSelect label="Travel pace" value={draft.pace} options={PACE_OPTIONS} onChange={(pace) => setDraft({ ...draft, pace })} />
          <PreferenceSelect label="Preferred transport" value={draft.transportPreference} options={TRANSPORT_MODES} onChange={(transportPreference) => setDraft({ ...draft, transportPreference })} />
          <PreferenceSelect label="Accommodation" value={draft.accommodationPreference} options={ACCOMMODATION_PREFERENCES} onChange={(accommodationPreference) => setDraft({ ...draft, accommodationPreference })} />
          <ToggleChips label="Dietary preference" options={FOOD_PREFERENCES} selected={draft.foodPreferences} onChange={(foodPreferences) => setDraft({ ...draft, foodPreferences })} />
          {error ? <p role="alert" className="text-sm text-clay-700">{error}</p> : null}
          <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
            <button type="button" className="btn-secondary" onClick={() => setIsOpen(false)}>Cancel</button>
            <button type="submit" disabled={isSaving} className="btn-primary">{isSaving ? 'Saving...' : 'Save preferences'}</button>
          </div>
        </form>
      </ProfileDrawer>
    </>
  );
}

function PreferenceRow({ label, value }) {
  return <p className="flex justify-between gap-3 border-b border-stone-200 pb-2"><span className="text-ink-500">{label}</span><span className="max-w-[65%] break-words text-right font-medium text-ink">{value || 'Not set'}</span></p>;
}
