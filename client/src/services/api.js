import axios from 'axios';

// In dev, Vite proxies /api to the backend (see vite.config.js). In
// production, set VITE_API_URL to the deployed API origin.
const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL });

const TOKEN_KEY = 'travel_manager_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Centralizes "your session is no longer valid" handling so individual
// pages don't each need to catch 401s and redirect themselves.
let onUnauthorized = null;
export function registerUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    // Normalize so callers can always read err.message for a user-friendly string.
    const message = error.response?.data?.message || error.message || 'Something went wrong.';
    return Promise.reject(Object.assign(new Error(message), { details: error.response?.data?.details, status: error.response?.status }));
  }
);

export default api;