const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { createImageUpload } = require('../middleware/imageUpload.middleware');
const validate = require('../middleware/validation.middleware');
const journalController = require('../controllers/journal.controller');
const {
  journalCreateSchema,
  journalUpdateSchema,
  journalIdParamSchema,
  journalPhotoParamSchema,
} = require('../validators/journal.validator');
const { MAX_JOURNAL_PHOTO_BYTES } = require('../services/journal/journal.service');

const router = express.Router();
const uploadJournalPhotos = createImageUpload({
  fieldName: 'photos',
  maxBytes: MAX_JOURNAL_PHOTO_BYTES,
  maxFiles: 5,
  maxFields: 7,
  label: 'Journal',
});

router.use(requireAuth);
router.get('/', journalController.listEntries);
router.post('/', uploadJournalPhotos, journalController.normalizeJournalForm, validate(journalCreateSchema), journalController.createEntry);
router.get('/:id/fallback-image', validate(journalIdParamSchema, 'params'), journalController.getFallbackImage);
router.get('/:id/photos/:filename', validate(journalPhotoParamSchema, 'params'), journalController.getPhoto);
router.patch('/:id', validate(journalIdParamSchema, 'params'), uploadJournalPhotos, journalController.normalizeJournalForm, validate(journalUpdateSchema), journalController.updateEntry);
router.delete('/:id', validate(journalIdParamSchema, 'params'), journalController.deleteEntry);

module.exports = router;
