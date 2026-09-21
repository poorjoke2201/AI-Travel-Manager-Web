"""
build_overture_pois.py
======================
Queries Overture Maps S3 directly with DuckDB.

Pipeline
--------
1. Pull from S3: bbox + category + confidence filters pushed to S3.
   Extra columns retained: websites, phones, sources list, confidence.
2. Dedupe / merge:
   - Same-name POIs within 300 m (1 500 m for large-area types).
   - Sub-feature names (Entry / Gate / Parking / Counter / Ticket) folded
     into parent when one exists within 500 m.
3. Tier assignment (no external API):
   A  has wikidata/wikipedia tag, or website, or source_count >= 3
   B  source_count >= 2 or confidence >= 0.85
   C  everything else
4. Category priors: visit_duration_hrs, indoor_outdoor, best_time_to_visit,
   entry_fee_inr, opening_time, closing_time — from lookup table.
5. has_airport_nearby: Haversine against static Indian airport list.
6. Output: data/pois_overture.csv  (same 29-col schema as master_pois.csv
   plus tier, confidence, source_count, website, phone columns).

Prerequisites
-------------
    pip install duckdb pandas pyarrow

Usage
-----
    python scripts/build_overture_pois.py
"""

import math
import os
import re
import unicodedata

import duckdb
import pandas as pd
from datetime import date

# ── config ────────────────────────────────────────────────────────────────────
OVERTURE_RELEASE = "2026-08-19.0"
S3_PATH = (
    f"s3://overturemaps-us-west-2/release/{OVERTURE_RELEASE}"
    "/theme=places/type=place/*"
)

BBOX           = {"xmin": 68.1, "xmax": 97.4, "ymin": 6.5, "ymax": 35.5}
MIN_CONFIDENCE = 0.7

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_CSV = os.path.join(BASE_DIR, "data", "pois_overture.csv")

# ── categories ────────────────────────────────────────────────────────────────
WANTED_CATEGORIES = (
    "historical_landmark", "monument", "museum", "art_museum",
    "science_museum", "history_museum", "art_gallery",
    "performing_arts_venue", "tourist_attraction",
    "place_of_worship", "hindu_temple", "mosque", "church",
    "buddhist_temple", "jain_temple", "gurudwara", "shrine", "monastery",
    "national_park", "nature_reserve", "wildlife_sanctuary",
    "park", "botanical_garden", "beach", "waterfall", "lake",
    "mountain", "cave", "fort", "palace", "ruins", "archaeological_site",
    "memorial", "viewpoint", "amusement_park", "theme_park", "water_park",
    "zoo", "aquarium", "stadium", "market", "shopping_mall",
)

CATEGORY_MAP = {
    "historical_landmark":   "Cultural & Heritage Sites",
    "monument":              "Cultural & Heritage Sites",
    "fort":                  "Cultural & Heritage Sites",
    "palace":                "Cultural & Heritage Sites",
    "ruins":                 "Cultural & Heritage Sites",
    "archaeological_site":   "Cultural & Heritage Sites",
    "memorial":              "Cultural & Heritage Sites",
    "cave":                  "Cultural & Heritage Sites",
    "museum":                "Arts, Science & Literature Attractions",
    "art_museum":            "Arts, Science & Literature Attractions",
    "science_museum":        "Arts, Science & Literature Attractions",
    "history_museum":        "Arts, Science & Literature Attractions",
    "art_gallery":           "Arts, Science & Literature Attractions",
    "performing_arts_venue": "Arts, Science & Literature Attractions",
    "place_of_worship":      "Religious & Spiritual Pilgrimages",
    "hindu_temple":          "Religious & Spiritual Pilgrimages",
    "mosque":                "Religious & Spiritual Pilgrimages",
    "church":                "Religious & Spiritual Pilgrimages",
    "buddhist_temple":       "Religious & Spiritual Pilgrimages",
    "jain_temple":           "Religious & Spiritual Pilgrimages",
    "gurudwara":             "Religious & Spiritual Pilgrimages",
    "shrine":                "Religious & Spiritual Pilgrimages",
    "monastery":             "Religious & Spiritual Pilgrimages",
    "national_park":         "Natural Landscapes & Wildlife",
    "nature_reserve":        "Natural Landscapes & Wildlife",
    "wildlife_sanctuary":    "Natural Landscapes & Wildlife",
    "park":                  "Natural Landscapes & Wildlife",
    "botanical_garden":      "Natural Landscapes & Wildlife",
    "beach":                 "Natural Landscapes & Wildlife",
    "waterfall":             "Natural Landscapes & Wildlife",
    "lake":                  "Natural Landscapes & Wildlife",
    "mountain":              "Natural Landscapes & Wildlife",
    "zoo":                   "Natural Landscapes & Wildlife",
    "aquarium":              "Natural Landscapes & Wildlife",
    "tourist_attraction":    "Sightseeing & Exploration",
    "viewpoint":             "Sightseeing & Exploration",
    "amusement_park":        "Adventure & Outdoor Activities",
    "theme_park":            "Adventure & Outdoor Activities",
    "water_park":            "Adventure & Outdoor Activities",
    "stadium":               "Sports & Recreation",
    "market":                "Shopping & Markets",
    "shopping_mall":         "Shopping & Markets",
}

