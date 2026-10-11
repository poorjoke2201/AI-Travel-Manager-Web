const options = require('../../../shared/travelPreferences.json');
const TRAVEL_STYLES = options.travelStyles.map(({ value }) => value);
const TRIP_TYPES = options.tripTypes.map(({ value }) => value);
const PACE_OPTIONS = options.paceOptions.map(({ value }) => value);
const ACCOMMODATION_PREFERENCES = options.accommodationPreferences.map(({ value }) => value);
const TRIP_STATUS = ['draft', 'generating', 'generated', 'failed'];

// Pace -> rough max activities/day, used by itineraryOptimizer.service.js
// as a starting constraint before Gemini/heuristic sequencing.
const PACE_MAX_ACTIVITIES_PER_DAY = {
  relaxed: 3,
  balanced: 5,
  packed: 7,
};

module.exports = {
  TRAVEL_STYLES,
  TRIP_TYPES,
  PACE_OPTIONS,
  ACCOMMODATION_PREFERENCES,
  TRIP_STATUS,
  PACE_MAX_ACTIVITIES_PER_DAY,
};