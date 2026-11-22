#!/usr/bin/env python3
import hashlib, json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
now = datetime.now(timezone.utc)
catalog = ROOT / "camping-atlas" / "public" / "explore" / "data" / "campgrounds.json"
quality = ROOT / "data" / "quality" / "latest.json"
items = json.loads(catalog.read_text(encoding="utf-8"))
quality_data = json.loads(quality.read_text(encoding="utf-8")) if quality.exists() else {}
if not isinstance(items, list) or not items:
    raise RuntimeError("campground catalog has no persisted records")
totals = quality_data.get("totals") or {}
payload = {
    "schema": "lets_observability_v1", "run_id": f"camp-{now.strftime('%Y%m%dT%H%M%SZ')}", "observed_at": now.isoformat(), "service_id": "camp", "source": "persisted_campground_catalog",
    "stages": {"collect": {"status": "success", "ok": len(items), "artifact": True}, "analyze": {"status": "success" if totals else "not_started", "ok": totals.get("facts")}, "quality": {"status": "success" if totals and not totals.get("conflicts") else "degraded", "quality_issue_count": totals.get("conflicts")}, "publish": {"status": "success", "artifact": True}},
    "counts": {"records": len(items), "facts": totals.get("facts"), "increment": None}, "artifacts": {"catalog": hashlib.sha256(catalog.read_bytes()).hexdigest(), "quality": hashlib.sha256(quality.read_bytes()).hexdigest() if quality.exists() else None}, "note": "Persisted campground catalog and quality snapshot; no daily increment inferred."
}
out = ROOT / "data" / "observability" / "latest.json"; out.parent.mkdir(parents=True, exist_ok=True); out.write_text(json.dumps(payload, ensure_ascii=False, indent=2)+"\n", encoding="utf-8"); print(f"Campground records observed: {len(items)}")
