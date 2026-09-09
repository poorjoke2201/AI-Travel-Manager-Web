const express = require('express');
const { optionalAuth } = require('../middleware/auth.middleware');
const validate = require('../middleware/validation.middleware');
const publicTripController = require('../controllers/publicTrip.controller');
const { tripIdParamSchema } = require('../validators/trip.validator');

const router = express.Router();

router.get('/trips', publicTripController.listPublicTrips);
router.get('/trips/:id', optionalAuth, validate(tripIdParamSchema, 'params'), publicTripController.getPublicTrip);

module.exports = router;