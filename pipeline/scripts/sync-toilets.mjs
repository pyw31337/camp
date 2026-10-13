// 전국 공중화장실(행정안전부, 일 단위 갱신) 수집 → 정규화 → 주소 지오코딩(캐시) → out/toilets.json
// → 고캠핑 캠핑장 좌표와 연계(out/campground-toilets.json).
// 사용: KAKAO_REST_API_KEY=... node scripts/sync-toilets.mjs  (키가 없으면 수집·정규화까지만)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { csvToObjects, decodeKoreanText } from "../lib/csv.mjs";
import { geocodeAll, kakaoGeocode } from "../lib/geocode.mjs";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import { linkNearbyToilets } from "../lib/nearby-toilets.mjs";
import { geocodeQuery, normalizeToilet } from "../lib/toilets.mjs";

const SOURCE_URL = process.env.TOILET_SOURCE_URL ?? "https://file.localdata.go.kr/file/public_restroom_info/info";
const out = fileURLToPath(new URL("../out/", import.meta.url));
const cacheDir = fileURLToPath(new URL("../.cache/", import.meta.url));
const cachePath = `${cacheDir}geocode-toilets.json`;
await mkdir(out, { recursive: true });
await mkdir(cacheDir, { recursive: true });
const fetchedAt = toKstIso(nowInKst());
const warn = (title, msg) => console.log(`::warning title=${title}::${msg}`);

async function download(url, depth = 0) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36", Referer: "https://www.data.go.kr/", Accept: "text/csv,application/zip,*/*" }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") ?? "";
  // ZIP이면 첫 CSV를 꺼낸다(러너의 unzip 사용).
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const zip = `${cacheDir}toilets.zip`;
    await writeFile(zip, buf);
    const list = execFileSync("unzip", ["-Z1", zip]).toString().split("\n").filter((n) => /\.csv$/i.test(n));
    if (!list.length) throw new Error("ZIP 안에 CSV가 없음");
    return execFileSync("unzip", ["-p", zip, list[0]], { maxBuffer: 512 * 1024 * 1024 });
  }
  // 안내 HTML이면 그 안의 CSV/ZIP 링크를 한 번 따라간다.
  if (/html/i.test(type) && depth === 0) {
    const html = buf.toString("utf8");
    const m = html.match(/href=["']([^"']+\.(?:csv|zip)[^"']*)["']/i) || html.match(/(https?:\/\/[^"'\s]+\.(?:csv|zip))/i);
    if (!m) throw new Error(`다운로드 링크를 찾지 못함(HTML ${buf.length}B)`);
    return download(new URL(m[1], url).toString(), 1);
  }
  return buf;
}

let raw;
try {
  raw = await download(SOURCE_URL);
} catch (e) {
  warn("공중화장실 파일 수집 실패", `${e.message} — 원천: ${SOURCE_URL}`);
  process.exit(0);
}
const rows = csvToObjects(decodeKoreanText(raw));
const toilets = rows.map(normalizeToilet).filter(Boolean);
console.log(`공중화장실 원본 ${rows.length}행 → 정규화 ${toilets.length}곳`);
if (rows[0]) console.log(`머리글: ${Object.keys(rows[0]).join(", ")}`);

// 지오코딩(캐시 우선). 키가 없으면 이전 캐시로만 좌표를 채운다.
const cache = existsSync(cachePath) ? JSON.parse(await readFile(cachePath, "utf8")) : {};
const key = process.env.KAKAO_REST_API_KEY;
if (key) {
  const r = await geocodeAll(toilets.map(geocodeQuery), cache, {
    geocode: (q) => kakaoGeocode(q, { key }),
    maxCalls: Number(process.env.GEOCODE_MAX_CALLS ?? 30000),
    today: fetchedAt.slice(0, 10),
  });
  console.log(`지오코딩: 새 질의 ${r.requested}건 중 호출 ${r.calls}건(성공 ${r.hits}, 없음 ${r.misses}), 남은 ${r.remaining}건${r.stopped ? ` · 중단: ${r.stopped}` : ""}`);
  await writeFile(cachePath, JSON.stringify(cache));
} else {
  warn("지오코딩 건너뜀", "KAKAO_REST_API_KEY Secret이 없어 캐시에 있는 좌표만 씁니다(docs/OWNER_TODO.md 5단계).");
}
let located = 0;
for (const t of toilets) {
  const c = cache[geocodeQuery(t)];
  if (c && !c.miss) { t.lat = c.lat; t.lng = c.lng; t.precision = c.precision; located++; }
}
console.log(`좌표 확보 ${located}/${toilets.length}곳 (${toilets.length ? Math.round((located / toilets.length) * 100) : 0}%)`);
await writeFile(`${out}toilets.json`, JSON.stringify({
  source: { title: "행정안전부 공중화장실정보", url: SOURCE_URL, dataset: "https://www.data.go.kr/data/15075531/fileData.do", tier: "A", fetched_at: fetchedAt, coords: "주소 지오코딩(카카오) — 원천 좌표는 2025-02부터 미제공" },
  count: toilets.length, located, toilets,
}));

// 캠핑장 연계
const campPath = `${out}campgrounds.json`;
if (!existsSync(campPath)) {
  warn("캠핑장 연계 건너뜀", "out/campgrounds.json이 없습니다(고캠핑 동기화가 먼저 필요).");
  process.exit(0);
}
const { campgrounds } = JSON.parse(await readFile(campPath, "utf8"));
const points = campgrounds.filter((c) => c.location).map((c) => ({ id: c.external_id.id, lat: c.location.lat, lng: c.location.lng }));
const { byCampground, stats } = linkNearbyToilets(points, toilets);
await writeFile(`${out}campground-toilets.json`, JSON.stringify({ generated_at: fetchedAt, radius_m: 2000, stats, campgrounds: byCampground }));
console.log(`캠핑장 연계: 좌표 있는 ${points.length}곳 중 2km 안 화장실 ${stats.with_toilet_2km}곳, 300m 안 ${stats.with_toilet_300m}곳`);
