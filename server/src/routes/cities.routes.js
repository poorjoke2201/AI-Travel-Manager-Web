const express = require('express');
const POI = require('../models/POI');
const Hotel = require('../models/Hotel');
const Restaurant = require('../models/Restaurant');

const router = express.Router();

// GET /api/cities/search?q=ban  -> returns matching city names
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 1) return res.json({ success: true, data: [] });

    const regex = new RegExp(q, 'i');

    const [poiCities, hotelCities, restaurantCities] = await Promise.all([
      POI.distinct('city', { city: regex }),
      Hotel.distinct('city', { city: regex }),
      Restaurant.distinct('city', { city: regex }),
    ]);

    const merged = [...new Set([...poiCities, ...hotelCities, ...restaurantCities])]
      .filter(Boolean)
      .sort((a, b) => {
        // Prioritize names that start with the query
        const aStarts = a.toLowerCase().startsWith(q.toLowerCase());
        const bStarts = b.toLowerCase().startsWith(q.toLowerCase());
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 10);

    res.json({ success: true, data: merged });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
