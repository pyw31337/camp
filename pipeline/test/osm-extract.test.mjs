import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeOsmShop } from "../lib/nearby-context.mjs";

test("Geofabrik 추출(GeoJSONSeq) → Overpass 모양 elements: 점·면 중심, 태그 보존", () => {
  const out = join(mkdtempSync(join(tmpdir(), "osm-")), "x.json");
  const script = fileURLToPath(new URL("../scripts/osm-extract.mjs", import.meta.url));
  execFileSync(process.execPath, [script, fileURLToPath(new URL("./fixtures/osm-pois.geojsonseq", import.meta.url)), out]);
  const { elements, license } = JSON.parse(readFileSync(out, "utf8"));
  assert.match(license, /ODbL/);
  assert.equal(elements.length, 2);
  assert.deepEqual(elements[0], { type: "node", id: 1, lat: 37.5, lon: 127.1, tags: { shop: "convenience", name: "GS25 테스트점", brand: "GS25" } });
  assert.equal(elements[1].type, "way");
  assert.ok(Math.abs(elements[1].lat - 37.1) < 0.06);
  assert.equal(normalizeOsmShop(elements[0]).kind, "convenience");
});
