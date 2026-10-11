const { geocodeAddress, cityFallbackCoords } = require('../maps/geocoding.service');
const { getCandidatePOIs } = require('../recommendation/candidate.service');
const { candidateQualityScore } = require('../recommendation/scoring.service');
const { computeTransitionScore } = require('./transitionModel.service');
const { clusterPOIsByDay } = require('../itinerary/clustering.service');
const { sequenceDayPOIs } = require('../itinerary/sequencing.service');

const DEFAULT_WEIGHTS = {
  preference: 0.2,
  quality: 0.5,
  timeFit: 0.15,
  social: 0.10,
  penalty: 0.05,
};

const DAY_START_MINUTES = 9 * 60;
const FIRST_DAY_START_MINUTES = 11 * 60;
const DAY_END_MINUTES = 21 * 60 + 30;
const BREAKFAST_MINUTES = 8 * 60;
const LUNCH_MINUTES = 12 * 60 + 30;
const DINNER_MINUTES = 19 * 60 + 30;
const PACE_POI_LIMITS = { relaxed: 3, balanced: 5, packed: 7 };

function getGeocodeProviderOrder() {
  return ['geoapify', 'locationiq', 'cityFallback'];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scorePoiForV2Detailed(poi, trip, slotMinutes = 12 * 60, previousCategory = null) {
  const preferenceText = [poi.category, poi.poiType, poi.significance, ...(poi.tags || []), poi.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const preferenceScore = (trip.placePreferences || []).reduce((sum, term) => {
    if (!term) return sum;
    return sum + (preferenceText.includes(String(term).toLowerCase()) ? 1 : 0);
  }, 0)
    / Math.max(1, (trip.placePreferences || []).length || 1);

  const qualityScore = Number.isFinite(poi.qualityScore)
    ? clamp(poi.qualityScore, 0, 1)
    : candidateQualityScore(poi);
  const timeProfile = {
    heritage: [0.4,0.6,0.8,0.7,0.5,0.4,0.2,0.2,0.2,0.3,0.4,0.6,0.8,0.8,0.7,0.6,0.5,0.4,0.4,0.5,0.6,0.7,0.8,0.5],
    nature: [0.3,0.3,0.4,0.5,0.6,0.7,0.8,0.8,0.9,0.8,0.7,0.5,0.4,0.4,0.5,0.6,0.7,0.8,0.8,0.7,0.6,0.5,0.4,0.3],
    default: [0.5,0.5,0.6,0.6,0.7,0.7,0.8,0.8,0.8,0.7,0.6,0.5,0.5,0.6,0.7,0.7,0.8,0.8,0.7,0.6,0.6,0.5,0.5,0.5],
  };
  const categoryKey = poi.category && poi.category.toLowerCase().includes('nature') ? 'nature' : poi.category && poi.category.toLowerCase().includes('heritage') ? 'heritage' : 'default';
  const timeFit = timeProfile[categoryKey][Math.floor(slotMinutes / 60) % 24] || 0.5;
  const transitionBonus = previousCategory ? computeTransitionScore(previousCategory, poi.category || previousCategory) : 0.08;
  const social = 0.5 + (qualityScore * 0.5);
  const penalty = 0.1 + (previousCategory && String(previousCategory).toLowerCase() === String(poi.category || '').toLowerCase() ? 0.08 : 0);

  const breakdown = {
    preference: preferenceScore,
    quality: qualityScore,
    timeFit,
    social,
    penalty,
    transitionBonus,
  };

  const score = (
    DEFAULT_WEIGHTS.preference * preferenceScore +
    DEFAULT_WEIGHTS.quality * qualityScore +
    DEFAULT_WEIGHTS.timeFit * timeFit +
    DEFAULT_WEIGHTS.social * social +
    DEFAULT_WEIGHTS.penalty * Math.max(0, transitionBonus - penalty)
  );

  return { score: clamp(score, 0, 1), breakdown };
}

function scorePoiForV2(poi, trip, slotMinutes = 12 * 60, previousCategory = null) {
  return scorePoiForV2Detailed(poi, trip, slotMinutes, previousCategory).score;
}

function timeToMinutes(timeValue) {
  if (!timeValue || typeof timeValue !== 'string') return null;
  const [hours, minutes] = timeValue.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function isClosedOnDate(candidate, date) {
  if (!candidate.weeklyOff) return false;
  const dayName = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return String(candidate.weeklyOff).toLowerCase().includes(dayName.toLowerCase());
}

function fitsOpeningWindow(candidate, date, startMinutes, durationMinutes) {
  if (isClosedOnDate(candidate, date)) return false;
  const opening = timeToMinutes(candidate.openingTime);
  const closing = timeToMinutes(candidate.closingTime);
  if (opening != null && startMinutes < opening) return false;
  return closing == null || startMinutes + durationMinutes <= closing;
}

function durationFor(candidate, fallback = 90) {
  return Math.max(30, Math.round((Number(candidate.visitDurationHrs) || fallback / 60) * 60));
}

function minutesToTime(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = Math.floor(normalized % 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function addDays(dateLike, days) {
  const date = new Date(dateLike);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildActivity(type, name, startMinutes, durationMinutes, extras = {}) {
  return {
    type,
    name,
    startTime: minutesToTime(startMinutes),
    duration: durationMinutes,
    ...extras,
  };
}

function candidateKey(candidate) {
  return String(candidate.id || candidate.sourceRef || candidate.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function uniqueCandidates(candidates = []) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = candidateKey(candidate);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function resolveLocation(query) {
  const byGeoapify = await geocodeAddress(query);
  if (byGeoapify) return byGeoapify;
  return cityFallbackCoords(query.replace(/,\s*India$/i, '')) || cityFallbackCoords(query);
}

async function optimizeItineraryForTrip(trip, { pois = [], hotels = [], restaurants = [] } = {}) {
  const baseCandidatePool = pois.length ? pois : await getCandidatePOIs(trip);
  const selectedPlaces = Array.isArray(trip.selectedPlaces) ? trip.selectedPlaces : [];
  const selectedPoiIds = new Set(selectedPlaces.filter((place) => place.type === 'poi').map((place) => String(place.refId)));
  const selectedRestaurantIds = new Set(selectedPlaces.filter((place) => place.type === 'restaurant').map((place) => String(place.refId)));
  const forcedPois = baseCandidatePool.filter((poi) => selectedPoiIds.has(String(poi.id)));
  const forcedRestaurants = restaurants.filter((restaurant) => selectedRestaurantIds.has(String(restaurant.id)));
  const candidatePool = uniqueCandidates([...forcedPois, ...baseCandidatePool.filter((poi) => !selectedPoiIds.has(String(poi.id)))]);
  const dayCount = Math.max(1, Number(trip.numberOfDays) || 1);
  candidatePool.sort((left, right) => (
    scorePoiForV2(right, trip, 10 * 60) - scorePoiForV2(left, trip, 10 * 60)
  ));
  const poiClusters = clusterPOIsByDay(candidatePool, dayCount);
  const selectedClusters = clusterPOIsByDay(forcedPois, dayCount)
    .map((cluster) => sequenceDayPOIs(cluster, (
      hotels[0]?.latitude != null && hotels[0]?.longitude != null
        ? { lat: hotels[0].latitude, lng: hotels[0].longitude }
        : trip.destinationLocation
    )));
  const mealPool = uniqueCandidates([...forcedRestaurants, ...restaurants.filter((restaurant) => !selectedRestaurantIds.has(String(restaurant.id)))]);

  const baseHotel = hotels[0] || { id: 'hotel-default', name: 'Stay base', latitude: trip.destinationLocation?.lat ?? null, longitude: trip.destinationLocation?.lng ?? null };
  const days = [];
  const usedPoiKeys = new Set();
  const usedMealKeys = new Set();
  const maxPoisPerDay = PACE_POI_LIMITS[trip.pace] || PACE_POI_LIMITS.balanced;

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    const date = addDays(trip.startDate, dayIndex);
    const activities = [];
    const mealCandidates = mealPool;
    let cursor = dayIndex === 0 ? FIRST_DAY_START_MINUTES : DAY_START_MINUTES;

    let previousCategory = null;
    const breakfast = dayIndex > 0
      ? mealCandidates.find((meal) => !usedMealKeys.has(candidateKey(meal)) && fitsOpeningWindow(meal, date, BREAKFAST_MINUTES, 60))
      : null;
    if (breakfast) {
      usedMealKeys.add(candidateKey(breakfast));
      activities.push(buildActivity('restaurant', breakfast.name, BREAKFAST_MINUTES, 60, {
        location: { lat: breakfast.latitude ?? baseHotel.latitude, lng: breakfast.longitude ?? baseHotel.longitude },
        refId: breakfast.id || breakfast.sourceRef || null,
        category: breakfast.category || 'restaurant',
        source: breakfast.source || 'dataset',
      }));
      previousCategory = 'restaurant';
      cursor = BREAKFAST_MINUTES + 60;
    }

    const dayCandidates = uniqueCandidates([
      ...selectedClusters[dayIndex],
      ...poiClusters[dayIndex].filter((poi) => !selectedPoiIds.has(String(poi.id))),
    ]).sort((left, right) => (
      scorePoiForV2(right, trip, cursor) - scorePoiForV2(left, trip, cursor)
    ));
    const mandatoryForDay = selectedClusters[dayIndex];
    const dayPoiLimit = Math.max(maxPoisPerDay, mandatoryForDay.length);

    for (let i = 0; i < dayPoiLimit; i += 1) {
      if (cursor < LUNCH_MINUTES && cursor + 60 > LUNCH_MINUTES) cursor = LUNCH_MINUTES;
      if (cursor >= LUNCH_MINUTES && cursor < DINNER_MINUTES && !activities.some((activity) => activity.mealType === 'lunch')) {
        const lunchStart = Math.max(LUNCH_MINUTES, cursor);
        const lunch = mealCandidates.find((meal) => !usedMealKeys.has(candidateKey(meal)) && fitsOpeningWindow(meal, date, lunchStart, 60));
        if (lunch) {
          usedMealKeys.add(candidateKey(lunch));
          activities.push(buildActivity('restaurant', lunch.name, lunchStart, 60, {
            location: { lat: lunch.latitude ?? baseHotel.latitude, lng: lunch.longitude ?? baseHotel.longitude },
            refId: lunch.id || lunch.sourceRef || null,
            category: lunch.category || 'restaurant',
            mealType: 'lunch',
            source: lunch.source || 'dataset',
          }));
          cursor = lunchStart + 60;
          previousCategory = 'restaurant';
        }
      }

      const mandatoryPoi = mandatoryForDay.find((candidate) => !usedPoiKeys.has(candidateKey(candidate)));
      const poi = mandatoryPoi || dayCandidates
        .filter((candidate) => !usedPoiKeys.has(candidateKey(candidate)))
        .find((candidate) => fitsOpeningWindow(candidate, date, cursor, durationFor(candidate)) && cursor + durationFor(candidate) <= DINNER_MINUTES);
      if (!poi) break;

      usedPoiKeys.add(candidateKey(poi));
      const slotMinutes = cursor;
      const scored = scorePoiForV2Detailed(poi, trip, slotMinutes, previousCategory);
      const poiDuration = durationFor(poi);
      activities.push(buildActivity('poi', poi.name, slotMinutes, poiDuration, {
        location: { lat: poi.latitude ?? baseHotel.latitude, lng: poi.longitude ?? baseHotel.longitude },
        refId: poi.id || poi.sourceRef || null,
        category: poi.category || poi.poiType || 'point of interest',
        poiType: poi.poiType || null,
        score: scored.score,
        breakdown: scored.breakdown,
        source: poi.source || 'overture',
        isSelected: selectedPoiIds.has(String(poi.id)),
      }));
      previousCategory = poi.category || previousCategory;
      cursor += poiDuration + 20;
    }

    if (!activities.some((activity) => activity.mealType === 'lunch')) {
      const lunchStart = Math.max(LUNCH_MINUTES, cursor);
      const lunch = mealCandidates.find((meal) => !usedMealKeys.has(candidateKey(meal)) && fitsOpeningWindow(meal, date, lunchStart, 60));
      if (lunch) {
      usedMealKeys.add(candidateKey(lunch));
      activities.push(buildActivity('restaurant', lunch.name, lunchStart, 60, {
        location: { lat: lunch.latitude ?? baseHotel.latitude, lng: lunch.longitude ?? baseHotel.longitude },
        refId: lunch.id || lunch.sourceRef || null,
        category: lunch.category || 'restaurant',
        mealType: 'lunch',
        source: lunch.source || 'dataset',
      }));
      }
    }

    const dinnerStart = Math.max(DINNER_MINUTES, cursor);
    const dinner = mealCandidates.find((meal) => !usedMealKeys.has(candidateKey(meal)) && fitsOpeningWindow(meal, date, dinnerStart, 60));
    if (dinner) {
      usedMealKeys.add(candidateKey(dinner));
      activities.push(buildActivity('restaurant', dinner.name, dinnerStart, 60, {
        location: { lat: dinner.latitude ?? baseHotel.latitude, lng: dinner.longitude ?? baseHotel.longitude },
        refId: dinner.id || dinner.sourceRef || null,
        category: dinner.category || 'restaurant',
        mealType: 'dinner',
        source: dinner.source || 'dataset',
      }));
      previousCategory = 'restaurant';
    }

    activities.sort((a, b) => (timeToMinutes(a.startTime) || 0) - (timeToMinutes(b.startTime) || 0));

    days.push({
      day: dayIndex + 1,
      date: addDays(trip.startDate, dayIndex),
      summary: `Day ${dayIndex + 1} in ${trip.destination}`,
      activities: activities.map((activity) => ({
        ...activity,
        refId: activity.refId || null,
      })),
    });
  }

  return days;
}

module.exports = {
  getGeocodeProviderOrder,
  optimizeItineraryForTrip,
  scorePoiForV2,
  scorePoiForV2Detailed,
};
