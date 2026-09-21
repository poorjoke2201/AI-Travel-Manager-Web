function flag(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

module.exports = {
  FEATURE_CATEGORY_PINS: flag('FEATURE_CATEGORY_PINS', process.env.NODE_ENV !== 'production'),
  FEATURE_SPLIT_VIEW: flag('FEATURE_SPLIT_VIEW', process.env.NODE_ENV !== 'production'),
  FEATURE_GROUP_TRIPS: flag('FEATURE_GROUP_TRIPS', process.env.NODE_ENV !== 'production'),
};
