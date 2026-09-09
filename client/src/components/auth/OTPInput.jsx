import Input from '../common/Input';

export default function OTPInput({ value, onChange, error }) {
  function handleChange(e) {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 6);
    onChange(digitsOnly);
  }

  return (
    <Input
      label="Enter the 6-digit code"
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder="123456"
      value={value}
      onChange={handleChange}
      error={error}
      className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.5em]"
    />
  );
}