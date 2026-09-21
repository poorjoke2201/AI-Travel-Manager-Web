"""
build_poi_dataset.py
====================
Single entry point for the full Overture POI enrichment pipeline.

Steps
-----
  1. Download India OSM PBF from Geofabrik          (skipped if file exists)
  2. build_overture_pois.py   — query S3, dedup, tier, priors
  3. enrich_overture_osm.py   — match against OSM PBF
  4. enrich_overture_wikidata.py — SPARQL for Tier A/B QIDs

Each step is skipped automatically if its output file already exists,
so the pipeline is fully resumable after a crash or network failure.
Force a step to re-run by deleting its output file.

Flags
-----
  --skip-download     skip PBF download even if file is missing (error if needed)
  --skip-overture     skip step 2 (S3 query)
  --skip-osm          skip step 3 (OSM enrichment)
  --skip-wikidata     skip step 4 (Wikidata enrichment)
  --pbf PATH          custom path to an existing PBF file
  --force             ignore existing output files and re-run all steps

Usage
-----
  python scripts/build_poi_dataset.py
  python scripts/build_poi_dataset.py --skip-wikidata
  python scripts/build_poi_dataset.py --force
  python scripts/build_poi_dataset.py --pbf /path/to/india.osm.pbf
"""

import argparse
import os
import subprocess
import sys
import urllib.request

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, "scripts")
DATA_DIR    = os.path.join(BASE_DIR, "data")

PBF_URL     = "https://download.geofabrik.de/asia/india-latest.osm.pbf"
PBF_PATH    = os.path.join(DATA_DIR, "india-latest.osm.pbf")


def ensure_project_python():
    """Launch the repo venv Python when the build is started from a system interpreter."""
    venv_candidates = [
        os.path.join(BASE_DIR, ".venv", "Scripts", "python.exe"),
        os.path.join(BASE_DIR, ".venv", "Scripts", "python"),
        os.path.join(BASE_DIR, ".venv", "bin", "python"),
    ]
    venv_python = next((candidate for candidate in venv_candidates if os.path.exists(candidate)), None)
    if not venv_python:
        return
    if os.environ.get("VIRTUAL_ENV"):
        return
    if os.path.normcase(sys.executable) == os.path.normcase(venv_python):
        return
    print(f"  Re-launching with project environment: {venv_python}")
    os.execv(venv_python, [venv_python, __file__, *sys.argv[1:]])


ensure_project_python()


OVERTURE_CSV  = os.path.join(DATA_DIR, "pois_overture.csv")
OSM_CSV       = os.path.join(DATA_DIR, "osm_enrichment.csv")
WIKIDATA_CSV  = os.path.join(DATA_DIR, "wikidata_enrichment.csv")

REQUIRED_OVERTURE_COLUMNS = {
    "poi_id", "name", "city", "state", "zone", "latitude", "longitude",
    "category", "poi_type", "entry_fee_inr", "visit_duration_hrs",
    "google_rating", "review_count_lakhs", "weekly_off", "has_airport_nearby",
    "best_time_to_visit", "significance", "establishment_year",
    "characteristics", "description", "opening_time", "closing_time",
    "indoor_outdoor", "address", "country", "tags", "source_id", "last_updated",
    "tier", "confidence", "source_count", "website", "phone",
}


# ── helpers ───────────────────────────────────────────────────────────────────


def file_has_required_columns(csv_path, required_columns):
    """Return True only when the CSV has all required columns for the current schema."""
    if not os.path.exists(csv_path):
        return False
    try:
        with open(csv_path, "r", encoding="utf-8", errors="replace") as handle:
            header = handle.readline().strip().split(",")
        present = set(header)
        return required_columns.issubset(present)
    except Exception:
        return False

def header(text):
    bar = "─" * 60
    print(f"\n{bar}")
    print(f"  {text}")
    print(bar)


