const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const JournalEntry = require('../../models/JournalEntry');
const ApiError = require('../../utils/apiError');
const tripService = require('../trip/trip.service');
const { validateImageFile } = require('../media/imageValidation.service');
const { resolveDestinationLeadImage } = require('../trip/itineraryImageEnrichment.service');

const MAX_JOURNAL_PHOTO_BYTES = 5 * 1024 * 1024;
const JOURNAL_DIRECTORY = path.resolve(__dirname, '../../../uploads/journal');
const JOURNAL_FILENAME = /^[a-f\d-]{36}\.(?:jpg|png)$/i;

function photoPath(filename) {
  if (!JOURNAL_FILENAME.test(String(filename || ''))) throw ApiError.notFound('Journal photo not found.');
  const resolved = path.resolve(JOURNAL_DIRECTORY, filename);
  if (path.dirname(resolved) !== JOURNAL_DIRECTORY) throw ApiError.badRequest('Invalid journal photo reference.');
  return resolved;
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? value.slice(0, 10) : null;
}

function serializeEntry(entry) {
  const value = typeof entry.toObject === 'function' ? entry.toObject() : entry;
  return {
    _id: value._id,
    tripId: value.tripId || null,
    placeName: value.placeName,
    city: value.city,
    state: value.state || null,
    note: value.note || '',
    visitedOn: dateOnly(value.visitedOn),
    photos: (value.photos || []).map((photo) => ({
      filename: photo.filename,
      mimeType: photo.mimeType,
      url: `/api/journal/${value._id}/photos/${photo.filename}`,
    })),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

async function getOwnedEntry(userId, entryId) {
  const entry = await JournalEntry.findOne({ _id: entryId, userId });
  if (!entry) throw ApiError.notFound('Journal entry not found.');
  return entry;
}

async function validateTrip(userId, tripId) {
  if (tripId) await tripService.getTripById(tripId, userId);
}

function validateFiles(files = []) {
  return files.map((file) => ({
    file,
    extension: validateImageFile({ file, maxBytes: MAX_JOURNAL_PHOTO_BYTES, label: 'Journal' }),
  }));
}

async function removeStoredFiles(photos) {
  await Promise.all(photos.map(async (photo) => {
    try {
      await fs.unlink(photoPath(photo.filename));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }));
}

async function storeFiles(validatedFiles) {
  await fs.mkdir(JOURNAL_DIRECTORY, { recursive: true });
  const stored = [];
  try {
    for (const { file, extension } of validatedFiles) {
      const photo = {
        filename: `${randomUUID()}${extension}`,
        mimeType: file.mimetype,
      };
      await fs.writeFile(photoPath(photo.filename), file.buffer, { flag: 'wx', mode: 0o600 });
      stored.push(photo);
    }
    return stored;
  } catch (error) {
    await removeStoredFiles(stored);
    throw error;
  }
}

async function listEntries(userId) {
  const entries = await JournalEntry.find({ userId }).sort({ visitedOn: -1, createdAt: -1 }).lean();
  return entries.map(serializeEntry);
}

async function createEntry(userId, fields, files = []) {
  const tripId = fields.tripId || null;
  await validateTrip(userId, tripId);
  const validatedFiles = validateFiles(files);
  if (validatedFiles.length > 5) throw ApiError.badRequest('A journal entry can contain at most five photos.');
  const photos = await storeFiles(validatedFiles);
  try {
    const entry = await JournalEntry.create({
      ...fields,
      tripId,
      userId,
      visitedOn: new Date(`${fields.visitedOn}T00:00:00.000Z`),
      photos,
    });
    return serializeEntry(entry);
  } catch (error) {
    await removeStoredFiles(photos);
    throw error;
  }
}

async function updateEntry(userId, entryId, updates, files = []) {
  const entry = await getOwnedEntry(userId, entryId);
  const validatedFiles = validateFiles(files);
  const removePhotos = updates.removePhotos || [];
  const existingPhotos = entry.photos.map((photo) => ({
    filename: photo.filename,
    mimeType: photo.mimeType,
  }));
  const requestedRemovals = new Set(removePhotos);
  if (removePhotos.some((filename) => !existingPhotos.some((photo) => photo.filename === filename))) {
    throw ApiError.badRequest('A selected journal photo does not belong to this entry.');
  }
  const retainedPhotos = existingPhotos.filter((photo) => !requestedRemovals.has(photo.filename));
  if (retainedPhotos.length + validatedFiles.length > 5) {
    throw ApiError.badRequest('A journal entry can contain at most five photos.');
  }
  if (!Object.keys(updates).length && !validatedFiles.length) {
    throw ApiError.badRequest('Provide a journal change or an image to upload.');
  }
  if (Object.hasOwn(updates, 'tripId')) await validateTrip(userId, updates.tripId);

  const addedPhotos = await storeFiles(validatedFiles);
  const previousPhotos = existingPhotos.filter((photo) => requestedRemovals.has(photo.filename));
  const fields = { ...updates };
  delete fields.removePhotos;
  if (Object.hasOwn(fields, 'visitedOn')) {
    fields.visitedOn = new Date(`${fields.visitedOn}T00:00:00.000Z`);
  }
  if (Object.hasOwn(fields, 'tripId')) fields.tripId = fields.tripId || null;
  Object.assign(entry, fields);
  entry.photos = [...retainedPhotos, ...addedPhotos];
  try {
    await entry.save();
  } catch (error) {
    await removeStoredFiles(addedPhotos);
    throw error;
  }
  await removeStoredFiles(previousPhotos);
  return serializeEntry(entry);
}

async function deleteEntry(userId, entryId) {
  const entry = await getOwnedEntry(userId, entryId);
  const photos = entry.photos.map((photo) => ({ filename: photo.filename }));
  await entry.deleteOne();
  await removeStoredFiles(photos);
}

async function getPhoto(userId, entryId, filename) {
  await getOwnedEntry(userId, entryId);
  const entry = await JournalEntry.findOne({ _id: entryId, userId, 'photos.filename': filename }).select('photos').lean();
  if (!entry) throw ApiError.notFound('Journal photo not found.');
  const photo = entry.photos.find((item) => item.filename === filename);
  return { path: photoPath(filename), mimeType: photo.mimeType, size: (await fs.stat(photoPath(filename))).size };
}

async function getFallbackImage(userId, entryId) {
  const entry = await getOwnedEntry(userId, entryId);
  const photo = entry.photos[0];
  if (photo) return { photo: serializeEntry(entry).photos[0], imageUrl: null };
  return { photo: null, imageUrl: await resolveDestinationLeadImage(entry.city) };
}

module.exports = {
  MAX_JOURNAL_PHOTO_BYTES,
  JOURNAL_DIRECTORY,
  serializeEntry,
  photoPath,
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  getPhoto,
  getFallbackImage,
};
