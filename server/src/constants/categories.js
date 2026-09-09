/**
 * Enumerations shared between validators, Gemini prompt builders, and (via
 * client/src/constants mirrors) the frontend form. Keeping these as the
 * single source of truth avoids the trip form drifting from what the
 * backend actually accepts.
 */

const PLACE_INTERESTS = [
  'Historical', 'Heritage', 'Nature', 'Adventure', 'Beaches', 'Mountains',
  'Wildlife', 'Religious', 'Cultural', 'Museums', 'Shopping', 'Nightlife',
  'Photography', 'Architecture', 'Local experiences', 'Entertainment',
  'Family-friendly', 'Romantic',
];

const FOOD_PREFERENCES = [
  'Vegetarian', 'Non-vegetarian', 'Vegan', 'Jain', 'Local cuisine',
  'North Indian', 'South Indian', 'Chinese', 'Continental', 'Street food',
  'Fine dining', 'Budget food', 'No preference',
];

// POI categories as they actually appear in master_pois.csv `category` column.
// Used for fuzzy matching against placePreferences, not as a hard enum.
const KNOWN_POI_CATEGORIES = [
  'Cultural & Heritage Sites',
  'Religious & Spiritual Pilgrimages',
  'Nature & Wildlife',
  'Adventure & Outdoor',
  'Beaches & Coastal',
  'Museums & Galleries',
  'Shopping & Markets',
  'Entertainment & Nightlife',
];

module.exports = { PLACE_INTERESTS, FOOD_PREFERENCES, KNOWN_POI_CATEGORIES };