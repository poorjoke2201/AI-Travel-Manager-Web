const {
  preTripResponseSchema,
  transportResponseSchema,
  itineraryResponseSchema,
} = require('./geminiSchemas');

/**
 * Gemini's response is NEVER trusted blindly (spec section 27). Each
 * validate* function first checks structural shape via zod, then applies
 * business rules that need trip/candidate context zod alone can't express:
 * dataset IDs must reference a real candidate, dates must fall inside the
 * trip range, day numbers must be sequential and complete.
 *
 * Returns { valid: boolean, errors: string[], data: object|null }.
 */

function validatePreTrip(rawJson) {
  const parsed = preTripResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((i) => i.message), data: null };
  }
  return { valid: true, errors: [], data: parsed.data };
}

function validateTransport(rawJson) {
  const parsed = transportResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((i) => i.message), data: null };
  }
  return { valid: true, errors: [], data: parsed.data };
}

function parseTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function validateItinerary(rawJson, { trip, candidateIds }) {
  const parsed = itineraryResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((i) => i.message), data: null };
  }

  const errors = [];
  const { days } = parsed.data;

  if (days.length !== trip.numberOfDays) {
    errors.push(`Expected ${trip.numberOfDays} days, got ${days.length}`);
  }

  const tripStart = new Date(trip.startDate).getTime();
  const tripEnd = new Date(trip.endDate).getTime();

  days.forEach((day, idx) => {
    if (day.day !== idx + 1) {
      errors.push(`Day at index ${idx} has day=${day.day}, expected ${idx + 1} (must be sequential)`);
    }

    const dayTime = new Date(day.date).getTime();
    if (Number.isNaN(dayTime)) {
      errors.push(`Day ${day.day} has an unparseable date "${day.date}"`);
    } else if (dayTime < tripStart || dayTime > tripEnd) {
      errors.push(`Day ${day.day} date "${day.date}" falls outside trip range`);
    }

    day.activities.forEach((activity, actIdx) => {
      const startMinutes = parseTime(activity.startTime);
      const duration = Number(activity.duration);
      if (startMinutes == null) {
        errors.push(`Day ${day.day} activity ${actIdx} ("${activity.name}") must have a valid HH:mm startTime`);
      } else {
        const earliest = day.day === 1 ? 11 * 60 : 8 * 60;
        const latest = 21 * 60 + 30;
        if (startMinutes < earliest) errors.push(`Day ${day.day} activity ${actIdx} starts before the allowed day window`);
        if (Number.isFinite(duration) && startMinutes + duration > latest) errors.push(`Day ${day.day} activity ${actIdx} runs past the daily end time`);
        if (actIdx > 0) {
          const previous = day.activities[actIdx - 1];
          const previousStart = parseTime(previous.startTime);
          const previousDuration = Number(previous.duration);
          if (previousStart != null && Number.isFinite(previousDuration) && startMinutes < previousStart + previousDuration) {
            errors.push(`Day ${day.day} activities overlap around activity ${actIdx}`);
          }
        }
      }
      // hotel/travel/break activities are context-only and not strictly validated against candidateIds
      if (activity.source === 'dataset' && !['hotel', 'travel', 'break'].includes(activity.type)) {
        const id = activity.datasetId != null ? String(activity.datasetId) : null;
        if (!id || !candidateIds.has(id)) {
          errors.push(
            `Day ${day.day} activity ${actIdx} ("${activity.name}") claims source=dataset but datasetId ` +
              `"${activity.datasetId}" was not in the candidate set provided - likely fabricated.`
          );
        }
      }
    });
  });

  const restaurantIds = new Set();
  days.forEach((day) => {
    const meals = day.activities.filter((activity) => activity.type === 'restaurant');
    if (meals.length < 3) errors.push(`Day ${day.day} must contain breakfast, lunch, and dinner.`);
    day.activities.forEach((activity) => {
    if (activity.type !== 'restaurant' || activity.datasetId == null) return;
    const id = String(activity.datasetId);
    if (restaurantIds.has(id)) errors.push(`Restaurant ${id} is repeated; meals must use distinct restaurants.`);
    restaurantIds.add(id);
    });
  });

  if (errors.length) {
    return { valid: false, errors, data: null };
  }

  return { valid: true, errors: [], data: parsed.data };
}

module.exports = { validatePreTrip, validateTransport, validateItinerary };