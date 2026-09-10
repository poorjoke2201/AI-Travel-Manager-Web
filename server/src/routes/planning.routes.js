const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const planningController = require('../controllers/planning.controller');

const router = express.Router();
router.use(requireAuth);

router.post('/trips/:tripId/places', planningController.addPlaceToTrip);
router.post('/trips/:tripId/plan-around', planningController.planAround);

module.exports = router;
