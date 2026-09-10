const Trip = require('../models/Trip');
const POI = require('../models/POI');
const Hotel = require('../models/Hotel');
const Restaurant = require('../models/Restaurant');
const ApiError = require('../utils/apiError');

async function getTrip(userId, tripId) {
  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) throw ApiError.notFound('Trip not found or you do not have access to it.');
  return trip;
}

async function addPlaceToTrip(req, res, next) {
  try {
    const trip = await getTrip(req.userId, req.params.tripId);
    const { refId, type, name, source = 'dataset' } = req.body;
    if (!refId || !['poi', 'hotel', 'restaurant'].includes(type) || !name) throw ApiError.badRequest('refId, type, and name are required.');
    if (!trip.selectedPlaces.some((place) => place.refId === String(refId) && place.type === type)) {
      trip.selectedPlaces.push({ refId: String(refId), type, name, source });
      await trip.save();
    }
    res.status(201).json({ success: true, data: trip.selectedPlaces });
  } catch (err) { next(err); }
}

async function planAround(req, res, next) {
  try {
    const trip = await getTrip(req.userId, req.params.tripId);
    const { placeId, day = 1 } = req.body;
    const anchor = await POI.findById(placeId).lean();
    if (!anchor) throw ApiError.notFound('The selected POI was not found.');
    if (typeof anchor.latitude !== 'number' || typeof anchor.longitude !== 'number') throw ApiError.badRequest('The selected POI has no mapped coordinates.');

    const nearbyPois = await POI.find({
      _id: { $ne: anchor._id },
      location: { $near: { $geometry: { type: 'Point', coordinates: [anchor.longitude, anchor.latitude] }, $maxDistance: 10000 } },
    }).limit(5).lean();
    const nearbyRestaurants = await Restaurant.find({
      location: { $near: { $geometry: { type: 'Point', coordinates: [anchor.longitude, anchor.latitude] }, $maxDistance: 5000 } },
    }).sort({ rating: -1 }).limit(3).lean();

    res.json({
      success: true,
      data: {
        day: Number(day),
        anchor: { id: String(anchor._id), name: anchor.name, latitude: anchor.latitude, longitude: anchor.longitude },
        nearbyPois: nearbyPois.map((poi) => ({ id: String(poi._id), name: poi.name, category: poi.category, latitude: poi.latitude, longitude: poi.longitude })),
        nearbyRestaurants: nearbyRestaurants.map((restaurant) => ({ id: String(restaurant._id), name: restaurant.name, cuisine: restaurant.cuisine, rating: restaurant.rating })),
        note: `Preview around ${anchor.name}. Confirm the day in the itinerary before applying changes.`,
      },
    });
  } catch (err) { next(err); }
}

module.exports = { addPlaceToTrip, planAround };
