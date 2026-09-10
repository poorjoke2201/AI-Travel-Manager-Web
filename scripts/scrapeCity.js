/**
 * scripts/scrapeCity.js
 *
 * Scrapes POIs, hotels, and restaurants for a given city from OpenStreetMap
 * via the Overpass API (free, no key required) and upserts them into MongoDB.
 *
 * Usage:
 *   node scripts/scrapeCity.js Mysore
 *   node scripts/scrapeCity.js Goa
 *   node scripts/scrapeCity.js Delhi
 */

const axios = require('axios');
const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { env } = require('../server/src/config/env');
const logger = require('../server/src/utils/logger');
const POI = require('../server/src/models/POI');
const Hotel = require('../server/src/models/Hotel');
const Restaurant = require('../server/src/models/Restaurant');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

const POI_CATEGORY_MAP = {
  museum: 'Cultural & Heritage Sites',
  gallery: 'Cultural & Heritage Sites',
  artwork: 'Cultural & Heritage Sites',
  monument: 'Cultural & Heritage Sites',
  memorial: 'Cultural & Heritage Sites',
  castle: 'Cultural & Heritage Sites',
  ruins: 'Cultural & Heritage Sites',
  archaeological_site: 'Cultural & Heritage Sites',
  place_of_worship: 'Religious & Spiritual Pilgrimages',
  shrine: 'Religious & Spiritual Pilgrimages',
  park: 'Natural Landscapes & Wildlife',
  nature_reserve: 'Natural Landscapes & Wildlife',
  garden: 'Natural Landscapes & Wildlife',
  beach: 'Natural Landscapes & Wildlife',
  viewpoint: 'Natural Landscapes & Wildlife',
  zoo: 'Natural Landscapes & Wildlife',
  aquarium: 'Natural Landscapes & Wildlife',
  theme_park: 'Adventure & Outdoor Activities',
  attraction: 'Adventure & Outdoor Activities',
  theatre: 'Arts & Entertainment',
  cinema: 'Arts & Entertainment',
};

function osmTagToCategory(tags) {
  for (const field of ['tourism', 'historic', 'leisure', 'amenity']) {
    if (tags[field] && POI_CATEGORY_MAP[tags[field]]) return POI_CATEGORY_MAP[tags[field]];
  }
  return 'Points of Interest';
}

function parseOpeningHours(ohStr) {
  if (!ohStr) return { openingTime: null, closingTime: null };
  const match = ohStr.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
  if (match) return { openingTime: match[1], closingTime: match[2] };
  return { openingTime: null, closingTime: null };
}

function parseWeeklyOff(ohStr) {
  if (!ohStr) return null;
  const dayMap = { Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' };
  const offMatch = ohStr.match(/([A-Za-z]{2})\s+off/i);
  if (offMatch) return dayMap[offMatch[1]] || offMatch[1];
  return null;
}

function getCoords(el) {
  if (el.type === 'node' && el.lat != null) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

// Step 1: get bounding box for city from Nominatim
async function getCityBbox(city) {
  const { data } = await axios.get(NOMINATIM_URL, {
    params: { q: `${city}, India`, format: 'json', limit: 1 },
    headers: { 'User-Agent': 'TravelManagerApp/1.0' },
    timeout: 10000,
  });
  if (!data.length) throw new Error(`City "${city}" not found in Nominatim`);
  const [minLat, maxLat, minLng, maxLng] = data[0].boundingbox.map(Number);
  // Expand bbox slightly for better coverage
  const pad = 0.05;
  return { south: minLat - pad, north: maxLat + pad, west: minLng - pad, east: maxLng + pad };
}

// Step 2: run Overpass query within bbox
async function overpassQuery(ql) {
  const params = new URLSearchParams();
  params.append('data', ql);
  const { data } = await axios.post(OVERPASS_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 90000,
  });
  return data.elements || [];
}

async function scrapePOIs(city, bbox) {
  logger.info(`Scraping POIs for ${city}...`);
  const { south, north, west, east } = bbox;
  const bb = `${south},${west},${north},${east}`;

  const ql = `[out:json][timeout:60];
(
  node["tourism"~"museum|gallery|artwork|attraction|viewpoint|theme_park|zoo|aquarium"](${bb});
  node["historic"~"monument|memorial|castle|ruins|archaeological_site"](${bb});
  node["leisure"~"park|nature_reserve|garden"](${bb});
  node["amenity"~"place_of_worship|theatre|cinema"](${bb});
  way["tourism"~"museum|gallery|attraction|viewpoint|theme_park|zoo|aquarium"](${bb});
  way["historic"~"monument|memorial|castle|ruins|archaeological_site"](${bb});
  way["leisure"~"park|nature_reserve|garden"](${bb});
  way["amenity"~"place_of_worship|theatre"](${bb});
);
out center tags;`;

  const elements = await overpassQuery(ql);
  const ops = [];

  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || tags['name:en'];
    if (!name || name.trim().length < 3) continue;
    const coords = getCoords(el);
    if (!coords) continue;

    const { openingTime, closingTime } = parseOpeningHours(tags.opening_hours);
    const osmId = `osm-${el.type}-${el.id}`;

    ops.push({
      updateOne: {
        filter: { sourceRef: osmId },
        update: {
          $set: {
            name: name.trim(),
            city,
            country: 'India',
            latitude: coords.lat,
            longitude: coords.lng,
            location: { type: 'Point', coordinates: [coords.lng, coords.lat] },
            category: osmTagToCategory(tags),
            poiType: tags.tourism || tags.historic || tags.leisure || tags.amenity || null,
            description: tags.description || null,
            address: tags['addr:full'] || tags['addr:street'] || null,
            openingTime,
            closingTime,
            weeklyOff: parseWeeklyOff(tags.opening_hours),
            tags: [tags.tourism, tags.historic, tags.leisure, tags.amenity].filter(Boolean),
            source: 'dataset',
            sourceRef: osmId,
          },
          $setOnInsert: { sourceId: Math.floor(Math.random() * 9000000) + 1000000 },
        },
        upsert: true,
      },
    });
  }

  if (ops.length) {
    const result = await POI.bulkWrite(ops, { ordered: false });
    logger.info(`POIs: ${result.upsertedCount} inserted, ${result.modifiedCount} updated (${ops.length} processed)`);
  } else {
    logger.warn(`No POIs found for ${city}`);
  }
  return ops.length;
}

