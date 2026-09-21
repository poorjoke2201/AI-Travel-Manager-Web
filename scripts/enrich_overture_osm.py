"""
enrich_overture_osm.py
======================
One-time offline enrichment of pois_overture.csv using the Geofabrik
India OSM extract.

What it fills
-------------
  opening_time / closing_time / weekly_off  — parsed from opening_hours tag
  entry_fee_inr                             — from fee / charge tags
  establishment_year                        — from start_date tag
  website                                   — from website tag
  wikidata                                  — from wikidata tag (for next step)
  wikipedia                                 — from wikipedia tag
  description                               — from description tag
  significance                              — from heritage / designation tags

Output
------
  data/osm_enrichment.csv
  Columns: poi_id, source_id, + one column per enriched field above.
  Only rows where at least one field was found are written.
  The import script merges this on top of pois_overture.csv.

Prerequisites
-------------
    pip install osmium pandas pyarrow

Download the India PBF first (one-time, ~700 MB):
    wget https://download.geofabrik.de/asia/india-latest.osm.pbf -P data/

Usage
-----
    python scripts/enrich_overture_osm.py
    python scripts/enrich_overture_osm.py --pbf data/india-latest.osm.pbf
"""

import argparse
import math
import os
import re
import sys

import osmium
import pandas as pd

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_PBF = os.path.join(BASE_DIR, "data", "india-latest.osm.pbf")
INPUT_CSV   = os.path.join(BASE_DIR, "data", "pois_overture.csv")
OUTPUT_CSV  = os.path.join(BASE_DIR, "data", "osm_enrichment.csv")

MATCH_RADIUS_KM = 0.15   # 150 m — tight to avoid wrong-place matches
NAME_MIN_SCORE  = 0.6    # Jaccard token overlap threshold

# ── opening_hours parser ──────────────────────────────────────────────────────
# Handles the most common OSM patterns; ignores complex conditional rules.

_TIME_RE   = re.compile(r"(\d{1,2}:\d{2})")
_CLOSED_RE = re.compile(r"\b(off|closed|PH off)\b", re.IGNORECASE)
_DAY_ABBR  = {"Mo": "Monday", "Tu": "Tuesday", "We": "Wednesday",
               "Th": "Thursday", "Fr": "Friday", "Sa": "Saturday", "Su": "Sunday"}


def parse_opening_hours(raw):
    """
    Returns dict with keys: opening_time, closing_time, weekly_off (all str or None).
    """
    result = {"opening_time": None, "closing_time": None, "weekly_off": None}
    if not raw:
        return result

    raw = str(raw).strip()
    if raw.lower() in ("24/7", "24/7;"):
        result["opening_time"] = "00:00"
        result["closing_time"] = "23:59"
        return result

    times = _TIME_RE.findall(raw)
    if len(times) >= 2:
        result["opening_time"] = times[0]
        result["closing_time"] = times[-1]

    # weekly off: look for "Mo off", "Tu-We off", "PH off" etc.
    off_days = []
    for part in raw.split(";"):
        part = part.strip()
        if _CLOSED_RE.search(part):
            for abbr, full in _DAY_ABBR.items():
                if abbr in part:
                    off_days.append(full)
    if off_days:
        result["weekly_off"] = ", ".join(off_days)

    return result


def parse_fee(tags):
    """Return numeric INR fee or None."""
    fee_tag = tags.get("fee") or tags.get("charge") or ""
    if fee_tag.lower() in ("no", "free", "0"):
        return 0
    # try to extract a number
    m = re.search(r"(\d+)", fee_tag)
    if m:
        return int(m.group(1))
    return None


def parse_significance(tags):
    heritage = tags.get("heritage") or tags.get("heritage:operator") or ""
    designation = tags.get("designation") or ""
    combined = f"{heritage} {designation}".strip()
    if not combined:
        return None
    if re.search(r"UNESCO|world.heritage", combined, re.IGNORECASE):
        return "UNESCO World Heritage Site"
    if re.search(r"ASI|archaeological.survey", combined, re.IGNORECASE):
        return "ASI Protected Monument"
    if re.search(r"state|national", combined, re.IGNORECASE):
        return "State/National Heritage"
    return combined[:120] or None


# ── Haversine ─────────────────────────────────────────────────────────────────

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


# ── name similarity ───────────────────────────────────────────────────────────

