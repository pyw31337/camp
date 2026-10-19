#!/usr/bin/env python3
"""캠핑장 고도(해발 m) — Copernicus DEM GLO-30 (AWS Open Data, 키 없음, 무료).

한 번 돌려 registry/elevation.json을 만든다(지형은 바뀌지 않으므로 매일 돌릴 필요 없음).
타일(1°×1°) COG에서 필요한 픽셀만 HTTP 범위 요청으로 읽는다.
필요: pip install rasterio  (예: python3 -m venv .venv && .venv/bin/pip install rasterio)
사용: python3 tools/build-elevation.py   (pipeline/ 에서)
출처 표기: © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS
          by the European Union and ESA; all rights reserved. (GLO-30 공개 라이선스, 상업 이용 포함 무료)
"""
import json, math, os, sys, datetime
from collections import defaultdict
import rasterio

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "..", "camping-atlas", "public", "explore", "data", "campgrounds.json")
OUT = os.path.join(ROOT, "registry", "elevation.json")
BASE = "https://copernicus-dem-30m.s3.amazonaws.com"
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("AWS_NO_SIGN_REQUEST", "YES")

def tile_name(lat, lng):
    la, lo = math.floor(lat), math.floor(lng)
    ns, ew = ("N" if la >= 0 else "S"), ("E" if lo >= 0 else "W")
    n = f"Copernicus_DSM_COG_10_{ns}{abs(la):02d}_00_{ew}{abs(lo):03d}_00_DEM"
    return f"/vsicurl/{BASE}/{n}/{n}.tif"

cat = json.load(open(CATALOG, encoding="utf-8"))
by_tile = defaultdict(list)
for c in cat:
    lat, lng = c.get("lat"), c.get("lng")
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and 33 < lat < 39 and 124 < lng < 132:
        by_tile[tile_name(lat, lng)].append((str(c["id"]), lat, lng))

camps, missing = {}, 0
for i, (path, pts) in enumerate(sorted(by_tile.items())):
    try:
        with rasterio.open(path) as ds:
            for cid, v in zip([p[0] for p in pts], ds.sample([(p[2], p[1]) for p in pts])):
                h = float(v[0])
                if math.isfinite(h) and h > -50:
                    camps[cid] = round(h)
                else:
                    missing += 1
    except Exception as e:  # 바다만 있는 칸 등 타일이 없을 수 있다
        print(f"타일 실패 {path}: {e}", file=sys.stderr)
        missing += len(pts)
    print(f"[{i+1}/{len(by_tile)}] {path.rsplit('/',1)[-1]} {len(pts)}곳", file=sys.stderr)

out = {
    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "source": "Copernicus DEM GLO-30 (AWS Open Data copernicus-dem-30m)",
    "url": "https://registry.opendata.aws/copernicus-dem/",
    "attribution": "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA",
    "note": "캠핑장 대표 좌표 지점의 지표(DSM) 높이, 해발 m. 좌표가 입구·관리동일 수 있어 사이트 높이와 수십 m 다를 수 있다.",
    "camps": dict(sorted(camps.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0)),
}
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"고도 {len(camps)}곳(누락 {missing}) → {OUT}")
