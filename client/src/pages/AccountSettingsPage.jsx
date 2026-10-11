import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/common/Button';
import ErrorMessage from '../components/common/ErrorMessage';
import Input from '../components/common/Input';
import * as profileService from '../services/profileService';

export default function AccountSettingsPage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phoneNumber: '', username: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [saveState, setSaveState] = useState({ isSaving: false, isComplete: false });
  const [passwordState, setPasswordState] = useState({ isSaving: false, isComplete: false });

  useEffect(() => {
    let active = true;
    profileService.getProfile()
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setForm({
          name: data?.name || '',
          email: data?.email || '',
          phoneNumber: data?.phoneNumber || '',
          username: data?.username || '',
        });
      })
      .catch((loadError) => setError(loadError.message || 'Unable to load account details.'))
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  async function handleProfileSave(event) {
    event.preventDefault();
    setError('');
    setSaveState({ isSaving: true, isComplete: false });
    try {
      const nextProfile = await profileService.updateProfile({
        name: form.name || null,
        email: form.email || null,
      });
      setProfile(nextProfile);
      setSaveState({ isSaving: false, isComplete: true });
    } catch (requestError) {
      setError(requestError.message || 'Unable to save your account changes.');
      setSaveState({ isSaving: false, isComplete: false });
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    setPasswordError('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setPasswordState({ isSaving: true, isComplete: false });
    try {
      await profileService.changePassword({
        currentPassword: passwordForm.currentPassword || undefined,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordState({ isSaving: false, isComplete: true });
    } catch (requestError) {
      setPasswordError(requestError.message || 'Unable to change your password.');
      setPasswordState({ isSaving: false, isComplete: false });
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Account settings</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Manage your traveler profile</h1>
        </div>
        <Link to="/profile" className="text-sm font-medium text-ocean hover:text-ocean-700">← Back to profile</Link>
      </div>

      <div className="card p-6">
        <form className="space-y-4" onSubmit={handleProfileSave}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Display name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={80} />
            <Input label="Phone number" value={form.phoneNumber} readOnly />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Username" value={form.username} readOnly />
            <Input label="Email address" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </div>
          {error ? <ErrorMessage message={error} /> : null}
          {saveState.isComplete ? <p className="text-sm text-teal">Profile updated.</p> : null}
          <div className="flex justify-end">
            <Button type="submit" isLoading={isLoading || saveState.isSaving}>Save profile</Button>
          </div>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Change password</h2>
        <p className="mt-1 text-sm text-ink-500">Use a strong password for your account. Existing OTP login still works for accounts without a password.</p>
        <form className="mt-5 space-y-4" onSubmit={handlePasswordChange}>
          <Input label="Current password" type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} placeholder="Required if a password already exists" />
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="New password" type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} minLength={8} maxLength={72} placeholder="At least 8 characters" />
            <Input label="Confirm password" type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} minLength={8} maxLength={72} placeholder="Repeat password" />
          </div>
          {passwordError ? <ErrorMessage message={passwordError} /> : null}
          {passwordState.isComplete ? <p className="text-sm text-teal">Password updated.</p> : null}
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" isLoading={passwordState.isSaving}>Update password</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
