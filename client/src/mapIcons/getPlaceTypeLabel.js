const LABEL_MAP = {
  hindu_temple: 'Hindu Temple',
  church: 'Church',
  mosque: 'Mosque',
  gurudwara: 'Gurudwara',
  jain_temple: 'Jain Temple',
  buddhist_monastery: 'Buddhist Monastery',
  religious_general: 'Place of Worship',
  museum: 'Museum',
  art_gallery: 'Art Gallery',
  fort: 'Fort',
  palace: 'Palace',
  monument: 'Monument',
  heritage_general: 'Heritage Site',
  beach: 'Beach',
  park_garden: 'Park',
  viewpoint: 'Viewpoint',
  lake_river: 'Lake or River',
  waterfall: 'Waterfall',
  hill_mountain: 'Hill or Mountain',
  wildlife: 'Wildlife',
  cave: 'Cave',
  amusement_park: 'Amusement Park',
  adventure: 'Adventure Spot',
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  street_food: 'Street Food',
  bar_pub: 'Bar',
  nightlife: 'Nightlife',
  shopping_mall: 'Shopping Mall',
  market_bazaar: 'Market',
  entertainment: 'Entertainment',
  wellness: 'Wellness',
  airport: 'Airport',
  railway: 'Railway',
  bus_station: 'Bus Station',
  metro_station: 'Metro Station',
  ferry_port: 'Ferry Port',
  hotel: 'Hotel',
  generic_poi: 'Place',
};

export function getPlaceTypeLabel(place = {}) {
  const direct = place.typeLabel || place.placeType || place.categoryLabel || place.type;
  if (direct) {
    const asStr = String(direct).trim();
    if (asStr && !asStr.includes('|') && !asStr.startsWith('overture_')) {
      return asStr.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }

  const rawTag = [
    place.subtypeIcon,
    place.subtype,
    place.iconKey,
    place.tag,
    place.tags,
    place.travelCategory,
    place.category,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .find((value) => value.includes('overture') || value.includes('_') || !value.includes(' '));

  const normalized = String(rawTag || '').split('|').slice(-1)[0].replace(/[_-]+/g, ' ').trim();
  const keyed = normalized && LABEL_MAP[normalized.toLowerCase().replace(/\s+/g, '_')];
  if (keyed) return keyed;

  if (normalized) return normalized.replace(/\b\w/g, (char) => char.toUpperCase());

  return LABEL_MAP[place.travelCategory] || LABEL_MAP[place.category] || 'Place';
}

export default getPlaceTypeLabel;
