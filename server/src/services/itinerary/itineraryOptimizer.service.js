const { clusterPOIsByDay } = require('./clustering.service');
const { sequenceDayPOIs, findNearestRestaurant } = require('./sequencing.service');
const { PACE_MAX_ACTIVITIES_PER_DAY } = require('../../constants/trip');

const DEFAULT_VISIT_DURATION_MINS = 90;
const DAY_START_MINUTES = 9 * 60; // 09:00
const LUNCH_WINDOW = [12 * 60, 14 * 60];
const DINNER_WINDOW = [19 * 60, 21 * 60];
const BREAKFAST_TIME = 8 * 60;

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

function parseTime(value) {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function isOpenForVisit(activity, date, startMinutes, durationMins) {
  if (activity.weeklyOff) {
    const dayName = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    if (activity.weeklyOff.toLowerCase().includes(dayName.toLowerCase())) return false;
  }
  const opening = parseTime(activity.openingTime);
  const closing = parseTime(activity.closingTime);
  return (opening == null || startMinutes >= opening) && (closing == null || startMinutes + durationMins <= closing);
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
    const rankedCluster = [...clusterPois].sort((a, b) => (b.preferenceScore || 0) - (a.preferenceScore || 0));
    const capped = rankedCluster.filter((poi) => isOpenForVisit(poi, addDays(trip.startDate, dayIdx), DAY_START_MINUTES, poi.visitDurationHrs ? Math.round(poi.visitDurationHrs * 60) : DEFAULT_VISIT_DURATION_MINS)).slice(0, maxPerDay);
    const sequenced = sequenceDayPOIs(capped, startPoint);

    const activities = [];
    let clockMinutes = DAY_START_MINUTES;
    const meals = [];

    if (dayIdx > 0) {
      const breakfast = pickRestaurant(startPoint, restaurants, usedRestaurantIds);
      if (breakfast) {
        usedRestaurantIds.add(breakfast.id);
        meals.push(restaurantActivity(breakfast, BREAKFAST_TIME, 'breakfast'));
      }
    }

    sequenced.forEach((poi) => {
      const durationMins = poi.visitDurationHrs ? Math.round(poi.visitDurationHrs * 60) : DEFAULT_VISIT_DURATION_MINS;

      if (clockMinutes >= LUNCH_WINDOW[0] && clockMinutes <= LUNCH_WINDOW[1]) {
        const lastPoint = poi.latitude != null ? { lat: poi.latitude, lng: poi.longitude } : startPoint;
        const restaurant = pickRestaurant(lastPoint, restaurants, usedRestaurantIds);
        if (restaurant) {
          usedRestaurantIds.add(restaurant.id);
          meals.push(restaurantActivity(restaurant, Math.max(clockMinutes, 12 * 60 + 30), 'lunch'));
          clockMinutes += 60;
        }
      }

      activities.push(poiActivity(poi, clockMinutes, durationMins));
      clockMinutes += durationMins + 20; // 20 min buffer for travel between stops
    });

    const lastPoint = sequenced.length && sequenced[sequenced.length - 1].latitude != null
      ? { lat: sequenced[sequenced.length - 1].latitude, lng: sequenced[sequenced.length - 1].longitude }
      : startPoint;
    if (!meals.some((meal) => meal.mealType === 'lunch')) {
      const lunch = pickRestaurant(lastPoint, restaurants, usedRestaurantIds);
      if (lunch) {
        usedRestaurantIds.add(lunch.id);
        meals.push(restaurantActivity(lunch, 12 * 60 + 30, 'lunch'));
      }
    }
    const dinner = pickRestaurant(lastPoint, restaurants, usedRestaurantIds);
    if (dinner) {
      usedRestaurantIds.add(dinner.id);
      meals.push(restaurantActivity(dinner, Math.max(clockMinutes, DINNER_WINDOW[0]), 'dinner'));
    }

    return {
      day: dayIdx + 1,
      date: addDays(trip.startDate, dayIdx),
      summary: capped.length
        ? `Exploring ${capped.length} destination${capped.length > 1 ? 's' : ''} in ${trip.destination}.`
        : `Flexible day in ${trip.destination}.`,
      weatherContext: null,
      activities: [...activities, ...meals].sort((a, b) => (parseTime(a.startTime) ?? 0) - (parseTime(b.startTime) ?? 0)),
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
  return findNearestRestaurant(point, restaurants, usedRestaurantIds);
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
    category: poi.category || poi.poiType || 'point of interest',
    poiType: poi.poiType || null,
    website: poi.website || null,
    phone: poi.phone || null,
    imageUrl: poi.imageUrl || null,
    sourceRef: poi.sourceRef || null,
    location: { lat: poi.latitude ?? null, lng: poi.longitude ?? null },
    source: poi.source || 'dataset',
  };
}

function restaurantActivity(restaurant, startMinutes, mealType = null) {
  return {
    type: 'restaurant',
    refId: restaurant.source === 'gemini' ? null : restaurant.id,
    name: restaurant.name,
    startTime: minutesToTime(startMinutes),
    duration: 60,
    notes: restaurant.cuisine ? `Cuisine: ${restaurant.cuisine.join(', ')}` : null,
    category: restaurant.category || 'restaurant',
    mealType,
    openingTime: restaurant.openingTime || null,
    closingTime: restaurant.closingTime || null,
    description: restaurant.description || null,
    website: restaurant.website || null,
    phone: restaurant.phone || null,
    location: { lat: restaurant.latitude ?? null, lng: restaurant.longitude ?? null },
    source: restaurant.source || 'dataset',
  };
}

module.exports = { buildDeterministicItinerary, isOpenForVisit };