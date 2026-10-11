const fs = require('node:fs');
const ApiError = require('../utils/apiError');
const journalService = require('../services/journal/journal.service');

function normalizeJournalForm(req, res, next) {
  try {
    if (req.body.tripId === '') req.body.tripId = null;
    if (typeof req.body.removePhotos === 'string') {
      req.body.removePhotos = JSON.parse(req.body.removePhotos);
    }
    next();
  } catch {
    next(ApiError.badRequest('The journal photo removal list is invalid.'));
  }
}

async function listEntries(req, res, next) {
  try {
    res.json({ success: true, data: await journalService.listEntries(req.userId) });
  } catch (error) {
    next(error);
  }
}

async function createEntry(req, res, next) {
  try {
    const entry = await journalService.createEntry(req.userId, req.body, req.files || []);
    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
}

async function updateEntry(req, res, next) {
  try {
    const entry = await journalService.updateEntry(req.userId, req.params.id, req.body, req.files || []);
    res.json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
}

async function deleteEntry(req, res, next) {
  try {
    await journalService.deleteEntry(req.userId, req.params.id);
    res.json({ success: true, message: 'Journal entry deleted.' });
  } catch (error) {
    next(error);
  }
}

async function getPhoto(req, res, next) {
  try {
    const photo = await journalService.getPhoto(req.userId, req.params.id, req.params.filename);
    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Content-Length', photo.size);
    res.setHeader('Content-Disposition', 'inline; filename="journal-photo"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = fs.createReadStream(photo.path);
    stream.on('error', (error) => {
      if (res.headersSent) res.destroy(error);
      else next(error);
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

async function getFallbackImage(req, res, next) {
  try {
    res.json({ success: true, data: await journalService.getFallbackImage(req.userId, req.params.id) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  normalizeJournalForm,
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  getPhoto,
  getFallbackImage,
};
