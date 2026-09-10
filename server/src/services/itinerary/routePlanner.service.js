const { getRoute } = require('../maps/routing.service');
const { planGeoapifyRoute } = require('../maps/geoapify.service');
const { haversineDistanceKm } = require('../../utils/haversine');

const DAY_START_MINUTES = 9 * 60;
const FIRST_DAY_START_MINUTES = 11 * 60;
const DEFAULT_POI_MINUTES = 90;
const DEFAULT_MEAL_MINUTES = 60;
const TRAVEL_BUFFER_MINUTES = 10;

function parseTime(value) {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTime(totalMinutes) {
  const normalized = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(normalized / 60) % 24;
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function pointFor(activity) {
  if (!activity?.location) return null;
  if (typeof activity.location.lat !== 'number' || typeof activity.location.lng !== 'number') return null;
  return { lat: activity.location.lat, lng: activity.location.lng };
}

function isPlaceActivity(activity) {
  return ['poi', 'restaurant', 'hotel'].includes(activity.type);
}

function openingStart(activity, cursor) {
  const opening = parseTime(activity.openingTime);
  return opening != null ? Math.max(cursor, opening) : cursor;
}

function durationFor(activity) {
  if (Number.isFinite(activity.duration) && activity.duration > 0) return activity.duration;
  return activity.type === 'restaurant' ? DEFAULT_MEAL_MINUTES : DEFAULT_POI_MINUTES;
}

function closedOnDate(activity, date) {
  if (!activity.weeklyOff) return false;
  const dayName = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return activity.weeklyOff.toLowerCase().includes(dayName.toLowerCase());
}

async function routeBetween(origin, destination) {
  if (!origin || !destination) return null;
  const route = await getRoute(origin, destination, [], 'driving');
  if (route) return route;
  const distanceKm = haversineDistanceKm(origin, destination);
  return Number.isFinite(distanceKm)
    ? { provider: 'haversine', distanceKm, durationMinutes: Math.max(5, Math.round(distanceKm * 3)), geometry: [] }
    : null;
}

async function optimizeDayStops(day, accommodation = null) {
  const activities = day.activities || [];
  const places = activities.filter(isPlaceActivity);
  if (places.length < 2) return activities;

  const anchor = activities.find((activity) => activity.name === 'Stay base → first stop')?.location || accommodation;
  if (!anchor || typeof anchor.lat !== 'number' || typeof anchor.lng !== 'number') return activities;

  const plan = await planGeoapifyRoute(anchor, places.map((activity) => ({
    ...pointFor(activity),
    duration: durationFor(activity),
    activity,
  })));
  if (!plan) return activities;

  const orderedPlaces = plan.orderedStops.map((stop) => stop.activity);
  let placeIndex = 0;
  return activities.map((activity) => {
    if (!isPlaceActivity(activity)) return activity;
    const ordered = orderedPlaces[placeIndex];
    placeIndex += 1;
    return ordered;
  });
}

/**
 * Converts an AI/fallback list into a sequential timetable. Provider routing is
 * used for every mappable leg; Haversine is only the final timing fallback.
 */
async function planItineraryRoutes(days, { accommodation = null } = {}) {
  for (const day of days) {
    // Route Planner decides the stop order; Routing API supplies each leg's
    // actual street distance and duration below.
    // eslint-disable-next-line no-await-in-loop
    day.activities = await optimizeDayStops(day, accommodation);
    const places = (day.activities || []).filter(isPlaceActivity);
    const planned = [];
    let cursor = day.day === 1 ? FIRST_DAY_START_MINUTES : DAY_START_MINUTES;
    let previousPoint = null;

    for (const activity of places) {
      const currentPoint = pointFor(activity);
      if (previousPoint && currentPoint) {
        // eslint-disable-next-line no-await-in-loop
        const route = await routeBetween(previousPoint, currentPoint);
        if (route?.durationMinutes) {
          planned.push({
            type: 'travel',
            refId: null,
            name: 'Travel to next stop',
            startTime: formatTime(cursor),
            endTime: formatTime(cursor + route.durationMinutes),
            duration: route.durationMinutes,
            notes: route.distanceKm != null ? `${route.distanceKm.toFixed(1)} km` : 'Travel',
            location: { lat: previousPoint.lat, lng: previousPoint.lng },
            source: route.provider === 'google' ? 'google_maps' : route.provider === 'geoapify' ? 'geoapify' : 'gemini',
          });
          cursor += route.durationMinutes + TRAVEL_BUFFER_MINUTES;
        }
      }

      const requested = parseTime(activity.startTime);
      if (requested != null) cursor = Math.max(cursor, requested);
      cursor = openingStart(activity, cursor);

      const plannedActivity = {
        ...activity,
        startTime: formatTime(cursor),
        duration: durationFor(activity),
        notes: [
          activity.notes,
          closedOnDate(activity, day.date) ? `Check opening hours: closed on ${activity.weeklyOff}.` : null,
        ].filter(Boolean).join(' ') || null,
      };
      plannedActivity.endTime = formatTime(cursor + plannedActivity.duration);
      planned.push(plannedActivity);
      cursor += plannedActivity.duration;
      previousPoint = currentPoint || previousPoint;
    }

    day.activities = planned;
  }
  return days;
}

module.exports = { planItineraryRoutes };
