const { getCandidateHotels } = require('./candidate.service');
const { normalizeRating, budgetScore, weightedScore } = require('./scoring.service');
const { geocodeCandidates } = require('../maps/geocoding.service');
const logger = require('../../utils/logger');

const TOP_N_RETURNED = 8;
const GEOCODE_TOP_N = 3; // only the very best candidates get geocoded - see spec section 32

const WEIGHTS = { rating: 0.4, budget: 0.4, style: 0.2 };

function scoreHotel(hotel, budgetCeiling, travelStyle) {
  const rating = normalizeRating(hotel.googleRating);
  const budget = budgetScore(hotel.pricePerNightInr, budgetCeiling);
  const styleText = `${hotel.conditionLabel || ''} ${(hotel.amenities || []).join(' ')}`.toLowerCase();
  const style = !travelStyle || travelStyle === 'moderate'
    ? 0.5
    : styleText.includes(travelStyle.toLowerCase()) ? 1 : 0.25;
  return weightedScore(WEIGHTS, { rating, budget, style });
}

/**
 * Returns a ranked shortlist of hotels for the trip: [{ id, name,
 * googleRating, pricePerNightInr, amenities, latitude, longitude, source }].
 * Only the top GEOCODE_TOP_N get a best-effort geocode lookup so the
 * itinerary map has at least one usable base-location coordinate without
 * geocoding the whole shortlist (spec section 32).
 */
async function recommendHotels(trip) {
  const budgetCeiling = trip.budget ? (trip.budget / Math.max(trip.numberOfDays, 1)) * 0.4 : null;
  const rawCandidates = await getCandidateHotels(trip);

  const ranked = rawCandidates
    .map((hotel) => ({ hotel, score: scoreHotel(hotel, budgetCeiling, trip.travelStyle) }))
    .sort((a, b) => b.score - a.score)
    .map(({ hotel }) => hotel)
    .slice(0, TOP_N_RETURNED);

  const toGeocode = ranked.slice(0, GEOCODE_TOP_N).map((h) => ({
    _id: h._id,
    name: h.name,
    city: h.city,
  }));

  let coordsById = new Map();
  try {
    coordsById = await geocodeCandidates(toGeocode);
  } catch (err) {
    logger.warn('Hotel geocoding failed - continuing without coordinates', err.message);
  }

  return ranked.map((hotel) => {
    const coords = coordsById.get(String(hotel._id));
    return {
      id: String(hotel._id),
      name: hotel.name,
      googleRating: hotel.googleRating,
      pricePerNightInr: hotel.pricePerNightInr,
      conditionLabel: hotel.conditionLabel,
      amenities: hotel.amenities,
      description: hotel.description,
      latitude: coords ? coords.lat : hotel.location?.coordinates?.[1] ?? null,
      longitude: coords ? coords.lng : hotel.location?.coordinates?.[0] ?? null,
      label: 'Recommended accommodation', // never a confirmed reservation - spec section 20
      source: 'dataset',
    };
  });
}

module.exports = { recommendHotels };