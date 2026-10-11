const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const validate = require('../middleware/validation.middleware');
const activityController = require('../controllers/activity.controller');
const { threeDViewSchema } = require('../validators/activity.validator');

const router = express.Router();
router.use(requireAuth);
router.get('/recent', activityController.listRecent);
router.post('/3d-view', validate(threeDViewSchema), activityController.logThreeDView);

module.exports = router;
