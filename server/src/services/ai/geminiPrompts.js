const { TRANSPORT_DISCLAIMER } = require('../../constants/transport');

/**
 * All prompts explicitly demand strict JSON with no prose wrapper, and
 * repeat the guardrails from spec section 26 (prefer dataset candidates,
 * never invent dataset IDs, respect dates/preferences, label AI additions,
 * never claim live transport availability). Every prompt also states the
 * exact JSON shape inline so Gemini's structured-output mode has a concrete
 * target beyond just our schema description.
 */

function tripSummaryBlock(trip) {
  return `
Trip context:
- Destination: ${trip.destination}
- Origin: ${trip.origin}
- Dates: ${trip.startDate} to ${trip.endDate} (${trip.numberOfDays} days)
- Travellers: ${trip.travellers.adults} adults, ${trip.travellers.children} children
- Trip type: ${trip.tripType}
- Travel style: ${trip.travelStyle}
- Pace: ${trip.pace}
- Budget (INR, total trip): ${trip.budget ?? 'not specified'}
- Place interests: ${trip.placePreferences.join(', ') || 'none specified'}
- Food preferences: ${trip.foodPreferences.join(', ') || 'none specified'}
- Accommodation preference: ${trip.accommodationPreference}
- Daily local travel tolerance: ${trip.dailyTravelToleranceKm ?? 'not specified'} km
`.trim();
}

function buildPreTripPrompt(trip) {
  return `
You are a travel-planning assistant. Generate pre-trip guidance as STRICT JSON only.
Do not include markdown code fences, prose, or any text outside the JSON object.

${tripSummaryBlock(trip)}

Requirements:
- All weather information is AI-estimated guidance, NOT a verified forecast. Do not state exact temperatures/precipitation as fact - phrase advisories generally (e.g. "likely warm and humid").
- Packing items should reflect the destination, season implied by the dates, trip duration, and trip type.
- Keep each list item short (a few words).

Return exactly this JSON shape:
{
  "packingChecklist": {
    "essentials": ["string", ...],
    "clothing": ["string", ...],
    "destinationSpecific": ["string", ...]
  },
  "weatherAdvice": "one paragraph of general AI-estimated weather guidance",
  "travelTips": ["string", ...]
}
`.trim();
}

function buildTransportPrompt(trip) {
  return `
You are a travel-planning assistant. Generate transport recommendations as STRICT JSON only.
Do not include markdown code fences, prose, or any text outside the JSON object.

${tripSummaryBlock(trip)}
User's preferred transport mode: ${trip.transportPreference}

Requirements:
- If the preferred mode is "any", suggest the 2-3 most sensible modes for this route.
- Otherwise focus primarily on the preferred mode, optionally include one alternative.
- These are recommendations only - this application does NOT book travel and has no live
  transport API. Never imply confirmed pricing or availability. "${TRANSPORT_DISCLAIMER}".
- approxPriceInr and approxDurationHrs are rough estimates; use null if you cannot estimate responsibly.
- isLiveAvailability must always be false.

Return exactly this JSON shape:
{
  "options": [
    {
      "mode": "flight|train|bus|car|bike",
      "summary": "short natural-language recommendation",
      "approxDurationHrs": number or null,
      "approxPriceInr": number or null,
      "isLiveAvailability": false
    }
  ]
}
`.trim();
}

/**
 * candidatePOIs/candidateHotels/candidateRestaurants are the SMALL, already
 * dataset-filtered+ranked sets from recommendation services - never the raw
 * collections. Each candidate is passed with its Mongo _id as `id` so
 * Gemini can reference it via datasetId instead of inventing one.
 */
function buildItineraryPrompt({ trip, candidatePOIs, candidateHotels, candidateRestaurants, weatherContext }) {
  const poiList = candidatePOIs
    .map((p) => {
      const hours = (p.openingTime && p.closingTime) ? ` opens=${p.openingTime} closes=${p.closingTime}` : '';
      const off = p.weeklyOff ? ` closed=${p.weeklyOff}` : '';
      return `  - id=${p.id}, name="${p.name}", category=${p.category || 'n/a'}, rating=${p.googleRating ?? 'n/a'}, visitDurationHrs=${p.visitDurationHrs ?? 1}, lat=${p.latitude}, lng=${p.longitude}, indoorOutdoor=${p.indoorOutdoor || 'n/a'}, bestTime=${p.bestTimeToVisit || 'n/a'}${hours}${off}`;
    })
    .join('\n');
  const hotelList = candidateHotels
    .map((h) => `  - id=${h.id}, name="${h.name}", rating=${h.googleRating ?? 'n/a'}, pricePerNightInr=${h.pricePerNightInr ?? 'n/a'}`)
    .join('\n');
  const restaurantList = candidateRestaurants
    .map((r) => {
      const hours = (r.openingTime && r.closingTime) ? ` opens=${r.openingTime} closes=${r.closingTime}` : '';
      return `  - id=${r.id}, name="${r.name}", cuisine=${(r.cuisine || []).join('/') || 'n/a'}, rating=${r.rating ?? 'n/a'}, isPureVeg=${r.isPureVeg ?? 'n/a'}, lat=${r.latitude}, lng=${r.longitude}${hours}`;
    })
    .join('\n');

  return `
You are a travel-planning assistant building a day-by-day itinerary as STRICT JSON only.
Do not include markdown code fences, prose, or any text outside the JSON object.

${tripSummaryBlock(trip)}

IMPORTANT SCHEDULING RULES:
- Day 1 starts AFTER the traveller arrives from ${trip.origin}. Do NOT schedule any POI before 11:00 on Day 1.
- ALWAYS respect opening and closing times listed for each POI/restaurant. Never schedule a visit outside those hours.
- ALWAYS respect weekly off days — do not schedule a visit on a POI's closed day.
- Add realistic travel time between consecutive POIs (estimate ~15-30 min for nearby, ~45-60 min for far apart based on lat/lng).
- Group geographically nearby POIs on the same day to minimise travel.
- Insert a breakfast activity (~08:00, 30 min) from the restaurant list on Day 2 onwards.
- Insert lunch (~12:30, 60 min) and dinner (~19:30, 60 min) from the restaurant list every day.
- Between each POI/restaurant, insert a "travel" activity with realistic duration in minutes and notes showing distance.

AI-estimated weather context:
${weatherContext || 'No specific weather context available.'}

Candidate POIs:
${poiList || '  (none available)'}

Candidate hotels (base location reference):
${hotelList || '  (none available)'}

Candidate restaurants:
${restaurantList || '  (none available)'}

Requirements:
- Produce exactly ${trip.numberOfDays} day(s), dated sequentially starting ${trip.startDate}.
- When using a candidate, set "datasetId" to its exact id and "source":"dataset".
- Respect pace "${trip.pace}": relaxed=2-3 POIs/day, balanced=4-5, packed=6-7.
- Every activity needs startTime ("HH:mm") and duration in minutes.
- Travel activities between POIs must have type="travel" and notes with estimated distance.

Return exactly this JSON shape:
{
  "days": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "summary": "one sentence",
      "weatherContext": "short note or null",
      "activities": [
        {
          "type": "poi|restaurant|hotel|travel|break",
          "datasetId": "id or null",
          "name": "string",
          "startTime": "HH:mm",
          "duration": number,
          "notes": "string or null",
          "source": "dataset|gemini"
        }
      ]
    }
  ]
}
`.trim();
}

module.exports = { buildPreTripPrompt, buildTransportPrompt, buildItineraryPrompt };