import api from './api';

export async function listRecentActivity() {
  const { data } = await api.get('/activity/recent');
  return data.data;
}

export async function logThreeDView(payload) {
  const { data } = await api.post('/activity/3d-view', payload);
  return data.data;
}
