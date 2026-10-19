// ‘이번 주말 컨디션’ 수집: 단기·중기예보, 기상특보, 미세먼지, 산불위험, 물때 → camping-atlas/public/conditions/weekend.json
// 키(DATA_GO_KR_SERVICE_KEY)가 없거나 서비스별 활용신청 전이면 그 원천만 건너뛰고(status에 사유) 나머지는 계속한다. 실패해도 exit 0.
// 일출·일몰·달은 화면(conditions/card.js)이 astro.js로 직접 계산한다(호출 없음).
// 호출 상한(환경변수): CONDITIONS_SHORT_MAX(기본 1800) · CONDITIONS_TIDE_MAX(기본 120). 단기예보는 주말이 3일 안으로 들어왔을 때만 부른다.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { airBySido, apiProblem, fireRow, itemsOf, midTmFc, shortBase, summarizeAir, summarizeMid, summarizeShort, summarizeTide, upcomingWeekend } from "../lib/conditions.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "camping-atlas/public/conditions");
const mapping = JSON.parse(readFileSync(join(root, "pipeline/registry/condition-mapping.json"), "utf8"));
const key = process.env.DATA_GO_KR_SERVICE_KEY;
const envNum = (k, d) => (Number.isFinite(Number(process.env[k])) && process.env[k] !== "" && process.env[k] != null ? Number(process.env[k]) : d);
const SHORT_MAX = envNum("CONDITIONS_SHORT_MAX", 1800), TIDE_MAX = envNum("CONDITIONS_TIDE_MAX", 120);
// PR 검증용: 주말이 멀어도 단기예보를 소수 격자만 불러 응답 형태를 확인한다(CONDITIONS_SHORT_FORCE=1)
const SHORT_FORCE = process.env.CONDITIONS_SHORT_FORCE === "1";
const now = Date.now();
const wk = upcomingWeekend(now);
const status = {}, calls = {};
mkdirSync(outDir, { recursive: true });
copyFileSync(join(root, "pipeline/lib/astro.mjs"), join(outDir, "astro.js"));

async function get(service, url) {
  calls[service] = (calls[service] ?? 0) + 1;
  const { res } = await fetchDataGoKr(url, key, { timeoutMs: 20000 });
  const text = await res.text();
  const problem = apiProblem(res.status, text);
  return { problem, json: problem ? null : JSON.parse(text) };
}
/** 서비스 1개 실행: 첫 호출이 미등록·인증 오류면 나머지 호출을 하지 않는다 */
async function service(name, fn) {
  if (!key) { status[name] = "SKIPPED_NO_KEY"; return null; }
  try { return await fn(); } catch (e) { status[name] = `ERROR ${String(e.message).slice(0, 120)}`; return null; }
}
async function pool(list, n, fn) {
  const out = []; let i = 0, stop = false;
  await Promise.all(Array.from({ length: n }, async () => { while (!stop && i < list.length) { const x = list[i++]; const r = await fn(x); if (r === "STOP") stop = true; else out.push(r); } }));
  return out;
}
const FATAL = new Set(["NOT_REGISTERED", "UNAUTHORIZED", "NOT_FOUND", "EXPIRED", "QUOTA"]);

// 1) 단기예보(격자별)
const shortDays = wk.days_ahead <= 3 || SHORT_FORCE; // 토요일이 단기예보 범위(오늘+3일) 안. 일요일이 밖이면 중기예보로 채운다
const short = await service("short", async () => {
  if (!shortDays) { status.short = `SKIPPED_FAR (주말까지 ${wk.days_ahead}일 — 중기예보 사용)`; return null; }
  const { base_date, base_time } = shortBase(now);
  const grids = [...new Set(Object.values(mapping.camps).map((m) => `${m.nx},${m.ny}`))].slice(0, SHORT_MAX);
  const out = {}; let fatal = null, fails = 0;
  await pool(grids, 4, async (g) => {
    const [nx, ny] = g.split(",");
    try {
      const { problem, json } = await get("short", `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?pageNo=1&numOfRows=1000&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`);
      if (problem && FATAL.has(problem)) { fatal = problem; return "STOP"; }
      if (problem) { fails++; return null; }
      const days = summarizeShort(itemsOf(json));
      out[g] = [wk.sat, wk.sun].map((d) => days[d] ?? null);
      if (SHORT_FORCE && !status.short_sample) status.short_sample = `${g} ${JSON.stringify(days).slice(0, 300)}`;
    } catch { fails++; }
    return null;
  });
  status.short = fatal ? `${fatal}` : `OK ${Object.keys(out).length}/${grids.length} 격자 (실패 ${fails}) · 발표 ${base_date} ${base_time}`;
  return fatal ? null : out;
});

