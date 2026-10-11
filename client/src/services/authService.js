import api from './api';

export async function register({ phoneNumber, username, password, avatar }) {
  const { data } = await api.post('/auth/register', { phoneNumber, username, password, avatar });
  return data.data;
}

export async function login({ phoneNumber, password }) {
  const { data } = await api.post('/auth/login', { phoneNumber, password });
  return data.data;
}

export async function resendOtp({ phoneNumber }) {
  const { data } = await api.post('/auth/send-otp', { phoneNumber });
  return data.data;
}

export async function verifyOtp({ phoneNumber, code, pendingProfile }) {
  const { data } = await api.post('/auth/verify-otp', { phoneNumber, code, pendingProfile });
  return data.data; // { user, token }
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me');
  return data.data;
}