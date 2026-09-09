import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PhoneInput from '../components/auth/PhoneInput';
import Button from '../components/common/Button';
import ErrorMessage from '../components/common/ErrorMessage';
import * as authService from '../services/authService';

export default function LoginPage() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await authService.login({ phoneNumber });
      navigate('/verify-otp', { state: { phoneNumber, mode: 'login' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Welcome back</h1>
      <p className="mb-6 text-sm text-ink-500">Log in with your phone number.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PhoneInput value={phoneNumber} onChange={setPhoneNumber} />
        {error && <ErrorMessage message={error} />}
        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Send code
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        New here?{' '}
        <Link to="/register" className="font-semibold text-indigo">
          Create an account
        </Link>
      </p>
    </div>
  );
}