// 2) 중기예보(육상·기온)
const mid = await service("mid", async () => {
  const tmFc = midTmFc(now);
  const lands = [...new Set(Object.values(mapping.camps).map((m) => m.land).filter(Boolean))];
  const tas = [...new Set(Object.values(mapping.camps).map((m) => m.ta).filter(Boolean))];
  const land = {}, ta = {};
  for (const r of lands) {
    const { problem, json } = await get("mid", `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?pageNo=1&numOfRows=10&dataType=JSON&regId=${r}&tmFc=${tmFc}`);
    if (problem && FATAL.has(problem)) { status.mid = problem; return null; }
    if (!problem) land[r] = itemsOf(json)[0] ?? null;
  }
  for (const r of tas) {
    const { problem, json } = await get("mid", `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?pageNo=1&numOfRows=10&dataType=JSON&regId=${r}&tmFc=${tmFc}`);
    if (problem && FATAL.has(problem)) { status.mid = problem; return null; }
    if (!problem) ta[r] = itemsOf(json)[0] ?? null;
  }
  status.mid = `OK 육상 ${Object.keys(land).length}/${lands.length} · 기온 ${Object.keys(ta).length}/${tas.length} · 발표 ${tmFc}`;
  return { tmFc, land, ta };
});

// 3) 기상특보 현황(전국 1회)
const warn = await service("warn", async () => {
  const { problem, json } = await get("warn", "https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus?pageNo=1&numOfRows=10&dataType=JSON");
  if (problem) { status.warn = problem; return null; }
  const it = itemsOf(json)[0] ?? {};
  const text = Object.entries(it).filter(([k, v]) => typeof v === "string" && /^t\d+$|^other$/i.test(k)).map(([, v]) => v).join("\n");
  status.warn = `OK ${text ? "발효 정보 있음" : "발효 중 특보 없음"}`;
  return { text, at: it.tmFc ?? null };
});

// 4) 미세먼지(전국 측정소 실시간 1~2회)
const air = await service("air", async () => {
  const items = [];
  for (let page = 1; page <= 2; page++) {
    const { problem, json } = await get("air", `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?returnType=json&numOfRows=1000&pageNo=${page}&sidoName=${encodeURIComponent("전국")}&ver=1.0`);
    if (problem) { status.air = problem; return null; }
    const rows = itemsOf(json); items.push(...rows);
    if (rows.length < 1000) break;
  }
  const out = summarizeAir(items);
  const bySido = airBySido(out);
  status.air = `OK 측정소 ${Object.keys(out).length} · 시도 ${Object.keys(bySido).length}${mapping.stats?.with_air ? "" : " (측정소 좌표 없음 → 시도 중앙값으로 표시. 측정소정보 활용신청 후 가장 가까운 측정소로 바뀜)"}`;
  return { stations: out, bySido };
});

// 5) 산불위험예보(시군구). 응답 필드명은 첫 검증 실행에서 확인한다 — 이름·지수로 보이는 칸만 남긴다.
const fire = await service("fire", async () => {
  // 시군구 조회를 먼저, 안 되면 전국(시도) 조회. 2026-10-19 PR 검증에서 전국 조회 경로가 NO_OPENAPI_SERVICE_ERROR였다.
  const items = [], tried = [];
  for (const op of ["forestPointListSigunguSearch", "forestPointListGeongugSearch"]) {
    let problem = null;
    for (let page = 1; page <= 3; page++) {
      const r = await get("fire", `https://apis.data.go.kr/1400377/forestPoint/${op}?_type=json&numOfRows=300&pageNo=${page}&excludeForecast=1`);
      problem = r.problem;
      if (problem) break;
      const rows = itemsOf(r.json); items.push(...rows);
      if (rows.length < 300) break;
    }
    tried.push(`${op}=${problem ?? "OK"}`);
    if (items.length) break;
    if (problem === "NOT_REGISTERED" || problem === "UNAUTHORIZED") break;
  }
  if (!items.length) { status.fire = `${tried.join(" · ")}`; return null; }
  const out = {};
  for (const it of items) { const r = fireRow(it); if (r) out[r.name] = r; }
  status.fire = `OK 지역 ${Object.keys(out).length}/${items.length}${items[0] ? ` · 필드 ${Object.keys(items[0]).slice(0, 12).join(",")}` : ""}`;
  return out;
});

