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
import { overpassCached } from "../lib/overpass.mjs";
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

/** 응답 본문을 CSV 바이트로: ZIP이면 화장실 파일을 꺼낸다(메모리에서). */
async function toCsvBytes(buf, tag) {
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const entries = listZip(buf).filter((entry) => /\.csv$/i.test(entry.name));
    if (!zipListLogged) {
      zipListLogged = true;
      const visible = entries.length <= 20 ? entries : entries.filter((entry) => /화장실|야영/.test(entry.name));
      console.log(`ZIP 안 CSV ${entries.length}개: ${visible.map((entry) => `${entry.name}(${entry.size}B)`).join(", ") || "관련 없음"}`);
    }
    const entry = entries.find((item) => /화장실|restroom|toilet/i.test(item.name)) ?? (entries.length === 1 ? entries[0] : null);
    if (!entry) throw new Error(`ZIP 안에 화장실 파일이 없음(${entries.length}개 파일)`);
    return readZipEntry(buf, entry);
  }
  return buf;
}

/**
 * LOCALDATA 공중화장실 페이지의 전용 다운로드 버튼을 쓴다. 사이드바의
 * download-all 링크는 여러 인허가 업종을 묶은 파일이라 화장실 데이터가 아니다.
 * @returns {Promise<{rows: object[], parts: string[]}>}
 */
async function downloadAll(pageUrl) {
  const page = await fetch(pageUrl, { headers: { "User-Agent": UA, Referer: "https://www.data.go.kr/" }, signal: AbortSignal.timeout(60000) });
  if (!page.ok) throw new Error(`HTTP ${page.status} ${pageUrl}`);
  const cookie = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const buf = Buffer.from(await page.arrayBuffer());
  if (!/html/i.test(page.headers.get("content-type") ?? "")) return { rows: csvToObjects(decodeKoreanText(await toCsvBytes(buf, "single"))), parts: ["single"] };
  const html = buf.toString("utf8");
  const paths = [...new Set([...html.matchAll(/data-download-urls=["']([^"']+)["']/gi)].flatMap((match) => match[1].split(/[,\s]+/)).filter(Boolean))];
  if (!paths.length) throw new Error(`화장실 다운로드 버튼(data-download-urls)을 찾지 못함(HTML ${buf.length}B)`);
  const meta = (name) => html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1];
  const csrf = meta("_csrf");
  const csrfHeader = meta("_csrf_header") ?? "X-CSRF-TOKEN";
  const headers = { "User-Agent": UA, Referer: pageUrl, Cookie: cookie, ...(csrf ? { [csrfHeader]: csrf } : {}) };
  const tried = [];
  for (const path of paths) {
    const url = new URL(path, pageUrl).toString();
    for (const method of ["GET", "POST"]) {
      try {
        const response = await fetch(url, {
          method,
          headers: method === "POST" ? { ...headers, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" } : headers,
          ...(method === "POST" ? { body: csrf ? `_csrf=${encodeURIComponent(csrf)}` : "" } : {}),
          signal: AbortSignal.timeout(180000),
        });
        const bytes = Buffer.from(await response.arrayBuffer());
        const type = response.headers.get("content-type") ?? "";
        tried.push(`${method} ${path} → ${response.status} ${type} ${bytes.length}B`);
        if (!response.ok || /html/i.test(type) || /json/i.test(type)) continue;
        const rows = csvToObjects(decodeKoreanText(await toCsvBytes(bytes, path)));
        if (rows.length) return { rows, parts: [`${method} ${path}:${rows.length}`] };
      } catch (error) { tried.push(`${method} ${path} → ${error.message}`); }
    }
  }
  throw new Error(`화장실 파일 다운로드 실패: ${tried.join(" / ")}`);
}

let toilets = [];
// 1순위: 표준데이터 API. 활용신청되지 않은 키는 응답을 기록하고 다음 원천으로 넘어간다.
const standardUrls = ["https://api.data.go.kr/openapi/tn_pubr_public_toilet_api"];
let standardUrl = null;
if (process.env.DATA_GO_KR_SERVICE_KEY) {
  for (const base of standardUrls) {
    try {
      const all = [];
      for (let page = 1; page <= 80; page++) {
        const { res } = await fetchDataGoKr(`${base}?pageNo=${page}&numOfRows=1000&type=json`, process.env.DATA_GO_KR_SERVICE_KEY, { timeoutMs: 60000 });
        const text = await res.text();
        let body = null;
        try { body = JSON.parse(text)?.response?.body ?? JSON.parse(text)?.body; } catch { /* fallback below */ }
        if (!body) { console.log(`  ${base} p${page} → HTTP ${res.status} ${text.slice(0, 140).replace(/\s+/g, " ")}`); break; }
        const items = Array.isArray(body.items) ? body.items : body.items?.item ? [].concat(body.items.item) : [];
        all.push(...items);
        if (items.length < 1000) break;
      }
      if (all.length) {
        toilets = all.map(fromStandardApi).filter(Boolean);
        standardUrl = base;
        console.log(`전국공중화장실표준데이터 ${all.length}행 → 정규화 ${toilets.length}곳`);
        break;
      }
    } catch (error) { console.log(`  ${base} → ${error.message}`); }
  }
}
// 2순위: LOCALDATA 전용 다운로드 버튼.
if (!toilets.length) try {
  const { rows, parts } = await downloadAll(SOURCE_URL);
  console.log(`화장실 파일: ${parts.join(", ")}`);
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
  console.log(`지오코딩: 새 질의 ${r.requested}건 중 호출 ${r.calls}건(성공 ${r.hits}, 없음 ${r.misses}), 남은 ${r.remaining}건${r.errors ? ` · 오류 ${r.errors}건(캐시 안 함): ${r.first_error}` : ""}${r.stopped ? ` · 중단: ${r.stopped}` : ""}`);
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
  // 행안부 전량 파일이 기준 원천이다. OSM은 좌표 보조이므로 첫 캐시 생성 실패가
  // 전체 수집·DB 적재를 지연시키지 않게 서버당 한 번, 15초만 허용한다.
  const { elements, server, stale, error } = await overpassCached(OVERPASS_QUERY, `${cacheDir}osm-toilets.json`, { timeoutMs: 15000, attempts: 1 });
  if (stale) warn("Overpass 실패 — 직전 결과 사용", `${server} · ${error}`);
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
  source: { title: standardUrl ? "전국공중화장실표준데이터" : "행정안전부 공중화장실정보", url: standardUrl ?? SOURCE_URL, dataset: "https://www.data.go.kr/data/15075531/fileData.do", tier: "A", fetched_at: fetchedAt, coords: "주소 지오코딩(카카오) 또는 원천 좌표" },
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
