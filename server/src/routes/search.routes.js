const express = require('express');
const { optionalAuth } = require('../middleware/auth.middleware');
const searchController = require('../controllers/search.controller');

const router = express.Router();
router.use(optionalAuth);
router.get('/', searchController.search);

module.exports = router;
