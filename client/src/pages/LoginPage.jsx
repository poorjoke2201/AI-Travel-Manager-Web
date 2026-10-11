import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PhoneInput from '../components/auth/PhoneInput';
import Button from '../components/common/Button';
import ErrorMessage from '../components/common/ErrorMessage';
import Input from '../components/common/Input';
import { useAuth } from '../hooks/useAuth';
import * as authService from '../services/authService';

export default function LoginPage() {
  const navigate = useNavigate();
  const { authenticate } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handlePasswordLogin(e) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { user, token } = await authService.login({ phoneNumber, password });
      authenticate({ user, token });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOtpLogin(e) {
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
      <p className="mb-6 text-sm text-ink-500">Log in with your phone number and password, or request an OTP code.</p>
      <form className="space-y-4" onSubmit={handlePasswordLogin}>
        <PhoneInput value={phoneNumber} onChange={setPhoneNumber} />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <ErrorMessage message={error} />}
        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Log in with password
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-ink-400">
        <span className="h-px flex-1 bg-stone-300" />
        OR
        <span className="h-px flex-1 bg-stone-300" />
      </div>

      <form onSubmit={handleOtpLogin}>
        <Button type="submit" variant="secondary" isLoading={isSubmitting} className="w-full">
          Send OTP code
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