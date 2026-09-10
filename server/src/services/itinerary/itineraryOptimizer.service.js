const { clusterPOIsByDay } = require('./clustering.service');
const { sequenceDayPOIs, findNearestRestaurant } = require('./sequencing.service');
const { PACE_MAX_ACTIVITIES_PER_DAY } = require('../../constants/trip');

const DEFAULT_VISIT_DURATION_MINS = 90;
const DAY_START_MINUTES = 9 * 60; // 09:00
const LUNCH_WINDOW = [12 * 60, 14 * 60];
const DINNER_WINDOW = [19 * 60, 21 * 60];

function minutesToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The deterministic, Gemini-free itinerary builder. Used as:
 *   1. The fallback when Gemini fails validation twice (spec section 47).
 *   2. A sanity baseline during development/testing of the pipeline.
 * Combines clustering + sequencing + a simple time-of-day scheduler that
 * respects the trip's pace and slots restaurants near lunch/dinner windows.
 */
function buildDeterministicItinerary(trip, { pois, hotels, restaurants }) {
  const numDays = trip.numberOfDays;
  const maxPerDay = PACE_MAX_ACTIVITIES_PER_DAY[trip.pace] || PACE_MAX_ACTIVITIES_PER_DAY.balanced;

  const baseHotel = hotels[0] || null;
  const startPoint =
    baseHotel && typeof baseHotel.latitude === 'number'
      ? { lat: baseHotel.latitude, lng: baseHotel.longitude }
      : null;

  const clusters = clusterPOIsByDay(pois, numDays);
  const usedRestaurantIds = new Set();

  const days = clusters.map((clusterPois, dayIdx) => {
    const capped = clusterPois.slice(0, maxPerDay);
    const sequenced = sequenceDayPOIs(capped, startPoint);

    const activities = [];
    let clockMinutes = DAY_START_MINUTES;
    let lunchPlaced = false;
    let dinnerPlaced = false;

    sequenced.forEach((poi) => {
      const durationMins = poi.visitDurationHrs ? Math.round(poi.visitDurationHrs * 60) : DEFAULT_VISIT_DURATION_MINS;

      // Slot lunch if we've crossed into the lunch window and haven't placed it yet.
      if (!lunchPlaced && clockMinutes >= LUNCH_WINDOW[0] && clockMinutes <= LUNCH_WINDOW[1]) {
        const lastPoint = poi.latitude != null ? { lat: poi.latitude, lng: poi.longitude } : startPoint;
        const restaurant = pickRestaurant(lastPoint, restaurants, usedRestaurantIds);
        if (restaurant) {
          usedRestaurantIds.add(restaurant.id);
          activities.push(restaurantActivity(restaurant, clockMinutes));
          clockMinutes += 60;
          lunchPlaced = true;
        }
      }

      activities.push(poiActivity(poi, clockMinutes, durationMins));
      clockMinutes += durationMins + 20; // 20 min buffer for travel between stops
    });

    if (!dinnerPlaced) {
      const lastPoint =
        sequenced.length && sequenced[sequenced.length - 1].latitude != null
          ? { lat: sequenced[sequenced.length - 1].latitude, lng: sequenced[sequenced.length - 1].longitude }
          : startPoint;
      const restaurant = pickRestaurant(lastPoint, restaurants, usedRestaurantIds);
      if (restaurant) {
        usedRestaurantIds.add(restaurant.id);
        const dinnerTime = Math.max(clockMinutes, DINNER_WINDOW[0]);
        activities.push(restaurantActivity(restaurant, dinnerTime));
        dinnerPlaced = true;
      }
    }

    return {
      day: dayIdx + 1,
      date: addDays(trip.startDate, dayIdx),
      summary: capped.length
        ? `Exploring ${capped.length} destination${capped.length > 1 ? 's' : ''} in ${trip.destination}.`
        : `Flexible day in ${trip.destination}.`,
      weatherContext: null,
      activities,
    };
  });

  return days;
}

/**
 * Prefers an unused restaurant near `point`; if the candidate pool is
 * exhausted (small dataset for this city, long trip), falls back to
 * allowing a repeat rather than leaving the meal slot empty - a repeated
 * restaurant reads better to a user than a missing lunch/dinner.
 */
function pickRestaurant(point, restaurants, usedRestaurantIds) {
  if (!restaurants.length) return null;
  const fresh = findNearestRestaurant(point, restaurants, usedRestaurantIds);
  if (fresh) return fresh;
  return findNearestRestaurant(point, restaurants, new Set());
}

function poiActivity(poi, startMinutes, durationMins) {
  return {
    type: 'poi',
    refId: poi.source === 'dataset' ? poi.id : null,
    name: poi.name,
    startTime: minutesToTime(startMinutes),
    duration: durationMins,
    notes: poi.source === 'gemini' ? 'AI-suggested addition' : null,
    description: poi.description || null,
    website: poi.website || null,
    phone: poi.phone || null,
    imageUrl: poi.imageUrl || null,
    sourceRef: poi.sourceRef || null,
    location: { lat: poi.latitude ?? null, lng: poi.longitude ?? null },
    source: poi.source || 'dataset',
  };
}

function restaurantActivity(restaurant, startMinutes) {
  return {
    type: 'restaurant',
    refId: restaurant.source === 'dataset' ? restaurant.id : null,
    name: restaurant.name,
    startTime: minutesToTime(startMinutes),
    duration: 60,
    notes: restaurant.cuisine ? `Cuisine: ${restaurant.cuisine.join(', ')}` : null,
    description: restaurant.description || null,
    website: restaurant.website || null,
    phone: restaurant.phone || null,
    location: { lat: restaurant.latitude ?? null, lng: restaurant.longitude ?? null },
    source: restaurant.source || 'dataset',
  };
}

module.exports = { buildDeterministicItinerary };