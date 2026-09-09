const { env, validateEnv } = require('./src/config/env');
const { connectDB } = require('./src/config/db');
const logger = require('./src/utils/logger');
const app = require('./src/app');

async function start() {
  validateEnv();
  await connectDB();

  const server = app.listen(env.port, () => {
    logger.info(`Travel Manager API listening on port ${env.port} [${env.nodeEnv}]`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)));
  });
}

start().catch((err) => {
  logger.error('Fatal error during startup', err);
  process.exit(1);
});