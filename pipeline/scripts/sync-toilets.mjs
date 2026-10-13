// 전국 공중화장실(행정안전부, 일 단위 갱신) 수집 → 정규화 → 주소 지오코딩(캐시) → out/toilets.json
// → 고캠핑 캠핑장 좌표와 연계(out/campground-toilets.json).
// 사용: KAKAO_REST_API_KEY=... node scripts/sync-toilets.mjs  (키가 없으면 수집·정규화까지만)
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { csvToObjects, decodeKoreanText } from "../lib/csv.mjs";
import { geocodeAll, kakaoGeocode } from "../lib/geocode.mjs";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import { linkNearbyToilets } from "../lib/nearby-toilets.mjs";
import { OVERPASS_QUERY, mergeToiletSources, normalizeOsmToilet } from "../lib/osm-toilets.mjs";
import { overpass } from "../lib/overpass.mjs";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { fromStandardApi, geocodeQuery, normalizeToilet } from "../lib/toilets.mjs";
import { listZip, readZipEntry } from "../lib/zip.mjs";

const SOURCE_URL = process.env.TOILET_SOURCE_URL ?? "https://file.localdata.go.kr/file/public_restroom_info/info";
const out = fileURLToPath(new URL("../out/", import.meta.url));
const cacheDir = fileURLToPath(new URL("../.cache/", import.meta.url));
const cachePath = `${cacheDir}geocode-toilets.json`;
await mkdir(out, { recursive: true });
await mkdir(cacheDir, { recursive: true });
const fetchedAt = toKstIso(nowInKst());
const warn = (title, msg) => console.log(`::warning title=${title}::${msg}`);

let zipListLogged = false;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** 응답 본문을 CSV 바이트로: ZIP이면 화장실 파일을 꺼낸다(메모리에서, 캐시에 넣지 않음). */
async function toCsvBytes(buf, tag) {
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    // 시도별 ‘전체’ ZIP에는 모든 업종 파일이 들어 있다. 파일명은 UTF-8 플래그 없이 들어 있어 직접 디코딩한다.
    const entries = listZip(buf).filter((e) => /\.csv$/i.test(e.name));
    if (!zipListLogged) { zipListLogged = true; console.log(`ZIP 안 CSV ${entries.length}개(관련: ${entries.filter((e) => /화장실|야영/.test(e.name)).map((e) => e.name).join(", ") || "없음"})`); }
    const hit = entries.find((e) => /화장실|restroom|toilet/i.test(e.name));
    if (!hit) throw new Error(`ZIP 안에 화장실 파일이 없음(${entries.length}개 파일)`);
    console.log(`  ${tag}: ${hit.name} (${hit.size.toLocaleString()} bytes)`);
    return readZipEntry(buf, hit);
  }
  return buf;
}

/**
 * LOCALDATA 파일 페이지는 시도별 ‘전체 다운로드’ 링크(/file/download-all?orgCode=XXXXXXX_ALL)를 준다.
 * 페이지에서 쿠키·링크를 얻은 뒤 시도별 파일을 모두 받아 행을 합친다.
 * @returns {Promise<{rows: object[], parts: string[]}>}
 */
async function downloadAll(pageUrl) {
  const page = await fetch(pageUrl, { headers: { "User-Agent": UA, Referer: "https://www.data.go.kr/" }, signal: AbortSignal.timeout(60000) });
  if (!page.ok) throw new Error(`HTTP ${page.status} ${pageUrl}`);
  const cookie = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const buf = Buffer.from(await page.arrayBuffer());
  if (!/html/i.test(page.headers.get("content-type") ?? "")) return { rows: csvToObjects(decodeKoreanText(await toCsvBytes(buf, "single"))), parts: ["single"] };
  const html = buf.toString("utf8");
  const dataUrl = html.match(/data-download-url=["']([^"']+)["']/i)?.[1];
  if (dataUrl) console.log(`data-download-url: ${dataUrl}`);
  const links = [...new Set([...html.matchAll(/\/file\/download-all\?orgCode=([0-9A-Z_]+)/g)].map((m) => m[0]))];
  if (!links.length) throw new Error(`시도별 다운로드 링크 없음(HTML ${buf.length}B)`);
  const rows = [];
  const parts = [];
  for (const link of links) {
    const url = new URL(link, pageUrl).toString();
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Referer: pageUrl, Cookie: cookie }, signal: AbortSignal.timeout(120000) });
      const b = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || /html/i.test(type)) { console.log(`  ${link} → HTTP ${res.status} ${type} ${b.length}B`); continue; }
      const part = csvToObjects(decodeKoreanText(await toCsvBytes(b, link.split("=")[1])));
      rows.push(...part);
      parts.push(`${link.split("=")[1]}:${part.length}`);
    } catch (e) {
      console.log(`  ${link} → ${e.message}`);
    }
  }
  if (!rows.length) throw new Error(`시도별 파일 ${links.length}개 모두 실패`);
  return { rows, parts };
}

