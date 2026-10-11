const { getRoute } = require('../maps/routing.service');
const { planGeoapifyRoute } = require('../maps/geoapify.service');
const { haversineDistanceKm } = require('../../utils/haversine');
const { sequenceDayPOIs } = require('./sequencing.service');

const DAY_START_MINUTES = 9 * 60;
const FIRST_DAY_START_MINUTES = 11 * 60;
const DAY_END_MINUTES = 21 * 60 + 30;
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
  if (normalized > 23 * 60 + 59) return null;
  const hours = Math.floor(normalized / 60);
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

function timeToMinutes(value) {
  const parsed = parseTime(value);
  return parsed == null ? null : parsed;
}

function fitsOpeningWindow(activity, startMinutes) {
  const opening = timeToMinutes(activity.openingTime);
  const closing = timeToMinutes(activity.closingTime);
  const duration = durationFor(activity);
  if (opening != null && startMinutes < opening) return false;
  return closing == null || startMinutes + duration <= closing;
}

async function routeBetween(origin, destination, routeProvider = getRoute) {
  if (!origin || !destination) return null;
  const route = await routeProvider(origin, destination, [], 'driving');
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
  const mappablePlaces = places.filter((activity) => pointFor(activity));
  let orderedPlaces;
  const plan = anchor && typeof anchor.lat === 'number' && typeof anchor.lng === 'number' && mappablePlaces.length === places.length
    ? await planGeoapifyRoute(anchor, places.map((activity) => ({
    ...pointFor(activity),
    duration: durationFor(activity),
    activity,
  })))
    : null;
  if (plan) {
    orderedPlaces = plan.orderedStops.map((stop) => stop.activity);
  } else {
    const anchorPoint = anchor && typeof anchor.lat === 'number' && typeof anchor.lng === 'number' ? anchor : null;
    orderedPlaces = sequenceDayPOIs(places.map((activity) => ({
      ...activity,
      latitude: pointFor(activity)?.lat,
      longitude: pointFor(activity)?.lng,
    })), anchorPoint);
  }
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
async function planItineraryRoutes(days, { accommodation = null, reorder = true, routeProvider = getRoute } = {}) {
  for (const day of days) {
    // Preserve Gemini's structure. Geoapify reordering is opt-in because it
    // can otherwise move meals and breaks away from the intended schedule.
    if (reorder) {
      // eslint-disable-next-line no-await-in-loop
      day.activities = await optimizeDayStops(day, accommodation);
    }
    const sourceActivities = day.activities || [];
    const places = sourceActivities.filter(isPlaceActivity);
    const planned = [];
    const requestedStart = sourceActivities
      .map((activity) => parseTime(activity.startTime))
      .find((value) => value != null);
    let cursor = Math.max(day.day === 1 ? FIRST_DAY_START_MINUTES : DAY_START_MINUTES, requestedStart ?? 0);
    let previousPoint = null;

    for (const activity of sourceActivities) {
      if (!isPlaceActivity(activity)) {
        if (activity.type === 'break') {
          const breakStart = parseTime(activity.startTime);
          cursor = Math.max(cursor, breakStart ?? cursor);
          const breakActivity = { ...activity, startTime: formatTime(cursor), duration: durationFor(activity) };
          if (cursor + breakActivity.duration > DAY_END_MINUTES) continue;
          breakActivity.endTime = formatTime(cursor + breakActivity.duration);
          planned.push(breakActivity);
          cursor += breakActivity.duration;
        } else if (activity.type === 'travel') {
          const travelDuration = durationFor(activity);
          if (cursor + travelDuration > DAY_END_MINUTES) continue;
          planned.push({ ...activity, startTime: formatTime(cursor), endTime: formatTime(cursor + travelDuration), duration: travelDuration });
          cursor += travelDuration;
        }
        continue;
      }

      const requested = parseTime(activity.startTime);
      let candidateStart = Math.max(cursor, requested ?? cursor);
      candidateStart = openingStart(activity, candidateStart);
      const selectedPlace = activity.isSelected === true;
      const closed = closedOnDate(activity, day.date);
      const missesHours = !fitsOpeningWindow(activity, candidateStart);
      if ((closed || missesHours) && !selectedPlace) continue;

      const currentPoint = pointFor(activity);
      if (previousPoint && currentPoint && planned[planned.length - 1]?.type !== 'travel') {
        // eslint-disable-next-line no-await-in-loop
        const route = await routeBetween(previousPoint, currentPoint, routeProvider);
        if (route?.durationMinutes) {
          if (cursor + route.durationMinutes > 23 * 60 + 59) {
            if (selectedPlace) {
              planned.push({
                ...activity,
                startTime: null,
                endTime: null,
                notes: [activity.notes, 'Selected stop retained but needs rescheduling; no time remains today.'].filter(Boolean).join(' ') || null,
              });
            }
            continue;
          }
          if (cursor + route.durationMinutes + TRAVEL_BUFFER_MINUTES > DAY_END_MINUTES && !selectedPlace) continue;
          planned.push({
            type: 'travel',
            refId: null,
            name: 'Travel to next stop',
            startTime: formatTime(cursor),
            endTime: formatTime(cursor + route.durationMinutes),
            duration: route.durationMinutes,
            notes: route.distanceKm != null ? `${route.distanceKm.toFixed(1)} km` : 'Travel',
            distanceKm: route.distanceKm ?? null,
            isEstimated: route.provider !== 'geoapify',
            location: { lat: previousPoint.lat, lng: previousPoint.lng },
            source: route.provider === 'geoapify' ? 'geoapify' : 'gemini',
          });
          cursor += route.durationMinutes + TRAVEL_BUFFER_MINUTES;
        }
      }

      candidateStart = openingStart(activity, Math.max(cursor, requested ?? cursor));
      if (candidateStart + durationFor(activity) > DAY_END_MINUTES && !selectedPlace) continue;
      if (candidateStart + durationFor(activity) > 23 * 60 + 59) {
        if (selectedPlace) {
          planned.push({
            ...activity,
            startTime: null,
            endTime: null,
            notes: [activity.notes, 'Selected stop retained but needs rescheduling; no time remains today.'].filter(Boolean).join(' ') || null,
          });
        }
        continue;
      }
      cursor = candidateStart;

      const plannedActivity = {
        ...activity,
        startTime: formatTime(cursor),
        duration: durationFor(activity),
        notes: [
          activity.notes,
          closed ? `Selected place: verify opening hours; listed closed on ${activity.weeklyOff}.` : null,
          missesHours ? 'Selected place: visit time may fall outside listed opening hours.' : null,
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
