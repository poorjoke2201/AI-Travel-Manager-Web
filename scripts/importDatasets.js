/**
 * scripts/importDatasets.js
 *
 * Reads data/master_pois.csv, master_hotels.csv, master_restaurants.csv,
 * inspects their actual columns, normalizes types, and upserts into
 * MongoDB collections `pois`, `hotels`, `restaurants`.
 *
 * - Streams the CSVs (fs.createReadStream + csv-parse) so the large
 *   restaurant dataset is never fully loaded into memory.
 * - Idempotent: upserts by the dataset's own id column (poi_id / hotel_id /
 *   restaurant_id), so re-running the import is safe.
 * - Never invents columns - only fields that actually exist in each CSV's
 *   header row are mapped.
 * - Strips stray leading '**' seen in some header/value cells of the
 *   source files (copy/paste artifact) before normalizing.
 *
 * Usage:
 *   node scripts/importDatasets.js            # imports all 3
 *   node scripts/importDatasets.js pois        # imports just one
 *   node scripts/importDatasets.js hotels
 *   node scripts/importDatasets.js restaurants
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { env } = require('../server/src/config/env');
const logger = require('../server/src/utils/logger');
const POI = require('../server/src/models/POI');
const Hotel = require('../server/src/models/Hotel');
const Restaurant = require('../server/src/models/Restaurant');
const {
  toCleanStringOrNull,
  toNumberOrNull,
  toBooleanOrNull,
  toArrayOrEmpty,
  toGeoPointOrNull,
  toTitleCaseOrNull,
} = require('../server/src/utils/normalization');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BATCH_SIZE = 500;

/** Strips stray leading '**' from CSV header names (also handled defensively for values). */
function cleanHeader(header) {
  return header.replace(/^\*+/, '').trim();
}

// ---------------------------------------------------------------------------
// Row mappers: raw CSV row (object keyed by cleaned header) -> Mongo doc shape
// ---------------------------------------------------------------------------

function mapPoiRow(row) {
  const sourceId = toNumberOrNull(row.poi_id);
  if (sourceId === null) return null; // no valid id -> can't upsert safely, skip

  const lat = toNumberOrNull(row.latitude);
  const lng = toNumberOrNull(row.longitude);
  const location = toGeoPointOrNull(row.latitude, row.longitude);

  return {
    sourceId,
    name: toCleanStringOrNull(row.name) || `Unnamed POI ${sourceId}`,
    city: toTitleCaseOrNull(row.city),
    state: toTitleCaseOrNull(row.state),
    zone: toCleanStringOrNull(row.zone),
    country: toCleanStringOrNull(row.country) || 'India',
    address: toCleanStringOrNull(row.address),

    latitude: lat,
    longitude: lng,
    ...(location ? { location } : {}),

    category: toCleanStringOrNull(row.category),
    poiType: toCleanStringOrNull(row.poi_type),
    significance: toCleanStringOrNull(row.significance),
    characteristics: toCleanStringOrNull(row.characteristics),
    tags: toArrayOrEmpty(row.tags, '|'),

    entryFeeInr: toNumberOrNull(row.entry_fee_inr),
    visitDurationHrs: toNumberOrNull(row.visit_duration_hrs),

    googleRating: toNumberOrNull(row.google_rating),
    reviewCountLakhs: toNumberOrNull(row.review_count_lakhs),

    weeklyOff: toCleanStringOrNull(row.weekly_off),
    hasAirportNearby: toBooleanOrNull(row.has_airport_nearby),
    dslrAllowed: toBooleanOrNull(row.dslr_allowed),
    bestTimeToVisit: toCleanStringOrNull(row.best_time_to_visit),
    indoorOutdoor: (() => {
      const v = toCleanStringOrNull(row.indoor_outdoor);
      return v ? v.toLowerCase() : null;
    })(),

    openingTime: toCleanStringOrNull(row.opening_time),
    closingTime: toCleanStringOrNull(row.closing_time),
    establishmentYear: toCleanStringOrNull(row.establishment_year),

    description: toCleanStringOrNull(row.description),
    source: 'dataset',
    sourceRef: toCleanStringOrNull(row.source_id),
    lastUpdated: (() => {
      const v = toCleanStringOrNull(row.last_updated);
      const d = v ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? d : null;
    })(),
  };
}

function mapHotelRow(row) {
  const sourceId = toNumberOrNull(row.hotel_id);
  if (sourceId === null) return null;

  const name = toCleanStringOrNull(row.name);

  return {
    sourceId,
    name: name || `Unnamed Hotel ${sourceId}`,
    city: toTitleCaseOrNull(row.city),
    googleRating: toNumberOrNull(row.google_rating),
    totalReviews: toNumberOrNull(row.total_reviews),
    pricePerNightInr: toNumberOrNull(row.price_per_night_inr),
    conditionLabel: toCleanStringOrNull(row.condition_label),
    amenities: toArrayOrEmpty(row.amenities, ','),
    description: toCleanStringOrNull(row.description),
    source: toCleanStringOrNull(row.source),
  };
}

