const TRANSPORT_MODES = ['flight', 'train', 'bus', 'car', 'bike', 'any'];

// Modes where Google Maps can provide real routing/distance (driving directions).
const GOOGLE_MAPS_ROUTABLE_MODES = ['car', 'bike'];

// Everything else is Gemini-estimated because no live transport API is integrated.
const AI_ESTIMATED_MODES = ['flight', 'train', 'bus'];

const TRANSPORT_DISCLAIMER = 'AI recommendation - estimated, not live availability';

module.exports = {
  TRANSPORT_MODES,
  GOOGLE_MAPS_ROUTABLE_MODES,
  AI_ESTIMATED_MODES,
  TRANSPORT_DISCLAIMER,
};