const express = require('express');
const mapsController = require('../controllers/maps.controller');

const router = express.Router();

router.get('/geocode', mapsController.geocode);
router.post('/route', mapsController.route);

module.exports = router;