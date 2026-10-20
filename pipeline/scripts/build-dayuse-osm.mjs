#!/usr/bin/env node
// OSM(© OpenStreetMap contributors, ODbL) → registry/dayuse-osm.json. 공원(leisure=park, 이름·면적 3만㎡↑)·공공 물놀이(water_park/splash_pad, 유료·사유 제외).
// 기존 캠핑장과 150m 내 같은 이름이면 제외(중복). 화장실은 기존 nearby_toilets 형식. 취사는 OSM amenity=bbq 근거가 있을 때만, 아니면 UNKNOWN.
// 사용: node build-dayuse-osm.mjs <geojsonseq> [checked_at]
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const [file, at = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
const cat = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8")).filter((c) => !String(c.id).startsWith("osm-"));
const seedPl = JSON.parse(readFileSync(join(root, "pipeline/registry/dayuse-seed.json"), "utf8")).places;
const R = 6371000, rad = Math.PI / 180;
const dist = (a, b) => { const x = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad), y = (b[0] - a[0]) * rad; return Math.hypot(x, y) * R; };
const ring = (g) => g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : null;
function areaCentroid(g) {
  if (g.type === "Point") return { a: 0, c: [g.coordinates[1], g.coordinates[0]] };
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates; let A = 0, sx = 0, sy = 0;
  for (const p of polys) { const r = p[0], k = Math.cos(r[0][1] * rad) * rad * R, m = rad * R; let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length - 1; i++) { const x0 = r[i][0] * k, y0 = r[i][1] * m, x1 = r[i + 1][0] * k, y1 = r[i + 1][1] * m, f = x0 * y1 - x1 * y0; a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f; }
    a /= 2; if (!a) continue; A += Math.abs(a); sx += (cx / (6 * a) / k) * Math.abs(a); sy += (cy / (6 * a) / m) * Math.abs(a); }
  if (!A) { const r = ring(g); return { a: 0, c: [r[0][1], r[0][0]] }; }
  return { a: A, c: [sy / A, sx / A] };
}
const parks = [], water = [], toilets = [], bbq = [];
for (const line of readFileSync(file, "utf8").split("\n")) {
  const s = line.replace(/^\x1e/, "").trim(); if (!s) continue;
  const f = JSON.parse(s), t = f.properties, { a, c } = areaCentroid(f.geometry);
  const id = `${(t["@type"] ?? "x")[0]}${t["@id"] ?? ""}`;
  if (t.amenity === "toilets") { if (t.access !== "private") toilets.push({ c, name: t.name || "화장실" }); continue; }
  if (t.amenity === "bbq") { bbq.push(c); continue; }
  const name = t["name:ko"] || t.name; if (!name || t.access === "private" || t.access === "no") continue;
  if (t.leisure === "park" && a >= 30000 && a <= 1e7 && !/국립공원|도립공원|군립공원|자연공원|지질공원/.test(name)) parks.push({ c, a, name, t, id });
  else if ((t.leisure === "water_park" || t.leisure === "splash_pad" || t.playground === "splash_pad") && t.fee !== "yes" && !/워터파크|리조트|호텔|스파|오션|캐리비안/.test(name)) water.push({ c, a, name, t, id });
}
// 격자 인덱스
const grid = (pts, key) => { const m = new Map(); for (const p of pts) { const c = key(p), k = `${Math.floor(c[0] * 50)},${Math.floor(c[1] * 50)}`; (m.get(k) ?? m.set(k, []).get(k)).push(p); } return m; };
const near = (m, key, c, r = 1) => { const out = [], i = Math.floor(c[0] * 50), j = Math.floor(c[1] * 50); for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) out.push(...(m.get(`${i + a},${j + b}`) ?? [])); return out; };
const tG = grid(toilets, (p) => p.c), bG = grid(bbq, (p) => p), cG = grid(cat, (c) => [c.lat, c.lng]);
const norm = (s) => String(s).replace(/\s|공원|근린|어린이|물놀이장|물놀이터/g, "");
const src = { url: "https://www.openstreetmap.org/copyright", label: "© OpenStreetMap 기여자 (ODbL)", checked_at: at };
const seen = [];
function rec(p, du) {
  const c = p.c, nm = norm(p.name);
  if (near(cG, (x) => [x.lat, x.lng], c).some((x) => dist(c, [x.lat, x.lng]) < 150 && (norm(x.name).includes(nm) || nm.includes(norm(x.name))))) return null;
  if (/휴양림|캠핑장|야영장/.test(p.name)) return null;
  if (seedPl.some((x) => dist(c, [x.lat, x.lng]) < 3000 && (norm(x.name).includes(nm) || nm.includes(norm(x.name))))) return null;
  if (seen.some((s) => s.name === p.name && dist(s.c, c) < 500)) return null; seen.push(p);
  const ts = near(tG, (x) => x.c, c, 2).map((x) => ({ name: x.name, m: Math.round(dist(c, x.c)) })).filter((x) => x.m <= 2000).sort((a, b) => a.m - b.m);
  const hasBbq = near(bG, (x) => x, c).some((b) => dist(c, b) < Math.max(200, Math.sqrt(p.a || 0)));
  const ref = near(cG, (x) => [x.lat, x.lng], c, 25).sort((a, b) => dist(c, [a.lat, a.lng]) - dist(c, [b.lat, b.lng]))[0];
  const osmUrl = `https://www.openstreetmap.org/${String(p.id).replace(/^([nwr])/, (m) => ({ n: "node/", w: "way/", r: "relation/" })[m])}`;
  return {
    id: `osm-${String(p.id)}`, name: p.name, sido: p.t["addr:province"] || ref?.sido || "", sigungu: p.t["addr:city"] || p.t["addr:district"] || ref?.sigungu || "",
    lat: +c[0].toFixed(5), lng: +c[1].toFixed(5), types: du === "park" ? ["공원"] : ["물놀이터"], op: "LOCAL_GOVERNMENT", amenities: du === "water" ? ["물놀이장"] : [],
    ...(p.t.fee === "no" ? { fee: { min: 0, g: "FREE" } } : {}), homepage: p.t.website || "", status: "운영", du, osm: osmUrl,
    ...(ts.length ? { nearby_toilets: { within_2km: ts.length, within_500m: ts.filter((x) => x.m <= 500).length, nearest: ts.slice(0, 3).map((x) => ({ ...x, src: "osm" })) } } : {}),
    pf: { s: du === "park" ? `공원 · 면적 약 ${Math.round(p.a / 1000) / 10}만㎡ · 취사·그늘막 규정은 관리기관에 확인` : "공공 물놀이 시설 · 운영 기간·시간은 관리기관에 확인", t: ["PARK"] },
    src: { ...src, url: osmUrl },
    day: { cooking: hasBbq ? { v: "BBQ_FACILITY_MAPPED", text: "OSM에 바비큐 시설(amenity=bbq) 표시 — 이용 규정은 관리기관 확인", url: osmUrl, at } : { v: "UNKNOWN", at }, shade: { v: "UNKNOWN", at } },
  };
}
const P = parks.sort((a, b) => b.a - a.a).map((p) => rec(p, "park")).filter(Boolean);
const W = water.map((p) => rec(p, "water")).filter(Boolean);
const places = [...P, ...W];
writeFileSync(join(root, "pipeline/registry/dayuse-osm.json"), JSON.stringify({ source: "OpenStreetMap Geofabrik south-korea (ODbL)", checked_at: at, places }));
console.log(`공원 ${P.length} · 공공물놀이 ${W.length} · 화장실 연결 ${places.filter((p) => p.nearby_toilets).length} · bbq ${places.filter((p) => p.day.cooking.v !== "UNKNOWN").length} (원천 공원 ${parks.length}, 물놀이 ${water.length}, 화장실 ${toilets.length})`);
