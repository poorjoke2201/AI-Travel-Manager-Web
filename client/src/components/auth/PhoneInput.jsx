import Input from '../common/Input';

export default function PhoneInput({ value, onChange, error }) {
  return (
    <Input
      label="Phone number"
      type="tel"
      name="phoneNumber"
      placeholder="+91 98765 43210"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      hint="We'll send a one-time code to this number."
      autoComplete="tel"
    />
  );
}