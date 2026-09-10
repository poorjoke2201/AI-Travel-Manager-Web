#!/usr/bin/env python3
"""Add Geoapify coordinates to the hotel and restaurant CSV datasets.

Default behavior writes sibling files ending in ``_geocoded.csv`` and leaves
source CSVs untouched. Use ``--in-place`` only after reviewing the results.

The script is deliberately rerunnable:
- existing valid latitude/longitude values are preserved;
- successful and failed lookups are cached in JSON;
- duplicate queries share one Geoapify request;
- writes use a temporary file before replacing the output.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import requests

API_URL = "https://api.geoapify.com/v1/geocode/search"
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DEFAULT_RESTAURANT_FILE = DEFAULT_DATA_DIR / "master_restaurants.csv"
DEFAULT_HOTEL_FILE = DEFAULT_DATA_DIR / "master_hotels.csv"
DEFAULT_CACHE_FILE = DEFAULT_DATA_DIR / "geocoding_cache.json"
REQUEST_TIMEOUT_SECONDS = 15
DEFAULT_DELAY_SECONDS = 0.5
MAX_RETRIES = 4


def clean_text(value: Any) -> str:
    """Normalize CSV text and remove markdown artifacts from copied data."""
    if value is None:
        return ""
    text = str(value).replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\*+", "", text)
    return " ".join(text.split()).strip()


def clean_header(value: str) -> str:
    return clean_text(value).lower()


def is_valid_coordinate(value: Any, minimum: float, maximum: float) -> bool:
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return False
    return minimum <= number <= maximum


def existing_coordinates(row: dict[str, str]) -> bool:
    return is_valid_coordinate(row.get("latitude"), -90, 90) and is_valid_coordinate(row.get("longitude"), -180, 180)


def build_query(row: dict[str, str], dataset_type: str) -> str:
    name = clean_text(row.get("name"))
    city = clean_text(row.get("city"))
    area = clean_text(row.get("area"))
    address = clean_text(row.get("address"))

    parts: list[str] = []
    if name and name != "-":
        parts.append(name)
    if dataset_type == "restaurant":
        if area and area != "-":
            parts.append(area)
    elif address and address != "-":
        parts.append(address)
    if city and city != "-":
        parts.append(city)
    parts.append("India")
    return ", ".join(parts) if len(parts) > 1 else ""


def load_cache(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        print(f"Warning: could not read cache {path}; starting empty.", file=sys.stderr)
        return {}


def save_cache(path: Path, cache: dict[str, dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(cache, handle, indent=2, ensure_ascii=False)
    temporary.replace(path)


def geocode(session: requests.Session, query: str, api_key: str) -> dict[str, Any]:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = session.get(
                API_URL,
                params={"text": query, "filter": "countrycode:in", "limit": 1, "apiKey": api_key},
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            if response.status_code == 200:
                features = response.json().get("features", [])
                if not features:
                    return {"latitude": None, "longitude": None, "formatted_address": ""}
                properties = features[0].get("properties", {})
                latitude = properties.get("lat")
                longitude = properties.get("lon")
                if not is_valid_coordinate(latitude, -90, 90) or not is_valid_coordinate(longitude, -180, 180):
                    return {"latitude": None, "longitude": None, "formatted_address": ""}
                return {
                    "latitude": float(latitude),
                    "longitude": float(longitude),
                    "formatted_address": clean_text(properties.get("formatted")),
                }

            if response.status_code not in (408, 429) and response.status_code < 500:
                print(f"  Geoapify HTTP {response.status_code}: {response.text[:160]}", file=sys.stderr)
                return {"latitude": None, "longitude": None, "formatted_address": ""}

            wait = min(30, 2 ** attempt)
            print(f"  Temporary Geoapify failure ({response.status_code}); retrying in {wait}s...")
            time.sleep(wait)
        except (requests.RequestException, ValueError) as error:
            if attempt == MAX_RETRIES:
                print(f"  Request failed: {error}", file=sys.stderr)
                break
            wait = min(30, 2 ** attempt)
            print(f"  Request failed; retrying in {wait}s...", file=sys.stderr)
            time.sleep(wait)

    return {"latitude": None, "longitude": None, "formatted_address": ""}


def output_path(input_path: Path, in_place: bool) -> Path:
    if in_place:
        return input_path
    return input_path.with_name(f"{input_path.stem}_geocoded{input_path.suffix}")


def process_file(
    input_path: Path,
    output_file: Path,
    dataset_type: str,
    cache: dict[str, dict[str, Any]],
    session: requests.Session,
    api_key: str,
    delay: float,
) -> dict[str, int]:
    if not input_path.exists():
        raise FileNotFoundError(f"Dataset not found: {input_path}")

    stats = {"rows": 0, "existing": 0, "geocoded": 0, "not_found": 0}
    output_file.parent.mkdir(parents=True, exist_ok=True)
    temporary_handle = tempfile.NamedTemporaryFile("w", encoding="utf-8-sig", newline="", delete=False, dir=output_file.parent)
    temporary_path = Path(temporary_handle.name)
    print(f"Writing progress to temporary file: {temporary_path}", flush=True)

    try:
        with input_path.open("r", encoding="utf-8-sig", newline="") as source, temporary_handle as destination:
            reader = csv.DictReader(source)
            if not reader.fieldnames:
                raise ValueError(f"Dataset has no header: {input_path}")
            reader.fieldnames = [clean_header(field) for field in reader.fieldnames]
            fieldnames = list(reader.fieldnames)
            for field in ("latitude", "longitude", "geocoded_address"):
                if field not in fieldnames:
                    fieldnames.append(field)

            writer = csv.DictWriter(destination, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for raw_row in reader:
                stats["rows"] += 1
                row = {clean_header(key): clean_text(value) for key, value in raw_row.items() if key is not None}

                if existing_coordinates(row):
                    stats["existing"] += 1
                    writer.writerow(row)
                    if stats["rows"] % 100 == 0:
                        destination.flush()
                        print(
                            f"[{dataset_type}] done={stats['rows']} "
                            f"existing={stats['existing']} geocoded={stats['geocoded']} "
                            f"not_found={stats['not_found']}",
                            flush=True,
                        )
                    continue

                query = build_query(row, dataset_type)
                result = cache.get(query) if query else None
                if result is None:
                    result = geocode(session, query, api_key) if query else {"latitude": None, "longitude": None, "formatted_address": ""}
                    if query:
                        cache[query] = result
                        if stats["rows"] % 25 == 0:
                            save_cache(DEFAULT_CACHE_FILE, cache)
                        time.sleep(delay)

                if result.get("latitude") is not None and result.get("longitude") is not None:
                    row["latitude"] = result["latitude"]
                    row["longitude"] = result["longitude"]
                    row["geocoded_address"] = result.get("formatted_address", "")
                    stats["geocoded"] += 1
                else:
                    row.setdefault("latitude", "")
                    row.setdefault("longitude", "")
                    row.setdefault("geocoded_address", "")
                    stats["not_found"] += 1
                writer.writerow(row)
                if stats["rows"] % 100 == 0:
                    destination.flush()
                    save_cache(DEFAULT_CACHE_FILE, cache)
                    print(
                        f"[{dataset_type}] done={stats['rows']} "
                        f"existing={stats['existing']} geocoded={stats['geocoded']} "
                        f"not_found={stats['not_found']}",
                        flush=True,
                    )

        temporary_path.replace(output_file)
        save_cache(DEFAULT_CACHE_FILE, cache)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise

    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-key", default=os.getenv("GEOAPIFY_GEOCODING_API_KEY"), help="Geoapify key; defaults to GEOAPIFY_GEOCODING_API_KEY")
    parser.add_argument("--restaurants", type=Path, default=DEFAULT_RESTAURANT_FILE)
    parser.add_argument("--hotels", type=Path, default=DEFAULT_HOTEL_FILE)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE_FILE)
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS)
    parser.add_argument("--in-place", action="store_true", help="Overwrite source CSVs; default writes *_geocoded.csv")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.api_key or args.api_key == "YOUR_GEOAPIFY_API_KEY":
        print("Error: set GEOAPIFY_GEOCODING_API_KEY or pass --api-key.", file=sys.stderr)
        return 2
    if args.delay < 0:
        print("Error: --delay cannot be negative.", file=sys.stderr)
        return 2

    global DEFAULT_CACHE_FILE
    DEFAULT_CACHE_FILE = args.cache
    cache = load_cache(args.cache)
    session = requests.Session()

    for input_path, dataset_type in ((args.restaurants, "restaurant"), (args.hotels, "hotel")):
        target = output_path(input_path, args.in_place)
        print(f"\nProcessing {input_path} -> {target}")
        try:
            stats = process_file(input_path, target, dataset_type, cache, session, args.api_key, args.delay)
        except (OSError, ValueError) as error:
            print(f"Error: {error}", file=sys.stderr)
            return 1
        print(
            f"Rows: {stats['rows']} | existing: {stats['existing']} | "
            f"geocoded: {stats['geocoded']} | not found: {stats['not_found']}"
        )

    print(f"\nFinished. Cache: {args.cache}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