def jaccard(a, b):
    ta = set(re.sub(r"[^\w\s]", "", a.lower()).split())
    tb = set(re.sub(r"[^\w\s]", "", b.lower()).split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


# ── OSM handler ───────────────────────────────────────────────────────────────

WANTED_TAGS = {
    "tourism", "historic", "amenity", "leisure",
    "opening_hours", "fee", "charge",
    "wikidata", "wikipedia", "start_date",
    "website", "description", "heritage",
    "heritage:operator", "designation",
}

WANTED_TOURISM = {
    "museum", "gallery", "attraction", "viewpoint", "theme_park",
    "zoo", "aquarium", "artwork", "monument", "memorial",
}
WANTED_HISTORIC = {
    "monument", "memorial", "castle", "ruins", "archaeological_site",
    "fort", "palace", "building", "yes",
}
WANTED_AMENITY = {"place_of_worship", "theatre", "cinema"}
WANTED_LEISURE = {"park", "nature_reserve", "garden", "beach"}


class OSMIndex(osmium.SimpleHandler):
    """Builds a list of (lat, lon, name, tags_dict) for relevant OSM features."""

    def __init__(self):
        super().__init__()
        self.features = []

    def _accept(self, tags):
        t = tags.get("tourism", "")
        h = tags.get("historic", "")
        a = tags.get("amenity", "")
        l = tags.get("leisure", "")
        return (t in WANTED_TOURISM or h in WANTED_HISTORIC
                or a in WANTED_AMENITY or l in WANTED_LEISURE)

    def _record(self, lat, lon, tags):
        name = tags.get("name") or tags.get("name:en") or ""
        if len(name) < 3:
            return
        self.features.append({
            "lat":  lat,
            "lon":  lon,
            "name": name,
            "tags": {k: tags.get(k, "") for k in WANTED_TAGS if tags.get(k)},
        })

    def node(self, n):
        if not n.location.valid():
            return
        if self._accept(n.tags):
            self._record(n.location.lat, n.location.lon, n.tags)

    def way(self, w):
        try:
            c = w.nodes[len(w.nodes) // 2].location
            if c.valid() and self._accept(w.tags):
                self._record(c.lat, c.lon, w.tags)
        except Exception:
            pass

    def relation(self, r):
        # relations don't have a single coordinate; skip
        pass


# ── spatial grid for fast lookup ──────────────────────────────────────────────

def build_grid(features, cell_deg=0.05):
    """Bucket features into a lat/lon grid for O(1) neighbourhood lookup."""
    grid = {}
    for feat in features:
        key = (round(feat["lat"] / cell_deg), round(feat["lon"] / cell_deg))
        grid.setdefault(key, []).append(feat)
    return grid, cell_deg


def nearby_features(grid, cell_deg, lat, lon, radius_km):
    """Return OSM features within radius_km of (lat, lon)."""
    deg_span = math.ceil(radius_km / 111.0 / cell_deg) + 1
    clat = round(lat / cell_deg)
    clon = round(lon / cell_deg)
    candidates = []
    for dlat in range(-deg_span, deg_span + 1):
        for dlon in range(-deg_span, deg_span + 1):
            candidates.extend(grid.get((clat + dlat, clon + dlon), []))
    return [f for f in candidates
            if haversine_km(lat, lon, f["lat"], f["lon"]) <= radius_km]


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pbf", default=DEFAULT_PBF)
    args = parser.parse_args()

    if not os.path.exists(args.pbf):
        print(f"ERROR: PBF not found at {args.pbf}")
        print("Download it with:")
        print("  wget https://download.geofabrik.de/asia/india-latest.osm.pbf -P data/")
        sys.exit(1)

    if not os.path.exists(INPUT_CSV):
        print(f"ERROR: {INPUT_CSV} not found. Run build_overture_pois.py first.")
        sys.exit(1)

    print(f"[1/4] Loading Overture POIs from {INPUT_CSV} …")
    pois = pd.read_csv(INPUT_CSV, dtype=str).fillna("")
    print(f"    {len(pois):,} POIs loaded")

    print(f"[2/4] Parsing OSM PBF: {args.pbf} …")
    handler = OSMIndex()
    handler.apply_file(args.pbf, locations=True)
    print(f"    {len(handler.features):,} OSM features indexed")

    grid, cell_deg = build_grid(handler.features)

    print("[3/4] Matching and enriching …")
    enriched_rows = []

    for _, poi in pois.iterrows():
        try:
            lat = float(poi["latitude"])
            lon = float(poi["longitude"])
        except (ValueError, KeyError):
            continue

        candidates = nearby_features(grid, cell_deg, lat, lon, MATCH_RADIUS_KM)
        if not candidates:
            continue

        # pick best name match
        best = max(candidates, key=lambda f: jaccard(poi["name"], f["name"]))
        if jaccard(poi["name"], best["name"]) < NAME_MIN_SCORE:
            continue

        tags = best["tags"]
        hours = parse_opening_hours(tags.get("opening_hours"))
        fee   = parse_fee(tags)
        sig   = parse_significance(tags)

        row = {
            "poi_id":             poi["poi_id"],
            "source_id":          poi["source_id"],
            "opening_time":       hours["opening_time"] or "",
            "closing_time":       hours["closing_time"] or "",
            "weekly_off":         hours["weekly_off"] or "",
            "entry_fee_inr":      "" if fee is None else str(fee),
            "establishment_year": tags.get("start_date", "")[:4] if tags.get("start_date") else "",
            "website":            tags.get("website", ""),
            "wikidata":           tags.get("wikidata", ""),
            "wikipedia":          tags.get("wikipedia", ""),
            "description":        tags.get("description", "")[:500],
            "significance":       sig or "",
        }

        # only write if at least one useful field was found
        useful = any(row[k] for k in (
            "opening_time", "entry_fee_inr", "establishment_year",
            "website", "wikidata", "wikipedia", "description", "significance"
        ))
        if useful:
            enriched_rows.append(row)

    print(f"    Matched and enriched: {len(enriched_rows):,} POIs")

    print(f"[4/4] Writing {OUTPUT_CSV} …")
    if enriched_rows:
        pd.DataFrame(enriched_rows).to_csv(OUTPUT_CSV, index=False)
        print("Done.")
    else:
        print("No matches found — check PBF coverage or MATCH_RADIUS_KM.")


if __name__ == "__main__":
    main()
