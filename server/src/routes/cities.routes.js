const express = require('express');
const POI = require('../models/POI');
const Hotel = require('../models/Hotel');
const Restaurant = require('../models/Restaurant');
const { canonicalizeCityName } = require('../services/destination/destinationResolver.service');

function isLikelyCityName(value) {
  if (value == null) return false;
  const text = String(value).trim();
  if (!text) return false;

  const lowered = text.toLowerCase();
  const blockedPatterns = [
    'hotel', 'hotels', 'resort', 'resorts', 'villa', 'villas', 'homestay',
    'homestays', 'guesthouse', 'guesthouses', 'suite', 'suites', 'stays',
    'stay', 'apartment', 'apartments', 'rooms', 'room', 'group', 'groups',
    'member', 'members', 'itc', 'club', 'complex', 'tower', 'camp', 'retreat'
  ];

  if (lowered.includes(' - ') || lowered.includes('–')) return false;
  if (blockedPatterns.some((pattern) => lowered.includes(pattern))) return false;
  if (/\d/.test(text)) return false;
  return true;
}

function dedupeCanonicalCityNames(rawCities) {
  const seen = new Set();
  const canonical = [];

  for (const city of rawCities || []) {
    const value = canonicalizeCityName(city);
    if (!value || !isLikelyCityName(value) || seen.has(value)) continue;
    seen.add(value);
    canonical.push(value);
  }

  return canonical.sort((a, b) => {
    const aStarts = a.toLowerCase().startsWith('mys');
    const bStarts = b.toLowerCase().startsWith('mys');
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.localeCompare(b);
  });
}

const router = express.Router();

// GET /api/cities/search?q=ban  -> returns matching city names
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 1) return res.json({ success: true, data: [] });

    const regex = new RegExp(q, 'i');

    const [overtureCities, fallbackCities] = await Promise.all([
      POI.distinct('city', { source: 'overture', city: regex }),
      POI.distinct('city', { source: { $ne: 'overture' }, city: regex }),
    ]);

    const merged = dedupeCanonicalCityNames([
      ...(overtureCities.length ? overtureCities : fallbackCities),
    ])
      .filter(Boolean)
      .sort((a, b) => {
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
module.exports.dedupeCanonicalCityNames = dedupeCanonicalCityNames;
module.exports.canonicalizeCityName = canonicalizeCityName;