async function scrapeHotels(city, bbox) {
  logger.info(`Scraping hotels for ${city}...`);
  const { south, north, west, east } = bbox;
  const bb = `${south},${west},${north},${east}`;

  const ql = `[out:json][timeout:60];
(
  node["tourism"~"hotel|guest_house|hostel|resort|motel"](${bb});
  way["tourism"~"hotel|guest_house|hostel|resort|motel"](${bb});
);
out center tags;`;

  const elements = await overpassQuery(ql);
  const ops = [];

  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || tags['name:en'];
    if (!name || name.trim().length < 3) continue;
    const coords = getCoords(el);
    const osmId = `osm-${el.type}-${el.id}`;
    const stars = tags.stars ? parseFloat(tags.stars) : null;

    ops.push({
      updateOne: {
        filter: { name: name.trim(), city },
        update: {
          $set: {
            name: name.trim(),
            city,
            googleRating: stars ? Math.min(stars * 2, 10) : null,
            amenities: [tags['addr:street'], tags.phone].filter(Boolean),
            description: tags.description || null,
            source: 'osm',
            ...(coords ? { location: { type: 'Point', coordinates: [coords.lng, coords.lat] } } : {}),
          },
          $setOnInsert: { sourceId: Math.floor(Math.random() * 9000000) + 1000000 },
        },
        upsert: true,
      },
    });
  }

  if (ops.length) {
    const result = await Hotel.bulkWrite(ops, { ordered: false });
    logger.info(`Hotels: ${result.upsertedCount} inserted, ${result.modifiedCount} updated (${ops.length} processed)`);
  } else {
    logger.warn(`No hotels found for ${city}`);
  }
  return ops.length;
}

async function scrapeRestaurants(city, bbox) {
  logger.info(`Scraping restaurants for ${city}...`);
  const { south, north, west, east } = bbox;
  const bb = `${south},${west},${north},${east}`;

  const ql = `[out:json][timeout:60];
(
  node["amenity"~"restaurant|cafe|fast_food|food_court"](${bb});
  way["amenity"~"restaurant|cafe|fast_food|food_court"](${bb});
);
out center tags;`;

  const elements = await overpassQuery(ql);
  const ops = [];

  for (const el of elements) {
    const tags = el.tags || {};
    const name = tags.name || tags['name:en'];
    if (!name || name.trim().length < 3) continue;
    const coords = getCoords(el);
    const osmId = `osm-${el.type}-${el.id}`;
    const { openingTime, closingTime } = parseOpeningHours(tags.opening_hours);
    const cuisine = tags.cuisine
      ? tags.cuisine.split(/[;,]/).map((c) => c.trim()).filter(Boolean)
      : [];

    ops.push({
      updateOne: {
        filter: { name: name.trim(), city },
        update: {
          $set: {
            name: name.trim(),
            city,
            area: tags['addr:suburb'] || tags['addr:neighbourhood'] || null,
            cuisine,
            isPureVeg: tags['diet:vegetarian'] === 'yes' || tags.diet_vegetarian === 'yes' || null,
            source: 'osm',
            openingTime,
            closingTime,
            ...(coords ? { location: { type: 'Point', coordinates: [coords.lng, coords.lat] } } : {}),
          },
          $setOnInsert: { sourceId: Math.floor(Math.random() * 9000000) + 1000000 },
        },
        upsert: true,
      },
    });
  }

  if (ops.length) {
    const result = await Restaurant.bulkWrite(ops, { ordered: false });
    logger.info(`Restaurants: ${result.upsertedCount} inserted, ${result.modifiedCount} updated (${ops.length} processed)`);
  } else {
    logger.warn(`No restaurants found for ${city}`);
  }
  return ops.length;
}

async function main() {
  const city = process.argv[2];
  if (!city) {
    console.error('Usage: node scripts/scrapeCity.js <CityName>');
    process.exit(1);
  }

  await mongoose.connect(env.mongoUri);
  logger.info(`Connected to MongoDB`);

  logger.info(`Resolving bounding box for "${city}"...`);
  const bbox = await getCityBbox(city);
  logger.info(`Bbox: S=${bbox.south.toFixed(3)} N=${bbox.north.toFixed(3)} W=${bbox.west.toFixed(3)} E=${bbox.east.toFixed(3)}`);

  const [pois, hotels, restaurants] = await Promise.all([
    scrapePOIs(city, bbox),
    scrapeHotels(city, bbox),
    scrapeRestaurants(city, bbox),
  ]);

  console.log(`\n=== Scrape complete for ${city} ===`);
  console.log(`POIs: ${pois} | Hotels: ${hotels} | Restaurants: ${restaurants}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error('Scrape failed', err.message);
  process.exit(1);
});
