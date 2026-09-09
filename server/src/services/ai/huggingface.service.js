const { HfInference } = require('@huggingface/inference');
const { env } = require('../../config/env');
const logger = require('../../utils/logger');

let hfClient = null;

function getClient() {
  if (!env.huggingfaceApiKey || env.huggingfaceApiKey.startsWith('<')) return null;
  if (!hfClient) hfClient = new HfInference(env.huggingfaceApiKey);
  return hfClient;
}

/** Strips markdown fences and extracts the first JSON object/array from text. */
function extractJson(text) {
  if (!text) return null;
  // Remove markdown fences
  let cleaned = text.trim().replace(/^```(json)?/im, '').replace(/```$/m, '').trim();
  // Find first { or [ and last matching } or ]
  const start = cleaned.search(/[{[]/);
  if (start === -1) return null;
  const openChar = cleaned[start];
  const closeChar = openChar === '{' ? '}' : ']';
  const end = cleaned.lastIndexOf(closeChar);
  if (end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Calls a HuggingFace chat-completion model with the given prompt and
 * returns parsed JSON, or null on any failure.
 * Used as fallback when Gemini is rate-limited or unavailable.
 */
async function huggingfaceGenerateJson(prompt) {
  const hf = getClient();
  if (!hf) return null;

  try {
    const response = await hf.chatCompletion({
      model: env.huggingfaceModel,
      messages: [
        {
          role: 'system',
          content:
            'You are a travel-planning assistant. Always respond with valid JSON only. ' +
            'No markdown, no prose, no code fences. Output only the JSON object requested.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    });

    const text = response.choices?.[0]?.message?.content || '';
    const parsed = extractJson(text);
    if (!parsed) {
      logger.warn('HuggingFace returned unparseable JSON', text.slice(0, 200));
      return null;
    }
    return parsed;
  } catch (err) {
    logger.warn('HuggingFace generateJson failed', err.message);
    return null;
  }
}

module.exports = { huggingfaceGenerateJson };
