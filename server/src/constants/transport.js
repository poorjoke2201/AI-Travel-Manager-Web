const TRANSPORT_MODES = ['flight', 'train', 'bus', 'car', 'bike', 'any'];

// Geoapify is the canonical routing provider for road-based modes.
const GEOAPIFY_ROUTABLE_MODES = ['car', 'bike'];
const GOOGLE_MAPS_ROUTABLE_MODES = GEOAPIFY_ROUTABLE_MODES;

// Everything else is Gemini-estimated because no live transport API is integrated.
const AI_ESTIMATED_MODES = ['flight', 'train', 'bus'];

const TRANSPORT_DISCLAIMER = 'AI recommendation - estimated, not live availability';

module.exports = {
  TRANSPORT_MODES,
  GEOAPIFY_ROUTABLE_MODES,
  GOOGLE_MAPS_ROUTABLE_MODES,
  AI_ESTIMATED_MODES,
  TRANSPORT_DISCLAIMER,
};