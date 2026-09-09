/**
 * Re-exports the AI response validators for use at the controller/route
 * layer (e.g. an endpoint that lets a user regenerate a single AI-generated
 * day - see spec section 48 future features). The actual validation logic
 * lives in services/ai/geminiValidator.js since it needs trip/candidate
 * context that's only available inside the generation pipeline; this file
 * exists so controllers don't need to reach into services/ai directly.
 */
module.exports = require('../services/ai/geminiValidator');