import Input from '../common/Input';
import { computeNumberOfDays, todayIsoDate } from '../../utils/dateUtils';
import { pluralize } from '../../utils/formatters';

export default function TripBasicInfo({ values, onChange, errors = {} }) {
  const numberOfDays = computeNumberOfDays(values.startDate, values.endDate);

  function set(field, value) {
    onChange({ ...values, [field]: value });
  }

  return (
    <div className="space-y-4">
      <Input
        label="Trip name"
        name="tripName"
        placeholder="Goa getaway"
        value={values.tripName}
        onChange={(e) => set('tripName', e.target.value)}
        error={errors.tripName}
        required
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="From"
          name="origin"
          placeholder="Bengaluru"
          value={values.origin}
          onChange={(e) => set('origin', e.target.value)}
          error={errors.origin}
          required
        />
        <Input
          label="Destination"
          name="destination"
          placeholder="Goa"
          value={values.destination}
          onChange={(e) => set('destination', e.target.value)}
          error={errors.destination}
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Start date"
          name="startDate"
          type="date"
          min={todayIsoDate()}
          value={values.startDate}
          onChange={(e) => set('startDate', e.target.value)}
          error={errors.startDate}
          required
        />
        <Input
          label="End date"
          name="endDate"
          type="date"
          min={values.startDate || todayIsoDate()}
          value={values.endDate}
          onChange={(e) => set('endDate', e.target.value)}
          error={errors.endDate}
          required
        />
      </div>
      {numberOfDays && numberOfDays > 0 && (
        <p className="text-sm text-ink-500">Duration: {pluralize(numberOfDays, 'day')}</p>
      )}
      <Input
        label="Budget (INR, optional)"
        name="budget"
        type="number"
        min="0"
        placeholder="30000"
        value={values.budget ?? ''}
        onChange={(e) => set('budget', e.target.value ? Number(e.target.value) : null)}
        error={errors.budget}
      />
    </div>
  );
}