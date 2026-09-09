const { GoogleGenerativeAI } = require('@google/generative-ai');
const { env } = require('../../config/env');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');
const { huggingfaceGenerateJson } = require('./huggingface.service');

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
 * Tries Gemini first, then HuggingFace as fallback, then gives up.
 * generate -> validate -> retry on validation failure (Gemini only) ->
 * if still invalid or Gemini unavailable, try HuggingFace once ->
 * if that also fails/invalid, return { ok: false }.
 *
 * @param {string} prompt
 * @param {(json: any) => {valid: boolean, errors: string[], data: any}} validatorFn
 * @returns {Promise<{ok: boolean, data: any|null, errors: string[], provider: string}>}
 */
async function generateValidatedJson(prompt, validatorFn, { maxRetries = 1 } = {}) {
  let lastErrors = [];
  let currentPrompt = prompt;

  // --- Gemini attempts ---
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let raw;
    try {
      // eslint-disable-next-line no-await-in-loop
      raw = await generateJson(currentPrompt);
    } catch (err) {
      lastErrors = [err.message];
      break; // transport/quota failure - fall through to HuggingFace
    }

    const result = validatorFn(raw);
    if (result.valid) {
      return { ok: true, data: result.data, errors: [], provider: 'gemini' };
    }

    lastErrors = result.errors;
    logger.warn(`Gemini response failed validation (attempt ${attempt + 1}/${maxRetries + 1})`, result.errors);

    currentPrompt = `${prompt}\n\nYour previous response was invalid for these reasons:\n${result.errors
      .map((e) => `- ${e}`)
      .join('\n')}\nPlease correct these issues and return valid JSON only.`;
  }

  // --- HuggingFace fallback ---
  logger.warn('Gemini unavailable or invalid - trying HuggingFace fallback');
  try {
    const hfRaw = await huggingfaceGenerateJson(prompt);
    if (hfRaw) {
      const hfResult = validatorFn(hfRaw);
      if (hfResult.valid) {
        logger.info('HuggingFace fallback succeeded');
        return { ok: true, data: hfResult.data, errors: [], provider: 'huggingface' };
      }
      lastErrors = hfResult.errors;
      logger.warn('HuggingFace response failed validation', hfResult.errors);
    }
  } catch (err) {
    logger.warn('HuggingFace fallback threw', err.message);
  }

  return { ok: false, data: null, errors: lastErrors, provider: 'none' };
}

module.exports = { generateJson, generateValidatedJson };