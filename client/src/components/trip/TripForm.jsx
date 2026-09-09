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
      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">Trip basics</h2>
        <TripBasicInfo values={values} onChange={setValues} errors={errors} />
      </section>

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">Interests</h2>
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

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">Getting there and staying</h2>
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

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">Travellers and style</h2>
        <TravellerPreferences values={values} onChange={setValues} />
      </section>

      <section className="card flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Make this trip public</h2>
          <p className="text-sm text-ink-500">Public trips are visible to other travellers for inspiration.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={values.isPublic}
          onClick={() => setValues({ ...values, isPublic: !values.isPublic })}
          className={`h-7 w-12 rounded-full transition-colors ${values.isPublic ? 'bg-indigo' : 'bg-stone-300'}`}
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