const fs = require('node:fs');
const profileService = require('../services/profile/profile.service');

async function getProfile(req, res, next) {
  try {
    res.json({ success: true, data: await profileService.getProfile(req.userId) });
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    res.json({ success: true, data: await profileService.updateProfile(req.userId, req.body) });
  } catch (error) {
    next(error);
  }
}

async function getProfileSummary(req, res, next) {
  try {
    res.json({ success: true, data: await profileService.getProfileSummary(req.userId) });
  } catch (error) {
    next(error);
  }
}

async function requestPhoneChange(req, res, next) {
  try {
    res.json({ success: true, data: await profileService.requestPhoneChange(req.userId, req.body.phoneNumber) });
  } catch (error) {
    next(error);
  }
}

async function verifyPhoneChange(req, res, next) {
  try {
    res.json({
      success: true,
      data: await profileService.verifyPhoneChange(req.userId, req.body.phoneNumber, req.body.code),
    });
  } catch (error) {
    next(error);
  }
}

async function uploadAvatar(req, res, next) {
  try {
    res.json({ success: true, data: await profileService.updateAvatar(req.userId, req.file) });
  } catch (error) {
    next(error);
  }
}

async function getAvatar(req, res, next) {
  try {
    const avatar = await profileService.getAvatar(req.userId);
    res.setHeader('Content-Type', avatar.mimeType);
    res.setHeader('Content-Length', avatar.size);
    res.setHeader('Content-Disposition', 'inline; filename="avatar"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = fs.createReadStream(avatar.path);
    stream.on('error', (error) => {
      if (res.headersSent) res.destroy(error);
      else next(error);
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

async function removeAvatar(req, res, next) {
  try {
    res.json({ success: true, data: await profileService.removeAvatar(req.userId) });
  } catch (error) {
    next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    res.json({ success: true, data: await profileService.changePassword(req.userId, req.body) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getProfileSummary,
  requestPhoneChange,
  verifyPhoneChange,
  uploadAvatar,
  getAvatar,
  removeAvatar,
  changePassword,
};
