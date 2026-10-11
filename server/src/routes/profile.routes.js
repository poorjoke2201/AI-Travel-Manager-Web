const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth.middleware');
const { createImageUpload } = require('../middleware/imageUpload.middleware');
const validate = require('../middleware/validation.middleware');
const profileController = require('../controllers/profile.controller');
const {
  profileUpdateSchema,
  phoneChangeSchema,
  verifyPhoneChangeSchema,
  passwordChangeSchema,
} = require('../validators/profile.validator');
const { MAX_AVATAR_BYTES } = require('../services/profile/profile.service');

const router = express.Router();
const phoneChangeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many phone verification requests. Try again later.' },
});
const receiveAvatarUpload = createImageUpload({
  fieldName: 'avatar',
  maxBytes: MAX_AVATAR_BYTES,
  label: 'Avatar',
});

router.use(requireAuth);
router.get('/', profileController.getProfile);
router.patch('/', validate(profileUpdateSchema), profileController.updateProfile);
router.patch('/password', validate(passwordChangeSchema), profileController.changePassword);
router.get('/summary', profileController.getProfileSummary);
router.post('/phone-change', phoneChangeLimiter, validate(phoneChangeSchema), profileController.requestPhoneChange);
router.post('/phone-change/verify', phoneChangeLimiter, validate(verifyPhoneChangeSchema), profileController.verifyPhoneChange);
router.post('/avatar', receiveAvatarUpload, profileController.uploadAvatar);
router.get('/avatar', profileController.getAvatar);
router.delete('/avatar', profileController.removeAvatar);

module.exports = router;