# ── large-area types use a wider dedup radius ─────────────────────────────────
LARGE_AREA_CATS = {"beach", "park", "lake", "mountain", "national_park",
                   "nature_reserve", "wildlife_sanctuary", "botanical_garden"}

# ── sub-feature name patterns ─────────────────────────────────────────────────
SUB_FEATURE_RE = re.compile(
    r"\b(entry|gate|parking|counter|ticket|exit|entrance|point|booth)\b",
    re.IGNORECASE,
)

# ── category priors ───────────────────────────────────────────────────────────
# (visit_duration_hrs, indoor_outdoor, best_time_to_visit,
#  entry_fee_inr_free, opening_time, closing_time)
# entry_fee_inr_free=True means we set 0; False means leave null (unknown).
CATEGORY_PRIORS = {
    "beach":                (1.5,  "outdoor",  "Morning",   True,  "06:00", "20:00"),
    "park":                 (1.5,  "outdoor",  "Morning",   True,  "06:00", "20:00"),
    "botanical_garden":     (1.5,  "outdoor",  "Morning",   False, "09:00", "17:00"),
    "national_park":        (3.0,  "outdoor",  "Morning",   False, "06:00", "18:00"),
    "nature_reserve":       (2.5,  "outdoor",  "Morning",   False, "06:00", "18:00"),
    "wildlife_sanctuary":   (3.0,  "outdoor",  "Morning",   False, "06:00", "18:00"),
    "waterfall":            (1.0,  "outdoor",  "Morning",   True,  "06:00", "18:00"),
    "lake":                 (1.0,  "outdoor",  "Evening",   True,  "06:00", "20:00"),
    "mountain":             (4.0,  "outdoor",  "Morning",   True,  None,    None   ),
    "viewpoint":            (0.75, "outdoor",  "Evening",   True,  None,    None   ),
    "hindu_temple":         (0.75, "indoor",   "Morning",   True,  "05:00", "21:00"),
    "mosque":               (0.5,  "indoor",   "Morning",   True,  "05:00", "21:00"),
    "church":               (0.5,  "indoor",   "Morning",   True,  "07:00", "19:00"),
    "buddhist_temple":      (0.75, "indoor",   "Morning",   True,  "06:00", "20:00"),
    "jain_temple":          (0.75, "indoor",   "Morning",   True,  "06:00", "20:00"),
    "gurudwara":            (0.75, "indoor",   "Morning",   True,  "04:00", "22:00"),
    "shrine":               (0.5,  "indoor",   "Morning",   True,  "06:00", "20:00"),
    "monastery":            (1.0,  "indoor",   "Morning",   True,  "07:00", "18:00"),
    "place_of_worship":     (0.75, "indoor",   "Morning",   True,  "06:00", "20:00"),
    "museum":               (2.0,  "indoor",   "Afternoon", False, "10:00", "17:00"),
    "art_museum":           (2.0,  "indoor",   "Afternoon", False, "10:00", "17:00"),
    "science_museum":       (2.0,  "indoor",   "Afternoon", False, "10:00", "17:00"),
    "history_museum":       (2.0,  "indoor",   "Afternoon", False, "10:00", "17:00"),
    "art_gallery":          (1.5,  "indoor",   "Afternoon", False, "10:00", "18:00"),
    "performing_arts_venue":(2.0,  "indoor",   "Evening",   False, "18:00", "22:00"),
    "fort":                 (2.5,  "outdoor",  "Morning",   False, "09:00", "17:00"),
    "palace":               (2.0,  "indoor",   "Morning",   False, "09:00", "17:00"),
    "ruins":                (1.5,  "outdoor",  "Morning",   False, "09:00", "17:00"),
    "archaeological_site":  (2.0,  "outdoor",  "Morning",   False, "09:00", "17:00"),
    "historical_landmark":  (1.0,  "outdoor",  "Morning",   False, "09:00", "17:00"),
    "monument":             (0.75, "outdoor",  "Morning",   True,  None,    None   ),
    "memorial":             (0.5,  "outdoor",  "Morning",   True,  None,    None   ),
    "cave":                 (1.5,  "indoor",   "Morning",   False, "09:00", "17:00"),
    "tourist_attraction":   (1.5,  "outdoor",  "Morning",   False, "09:00", "17:00"),
    "amusement_park":       (4.0,  "outdoor",  "Afternoon", False, "10:00", "21:00"),
    "theme_park":           (4.0,  "outdoor",  "Afternoon", False, "10:00", "21:00"),
    "water_park":           (4.0,  "outdoor",  "Afternoon", False, "10:00", "20:00"),
    "zoo":                  (3.0,  "outdoor",  "Morning",   False, "09:00", "17:00"),
    "aquarium":             (2.0,  "indoor",   "Afternoon", False, "10:00", "18:00"),
    "stadium":              (2.5,  "outdoor",  "Evening",   False, None,    None   ),
    "market":               (1.5,  "outdoor",  "Morning",   True,  "09:00", "21:00"),
    "shopping_mall":        (2.0,  "indoor",   "Afternoon", False, "10:00", "22:00"),
}

