// 캠핑장 ‘여행 참고 정보’(Phase 2) → camping-atlas/public/context/extras.json
// 지금 바로 되는 것(키 있음/키 없음 무료):
//   - 고도: registry/elevation.json (Copernicus DEM GLO-30, tools/build-elevation.py로 한 번 계산)
//   - 주변 축제: TourAPI KorService2 searchFestival2 (활용신청됨) — 30km 안, 오늘~45일 사이에 열리는 것
//   - 전기차 충전소: OSM 추출본(OSM_EXTRACT, ODbL) — OSM 등록분만이라 실제보다 적다
// 활용신청 뒤 저절로 켜지는 것(신청 전이면 상태만 남기고 건너뜀):
//   - 환경부 전기차 충전소(15076352) → 충전소 자료를 이걸로 바꿈
//   - 국립중앙의료원 응급의료기관(15000563) → 가장 가까운 응급실
//   - 관광공사 반려동물 동반여행(15135102) · 무장애 여행(15101897) → 같은 캠핑장이 등록돼 있으면 표시
//   - 관광공사 두루누비(15101974) → 같은 시군 걷기길·자전거길
//   - 관광공사 관광지 집중률 예측(15128555) → 이번·다음 주말 시군 관광지 붐빔(상대값)
// 키가 없거나 실패해도 exit 0. 이전 결과가 있으면 실패한 항목은 그대로 둔다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { apiProblem, itemsOf, isoDay, upcomingWeekend } from "../lib/conditions.mjs";
import { GridIndex, chargersOf, concentrationByDay, festivalOf, festivalsNear, ldongIndex, matchTourList, nearestCharger, petDetail, sigunguCode, tourPoint } from "../lib/trip-extras.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "camping-atlas/public/context");
const outPath = join(outDir, "extras.json");
const catalog = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"))
  .map((c) => ({ ...c, lat: Number(c.lat), lng: Number(c.lng) })).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
const elevation = JSON.parse(readFileSync(join(root, "pipeline/registry/elevation.json"), "utf8"));
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : null;
const key = process.env.DATA_GO_KR_SERVICE_KEY;
const MAX = Number(process.env.TRIP_EXTRAS_MAX_CALLS || 900); // 서비스별 상한(개발계정 일 1,000)
const now = Date.now();
const today = isoDay(new Date(now + 9 * 3600e3));
const status = {}, calls = {};
const C = "MobileOS=ETC&MobileApp=moyeora&_type=json";
const TOUR = "https://apis.data.go.kr/B551011";

async function get(name, url, { xml = false } = {}) {
  if ((calls[name] = (calls[name] ?? 0) + 1) > MAX) throw new Error("호출 상한");
  let res;
  try { ({ res } = await fetchDataGoKr(url, key, { timeoutMs: 25000 })); } catch (e) {
    if (/DATA_GO_KR_UNREACHABLE/.test(e.code ?? "")) throw e;
    calls[name] += 1;
    ({ res } = await fetchDataGoKr(url, key, { timeoutMs: 45000 }));
  }
  const text = await res.text();
  if (xml && res.ok && /<item>/.test(text)) return { items: xmlItems(text) };
  const problem = apiProblem(res.status, text);
  if (problem === "NOT_JSON" && xml) return { items: xmlItems(text) };
  if (problem) return { problem };
  const json = JSON.parse(text);
  return { items: itemsOf(json), total: Number(json?.response?.body?.totalCount ?? 0) };
}
function xmlItems(text) {
  return [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) =>
    Object.fromEntries([...body.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)].map(([, k, v]) => [k, v.replace(/<!\[CDATA\[|\]\]>/g, "").trim()])));
}
/** 모든 쪽 읽기 */
async function all(name, base, rows = 1000, maxPages = 60) {
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const r = await get(name, `${base}&numOfRows=${rows}&pageNo=${p}`);
    if (r.problem) { if (p === 1) return { problem: r.problem }; break; }
    out.push(...r.items);
    if (!r.items.length || out.length >= r.total) break;
  }
  return { items: out };
}
async function step(name, fn) {
  if (!key && name !== "ev_osm") { status[name] = "SKIPPED_NO_KEY"; return null; }
  try { const v = await fn(); status[name] ??= v == null ? "NO_DATA" : "OK"; return v; } catch (e) { status[name] = `ERROR ${String(e.message).slice(0, 120)}`; return null; }
}
const fail = (name, problem) => { status[name] = problem; return null; };

