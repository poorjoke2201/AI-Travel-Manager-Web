const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const mapsController = require('../controllers/maps.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/geocode', mapsController.geocode);
router.post('/route', mapsController.route);

module.exports = router;