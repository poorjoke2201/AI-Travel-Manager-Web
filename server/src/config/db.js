const mongoose = require('mongoose');
const { env } = require('./env');
const logger = require('../utils/logger');

let isConnected = false;

async function connectDB() {
  if (isConnected) return mongoose.connection;

  if (!env.mongoUri) {
    logger.warn('MONGO_URI is not set. Skipping DB connection (dev boot without DB).');
    return null;
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(env.mongoUri, {
      autoIndex: !env.isProduction, // avoid rebuilding indexes on every boot in prod
    });
    isConnected = true;
    logger.info(`MongoDB connected -> ${mongoose.connection.host}/${mongoose.connection.name}`);

    mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', err));
    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected');
    });

    return mongoose.connection;
  } catch (err) {
    logger.error('Failed to connect to MongoDB', err);
    throw err;
  }
}

async function disconnectDB() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}

module.exports = { connectDB, disconnectDB };