# ── Indian airports (IATA, lat, lng) ─────────────────────────────────────────
AIRPORTS = [
    ("DEL",  28.5562,  77.1000), ("BOM",  19.0896,  72.8656), ("MAA",  12.9900,  80.1693),
    ("BLR",  13.1979,  77.7063), ("HYD",  17.2403,  78.4294), ("CCU",  22.6547,  88.4467),
    ("COK",   9.9946,  76.2701), ("AMD",  23.0772,  72.6347), ("PNQ",  18.5822,  73.9197),
    ("GOI",  15.3808,  73.8314), ("JAI",  26.8242,  75.8122), ("LKO",  26.7606,  80.8893),
    ("IXC",  30.6735,  76.7885), ("BHO",  23.2875,  77.3374), ("PAT",  25.5913,  85.0880),
    ("VNS",  25.4524,  82.8593), ("IXB",  26.6812,  88.3286), ("GAU",  26.1061,  91.5859),
    ("IXZ",  11.6412,  92.7296), ("SXR",  33.9871,  74.7742), ("IXL",  34.1589,  77.5465),
    ("ATQ",  31.7096,  74.7973), ("UDR",  24.6177,  73.8961), ("JDH",  26.2511,  73.0489),
    ("BBI",  20.2444,  85.8178), ("VTZ",  17.7212,  83.2245), ("TRV",   8.4782,  76.9201),
    ("IXM",   9.8345,  78.0934), ("CJB",  11.0300,  77.0434), ("TRZ",  10.7654,  78.7097),
    ("IDR",  22.7218,  75.8011), ("NAG",  21.0922,  79.0472), ("RPR",  21.1804,  81.7388),
    ("VGA",  16.5303,  80.7968), ("IXR",  23.3143,  85.3217), ("IXA",  23.8870,  91.2404),
]
AIRPORT_NEARBY_KM = 50.0

