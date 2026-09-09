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
      if (activity.source === 'dataset') {
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

  if (errors.length) {
    return { valid: false, errors, data: null };
  }

  return { valid: true, errors: [], data: parsed.data };
}

module.exports = { validatePreTrip, validateTransport, validateItinerary };