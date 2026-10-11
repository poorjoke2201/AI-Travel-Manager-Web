const CATEGORY_STYLES = {
  temple: { style: 'bg-violet-100 text-violet-700', color: '#8B3FA8' },
  nature: { style: 'bg-emerald-100 text-emerald-700', color: '#25824B' },
  museum: { style: 'bg-amber-100 text-amber-700', color: '#D27A1E' },
  food: { style: 'bg-rose-100 text-rose-700', color: '#D44848' },
  shopping: { style: 'bg-sky-100 text-sky-700', color: '#2875C7' },
  stay: { style: 'bg-blue-100 text-blue-700', color: '#3566B8' },
  heritage: { style: 'bg-orange-100 text-orange-700', color: '#BB642C' },
  other: { style: 'bg-stone-100 text-ink-600', color: '#6B7280' },
};

export function getActivityCategory(activity = {}) {
  const tagValues = Array.isArray(activity.tags) ? activity.tags : [activity.tags];
  const details = [activity.poiType, activity.category, activity.significance, activity.characteristics, ...tagValues, activity.type]
    .filter(Boolean)
    .join(' ')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();

  if (/\b(temples?|mandirs?|shrines?|church(?:es)?|mosques?|worship|religious|spiritual|pilgrims?)\b/.test(details)) {
    return { label: 'Temple', icon: '🛕', ...CATEGORY_STYLES.temple };
  }
  if (/\b(parks?|gardens?|lakes?|hills?|nature|wildlife|forests?|beach(?:es)?|landscapes?)\b/.test(details)) {
    return { label: 'Park / Nature', icon: '🌿', ...CATEGORY_STYLES.nature };
  }
  if (/\b(museums?|galler(?:y|ies))\b/.test(details)) {
    return { label: 'Museum', icon: '🏛️', ...CATEGORY_STYLES.museum };
  }
  if (activity.type === 'restaurant' || /\b(food|restaurants?|cafes?|cuisine|dining)\b/.test(details)) {
    return { label: 'Food', icon: '🍽️', ...CATEGORY_STYLES.food };
  }
  if (/\b(shops?|shopping|markets?|bazaars?)\b/.test(details)) {
    return { label: 'Shopping', icon: '🛍️', ...CATEGORY_STYLES.shopping };
  }
  if (activity.type === 'hotel' || /\b(hotels?|hostels?|resorts?|stay|accommodation)\b/.test(details)) {
    return { label: 'Stay', icon: '🛏️', ...CATEGORY_STYLES.stay };
  }
  if (/\b(heritage|historic|historical|palaces?|forts?|monuments?|cultural)\b/.test(details)) {
    return { label: 'Heritage', icon: '🏰', ...CATEGORY_STYLES.heritage };
  }
  return { label: 'Other', icon: '📍', ...CATEGORY_STYLES.other };
}

export function getActivityCategoryLegend() {
  return [
    { label: 'Temple', icon: '🛕', ...CATEGORY_STYLES.temple },
    { label: 'Park / Nature', icon: '🌿', ...CATEGORY_STYLES.nature },
    { label: 'Museum', icon: '🏛️', ...CATEGORY_STYLES.museum },
    { label: 'Food', icon: '🍽️', ...CATEGORY_STYLES.food },
    { label: 'Shopping', icon: '🛍️', ...CATEGORY_STYLES.shopping },
    { label: 'Stay', icon: '🛏️', ...CATEGORY_STYLES.stay },
    { label: 'Heritage', icon: '🏰', ...CATEGORY_STYLES.heritage },
    { label: 'Other', icon: '📍', ...CATEGORY_STYLES.other },
  ];
}

const CURATED_TAGS = {
  place_of_worship: ['Spiritual', 'Heritage'],
  temple: ['Spiritual', 'Heritage'],
  shrine: ['Spiritual', 'Heritage'],
  theme_park: ['Family-friendly', 'Entertainment'],
  family_friendly: ['Family-friendly'],
  water_park: ['Family-friendly', 'Water activities'],
  park: ['Outdoors', 'Relaxing'],
  garden: ['Outdoors', 'Peaceful'],
  peaceful: ['Peaceful'],
  scenic: ['Scenic'],
  relaxing: ['Relaxing'],
  outdoors: ['Outdoors'],
  museum: ['Culture', 'Learning'],
  art_gallery: ['Culture', 'Art'],
  historic: ['Heritage', 'History'],
  heritage: ['Heritage', 'History'],
  restaurant: ['Local cuisine', 'Dining'],
  cafe: ['Local cuisine', 'Relaxing'],
  market: ['Local finds', 'Shopping'],
  shopping: ['Local finds', 'Shopping'],
};

export function getActivityTags(activity = {}) {
  const rawValues = [activity.tags, activity.characteristics]
    .flatMap((value) => Array.isArray(value) ? value : String(value || '').split(/[;,|]/))
    .map((value) => String(value).trim())
    .filter(Boolean);
  const curated = rawValues.flatMap((value) => {
    const key = value.toLowerCase().replace(/[\s-]+/g, '_');
    if (CURATED_TAGS[key]) return CURATED_TAGS[key];
    if (!value.includes('_') && !/^[a-z0-9]+$/.test(value)) return [value];
    return [];
  });
  const category = getActivityCategory(activity).label;
  const defaults = {
    Temple: ['Spiritual', 'Heritage'],
    'Park / Nature': ['Outdoors', 'Peaceful'],
    Museum: ['Culture', 'Learning'],
    Food: ['Local cuisine', 'Dining'],
    Shopping: ['Local finds', 'Shopping'],
    Stay: ['Restful stay'],
    Heritage: ['Heritage', 'History'],
    Other: ['Local highlight'],
  };
  return [...new Set(curated.length ? curated : defaults[category])].slice(0, 4);
}

export function getActivityPhotoSources(activity = {}) {
  const sources = [
    ...(activity.imageUrl ? [{ url: activity.imageUrl }] : []),
    ...(Array.isArray(activity.photos) ? activity.photos : []),
  ].map((photo) => typeof photo === 'string' ? { url: photo } : photo);
  return [...new Map(sources.filter((photo) => photo?.url).map((photo) => [photo.url, photo])).values()];
}

export function getActivityStopId(activity = {}, day, activityIndex) {
  return String(activity.refId || `${day}:${activityIndex}:${activity.name || 'stop'}`);
}

export function getActivityPhotos(activity = {}) {
  return [...new Set(getActivityPhotoSources(activity).map((photo) => photo.url))];
}
