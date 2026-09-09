/**
 * scripts/createIndexes.js
 *
 * Explicitly syncs indexes defined on each Mongoose schema (2dsphere geo
 * indexes, compound query indexes, text search, uniqueness constraints).
 * Needed because config/db.js disables Mongoose's autoIndex in production
 * for performance - so this must be run manually after deploys / imports.
 *
 * Usage: node scripts/createIndexes.js
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { env } = require('../server/src/config/env');
const logger = require('../server/src/utils/logger');

const User = require('../server/src/models/User');
const Trip = require('../server/src/models/Trip');
const POI = require('../server/src/models/POI');
const Hotel = require('../server/src/models/Hotel');
const Restaurant = require('../server/src/models/Restaurant');

const MODELS = { User, Trip, POI, Hotel, Restaurant };

async function main() {
  if (!env.mongoUri) {
    throw new Error('MONGO_URI is not set. Add it to .env before creating indexes.');
  }

  await mongoose.connect(env.mongoUri);
  logger.info('Connected to MongoDB for index sync.');

  for (const [name, model] of Object.entries(MODELS)) {
    // eslint-disable-next-line no-await-in-loop
    await model.syncIndexes();
    // eslint-disable-next-line no-await-in-loop
    const indexes = await model.collection.indexes();
    logger.info(`Synced indexes for ${name} (${indexes.length} total):`);
    indexes.forEach((idx) => logger.info(`  - ${idx.name}: ${JSON.stringify(idx.key)}`));
  }

  await mongoose.disconnect();
  logger.info('Index sync complete.');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Index creation failed', err);
      process.exit(1);
    });
}