// 1) 축제
const fest = await step("festival", async () => {
  const start = today.replaceAll("-", "");
  const r = await all("festival", `${TOUR}/KorService2/searchFestival2?${C}&arrange=A&eventStartDate=${start}`);
  if (r.problem) return fail("festival", r.problem);
  // 오늘 이전에 시작해 아직 진행 중인 축제도 포함(시작일 기준 60일 전부터 조회)
  const back = new Date(now + 9 * 3600e3 - 60 * 864e5).toISOString().slice(0, 10).replaceAll("-", "");
  const r2 = await all("festival", `${TOUR}/KorService2/searchFestival2?${C}&arrange=A&eventStartDate=${back}&eventEndDate=${start}`);
  const map = new Map();
  for (const it of [...(r2.items ?? []), ...r.items]) { const f = festivalOf(it, today); if (f) map.set(f.id, f); }
  return [...map.values()];
});
// 2) 전기차 충전소: 환경부(신청 후) → 없으면 OSM 추출본
const evOfficial = await step("ev_official", async () => {
  const r = await all("ev_official", "https://apis.data.go.kr/B552584/EvCharger/getChargerInfo?dataType=JSON", 9999, 80);
  if (r.problem) return fail("ev_official", r.problem);
  const seen = new Map();
  for (const it of r.items) {
    const lat = Number(it.lat), lng = Number(it.lng);
    if (!it.statId || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const s = seen.get(it.statId) ?? { lat, lng, name: it.statNm || null, fast: false };
    if (/^(0[1-7]|09|10)$/.test(String(it.chgerType ?? "")) && it.chgerType !== "02") s.fast = true; // 02 = 완속
    seen.set(it.statId, s);
  }
  return seen.size ? [...seen.values()] : null;
});
const evOsm = evOfficial ? null : await step("ev_osm", async () => {
  const p = process.env.OSM_EXTRACT;
  if (!p || !existsSync(p)) return fail("ev_osm", "NO_EXTRACT");
  const pts = chargersOf(JSON.parse(readFileSync(p, "utf8")).elements);
  return pts.length ? pts : null;
});
// 3) 응급의료기관(국립중앙의료원, XML)
const er = await step("er", async () => {
  const r = await get("er", "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytListInfoInqire?pageNo=1&numOfRows=1000", { xml: true });
  if (r.problem) return fail("er", r.problem);
  const pts = r.items.map((it) => ({ lat: Number(it.wgs84Lat), lng: Number(it.wgs84Lon), name: it.dutyName, cls: it.dutyEmclsName || null, tel: it.dutyTel3 || it.dutyTel1 || null }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.name);
  return pts.length ? pts : null;
});
// 4) 반려동물·무장애 목록(야영장만: 레포츠 28 중 cat3 야영장, 숙박 32 포함)
async function tourList(name, svc) {
  return step(name, async () => {
    const out = [];
    for (const type of [28, 32]) {
      const r = await all(name, `${TOUR}/${svc}/areaBasedList2?${C}&contentTypeId=${type}`);
      if (r.problem) return fail(name, r.problem);
      out.push(...r.items.map(tourPoint).filter(Boolean));
    }
    return out.length ? out : null;
  });
}
const pet = await tourList("pet", "KorPetTourService2");
const barrierFree = await tourList("barrier_free", "KorWithService2");
// 5) 두루누비 코스(시군 이름으로 연결)
const trails = await step("trail", async () => {
  const r = await all("trail", `https://apis.data.go.kr/B551011/Durunubi/courseList?${C}`, 1000, 10);
  if (r.problem) return fail("trail", r.problem);
  const list = r.items.map((it) => ({ name: it.crsKorNm, km: Number(it.crsDstnc) || null, h: it.crsTotlRqrmHour ? Math.round(Number(it.crsTotlRqrmHour) / 6) / 10 : null, sigun: String(it.sigun ?? "").trim(), lv: it.crsLevel ?? null, kind: it.brdDiv === "DNBW" ? "걷기" : it.brdDiv === "DNWW" ? "자전거" : null }))
    .filter((t) => t.name && t.sigun);
  return list.length ? list : null;
});
// 6) 관광지 집중률 예측(시군구 법정동 코드 필요 → KorService2 ldongCode2)
const crowd = await step("crowd", async () => {
  const ld = await all("ldong", `${TOUR}/KorService2/ldongCode2?${C}&lDongListYn=Y`, 1000, 10);
  if (ld.problem) return fail("crowd", `LDONG_${ld.problem}`);
  const idx = ldongIndex(ld.items);
  const codes = new Map();
  for (const c of catalog) { const code = sigunguCode(c, idx); if (code) codes.set(c.id, code); }
  const byCode = {};
  for (const code of [...new Set(codes.values())]) {
    const r = await get("crowd", `${TOUR}/TatsCnctrRateService/tatsCnctrRatedList?${C}&pageNo=1&numOfRows=3000&areaCd=${code.slice(0, 2)}&signguCd=${code}`);
    if (r.problem) { if (r.problem === "NOT_REGISTERED" || r.problem === "NOT_FOUND") return fail("crowd", r.problem); continue; }
    const d = concentrationByDay(r.items);
    if (Object.keys(d).length) byCode[code] = d;
  }
  return Object.keys(byCode).length ? { codes, byCode } : null;
});

// 묶기
const festIdx = fest ? new GridIndex(fest, 0.1) : null;
const evPts = evOfficial ?? evOsm;
const evIdx = evPts ? new GridIndex(evPts, 0.05) : null;
const erIdx = er ? new GridIndex(er, 0.1) : null;
const petIdx = pet ? new GridIndex(pet, 0.01) : null;
const bfIdx = barrierFree ? new GridIndex(barrierFree, 0.01) : null;
const wk = upcomingWeekend(now);
const camps = {};
const usedFest = new Set();
const petDetails = { ...(prev?.pet_detail ?? {}) };
const petNeed = [];
for (const c of catalog) {
  const p = prev?.camps?.[c.id] ?? {};
  const o = {};
  if (Number.isFinite(elevation.camps?.[c.id])) o.el = elevation.camps[c.id];
  const ev = evIdx ? nearestCharger(c, evIdx) : (status.ev_official === "OK" || status.ev_osm === "OK") ? null : p.ev;
  if (ev) o.ev = ev;
  const fs = festIdx ? festivalsNear(c, festIdx) : (p.fe ?? []).filter((x) => prev?.fest?.[x[0]]);
  if (fs.length) { o.fe = fs; fs.forEach(([id]) => usedFest.add(id)); }
  if (erIdx) {
    const h = erIdx.within(c.lat, c.lng, 80000).sort((a, b) => a.distance_m - b.distance_m)[0];
    if (h) o.er = [h.point.name, Math.round(h.distance_m / 100) / 10, h.point.cls, h.point.tel];
  } else if (p.er) o.er = p.er;
  const pm = petIdx ? matchTourList(c, petIdx) : null;
  if (pm) { o.pet = pm.id; if (!petDetails[pm.id]) petNeed.push(pm.id); } else if (!petIdx && p.pet) o.pet = p.pet;
  const bm = bfIdx ? matchTourList(c, bfIdx) : null;
  if (bm) o.bf = bm.id; else if (!bfIdx && p.bf) o.bf = p.bf;
  if (trails) {
    const sg = String(c.sigungu ?? "").split(/\s+/)[0];
    const t = sg ? trails.filter((x) => x.sigun.includes(sg)).slice(0, 3) : [];
    if (t.length) o.tr = t.map((x) => [x.name, x.km, x.h, x.kind]);
  } else if (p.tr) o.tr = p.tr;
  if (crowd) {
    const d = crowd.byCode[crowd.codes.get(c.id)];
    if (d) o.cr = Object.fromEntries(Object.entries(d).filter(([day]) => day >= today).slice(0, 21));
  } else if (p.cr) o.cr = Object.fromEntries(Object.entries(p.cr).filter(([day]) => day >= today));
  if (Object.keys(o).length) camps[c.id] = o;
}
// 반려동물 동반 상세: 새로 맞은 곳만 하루 최대 200건
if (petNeed.length) await step("pet_detail", async () => {
  for (const id of petNeed.slice(0, 200)) {
    const r = await get("pet_detail", `${TOUR}/KorPetTourService2/detailPetTour2?${C}&contentId=${id}`);
    if (r.problem) return fail("pet_detail", r.problem);
    const d = petDetail(r.items[0]);
    if (d) petDetails[id] = d;
  }
  return true;
});
const festOut = {};
for (const f of fest ?? []) if (usedFest.has(f.id)) festOut[f.id] = { t: f.title, s: f.s, e: f.e, a: f.addr, img: f.img };
if (!fest) for (const id of usedFest) if (prev?.fest?.[id]) festOut[id] = prev.fest[id];

const out = {
  generated_at: new Date(now).toISOString(), today, weekend: wk, status, calls,
  sources: {
    el: { name: "Copernicus DEM GLO-30", url: elevation.url, attribution: elevation.attribution, at: elevation.generated_at, grade: "PUBLIC_DATA" },
    ev: evOfficial ? { name: "환경부 전기자동차 충전소 정보(한국환경공단)", url: "https://www.data.go.kr/data/15076352/openapi.do", grade: "PUBLIC_DATA" }
      : { name: "OpenStreetMap 충전소(등록분만, 실제보다 적을 수 있음)", url: "https://www.openstreetmap.org/copyright", attribution: "© OpenStreetMap contributors (ODbL)", grade: "COMMUNITY" },
    fe: { name: "한국관광공사 TourAPI 행사정보", url: "https://api.visitkorea.or.kr", grade: "PUBLIC_DATA" },
    er: { name: "국립중앙의료원 응급의료기관 정보", url: "https://www.data.go.kr/data/15000563/openapi.do", grade: "PUBLIC_DATA" },
    pet: { name: "한국관광공사 반려동물 동반여행", url: "https://www.data.go.kr/data/15135102/openapi.do", grade: "PUBLIC_DATA" },
    bf: { name: "한국관광공사 무장애 여행", url: "https://www.data.go.kr/data/15101897/openapi.do", grade: "PUBLIC_DATA" },
    tr: { name: "한국관광공사 두루누비", url: "https://www.durunubi.kr", grade: "PUBLIC_DATA" },
    cr: { name: "한국관광공사 관광지 집중률 예측(KT 이동통신 기반, 상대값)", url: "https://www.data.go.kr/data/15128555/openapi.do", grade: "FORECAST" },
  },
  fest: festOut,
  pet_detail: petDetails,
  camps,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(out));
const cnt = (k) => Object.values(camps).filter((o) => o[k]).length;
console.log(`여행 참고 정보: 고도 ${cnt("el")} · 충전소 ${cnt("ev")} · 축제 ${cnt("fe")}곳(${Object.keys(festOut).length}건) · 응급실 ${cnt("er")} · 반려 ${cnt("pet")} · 무장애 ${cnt("bf")} · 걷기길 ${cnt("tr")} · 혼잡 ${cnt("cr")}`);
console.log(JSON.stringify({ status, calls }));