def run(script, extra_args=None):
    """Run a sibling script with the current Python interpreter."""
    cmd = [sys.executable, os.path.join(SCRIPTS_DIR, script)] + (extra_args or [])
    print(f"  $ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=BASE_DIR)
    if result.returncode != 0:
        print(f"\nERROR: {script} exited with code {result.returncode}.")
        sys.exit(result.returncode)


def download_pbf(pbf_path):
    """Stream-download the Geofabrik India PBF with a progress indicator."""
    print(f"  Downloading {PBF_URL}")
    print(f"  → {pbf_path}")
    print("  (this is ~700 MB — may take several minutes on a slow connection)\n")

    os.makedirs(os.path.dirname(pbf_path), exist_ok=True)
    tmp_path = pbf_path + ".part"

    def reporthook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            pct = min(100, downloaded * 100 // total_size)
            mb  = downloaded / 1_048_576
            print(f"\r  {pct:3d}%  {mb:.1f} MB", end="", flush=True)

    try:
        urllib.request.urlretrieve(PBF_URL, tmp_path, reporthook)
        os.replace(tmp_path, pbf_path)
        print(f"\n  Download complete: {pbf_path}")
    except Exception as exc:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise RuntimeError(f"PBF download failed: {exc}") from exc


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Full Overture POI enrichment pipeline")
    parser.add_argument("--skip-download", action="store_true",
                        help="Do not download PBF even if missing")
    parser.add_argument("--skip-overture", action="store_true",
                        help="Skip S3 query step (step 2)")
    parser.add_argument("--skip-osm",      action="store_true",
                        help="Skip OSM enrichment step (step 3)")
    parser.add_argument("--skip-wikidata", action="store_true",
                        help="Skip Wikidata enrichment step (step 4)")
    parser.add_argument("--pbf", default=PBF_PATH,
                        help=f"Path to India OSM PBF (default: {PBF_PATH})")
    parser.add_argument("--force", action="store_true",
                        help="Re-run all steps even if output files exist")
    args = parser.parse_args()

    pbf_path = args.pbf

    print("\n╔══════════════════════════════════════════════════════════════╗")
    print("║          Overture POI Dataset — Full Build Pipeline          ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    # ── Step 1: PBF download ──────────────────────────────────────────────────
    header("Step 1/4 — India OSM PBF")
    if args.skip_osm and args.skip_wikidata:
        print("  OSM and Wikidata steps are both skipped — PBF not needed.")
    elif os.path.exists(pbf_path) and not args.force:
        size_mb = os.path.getsize(pbf_path) / 1_048_576
        print(f"  ✓ Already exists ({size_mb:.0f} MB): {pbf_path}")
    elif args.skip_download:
        if not os.path.exists(pbf_path):
            print(f"  ERROR: --skip-download set but PBF not found at {pbf_path}")
            sys.exit(1)
        print(f"  ✓ Using existing PBF: {pbf_path}")
    else:
        download_pbf(pbf_path)

    # ── Step 2: Overture S3 query ─────────────────────────────────────────────
    header("Step 2/4 — Overture S3 query (build_overture_pois.py)")
    if args.skip_overture:
        print("  Skipped via --skip-overture.")
    elif os.path.exists(OVERTURE_CSV) and not args.force:
        if file_has_required_columns(OVERTURE_CSV, REQUIRED_OVERTURE_COLUMNS):
            rows = sum(1 for _ in open(OVERTURE_CSV, encoding='utf-8', errors='replace')) - 1
            print(f"  ✓ Already exists ({rows:,} rows): {OVERTURE_CSV}")
            print("  Delete the file and re-run to refresh from S3.")
        else:
            print(f"  ⚠ Detected stale or incomplete Overture schema in {OVERTURE_CSV}")
            print("    Missing required columns. Re-running build_overture_pois.py …")
            run("build_overture_pois.py")
    else:
        run("build_overture_pois.py")

    if not os.path.exists(OVERTURE_CSV):
        print(f"\nERROR: {OVERTURE_CSV} not found after step 2. Cannot continue.")
        sys.exit(1)

    # ── Step 3: OSM enrichment ────────────────────────────────────────────────
    header("Step 3/4 — OSM enrichment (enrich_overture_osm.py)")
    if args.skip_osm:
        print("  Skipped via --skip-osm.")
    elif os.path.exists(OSM_CSV) and not args.force:
        rows = sum(1 for _ in open(OSM_CSV, encoding='utf-8', errors='replace')) - 1
        print(f"  ✓ Already exists ({rows:,} rows): {OSM_CSV}")
        print("  Delete the file and re-run to refresh.")
    else:
        run("enrich_overture_osm.py", ["--pbf", pbf_path])

    # ── Step 4: Wikidata enrichment ───────────────────────────────────────────
    header("Step 4/4 — Wikidata enrichment (enrich_overture_wikidata.py)")
    if args.skip_wikidata:
        print("  Skipped via --skip-wikidata.")
    elif os.path.exists(WIKIDATA_CSV) and not args.force:
        rows = sum(1 for _ in open(WIKIDATA_CSV, encoding='utf-8', errors='replace')) - 1
        print(f"  ✓ Already exists ({rows:,} rows): {WIKIDATA_CSV}")
        print("  Delete the file and re-run to refresh.")
    else:
        run("enrich_overture_wikidata.py")

    # ── Summary ───────────────────────────────────────────────────────────────
    header("Pipeline complete")
    files = [
        ("Overture CSV",        OVERTURE_CSV),
        ("OSM enrichment",      OSM_CSV),
        ("Wikidata enrichment", WIKIDATA_CSV),
    ]
    for label, fpath in files:
        if os.path.exists(fpath):
            rows = sum(1 for _ in open(fpath, encoding='utf-8', errors='replace')) - 1
            print(f"  ✓ {label:<22} {rows:>7,} rows   {fpath}")
        else:
            print(f"  ✗ {label:<22} not generated (step was skipped)")

    print("\nNext step — import into MongoDB:")
    print("  npm run import:overture")
    print("  # or to import everything:")
    print("  npm run import:data\n")


if __name__ == "__main__":
    main()
