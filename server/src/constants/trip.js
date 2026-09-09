const TRAVEL_STYLES = ['budget', 'moderate', 'luxury'];
const TRIP_TYPES = ['solo', 'couple', 'family', 'friends', 'business'];
const PACE_OPTIONS = ['relaxed', 'balanced', 'packed'];
const ACCOMMODATION_PREFERENCES = ['hotel', 'hostel', 'resort', 'budget', 'luxury', 'any'];
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