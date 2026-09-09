import api from './api';

export async function createTrip(payload) {
  const { data } = await api.post('/trips', payload);
  return data.data;
}

/** Creates the draft AND runs the full generation pipeline in one call (used by the Create Trip form). */
export async function createAndGenerateTrip(payload) {
  const { data } = await api.post('/trips/generate', payload);
  return data.data;
}

export async function regenerateTrip(tripId) {
  const { data } = await api.post(`/trips/${tripId}/generate`);
  return data.data;
}

export async function listTrips() {
  const { data } = await api.get('/trips');
  return data.data;
}

export async function getTrip(tripId) {
  const { data } = await api.get(`/trips/${tripId}`);
  return data.data;
}

export async function updateTrip(tripId, updates) {
  const { data } = await api.put(`/trips/${tripId}`, updates);
  return data.data;
}

export async function deleteTrip(tripId) {
  await api.delete(`/trips/${tripId}`);
}