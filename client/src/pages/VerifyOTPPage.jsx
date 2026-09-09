import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import OTPInput from '../components/auth/OTPInput';
import Button from '../components/common/Button';
import ErrorMessage from '../components/common/ErrorMessage';
import { useAuth } from '../hooks/useAuth';
import * as authService from '../services/authService';

export default function VerifyOTPPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { authenticate } = useAuth();

  const { phoneNumber, pendingProfile } = location.state || {};

  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState(null);
  const [resent, setResent] = useState(false);

  // Landed here directly without going through login/register first.
  if (!phoneNumber) return <Navigate to="/login" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { user, token } = await authService.verifyOtp({ phoneNumber, code, pendingProfile });
      authenticate({ user, token });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResent(false);
    setIsResending(true);
    try {
      await authService.resendOtp({ phoneNumber });
      setResent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Verify your number</h1>
      <p className="mb-6 text-sm text-ink-500">
        We sent a code to <span className="font-semibold text-ink">{phoneNumber}</span>.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <OTPInput value={code} onChange={setCode} />
        {error && <ErrorMessage message={error} />}
        {resent && <p className="text-sm text-teal">A new code has been sent.</p>}
        <Button type="submit" isLoading={isSubmitting} disabled={code.length !== 6} className="w-full">
          Verify and continue
        </Button>
      </form>
      <button
        type="button"
        onClick={handleResend}
        disabled={isResending}
        className="mt-4 w-full text-center text-sm font-semibold text-indigo disabled:opacity-50"
      >
        {isResending ? 'Sending...' : "Didn't get a code? Resend"}
      </button>
    </div>
  );
}