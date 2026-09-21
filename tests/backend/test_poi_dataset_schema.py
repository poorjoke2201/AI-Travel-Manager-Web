import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "build_poi_dataset",
    ROOT / "scripts" / "build_poi_dataset.py",
)
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


def test_detects_missing_required_columns(tmp_path):
    csv_path = tmp_path / "pois_overture.csv"
    csv_path.write_text("poi_id,name\nOV-1,Example\n", encoding="utf-8")

    assert mod.file_has_required_columns(csv_path, {"poi_id", "name", "tier"}) is False
