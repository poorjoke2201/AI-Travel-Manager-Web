const POI = require('../models/POI');
const Hotel = require('../models/Hotel');
const Restaurant = require('../models/Restaurant');
const Trip = require('../models/Trip');

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
    const cities = await POI.distinct('city', { city: regex });
    res.json({ success: true, data: { cities: cities.slice(0, 8), pois, hotels, restaurants, publicTrips } });
  } catch (err) { next(err); }
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = { search };
