const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { env } = require('./config/env');
const notFound = require('./middleware/notFound.middleware');
const errorHandler = require('./middleware/error.middleware');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.isProduction ? 'combined' : 'dev'));

// General API rate limit; auth routes additionally get a stricter limiter
// applied at the router level (see routes/auth.routes.js) to slow OTP abuse.
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/health', (req, res) => {
  res.json({ success: true, service: 'travel-manager-api', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// API routes. Each router is mounted here as it's built out module by module.
// mountIfPresent only tolerates the router file not existing yet (so this
// app boots incrementally across build batches) - any real error inside an
// existing route file (syntax error, bad require, etc.) is rethrown so it's
// never silently swallowed.
// ---------------------------------------------------------------------------
function mountIfPresent(basePath, modulePath) {
  let router;
  try {
    router = require(modulePath); // eslint-disable-line global-require, import/no-dynamic-require
  } catch (err) {
    const isMissingThisModule =
      err.code === 'MODULE_NOT_FOUND' && err.message.includes(modulePath.split('/').pop());
    if (isMissingThisModule) return; // not built yet - skip for now
    throw err; // real bug in an existing route file - fail loudly
  }
  app.use(basePath, router);
}

mountIfPresent('/api/auth', './routes/auth.routes');
mountIfPresent('/api/cities', './routes/cities.routes');
mountIfPresent('/api/trips', './routes/trip.routes');
mountIfPresent('/api/explore', './routes/explore.routes');
mountIfPresent('/api/public', './routes/publicTrip.routes');
mountIfPresent('/api/maps', './routes/maps.routes');
mountIfPresent('/api/chat', './routes/chat.routes');
mountIfPresent('/api', './routes/expense.routes');
mountIfPresent('/api', './routes/planning.routes');
mountIfPresent('/api/search', './routes/search.routes');

app.use(notFound);
app.use(errorHandler);

module.exports = app;