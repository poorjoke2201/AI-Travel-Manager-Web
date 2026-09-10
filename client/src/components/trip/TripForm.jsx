import { useState } from 'react';
import TripBasicInfo from './TripBasicInfo';
import PlacePreferences from './PlacePreferences';
import FoodPreferences from './FoodPreferences';
import TransportPreferences from './TransportPreferences';
import TravellerPreferences from './TravellerPreferences';
import AccommodationPreferences from './AccommodationPreferences';
import Button from '../common/Button';
import ErrorMessage from '../common/ErrorMessage';

const DEFAULT_VALUES = {
  tripName: '',
  origin: '',
  destination: '',
  startDate: '',
  endDate: '',
  budget: null,
  travellers: { adults: 1, children: 0 },
  transportPreference: 'any',
  placePreferences: [],
  foodPreferences: [],
  travelStyle: 'moderate',
  tripType: 'solo',
  pace: 'balanced',
  accommodationPreference: 'any',
  dailyTravelToleranceKm: null,
  isPublic: false,
};

function validate(values) {
  const errors = {};
  if (!values.tripName.trim()) errors.tripName = 'Trip name is required.';
  if (!values.origin.trim()) errors.origin = 'Origin is required.';
  if (!values.destination.trim()) errors.destination = 'Destination is required.';
  if (!values.startDate) errors.startDate = 'Start date is required.';
  if (!values.endDate) errors.endDate = 'End date is required.';
  if (values.startDate && values.endDate && new Date(values.endDate) < new Date(values.startDate)) {
    errors.endDate = 'End date must be on or after the start date.';
  }
  return errors;
}

export default function TripForm({ onSubmit, isSubmitting, submitError }) {
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [errors, setErrors] = useState({});

  function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="journal-sheet relative p-6 sm:p-8">
        <SectionHeading number="01" title="Trip basics" note="Give this journey a name and a starting point." />
        <TripBasicInfo values={values} onChange={setValues} errors={errors} />
      </section>

      <section className="journal-sheet p-6 sm:p-8">
        <SectionHeading number="02" title="What draws you in?" note="Choose the places, flavours, and details you want to follow." />
        <div className="space-y-6">
          <PlacePreferences
            values={values.placePreferences}
            onChange={(v) => setValues({ ...values, placePreferences: v })}
          />
          <FoodPreferences
            values={values.foodPreferences}
            onChange={(v) => setValues({ ...values, foodPreferences: v })}
          />
        </div>
      </section>

      <section className="journal-sheet p-6 sm:p-8">
        <SectionHeading number="03" title="Getting there and staying" note="A little practical detail helps the route take shape." />
        <div className="space-y-6">
          <TransportPreferences
            value={values.transportPreference}
            onChange={(v) => setValues({ ...values, transportPreference: v })}
          />
          <AccommodationPreferences
            value={values.accommodationPreference}
            onChange={(v) => setValues({ ...values, accommodationPreference: v })}
          />
        </div>
      </section>

      <section className="journal-sheet p-6 sm:p-8">
        <SectionHeading number="04" title="Travellers and style" note="Set the pace for the days ahead." />
        <TravellerPreferences values={values} onChange={setValues} />
      </section>

      <section className="journal-sheet flex items-center justify-between gap-5 p-6 sm:p-8">
        <div>
          <p className="eyebrow">Optional / shared page</p>
          <h2 className="mt-1 text-lg font-semibold">Make this trip public</h2>
          <p className="text-sm text-ink-500">Public trips are visible to other travellers for inspiration.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={values.isPublic}
          onClick={() => setValues({ ...values, isPublic: !values.isPublic })}
          className={`h-7 w-12 rounded-full transition-colors ${values.isPublic ? 'bg-ocean' : 'bg-stone-300'}`}
        >
          <span
            className={`block h-5 w-5 translate-x-1 rounded-full bg-white transition-transform ${
              values.isPublic ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </section>

      {submitError && <ErrorMessage message={submitError} />}

      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Generate my trip
      </Button>
    </form>
  );
}

function SectionHeading({ number, title, note }) {
  return (
    <div className="mb-6 flex gap-4 border-b border-stone-200 pb-4">
      <span className="font-display text-2xl text-clay">{number}</span>
      <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-ink-500">{note}</p></div>
    </div>
  );
}