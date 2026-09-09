import api from './api';

export async function searchDestination(query, radius) {
  const { data } = await api.get('/explore/search', { params: { query, radius } });
  return data.data;
}

export async function browsePOIs(filters) {
  const { data } = await api.get('/explore/pois', { params: filters });
  return data.data;
}

export async function browseHotels(filters) {
  const { data } = await api.get('/explore/hotels', { params: filters });
  return data.data;
}

export async function browseRestaurants(filters) {
  const { data } = await api.get('/explore/restaurants', { params: filters });
  return data.data;
}

export async function nearby({ lat, lng, radius, type }) {
  const { data } = await api.get('/explore/nearby', { params: { lat, lng, radius, type } });
  return data.data;
}