let toilets = [];
// 1순위: 전국공중화장실표준데이터 API(data.go.kr, 좌표 포함 가능). 2026-10-13 확인: LOCALDATA ‘전체 다운로드’ ZIP은
// 인허가 업종 195종 묶음이라 화장실 파일이 없다. 표준데이터 API 경로는 졸음쉼터와 같은 tn_pubr_public_*_api 규칙을 따른다.
// 2026-10-13 CI: 경로는 있고 SERVICE_KEY_IS_NOT_REGISTERED → 활용신청만 하면 된다(docs/OWNER_TODO.md 2-1).
const STD_URLS = ["https://api.data.go.kr/openapi/tn_pubr_public_toilet_api"];
let stdUrl = null;
if (process.env.DATA_GO_KR_SERVICE_KEY) {
  for (const base of STD_URLS) {
    try {
      const got = [];
      for (let page = 1; page <= 80; page++) {
        const { res } = await fetchDataGoKr(`${base}?pageNo=${page}&numOfRows=1000&type=json`, process.env.DATA_GO_KR_SERVICE_KEY, { timeoutMs: 60000 });
        const text = await res.text();
        let body = null;
        try { const j = JSON.parse(text); body = j?.response?.body ?? j?.body; } catch { /* 아래 */ }
        if (!body) { console.log(`  ${base} p${page} → HTTP ${res.status} ${text.slice(0, 140).replace(/\s+/g, " ")}`); break; }
        const items = Array.isArray(body.items) ? body.items : body.items?.item ? [].concat(body.items.item) : [];
        if (page === 1 && items[0]) console.log(`표준데이터 필드: ${Object.keys(items[0]).join(", ")} · 전체 ${body.totalCount}`);
        got.push(...items);
        if (items.length < 1000) break;
      }
      if (got.length) {
        toilets = got.map(fromStandardApi).filter(Boolean);
        stdUrl = base;
        console.log(`전국공중화장실표준데이터 ${got.length}행 → 정규화 ${toilets.length}곳(원천 좌표 ${toilets.filter((t) => Number.isFinite(t.lat)).length}곳)`);
        break;
      }
    } catch (e) { console.log(`  ${base} → ${e.message}`); }
  }
}
// 2순위: LOCALDATA 파일(경로가 바뀌어 화장실 파일이 다시 생기면 사용)
if (!toilets.length) try {
  const { rows, parts } = await downloadAll(SOURCE_URL);
  console.log(`시도별 파일: ${parts.join(", ")}`);
  toilets = rows.map(normalizeToilet).filter(Boolean);
  console.log(`행안부 공중화장실 원본 ${rows.length}행 → 정규화 ${toilets.length}곳`);
  if (rows[0]) console.log(`머리글: ${Object.keys(rows[0]).join(", ")}`);
} catch (e) {
  warn("행안부 공중화장실 수집 실패", `${e.message} — 원천: ${SOURCE_URL}. OpenStreetMap 원천만으로 계속합니다.`);
}

// 지오코딩(캐시 우선). 키가 없으면 이전 캐시로만 좌표를 채운다.
const cache = existsSync(cachePath) ? JSON.parse(await readFile(cachePath, "utf8")) : {};
const key = process.env.KAKAO_REST_API_KEY;
if (key) {
  const r = await geocodeAll(toilets.filter((t) => !Number.isFinite(t.lat)).map(geocodeQuery), cache, {
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
  if (Number.isFinite(t.lat)) { located++; continue; }
  const c = cache[geocodeQuery(t)];
  if (c && !c.miss) { t.lat = c.lat; t.lng = c.lng; t.precision = c.precision; located++; }
}
console.log(`좌표 확보 ${located}/${toilets.length}곳 (${toilets.length ? Math.round((located / toilets.length) * 100) : 0}%)`);
// OpenStreetMap 보조 원천(좌표 포함). 행안부 항목과 30m 안에서 겹치면 버린다.
let osmStats = { fetched: 0, added: 0, duplicates: 0 };
try {
  const { elements } = await overpass(OVERPASS_QUERY);
  const osm = elements.map(normalizeOsmToilet).filter(Boolean);
  const m = mergeToiletSources(toilets, osm);
  toilets = m.merged;
  osmStats = { fetched: osm.length, added: m.osm_added, duplicates: m.osm_duplicates };
  located += m.osm_added;
  console.log(`OpenStreetMap 화장실 ${osm.length}곳 → 새로 추가 ${m.osm_added}곳(행안부와 중복 ${m.osm_duplicates}곳)`);
} catch (e) {
  warn("OpenStreetMap 화장실 수집 실패", e.message);
}

await writeFile(`${out}toilets.json`, JSON.stringify({
  source: { title: stdUrl ? "전국공중화장실표준데이터" : "행정안전부 공중화장실정보", url: stdUrl ?? SOURCE_URL, dataset: "https://www.data.go.kr/data/15075531/fileData.do", tier: "A", fetched_at: fetchedAt, coords: "주소 지오코딩(카카오) — 원천 좌표는 2025-02부터 미제공" },
  sources: { mois: toilets.filter((t) => t.source !== "osm").length, osm: osmStats, osm_attribution: "© OpenStreetMap contributors (ODbL)" },
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
