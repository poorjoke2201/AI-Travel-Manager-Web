/**
 * Fetches POIs, hotels and restaurants for any destination from OpenStreetMap
 * via the Overpass API and upserts them into MongoDB.
 * Called automatically during trip generation when the destination has fewer
 * than MIN_POI_THRESHOLD POIs in the database.
 */

const https = require('https');
const querystring = require('querystring');
const axios = require('axios');
const logger = require('../../utils/logger');
const POI = require('../../models/POI');
const Hotel = require('../../models/Hotel');
const Restaurant = require('../../models/Restaurant');

const OVERPASS_HOST = 'overpass.kumi.systems';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_POI_THRESHOLD = 8;

const POI_CATEGORY_MAP = {
  museum: 'Cultural & Heritage Sites',
  gallery: 'Cultural & Heritage Sites',
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
  const match = ohStr.match(/(\d{2}:\d{2})\s*[-]\s*(\d{2}:\d{2})/);
  if (match) return { openingTime: match[1], closingTime: match[2] };
  return { openingTime: null, closingTime: null };
}

function parseWeeklyOff(ohStr) {
  if (!ohStr) return null;
  const dayMap = { Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' };
  const m = ohStr.match(/([A-Za-z]{2})\s+off/i);
  return m ? (dayMap[m[1]] || m[1]) : null;
}

function getCoords(el) {
  if (el.type === 'node' && el.lat != null) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

function overpassPost(ql) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({ data: ql });
    const opts = {
      hostname: OVERPASS_HOST,
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'TravelManagerApp/1.0',
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Overpass ${res.statusCode}`));
        try { resolve(JSON.parse(data).elements || []); }
        catch (e) { reject(new Error('Overpass invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Overpass timeout')); });
    req.write(body);
    req.end();
  });
}

async function getCityBbox(city) {
  const { data } = await axios.get(NOMINATIM_URL, {
    params: { q: `${city}, India`, format: 'json', limit: 1 },
    headers: { 'User-Agent': 'TravelManagerApp/1.0' },
    timeout: 10000,
  });
  if (!data.length) throw new Error(`City "${city}" not found in Nominatim`);
  const [minLat, maxLat, minLng, maxLng] = data[0].boundingbox.map(Number);
  const pad = 0.03;
  return { south: minLat - pad, north: maxLat + pad, west: minLng - pad, east: maxLng + pad };
}

async function scrapePOIs(city, bbox) {
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

  const elements = await overpassPost(ql);
  const ops = [];

  for (const el of elements) {
    const tags = el.tags || {};
    const name = (tags.name || tags['name:en'] || '').trim();
    if (name.length < 3) continue;
    const coords = getCoords(el);
    if (!coords) continue;
    const { openingTime, closingTime } = parseOpeningHours(tags.opening_hours);
    const osmId = `osm-${el.type}-${el.id}`;

    ops.push({
      updateOne: {
        filter: { sourceRef: osmId },
        update: {
          $set: {
            name, city, country: 'India',
            latitude: coords.lat, longitude: coords.lng,
            location: { type: 'Point', coordinates: [coords.lng, coords.lat] },
            category: osmTagToCategory(tags),
            poiType: tags.tourism || tags.historic || tags.leisure || tags.amenity || null,
            description: tags.description || null,
            website: tags.website || tags['contact:website'] || null,
            phone: tags.phone || tags['contact:phone'] || null,
            wikipedia: tags.wikipedia || null,
            imageUrl: tags.image || null,
            address: tags['addr:full'] || tags['addr:street'] || null,
            openingTime, closingTime,
            weeklyOff: parseWeeklyOff(tags.opening_hours),
            tags: [tags.tourism, tags.historic, tags.leisure, tags.amenity].filter(Boolean),
            source: 'dataset', sourceRef: osmId,
          },
          $setOnInsert: { sourceId: Date.now() + Math.floor(Math.random() * 10000) },
        },
        upsert: true,
      },
    });
  }

  if (ops.length) {
    const r = await POI.bulkWrite(ops, { ordered: false });
    logger.info(`[scraper] ${city} POIs: ${r.upsertedCount} new, ${r.modifiedCount} updated`);
  }
  return ops.length;
}

async function scrapeHotels(city, bbox) {
  const { south, north, west, east } = bbox;
  const bb = `${south},${west},${north},${east}`;
  const ql = `[out:json][timeout:60];
(
  node["tourism"~"hotel|guest_house|hostel|resort|motel"](${bb});
  way["tourism"~"hotel|guest_house|hostel|resort|motel"](${bb});
);
out center tags;`;

  const elements = await overpassPost(ql);
  const ops = [];

  for (const el of elements) {
    const tags = el.tags || {};
    const name = (tags.name || tags['name:en'] || '').trim();
    if (name.length < 3) continue;
    const coords = getCoords(el);
    const stars = tags.stars ? parseFloat(tags.stars) : null;

    ops.push({
      updateOne: {
        filter: { name, city },
        update: {
          $set: {
            name, city,
            googleRating: stars ? Math.min(stars * 2, 10) : null,
            amenities: [tags.tourism].filter(Boolean),
            description: tags.description || null,
            website: tags.website || tags['contact:website'] || null,
            phone: tags.phone || tags['contact:phone'] || null,
            source: 'osm',
            ...(coords ? { location: { type: 'Point', coordinates: [coords.lng, coords.lat] } } : {}),
          },
          $setOnInsert: { sourceId: Date.now() + Math.floor(Math.random() * 10000) },
        },
        upsert: true,
      },
    });
  }

  if (ops.length) {
    const r = await Hotel.bulkWrite(ops, { ordered: false });
    logger.info(`[scraper] ${city} Hotels: ${r.upsertedCount} new, ${r.modifiedCount} updated`);
  }
  return ops.length;
}

async function scrapeRestaurants(city, bbox) {
  const { south, north, west, east } = bbox;
  const bb = `${south},${west},${north},${east}`;
  const ql = `[out:json][timeout:60];
(
  node["amenity"~"restaurant|cafe|fast_food|food_court"](${bb});
  way["amenity"~"restaurant|cafe|fast_food|food_court"](${bb});
);
out center tags;`;

  const elements = await overpassPost(ql);
  const ops = [];

  for (const el of elements) {
    const tags = el.tags || {};
    const name = (tags.name || tags['name:en'] || '').trim();
    if (name.length < 3) continue;
    const coords = getCoords(el);
    const { openingTime, closingTime } = parseOpeningHours(tags.opening_hours);
    const cuisine = tags.cuisine ? tags.cuisine.split(/[;,]/).map((c) => c.trim()).filter(Boolean) : [];

    ops.push({
      updateOne: {
        filter: { name, city },
        update: {
          $set: {
            name, city,
            area: tags['addr:suburb'] || tags['addr:neighbourhood'] || null,
            cuisine,
            isPureVeg: tags['diet:vegetarian'] === 'yes' || null,
            description: tags.description || null,
            website: tags.website || tags['contact:website'] || null,
            phone: tags.phone || tags['contact:phone'] || null,
            source: 'osm',
            openingTime, closingTime,
            ...(coords ? { location: { type: 'Point', coordinates: [coords.lng, coords.lat] } } : {}),
          },
          $setOnInsert: { sourceId: Date.now() + Math.floor(Math.random() * 10000) },
        },
        upsert: true,
      },
    });
  }

  if (ops.length) {
    const r = await Restaurant.bulkWrite(ops, { ordered: false });
    logger.info(`[scraper] ${city} Restaurants: ${r.upsertedCount} new, ${r.modifiedCount} updated`);
  }
  return ops.length;
}

/**
 * Called during trip generation. Checks if the city already has enough data;
 * if not, scrapes OSM and upserts. Never throws — scrape failure must not
 * block trip generation.
 */
async function enrichCityDataIfNeeded(city) {
  try {
    const existingCount = await POI.countDocuments({ city: new RegExp(`^${city}$`, 'i') });
    if (existingCount >= MIN_POI_THRESHOLD) {
      logger.info(`[scraper] ${city} has ${existingCount} POIs — skipping scrape`);
      return;
    }
    logger.info(`[scraper] ${city} has only ${existingCount} POIs — enriching from OSM...`);
    const bbox = await getCityBbox(city);
    await Promise.all([
      scrapePOIs(city, bbox),
      scrapeHotels(city, bbox),
      scrapeRestaurants(city, bbox),
    ]);
    logger.info(`[scraper] Enrichment complete for ${city}`);
  } catch (err) {
    logger.warn(`[scraper] Enrichment failed for "${city}" — continuing with existing data`, err.message);
  }
}

module.exports = { enrichCityDataIfNeeded };
