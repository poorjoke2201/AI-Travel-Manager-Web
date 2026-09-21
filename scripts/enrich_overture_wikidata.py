"""
enrich_overture_wikidata.py
===========================
Fetches structured data from Wikidata for Tier A/B Overture POIs that
have a wikidata QID (from osm_enrichment.csv or the overture CSV itself).

Fields fetched per QID
----------------------
  establishment_year  — P571 (inception)
  significance        — P1435 (heritage designation label)
  description         — Wikidata short description (English)
  sitelink_count      — number of Wikipedia language editions
                        (used as popularity_score proxy)

Output
------
  data/wikidata_enrichment.csv
  Columns: poi_id, source_id, qid, establishment_year, significance,
           description, sitelink_count

Prerequisites
-------------
    pip install pandas requests

No API key required — uses the public Wikidata SPARQL endpoint.

Usage
-----
    python scripts/enrich_overture_wikidata.py
"""

import os
import sys
import time

import pandas as pd
import requests

BASE_DIR        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OVERTURE_CSV    = os.path.join(BASE_DIR, "data", "pois_overture.csv")
OSM_CSV         = os.path.join(BASE_DIR, "data", "osm_enrichment.csv")
OUTPUT_CSV      = os.path.join(BASE_DIR, "data", "wikidata_enrichment.csv")

SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
BATCH_SIZE      = 50      # QIDs per SPARQL query
SLEEP_BETWEEN   = 1.5     # seconds — respect Wikidata rate limits
MAX_RETRIES     = 3
HEADERS         = {"User-Agent": "TravelManagerApp/1.0 (educational project)"}


# ── SPARQL query ──────────────────────────────────────────────────────────────

def sparql_query(qids):
    """
    Returns a dict: qid -> {establishment_year, significance, description, sitelink_count}
    """
    values = " ".join(f"wd:{q}" for q in qids)
    query = f"""
    SELECT ?item ?itemLabel ?itemDescription
           ?inception ?heritageLabel
           (COUNT(DISTINCT ?sitelink) AS ?sitelinks)
    WHERE {{
      VALUES ?item {{ {values} }}
      OPTIONAL {{ ?item wdt:P571 ?inception. }}
      OPTIONAL {{ ?item wdt:P1435 ?heritage. }}
      ?sitelink schema:about ?item.
      SERVICE wikibase:label {{
        bd:serviceParam wikibase:language "en".
      }}
    }}
    GROUP BY ?item ?itemLabel ?itemDescription ?inception ?heritageLabel
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(
                SPARQL_ENDPOINT,
                params={"query": query, "format": "json"},
                headers=HEADERS,
                timeout=30,
            )
            resp.raise_for_status()
            bindings = resp.json()["results"]["bindings"]
            break
        except Exception as exc:
            if attempt == MAX_RETRIES:
                print(f"    SPARQL failed after {MAX_RETRIES} attempts: {exc}")
                return {}
            time.sleep(2 ** attempt)

    results = {}
    for b in bindings:
        qid = b["item"]["value"].split("/")[-1]
        inception_raw = b.get("inception", {}).get("value", "")
        year = inception_raw[:4] if inception_raw else ""

        heritage_label = b.get("heritageLabel", {}).get("value", "")
        significance = ""
        if heritage_label:
            import re
            if re.search(r"UNESCO|world.heritage", heritage_label, re.IGNORECASE):
                significance = "UNESCO World Heritage Site"
            elif re.search(r"ASI|archaeological.survey", heritage_label, re.IGNORECASE):
                significance = "ASI Protected Monument"
            else:
                significance = heritage_label[:120]

        results[qid] = {
            "establishment_year": year,
            "significance":       significance,
            "description":        b.get("itemDescription", {}).get("value", "")[:500],
            "sitelink_count":     int(b.get("sitelinks", {}).get("value", 0)),
        }
    return results


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    if not os.path.exists(OVERTURE_CSV):
        print(f"ERROR: {OVERTURE_CSV} not found. Run build_overture_pois.py first.")
        sys.exit(1)

    print(f"[1/4] Loading Overture POIs …")
    pois = pd.read_csv(OVERTURE_CSV, dtype=str).fillna("")

    if "tier" not in pois.columns:
        print("    WARNING: missing 'tier' column in Overture CSV. Treating all rows as eligible for enrichment to avoid a hard crash.")
        pois_ab = pois.copy()
    else:
        tier_mask = pois["tier"].fillna("").astype(str).str.upper().isin(["A", "B"])
        pois_ab = pois[tier_mask].copy()
    print(f"    Tier A/B POIs: {len(pois_ab):,}")

    # Collect QIDs: prefer OSM enrichment file, fall back to overture tags
    qid_map = {}  # qid -> (poi_id, source_id)

    if os.path.exists(OSM_CSV):
        osm = pd.read_csv(OSM_CSV, dtype=str).fillna("")
        osm_qids = osm[osm["wikidata"].str.startswith("Q", na=False)]
        for _, row in osm_qids.iterrows():
            qid_map[row["wikidata"]] = (row["poi_id"], row["source_id"])
        print(f"    QIDs from OSM enrichment: {len(qid_map):,}")

    # Also check if overture CSV has a wikidata column (future-proof)
    if "wikidata" in pois_ab.columns:
        for _, row in pois_ab[pois_ab["wikidata"].str.startswith("Q", na=False)].iterrows():
            if row["wikidata"] not in qid_map:
                qid_map[row["wikidata"]] = (row["poi_id"], row["source_id"])

    if not qid_map:
        print("No Wikidata QIDs found. Run enrich_overture_osm.py first.")
        print("Writing empty output.")
        pd.DataFrame(columns=["poi_id", "source_id", "qid", "establishment_year",
                               "significance", "description", "sitelink_count"]
                     ).to_csv(OUTPUT_CSV, index=False)
        return

    qids = list(qid_map.keys())
    print(f"[2/4] Querying Wikidata for {len(qids):,} QIDs in batches of {BATCH_SIZE} …")

    all_results = {}
    for i in range(0, len(qids), BATCH_SIZE):
        batch = qids[i:i + BATCH_SIZE]
        print(f"    Batch {i // BATCH_SIZE + 1}/{(len(qids) - 1) // BATCH_SIZE + 1} …", end=" ")
        batch_results = sparql_query(batch)
        all_results.update(batch_results)
        print(f"{len(batch_results)} results")
        time.sleep(SLEEP_BETWEEN)

    print(f"[3/4] Building output rows …")
    rows = []
    for qid, (poi_id, source_id) in qid_map.items():
        data = all_results.get(qid, {})
        rows.append({
            "poi_id":             poi_id,
            "source_id":          source_id,
            "qid":                qid,
            "establishment_year": data.get("establishment_year", ""),
            "significance":       data.get("significance", ""),
            "description":        data.get("description", ""),
            "sitelink_count":     data.get("sitelink_count", 0),
        })

    df_out = pd.DataFrame(rows)
    print(f"[4/4] Writing {len(df_out):,} rows → {OUTPUT_CSV}")
    df_out.to_csv(OUTPUT_CSV, index=False)
    print("Done.")
    print(f"\nCoverage: {len(all_results):,} / {len(qids):,} QIDs returned data")


if __name__ == "__main__":
    main()
