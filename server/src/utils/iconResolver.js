const subtypeMap = require('../../../client/src/config/iconMap/subtype.json');
const categoryMap = require('../../../client/src/config/iconMap/category.json');

const defaultIcon = { iconKey: 'generic_poi', group: 'Other', color: '#6B7280' };

function normalizeTag(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase().replace(/[^a-z0-9_\-]+/g, '_');
}

function resolveIcon(poi = {}) {
  const directSubtype = poi.subtypeIcon || poi.subtype || poi.iconKey;
  if (directSubtype) {
    const key = normalizeTag(directSubtype);
    if (key) return { iconKey: key, group: 'Other', color: '#6B7280' };
  }

  const tagValues = [...(Array.isArray(poi.tags) ? poi.tags : []), poi.tag, poi.tags]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map(normalizeTag)
    .filter(Boolean);

  const fineTag = tagValues.find((tag) => subtypeMap[tag]);
  if (fineTag && subtypeMap[fineTag]) {
    return { ...subtypeMap[fineTag], iconKey: subtypeMap[fineTag].key || fineTag };
  }

  const categoryKey = normalizeTag(poi.travelCategory || poi.category);
  const categoryEntry = categoryMap[categoryKey];
  if (categoryEntry) {
    return { ...categoryEntry, iconKey: categoryEntry.key || categoryKey };
  }

  return defaultIcon;
}

module.exports = { resolveIcon, defaultIcon };