# ── output columns ────────────────────────────────────────────────────────────
# Core 29 (same as master_pois.csv) + 4 Overture-specific extras
OUTPUT_COLUMNS = [
    "poi_id", "name", "city", "state", "zone", "latitude", "longitude",
    "category", "poi_type", "entry_fee_inr", "visit_duration_hrs",
    "google_rating", "review_count_lakhs", "weekly_off", "has_airport_nearby",
    "best_time_to_visit", "significance", "establishment_year",
    "characteristics", "description", "opening_time", "closing_time",
    "indoor_outdoor", "address", "country", "tags", "source_id", "last_updated",
    # extras (not in master_pois.csv but stored in MongoDB via POI model)
    "tier", "confidence", "source_count", "website", "phone",
]

# ── helpers ───────────────────────────────────────────────────────────────────

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def norm_name(name):
    """Lowercase, strip accents, collapse whitespace — for fuzzy matching."""
    nfkd = unicodedata.normalize("NFKD", str(name))
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_str.lower().strip())


def s(v):
    """Safe string: return empty string for None / NaN floats."""
    if v is None:
        return ""
    sv = str(v)
    return "" if sv == "nan" else sv.strip()


def airport_nearby(lat, lon):
    return any(haversine_km(lat, lon, alat, alon) <= AIRPORT_NEARBY_KM
               for _, alat, alon in AIRPORTS)


# ── dedup / merge ─────────────────────────────────────────────────────────────

def dedupe(df):
    """
    1. Merge same-name rows within distance threshold (keep highest source_count).
    2. Drop sub-feature rows when a parent exists within 500 m.
    Returns a new DataFrame.
    """
    records = df.to_dict("records")

    # --- pass 1: same-name merge ---
    kept = {}   # norm_name -> record index in `merged`
    merged = []

    for row in records:
        key = norm_name(row["name"])
        cat = row["primary_cat"]
        threshold_km = 1.5 if cat in LARGE_AREA_CATS else 0.3

        if key in kept:
            idx = kept[key]
            existing = merged[idx]
            dist = haversine_km(row["latitude"], row["longitude"],
                                existing["latitude"], existing["longitude"])
            if dist <= threshold_km:
                # keep the one with more sources; average coordinates
                if row["source_count"] >= existing["source_count"]:
                    merged[idx] = row
                    merged[idx]["latitude"]  = (row["latitude"]  + existing["latitude"])  / 2
                    merged[idx]["longitude"] = (row["longitude"] + existing["longitude"]) / 2
                continue  # drop the duplicate

        kept[key] = len(merged)
        merged.append(dict(row))

    # --- pass 2: sub-feature removal ---
    final = []
    for row in merged:
        if not SUB_FEATURE_RE.search(row["name"]):
            final.append(row)
            continue
        # check if a parent (similar base name) exists within 500 m
        base = SUB_FEATURE_RE.sub("", row["name"]).strip()
        base_key = norm_name(base)
        has_parent = any(
            norm_name(p["name"]).startswith(base_key[:max(4, len(base_key) - 4)])
            and haversine_km(row["latitude"], row["longitude"],
                             p["latitude"], p["longitude"]) <= 0.5
            for p in merged
            if p is not row
        )
        if not has_parent:
            final.append(row)

    return pd.DataFrame(final)


# ── tier assignment ───────────────────────────────────────────────────────────

