import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PhoneInput from '../components/auth/PhoneInput';
import AvatarSelector from '../components/auth/AvatarSelector';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import ErrorMessage from '../components/common/ErrorMessage';
import * as authService from '../services/authService';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('🧭');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await authService.register({ phoneNumber, username, avatar });
      navigate('/verify-otp', {
        state: { phoneNumber, mode: 'register', pendingProfile: { username, avatar } },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-ink-500">A few details and you're ready to plan.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PhoneInput value={phoneNumber} onChange={setPhoneNumber} />
        <Input
          label="Username"
          name="username"
          placeholder="wanderlust_23"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          maxLength={30}
          required
        />
        <AvatarSelector value={avatar} onChange={setAvatar} />
        {error && <ErrorMessage message={error} />}
        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Send code
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-500">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-indigo">
          Log in
        </Link>
      </p>
    </div>
  );
}