const express = require('express');
const { optionalAuth } = require('../middleware/auth.middleware');
const exploreController = require('../controllers/explore.controller');

const router = express.Router();

router.use(optionalAuth);

router.get('/search', exploreController.search);
router.get('/pois', exploreController.browsePOIs);
router.get('/hotels', exploreController.browseHotels);
router.get('/restaurants', exploreController.browseRestaurants);
router.get('/nearby', exploreController.nearby);

module.exports = router;