def assign_tier(row):
    has_wiki    = bool(s(row.get("wikidata")) or s(row.get("wikipedia")))
    has_website = bool(s(row.get("website")))
    sc          = int(row.get("source_count") or 0)
    conf        = float(row.get("confidence") or 0)

    if has_wiki or has_website or sc >= 3:
        return "A"
    if sc >= 2 or conf >= 0.85:
        return "B"
    return "C"


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Overture release : {OVERTURE_RELEASE}")
    print(f"Output           : {OUTPUT_CSV}\n")

    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("INSTALL httpfs;  LOAD httpfs;")
    con.execute("SET s3_region='us-west-2';")
    con.execute("SET s3_access_key_id='';")
    con.execute("SET s3_secret_access_key='';")
    con.execute("SET s3_session_token='';")
    con.execute("SET threads=4;")
    con.execute("SET http_retries=5;")
    con.execute("SET http_retry_wait_ms=2000;")
    con.execute("SET http_timeout=60000;")

    cats_sql = ", ".join(f"'{c}'" for c in WANTED_CATEGORIES)

    print("[1/5] Querying Overture S3 …")
    query = f"""
        SELECT
            id,
            names.primary                                        AS name,
            categories.primary                                   AS primary_cat,
            ST_Y(geometry)                                       AS latitude,
            ST_X(geometry)                                       AS longitude,
            COALESCE(addresses[1].locality, addresses[1].region) AS city,
            addresses[1].region                                  AS state,
            addresses[1].freeform                                AS freeform,
            addresses[1].country                                 AS country_code,
            confidence,
            len(sources)                                         AS source_count,
            COALESCE(websites[1], '')                            AS website,
            COALESCE(phones[1], '')                              AS phone
        FROM read_parquet('{S3_PATH}', filename=true, hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {BBOX['xmin']} AND {BBOX['xmax']}
          AND bbox.ymin BETWEEN {BBOX['ymin']} AND {BBOX['ymax']}
          AND categories.primary IN ({cats_sql})
          AND confidence >= {MIN_CONFIDENCE}
    """
    df = con.execute(query).df()
    print(f"    Rows from S3 : {len(df):,}")

    # India filter
    india_mask = df["country_code"].isna() | df["country_code"].isin(["IN", "IND", "India", "INDIA"])
    df = df[india_mask]
    df = df[df["name"].notna() & (df["name"].str.strip() != "")]
    print(f"    After India + name filter : {len(df):,}")

    print("[2/5] Deduplicating and removing sub-features …")
    df = dedupe(df)
    print(f"    After dedup : {len(df):,}")

    print("[3/5] Assigning tiers …")
    df["tier"] = df.apply(assign_tier, axis=1)
    tier_counts = df["tier"].value_counts()
    print(f"    Tier A: {tier_counts.get('A', 0):,}  B: {tier_counts.get('B', 0):,}  C: {tier_counts.get('C', 0):,}")

    print("[4/5] Applying category priors and computing derived fields …")
    today   = date.today().isoformat()
    records = []

    for i, (_, r) in enumerate(df.iterrows(), start=1):
        primary_cat = s(r.get("primary_cat"))
        our_cat     = CATEGORY_MAP.get(primary_cat, "Sightseeing & Exploration")
        prior       = CATEGORY_PRIORS.get(primary_cat, (1.0, "outdoor", "Morning", False, None, None))
        visit_dur, indoor_out, best_time, fee_free, open_t, close_t = prior

        lat = float(r["latitude"])
        lon = float(r["longitude"])

        addr_parts = [s(r.get("freeform")), s(r.get("city")), s(r.get("state"))]
        address    = ", ".join(p for p in addr_parts if p)

        records.append({
            "poi_id":             f"OV-{1000 + i}",
            "name":               r["name"],
            "city":               s(r.get("city")),
            "state":              s(r.get("state")),
            "zone":               "",
            "latitude":           lat,
            "longitude":          lon,
            "category":           our_cat,
            "poi_type":           primary_cat,
            "entry_fee_inr":      0 if fee_free else "",
            "visit_duration_hrs": visit_dur,
            "google_rating":      "",
            "review_count_lakhs": "",
            "weekly_off":         "",
            "has_airport_nearby": airport_nearby(lat, lon),
            "best_time_to_visit": best_time,
            "significance":       "",
            "establishment_year": "",
            "characteristics":    "",
            "description":        "",
            "opening_time":       open_t or "",
            "closing_time":       close_t or "",
            "indoor_outdoor":     indoor_out,
            "address":            address,
            "country":            "India",
            "tags":               f"overture_maps|{primary_cat}",
            "source_id":          r["id"],
            "last_updated":       today,
            # extras
            "tier":               r["tier"],
            "confidence":         round(float(r["confidence"]), 4),
            "source_count":       int(r.get("source_count") or 0),
            "website":            s(r.get("website")),
            "phone":              s(r.get("phone")),
        })

    df_out = pd.DataFrame(records, columns=OUTPUT_COLUMNS)

    print(f"[5/5] Writing {len(df_out):,} rows → {OUTPUT_CSV}")
    df_out.to_csv(OUTPUT_CSV, index=False)
    print("\nDone.\n")
    print("Category breakdown:")
    print(df_out["category"].value_counts().to_string())
    print("\nTier breakdown:")
    print(df_out["tier"].value_counts().to_string())


if __name__ == "__main__":
    main()
