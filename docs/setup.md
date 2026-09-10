## Requirements

- Node.js 18 or newer
- MongoDB connection string
- Gemini API key
- Google Maps API key with Geocoding and Directions enabled
- Geoapify API key for routing/geocoding fallback

## Install

From the repository root:

```bash
npm run setup
```

Copy `.env.example` to `.env` and fill in the values. Secrets stay in the
server environment; the Vite client only uses the API proxy settings.

## Database setup

Import the authoritative CSV datasets and create their indexes:

```bash
npm run import:data
npm run create:indexes
```

The importer streams all CSV files in batches and does not load the large
restaurant dataset into memory.

## Run locally

Use two terminals:

```bash
npm run server
npm run client
```

Open `http://localhost:5173`. The API health check is available at
`http://localhost:5000/health`.

Authentication uses the development OTP `123456`; no SMS provider is called.

## Production notes

Set `NODE_ENV=production`, provide every required secret, restrict `CLIENT_URL`
to the deployed frontend origin, and never commit `.env` or API keys.
