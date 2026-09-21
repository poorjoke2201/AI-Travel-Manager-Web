const POI = require('../models/POI');
const Hotel = require('../models/Hotel');
const Restaurant = require('../models/Restaurant');
const Trip = require('../models/Trip');

function canonicalizeCityName(city) {
  if (city == null) return '';
  const value = String(city).trim();
  if (!value) return '';
  const key = value.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases = {
    bangalore: 'Bengaluru',
    bengaluru: 'Bengaluru',
    bangaluru: 'Bengaluru',
    bengalore: 'Bengaluru',
    mysore: 'Mysore',
    mysuru: 'Mysore',
    mumbai: 'Mumbai',
    bombay: 'Mumbai',
    chennai: 'Chennai',
    madras: 'Chennai',
    kolkata: 'Kolkata',
    calcutta: 'Kolkata',
    kochi: 'Kochi',
    cochin: 'Kochi',
    mangalore: 'Mangalore',
    mangaluru: 'Mangalore',
    gurgaon: 'Gurugram',
    gurugram: 'Gurugram',
    pondicherry: 'Puducherry',
    puducherry: 'Puducherry',
    thiruvananthapuram: 'Thiruvananthapuram',
    trivandrum: 'Thiruvananthapuram',
    visakhapatnam: 'Visakhapatnam',
    vizag: 'Visakhapatnam',
    dehradun: 'Dehradun',
    goa: 'Goa',
  };
  return aliases[key] || value;
}

function dedupeCanonicalCityNames(rawCities) {
  const seen = new Set();
  const deduped = [];
  for (const city of rawCities || []) {
    const canonical = canonicalizeCityName(city);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    deduped.push(canonical);
  }
  return deduped;
}

async function search(req, res, next) {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json({ success: true, data: { cities: [], pois: [], hotels: [], restaurants: [], publicTrips: [] } });
    const regex = new RegExp(escapeRegExp(query), 'i');
    const [pois, hotels, restaurants, publicTrips] = await Promise.all([
      POI.find({ $or: [{ name: regex }, { city: regex }, { category: regex }] }).limit(8).select('name city category googleRating latitude longitude').lean(),
      Hotel.find({ $or: [{ name: regex }, { city: regex }] }).limit(8).select('name city googleRating pricePerNightInr location').lean(),
      Restaurant.find({ $or: [{ name: regex }, { city: regex }, { cuisine: regex }] }).limit(8).select('name city cuisine rating avgPriceForTwo location').lean(),
      Trip.find({ isPublic: true, $or: [{ tripName: regex }, { destination: regex }] }).limit(8).select('tripName destination startDate endDate').lean(),
    ]);
    const cities = dedupeCanonicalCityNames(await POI.distinct('city', { city: regex }));
    res.json({ success: true, data: { cities: cities.slice(0, 8), pois, hotels, restaurants, publicTrips } });
  } catch (err) { next(err); }
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = { search };
