import subtypeMap from '../config/iconMap/subtype.json';
import categoryMap from '../config/iconMap/category.json';

const defaultIcon = { iconKey: 'generic_poi', group: 'Other', color: '#6B7280' };

function normalizeTag(value) {
  if (!value) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\|/g, '_')
    .replace(/[^a-z0-9_\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function collectTagValues(poi) {
  const raw = [
    poi.subtypeIcon,
    poi.subtype,
    poi.iconKey,
    poi.tag,
    poi.tags,
    poi.type,
    poi.placeType,
    poi.travelCategory,
    poi.category,
  ];

  const values = [];
  raw.forEach((entry) => {
    if (!entry) return;
    if (Array.isArray(entry)) {
      entry.forEach((value) => values.push(value));
      return;
    }
    if (typeof entry === 'string') {
      const split = entry.split('|').map((part) => part.trim()).filter(Boolean);
      split.forEach((part) => {
        const normalized = normalizeTag(part);
        if (normalized) values.push(normalized);
      });
      return;
    }
    const normalized = normalizeTag(String(entry));
    if (normalized) values.push(normalized);
  });

  return [...new Set(values)];
}

export function resolveIcon(poi = {}) {
  if (poi.type === 'hotel' || poi.category === 'hotel' || poi.travelCategory === 'hotel') {
    return { iconKey: 'hotel', group: 'Stay & trip anchors', color: '#1D4ED8' };
  }

  const directSubtype = poi.subtypeIcon || poi.subtype || poi.iconKey;
  if (directSubtype) {
    const key = normalizeTag(directSubtype);
    if (key && subtypeMap[key]) return { ...subtypeMap[key], iconKey: subtypeMap[key].key || key };
    if (key) return { iconKey: key, group: 'Other', color: '#6B7280' };
  }

  const tagValues = collectTagValues(poi);
  const fineTag = tagValues.find((tag) => subtypeMap[tag]);
  if (fineTag && subtypeMap[fineTag]) {
    return { ...subtypeMap[fineTag], iconKey: subtypeMap[fineTag].key || fineTag };
  }

  const categoryKey = normalizeTag(poi.travelCategory || poi.category || poi.type || 'other');
  const categoryEntry = categoryMap[categoryKey] || categoryMap.other;
  if (categoryEntry) {
    return { ...categoryEntry, iconKey: categoryEntry.key || categoryKey };
  }

  if (process.env.NODE_ENV !== 'production') {
    const unresolved = tagValues.filter((tag) => !subtypeMap[tag] && tag !== 'generic_poi');
    if (unresolved.length) {
      console.warn('[mapIcons] unmapped POI tags:', unresolved);
    }
  }

  return defaultIcon;
}

export default resolveIcon;
