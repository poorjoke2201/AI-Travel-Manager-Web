/**
 * Generic value-cleaning helpers for turning raw CSV strings into proper
 * MongoDB types. Deliberately conservative: if a value can't be safely
 * interpreted, we store null rather than guessing/inventing data.
 */

const PLACEHOLDER_VALUES = new Set(['', '-', '--', 'n/a', 'na', 'null', 'none', 'nil', '**']);

/** Strips stray leading/trailing '**' (markdown-bold artifacts seen in some source files) and trims whitespace. */
function cleanRawString(value) {
  if (value === null || value === undefined) return null;
  let str = String(value).trim();
  str = str.replace(/^\*+/, '').replace(/\*+$/, '').trim();
  return str;
}

/** Returns null for empty/placeholder values, otherwise the cleaned string. */
function toCleanStringOrNull(value) {
  const cleaned = cleanRawString(value);
  if (cleaned === null) return null;
  if (PLACEHOLDER_VALUES.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

/** Parses a numeric field; returns null (never NaN, never invented) if not a valid number. */
function toNumberOrNull(value) {
  const cleaned = cleanRawString(value);
  if (cleaned === null || PLACEHOLDER_VALUES.has(cleaned.toLowerCase())) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Parses common boolean spellings; returns null if ambiguous. */
function toBooleanOrNull(value) {
  const cleaned = toCleanStringOrNull(value);
  if (cleaned === null) return null;
  const lower = cleaned.toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(lower)) return true;
  if (['false', 'no', 'n', '0'].includes(lower)) return false;
  return null;
}

/** Splits a delimited string field (amenities, tags, cuisine) into a clean array. */
function toArrayOrEmpty(value, delimiter = ',') {
  const cleaned = toCleanStringOrNull(value);
  if (cleaned === null) return [];
  return cleaned
    .split(delimiter)
    .map((s) => cleanRawString(s))
    .filter((s) => s && !PLACEHOLDER_VALUES.has(s.toLowerCase()));
}

/** Builds a GeoJSON Point if both lat/lng are valid numbers in range, else null. */
function toGeoPointOrNull(lat, lng) {
  const latNum = toNumberOrNull(lat);
  const lngNum = toNumberOrNull(lng);
  if (latNum === null || lngNum === null) return null;
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return null;
  return { type: 'Point', coordinates: [lngNum, latNum] }; // GeoJSON order: [lng, lat]
}

/** Title-cases a city/state string for consistent matching (e.g. "new york" -> "New York"). */
function toTitleCaseOrNull(value) {
  const cleaned = toCleanStringOrNull(value);
  if (cleaned === null) return null;
  return cleaned
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

module.exports = {
  cleanRawString,
  toCleanStringOrNull,
  toNumberOrNull,
  toBooleanOrNull,
  toArrayOrEmpty,
  toGeoPointOrNull,
  toTitleCaseOrNull,
  PLACEHOLDER_VALUES,
};