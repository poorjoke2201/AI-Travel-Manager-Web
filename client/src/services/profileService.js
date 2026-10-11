import api from './api';

export async function getProfile() {
  const { data } = await api.get('/profile');
  return data.data;
}

export async function updateProfile(updates) {
  const { data } = await api.patch('/profile', updates);
  return data.data;
}

export async function changePassword({ currentPassword, newPassword }) {
  const { data } = await api.patch('/profile/password', { currentPassword, newPassword });
  return data.data;
}

export async function getProfileSummary() {
  const { data } = await api.get('/profile/summary');
  return data.data;
}

export async function uploadAvatar(file) {
  const form = new FormData();
  form.append('avatar', file);
  const { data } = await api.post('/profile/avatar', form);
  return data.data;
}

export async function requestPhoneChange(phoneNumber) {
  const { data } = await api.post('/profile/phone-change', { phoneNumber });
  return data.data;
}

export async function verifyPhoneChange(phoneNumber, code) {
  const { data } = await api.post('/profile/phone-change/verify', { phoneNumber, code });
  return data.data;
}
