const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireTripAccess } = require('../middleware/tripAccess.middleware');
const validate = require('../middleware/validation.middleware');
const tripController = require('../controllers/trip.controller');
const { createTripSchema, updateTripSchema, tripIdParamSchema, replaceItineraryParamsSchema } = require('../validators/trip.validator');

const router = express.Router();

router.use(requireAuth); // every trip route requires a logged-in user

router.post('/', validate(createTripSchema), tripController.createTrip);
router.post('/discover', validate(createTripSchema), tripController.discoverOptions);
router.post('/generate', validate(createTripSchema), tripController.createAndGenerateTrip);
router.get('/', tripController.listTrips);
router.get('/invites/pending', tripController.listPendingInvites);
router.post('/:id/accept-invite', validate(tripIdParamSchema, 'params'), requireTripAccess, tripController.acceptTripInvite);
router.post('/:id/itinerary/:day/:activity/replace', validate(replaceItineraryParamsSchema, 'params'), tripController.replaceItineraryActivity);
router.post('/:id/itinerary/enrich-images', validate(tripIdParamSchema, 'params'), requireTripAccess, tripController.enrichTripImages);
router.get('/:id/cover-image', validate(tripIdParamSchema, 'params'), requireTripAccess, tripController.getTripCoverImage);

router.get('/:id', validate(tripIdParamSchema, 'params'), requireTripAccess, tripController.getTrip);
router.put('/:id', validate(tripIdParamSchema, 'params'), validate(updateTripSchema), requireTripAccess, tripController.updateTrip);
router.delete('/:id', validate(tripIdParamSchema, 'params'), requireTripAccess, tripController.deleteTrip);
router.post('/:id/generate', validate(tripIdParamSchema, 'params'), requireTripAccess, tripController.regenerateTrip);

module.exports = router;