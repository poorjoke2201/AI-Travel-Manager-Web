const flag = (name, fallback) => {
  const value = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env[name] : undefined;
  if (value === undefined || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

export const FEATURE_FLAGS = {
  FEATURE_PLACE_PINS: flag('FEATURE_PLACE_PINS', true),
  FEATURE_CATEGORY_PINS: flag('FEATURE_CATEGORY_PINS', true),
  FEATURE_SPLIT_VIEW: flag('FEATURE_SPLIT_VIEW', true),
  FEATURE_GROUP_TRIPS: flag('FEATURE_GROUP_TRIPS', true),
};

export default FEATURE_FLAGS;