// 6) 물때(조석 고·저조, 해안 25km 이내 캠핑장의 예보지점만, 토·일)
const tide = await service("tide", async () => {
  const codes = [...new Set(Object.values(mapping.camps).map((m) => m.tide).filter(Boolean))];
  if (!codes.length) { status.tide = "SKIPPED_NO_STATIONS (대응표에 조석 지점 없음 — 활용신청 후 build-condition-mapping 재실행)"; return null; }
  const out = {};
  for (const code of codes) for (const d of [wk.sat, wk.sun]) {
    if ((calls.tide ?? 0) >= TIDE_MAX) break;
    const { problem, json } = await get("tide", `https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?obsCode=${code}&reqDate=${d.replaceAll("-", "")}&type=json&numOfRows=10&pageNo=1`);
    if (problem && FATAL.has(problem)) { status.tide = problem; return null; }
    if (!problem) (out[code] ??= {})[d] = summarizeTide(itemsOf(json));
  }
  status.tide = `OK 지점 ${Object.keys(out).length}/${codes.length}`;
  return out;
});

// ── 캠핑장별 주말 요약(토·일)
const dayMid = (m, d) => { const l = mid?.land?.[m.land], t = mid?.ta?.[m.ta]; return l || t ? summarizeMid(l, t, mid.tmFc)[d] ?? null : null; };
const camps = {};
for (const [id, m] of Object.entries(mapping.camps)) {
  const g = short?.[`${m.nx},${m.ny}`];
  const w = [wk.sat, wk.sun].map((d, i) => { const s = g?.[i]; if (s) return { src: "short", ...s }; const x = dayMid(m, d); return x ? { src: "mid", ...x } : null; });
  const row = {};
  if (w.some(Boolean)) row.w = w;
  if (m.air && air?.stations?.[m.air]) row.air = { station: m.air, ...air.stations[m.air] };
  else if (m.sido && air?.bySido?.[m.sido]) row.air = { sido: m.sido, ...air.bySido[m.sido] };
  const sg = m.sigungu?.split(/\s/)[0];
  const fireKeys = fire && sg ? Object.keys(fire).filter((k) => k.includes(sg)) : [];
  const fireKey = fireKeys.find((k) => m.sido && k.includes(m.sido)) ?? (fireKeys.length === 1 ? fireKeys[0] : null);
  if (fireKey) row.fire = fire[fireKey];
  if (m.tide && tide?.[m.tide]) row.tide = { code: m.tide, km: m.tide_km, days: [tide[m.tide][wk.sat] ?? null, tide[m.tide][wk.sun] ?? null] };
  if (warn?.text && m.sigungu && warn.text.includes(m.sigungu.replace(/(시|군|구)$/, ""))) row.warn = true;
  if (Object.keys(row).length) camps[id] = row;
}
const out = {
  generated_at: new Date(now).toISOString(), weekend: wk, status, calls,
  warn: warn?.text ? { text: warn.text.slice(0, 4000), at: warn.at } : null,
  sources: {
    short: "기상청 단기예보(공공데이터포털 15084084)", mid: "기상청 중기예보(15059468)", warn: "기상청 기상특보(15000415)",
    air: "한국환경공단 에어코리아 대기오염정보(15073861)", fire: "산림청 국립산림과학원 산불위험예보정보(15084817)", tide: "국립해양조사원 조석예보 고·저조(15156018)",
    sun: "일출·일몰·달: 화면에서 천문 계산(근사, ±2분)",
  },
  camps,
};
writeFileSync(join(outDir, "weekend.json"), `${JSON.stringify(out)}\n`);
console.log(`주말 ${wk.sat}~${wk.sun}(${wk.days_ahead}일 뒤) · 캠핑장 ${Object.keys(camps).length}곳에 값 · 호출 ${JSON.stringify(calls)}`);
for (const [k, v] of Object.entries(status)) console.log(`  ${k}: ${v}`);
