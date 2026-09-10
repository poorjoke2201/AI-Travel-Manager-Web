const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const validate = require('../middleware/validation.middleware');
const tripController = require('../controllers/trip.controller');
const { createTripSchema, updateTripSchema, tripIdParamSchema, replaceItineraryParamsSchema } = require('../validators/trip.validator');

const router = express.Router();

router.use(requireAuth); // every trip route requires a logged-in user

router.post('/', validate(createTripSchema), tripController.createTrip);
router.post('/discover', validate(createTripSchema), tripController.discoverOptions);
router.post('/generate', validate(createTripSchema), tripController.createAndGenerateTrip);
router.get('/', tripController.listTrips);
router.post('/:id/itinerary/:day/:activity/replace', validate(replaceItineraryParamsSchema, 'params'), tripController.replaceItineraryActivity);

router.get('/:id', validate(tripIdParamSchema, 'params'), tripController.getTrip);
router.put('/:id', validate(tripIdParamSchema, 'params'), validate(updateTripSchema), tripController.updateTrip);
router.delete('/:id', validate(tripIdParamSchema, 'params'), tripController.deleteTrip);
router.post('/:id/generate', validate(tripIdParamSchema, 'params'), tripController.regenerateTrip);

module.exports = router;