function mapRestaurantRow(row) {
  const sourceId = toNumberOrNull(row.restaurant_id);
  if (sourceId === null) return null;

  return {
    sourceId,
    name: toCleanStringOrNull(row.name) || `Unnamed Restaurant ${sourceId}`,
    city: toTitleCaseOrNull(row.city),
    area: toCleanStringOrNull(row.area),
    cuisine: toArrayOrEmpty(row.cuisine, ','),
    rating: toNumberOrNull(row.rating),
    isPureVeg: toBooleanOrNull(row.is_pure_veg),
    avgPriceForTwo: toNumberOrNull(row.avg_price_for_two),
    avgDeliveryTimeMins: toNumberOrNull(row.avg_delivery_time),
    source: toCleanStringOrNull(row.source),
  };
}

const DATASET_CONFIG = {
  pois: {
    file: 'master_pois.csv',
    model: POI,
    mapRow: mapPoiRow,
    label: 'POIs',
  },
  hotels: {
    file: 'master_hotels.csv',
    model: Hotel,
    mapRow: mapHotelRow,
    label: 'Hotels',
  },
  restaurants: {
    file: 'master_restaurants.csv',
    model: Restaurant,
    mapRow: mapRestaurantRow,
    label: 'Restaurants',
  },
};

// ---------------------------------------------------------------------------
// Streaming import for one dataset
// ---------------------------------------------------------------------------

async function importDataset(key) {
  const config = DATASET_CONFIG[key];
  if (!config) throw new Error(`Unknown dataset key: ${key}`);

  const filePath = path.join(DATA_DIR, config.file);
  if (!fs.existsSync(filePath)) {
    logger.warn(`Skipping ${config.label}: file not found at ${filePath}`);
    return { key, ...emptyStats() };
  }

  logger.info(`Importing ${config.label} from ${config.file} ...`);

  const stats = emptyStats();
  let batch = [];

  const parser = fs.createReadStream(filePath).pipe(
    parse({
      columns: (headerRow) => headerRow.map(cleanHeader),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    })
  );

  const flushBatch = async () => {
    if (!batch.length) return;
    const ops = batch.map((doc) => ({
      updateOne: {
        filter: { sourceId: doc.sourceId },
        update: { $set: doc },
        upsert: true,
      },
    }));
    const result = await config.model.bulkWrite(ops, { ordered: false });
    stats.inserted += result.upsertedCount || 0;
    stats.updated += result.modifiedCount || 0;
    batch = [];
  };

  for await (const rawRow of parser) {
    stats.totalRows += 1;
    let doc;
    try {
      doc = config.mapRow(rawRow);
    } catch (err) {
      stats.errors += 1;
      logger.debug(`Row mapping error in ${config.label} row ${stats.totalRows}`, err);
      continue;
    }

    if (!doc) {
      stats.skippedInvalid += 1;
      continue;
    }

    batch.push(doc);
    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }
  await flushBatch();

  logger.info(
    `${config.label} import complete: ${stats.totalRows} rows read, ` +
      `${stats.inserted} inserted, ${stats.updated} updated, ` +
      `${stats.skippedInvalid} skipped (missing id), ${stats.errors} errors.`
  );

  return { key, ...stats };
}

function emptyStats() {
  return { totalRows: 0, inserted: 0, updated: 0, skippedInvalid: 0, errors: 0 };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const requested = process.argv.slice(2);
  const keys = requested.length ? requested : Object.keys(DATASET_CONFIG);

  const invalid = keys.filter((k) => !DATASET_CONFIG[k]);
  if (invalid.length) {
    throw new Error(`Unknown dataset(s): ${invalid.join(', ')}. Valid: ${Object.keys(DATASET_CONFIG).join(', ')}`);
  }

  if (!env.mongoUri) {
    throw new Error('MONGO_URI is not set. Add it to .env before running the import.');
  }

  await mongoose.connect(env.mongoUri);
  logger.info('Connected to MongoDB for import.');

  const results = [];
  for (const key of keys) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await importDataset(key));
  }

  console.log('\n=== Import Summary ===');
  console.table(
    results.map((r) => ({
      dataset: r.key,
      rowsRead: r.totalRows,
      inserted: r.inserted,
      updated: r.updated,
      skipped: r.skippedInvalid,
      errors: r.errors,
    }))
  );

  await mongoose.disconnect();
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Dataset import failed', err);
      process.exit(1);
    });
}

module.exports = { importDataset, mapPoiRow, mapHotelRow, mapRestaurantRow };