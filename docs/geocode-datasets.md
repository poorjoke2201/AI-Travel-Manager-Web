# Geocoding Hotels and Restaurants

`scripts/geocode_datasets.py` adds `latitude`, `longitude`, and `geocoded_address` to both datasets using Geoapify's geocoding API.

The repository's filenames are:

- `data/master_restaurants.csv`
- `data/master_hotels.csv`

The script accepts custom paths, so `master_restaurant.csv` also works if that is the filename on your machine.

## One-time setup

From the repository root:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements-geocoding.txt
$env:GEOAPIFY_GEOCODING_API_KEY = "your_geoapify_key"
```

You can also put the key in the project `.env` as `GEOAPIFY_GEOCODING_API_KEY=...`; the Python script itself reads the process environment, so loading `.env` manually in PowerShell is required if you choose that route:

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^GEOAPIFY_GEOCODING_API_KEY=(.*)$') { $env:GEOAPIFY_GEOCODING_API_KEY = $Matches[1] }
}
```

## Safe first run

By default, source files are preserved and these files are created:

```text
data/master_restaurants_geocoded.csv
data/master_hotels_geocoded.csv
data/geocoding_cache.json
```

Run:

```powershell
py scripts\geocode_datasets.py
```

The cache makes reruns much cheaper. Existing valid coordinates are preserved, and duplicate location queries are sent only once. Failed lookups are cached too, so inspect or remove `data/geocoding_cache.json` before retrying after correcting a bad address.

## Custom restaurant filename

```powershell
py scripts\geocode_datasets.py --restaurants data\master_restaurant.csv
```

## Replace the original files

Review the generated files first. Then either copy them over the originals manually or let the script overwrite them explicitly:

```powershell
py scripts\geocode_datasets.py --in-place
```

Make a backup before using `--in-place`:

```powershell
Copy-Item data\master_restaurants.csv data\master_restaurants.csv.bak
Copy-Item data\master_hotels.csv data\master_hotels.csv.bak
```

## Import coordinates into MongoDB

After reviewing the CSV output, run the existing importer:

```powershell
node scripts\importDatasets.js hotels restaurants
```

The importer now copies the CSV coordinates into `latitude`, `longitude`, and a GeoJSON `location` field. That GeoJSON field is what the `2dsphere` indexes use for map and distance queries.

## What the query contains

- Restaurants: `name, area, city, India`
- Hotels: `name, address when present, city, India`

A city-only query is used when a row has no usable name or address. The script restricts results to India, retries temporary errors and rate limits, and records Geoapify's matched address for review.
