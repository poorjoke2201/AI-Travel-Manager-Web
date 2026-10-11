import api from './api';

function toFormData(fields, files = [], removePhotos = []) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  if (removePhotos.length) form.append('removePhotos', JSON.stringify(removePhotos));
  files.forEach((file) => form.append('photos', file));
  return form;
}

export async function listJournalEntries() {
  const { data } = await api.get('/journal');
  return data.data;
}

export async function createJournalEntry(fields, files) {
  const { data } = await api.post('/journal', toFormData(fields, files));
  return data.data;
}

export async function updateJournalEntry(entryId, fields, files, removePhotos) {
  const { data } = await api.patch(`/journal/${entryId}`, toFormData(fields, files, removePhotos));
  return data.data;
}

export async function deleteJournalEntry(entryId) {
  await api.delete(`/journal/${entryId}`);
}

export async function getJournalPhotoUrl(entryId, filename) {
  const { data } = await api.get(`/journal/${entryId}/photos/${encodeURIComponent(filename)}`, { responseType: 'blob' });
  return URL.createObjectURL(data);
}

export async function getJournalFallbackImage(entryId) {
  const { data } = await api.get(`/journal/${entryId}/fallback-image`);
  return data.data.imageUrl;
}
