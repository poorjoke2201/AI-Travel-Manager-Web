import api from './api';

export async function listPublicTrips({ limit = 20, skip = 0 } = {}) {
  const { data } = await api.get('/public/trips', { params: { limit, skip } });
  return data.data;
}

export async function getPublicTrip(tripId) {
  const { data } = await api.get(`/public/trips/${tripId}`);
  return data.data;
}