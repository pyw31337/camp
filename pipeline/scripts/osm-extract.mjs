// Geofabrik 한국 OSM 파일에서 필요한 시설만 뽑은 GeoJSONSeq → Overpass 응답과 같은 모양의 elements(JSON)
// 공용 Overpass 서버가 과부하(504)일 때도 매일 안정적으로 쓰려고 만든 경로다(파일은 주 1회 내려받아 캐시).
// 사용: node scripts/osm-extract.mjs <pois.geojsonseq> <out.json>
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("사용: node scripts/osm-extract.mjs <pois.geojsonseq> <out.json>"); process.exit(2); }
/** 도형의 대표 좌표: 점은 그대로, 선·면은 첫 고리 좌표 평균 */
function centerOf(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Point") return geometry.coordinates;
  let ring = geometry.coordinates;
  while (Array.isArray(ring?.[0]?.[0])) ring = ring[0];
  if (!ring?.length) return null;
  const [sx, sy] = ring.reduce(([x, y], [a, b]) => [x + a, y + b], [0, 0]);
  return [sx / ring.length, sy / ring.length];
}
const elements = [];
const lines = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
for await (const raw of lines) {
  const line = raw.replace(/^\x1e/, "").trim();
  if (!line) continue;
  let f; try { f = JSON.parse(line); } catch { continue; }
  const c = centerOf(f.geometry);
  if (!c) continue;
  const { "@type": type = "node", "@id": id, ...tags } = f.properties ?? {};
  elements.push({ type, id, lat: Math.round(c[1] * 1e7) / 1e7, lon: Math.round(c[0] * 1e7) / 1e7, tags });
}
await writeFile(output, JSON.stringify({ fetched_at: new Date().toISOString(), source: "https://download.geofabrik.de/asia/south-korea.html", license: "© OpenStreetMap contributors (ODbL)", elements }));
console.log(`OSM 추출 ${elements.length}건 → ${output}`);
