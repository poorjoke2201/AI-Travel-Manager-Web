const { GoogleGenerativeAI } = require('@google/generative-ai');
const { env } = require('../../config/env');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');

let client = null;
function getClient() {
  if (!env.geminiApiKey) {
    throw ApiError.serviceUnavailable('Gemini API key is not configured.');
  }
  if (!client) client = new GoogleGenerativeAI(env.geminiApiKey);
  return client;
}

/** Strips markdown code fences etc. in case the model ignores the JSON-only instruction. */
function safeParseJson(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    return null;
  }
}

/**
 * Single raw call to Gemini in JSON mode. Throws ApiError.serviceUnavailable
 * on any transport/API failure or unparseable output - callers (via
 * generateValidatedJson) are responsible for retry/fallback decisions.
 */
async function generateJson(prompt) {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: env.geminiModel,
    generationConfig: { responseMimeType: 'application/json' },
  });

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = safeParseJson(text);
    if (parsed === null) {
      throw ApiError.serviceUnavailable('Gemini returned unparseable JSON.');
    }
    return parsed;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.warn('Gemini generateContent failed', err.message);
    throw ApiError.serviceUnavailable('Gemini request failed.');
  }
}

/**
 * The core "never trust Gemini blindly" loop (spec section 27):
 * generate -> validate -> if invalid, retry once with the validation errors
 * appended to the prompt as corrective feedback -> if still invalid, give up
 * and let the caller apply its deterministic fallback (spec section 47).
 *
 * @param {string} prompt
 * @param {(json: any) => {valid: boolean, errors: string[], data: any}} validatorFn
 * @returns {Promise<{ok: boolean, data: any|null, errors: string[]}>}
 */
async function generateValidatedJson(prompt, validatorFn, { maxRetries = 1 } = {}) {
  let lastErrors = [];
  let currentPrompt = prompt;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let raw;
    try {
      // eslint-disable-next-line no-await-in-loop
      raw = await generateJson(currentPrompt);
    } catch (err) {
      lastErrors = [err.message];
      break; // transport failure - retrying with the same broken connection rarely helps
    }

    const result = validatorFn(raw);
    if (result.valid) {
      return { ok: true, data: result.data, errors: [] };
    }

    lastErrors = result.errors;
    logger.warn(`Gemini response failed validation (attempt ${attempt + 1}/${maxRetries + 1})`, result.errors);

    currentPrompt = `${prompt}\n\nYour previous response was invalid for these reasons:\n${result.errors
      .map((e) => `- ${e}`)
      .join('\n')}\nPlease correct these issues and return valid JSON only.`;
  }

  return { ok: false, data: null, errors: lastErrors };
}

module.exports = { generateJson, generateValidatedJson };