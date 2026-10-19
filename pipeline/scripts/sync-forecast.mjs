// 캠핑장별 주간 날씨(오늘~10일) 수집 → camping-atlas/public/conditions/forecast.json
// - 단기예보(기상청 15084084, 활용신청됨): 격자별 오늘~3일 뒤 하루 요약. 실행마다 전 격자(약 1,600곳)를 부른다(일 한도 10,000 중 회당 ≤1,800).
// - 중기예보(15059468): 4~10일 뒤, 육상 구역(하늘·강수확률 오전/오후) + 기온 도시(최저·최고). 활용신청 전이면 건너뛰고 화면은 단기 날짜만 보인다.
// - 보조: 기상특보 현황(15000415, 신청 전이면 건너뜀) · 미세먼지 실시간(15073861, 신청됨; 측정소 좌표가 없으면 시도 중앙값).
// 일출·일몰·달은 화면(conditions/card.js)이 astro.js로 계산한다. 키가 없거나 실패해도 exit 0.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { landslideBySgg, landslideFor } from "../lib/trip-extras.mjs";
import { airBySido, apiProblem, itemsOf, midTmFc, shortBase, sidoKey, summarizeAir, summarizeMid, summarizeShort, isoDay } from "../lib/conditions.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "camping-atlas/public/conditions");
const outPath = join(outDir, "forecast.json");
const mapping = JSON.parse(readFileSync(join(root, "pipeline/registry/condition-mapping.json"), "utf8"));
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : null;
const key = process.env.DATA_GO_KR_SERVICE_KEY;
const envNum = (k, d) => { const v = process.env[k]; return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d; };
const SHORT_MAX = envNum("CONDITIONS_SHORT_MAX", 1800);
const now = Date.now();
const today = isoDay(new Date(now + 9 * 3600e3));
const status = {}, calls = {};
mkdirSync(outDir, { recursive: true });
copyFileSync(join(root, "pipeline/lib/astro.mjs"), join(outDir, "astro.js"));

async function get(service, url, timeoutMs = 20000) {
  calls[service] = (calls[service] ?? 0) + 1;
  let res;
  try { ({ res } = await fetchDataGoKr(url, key, { timeoutMs })); } catch (e) {
    if (/DATA_GO_KR_UNREACHABLE/.test(e.code ?? "")) throw e;
    calls[service] += 1; // 시간 초과 등은 한 번만 다시
    ({ res } = await fetchDataGoKr(url, key, { timeoutMs: timeoutMs * 2 }));
  }
  const text = await res.text();
  const problem = apiProblem(res.status, text);
  return { problem, json: problem ? null : JSON.parse(text) };
}
async function service(name, fn) {
  if (!key) { status[name] = "SKIPPED_NO_KEY"; return null; }
  try { return await fn(); } catch (e) { status[name] = `ERROR ${String(e.message).slice(0, 120)}`; return null; }
}
async function pool(list, n, fn) {
  let i = 0, stop = false;
  await Promise.all(Array.from({ length: n }, async () => { while (!stop && i < list.length) { if ((await fn(list[i++])) === "STOP") stop = true; } }));
}
const FATAL = new Set(["NOT_REGISTERED", "UNAUTHORIZED", "NOT_FOUND", "EXPIRED", "QUOTA"]);
const camps = Object.entries(mapping.camps);
const gridOf = (m) => `${m.nx},${m.ny}`;

// 1) 단기예보: 격자별 날짜 요약 [하늘, 강수형태, 최저, 최고, 강수확률, 최대풍속]
const short = await service("short", async () => {
  const { base_date, base_time } = shortBase(now);
  const grids = [...new Set(camps.map(([, m]) => gridOf(m)))].slice(0, SHORT_MAX);
  const out = {}; let fatal = null, fails = 0;
  await pool(grids, 4, async (g) => {
    const [nx, ny] = g.split(",");
    try {
      const { problem, json } = await get("short", `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?pageNo=1&numOfRows=1000&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`);
      if (problem && FATAL.has(problem)) { fatal = problem; return "STOP"; }
      if (problem) { fails++; return null; }
      const days = summarizeShort(itemsOf(json));
      out[g] = Object.fromEntries(Object.entries(days).filter(([d]) => d >= today).map(([d, x]) => [d, [x.sky, x.pty, x.tmin, x.tmax, x.pop, x.wsd]]));
    } catch { fails++; }
    return null;
  });
  status.short = fatal ?? `OK ${Object.keys(out).length}/${grids.length} 격자 (실패 ${fails}) · 발표 ${base_date} ${base_time}`;
  if (fatal || !Object.keys(out).length) return null;
  // 일부 격자가 실패하면 직전 결과(같은 날 이후 값)를 남긴다
  for (const g of grids) if (!out[g] && prev?.short?.grids?.[g]) out[g] = Object.fromEntries(Object.entries(prev.short.grids[g]).filter(([d]) => d >= today));
  return { issued: `${base_date} ${base_time}`, grids: out };
});

// 2) 중기예보(4~10일 뒤): 육상 [오전 하늘, 오후 하늘, 강수확률] · 기온 [최저, 최고]
const mid = await service("mid", async () => {
  const tmFc = midTmFc(now);
  const lands = [...new Set(camps.map(([, m]) => m.land).filter(Boolean))];
  const tas = [...new Set(camps.map(([, m]) => m.ta).filter(Boolean))];
  const land = {}, ta = {};
  for (const r of lands) {
    const { problem, json } = await get("mid", `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?pageNo=1&numOfRows=10&dataType=JSON&regId=${r}&tmFc=${tmFc}`);
    if (problem && FATAL.has(problem)) { status.mid = problem; return null; }
    const it = problem ? null : itemsOf(json)[0];
    if (it) land[r] = Object.fromEntries(Object.entries(summarizeMid(it, null, tmFc)).filter(([d]) => d >= today).map(([d, x]) => [d, [x.sky_am, x.sky_pm, x.pop]]));
  }
  for (const r of tas) {
    const { problem, json } = await get("mid", `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?pageNo=1&numOfRows=10&dataType=JSON&regId=${r}&tmFc=${tmFc}`);
    if (problem && FATAL.has(problem)) { status.mid = problem; return null; }
    const it = problem ? null : itemsOf(json)[0];
    if (it) ta[r] = Object.fromEntries(Object.entries(summarizeMid(null, it, tmFc)).filter(([d]) => d >= today).map(([d, x]) => [d, [x.tmin, x.tmax]]));
  }
  status.mid = `OK 육상 ${Object.keys(land).length}/${lands.length} · 기온 ${Object.keys(ta).length}/${tas.length} · 발표 ${tmFc}`;
  return Object.keys(land).length ? { issued: tmFc, land, ta } : null;
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

// 3-1) 산사태 예측(산림청 15074800, 활용신청 전이면 건너뜀): 최근 12시간 안의 시군구 주의보·경보
const landslide = await service("landslide", async () => {
  const { problem, json } = await get("landslide", "https://apis.data.go.kr/1400000/predictionInfoService/predictionInfoList?_type=json&pageNo=1&numOfRows=500");
  if (problem) { status.landslide = problem; return null; }
  const by = landslideBySgg(itemsOf(json), now);
  status.landslide = `OK 최근 12시간 ${Object.keys(by).length}개 시군구`;
  return by;
});

// 4) 미세먼지(지금): 전국 측정소 실시간 1~2회
const air = await service("air", async () => {
  const items = [];
  for (let page = 1; page <= 2; page++) {
    const { problem, json } = await get("air", `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?returnType=json&numOfRows=1000&pageNo=${page}&sidoName=${encodeURIComponent("전국")}&ver=1.0`, 45000);
    if (problem) { status.air = problem; return null; }
    const rows = itemsOf(json); items.push(...rows);
    if (rows.length < 1000) break;
  }
  const stations = summarizeAir(items), bySido = airBySido(stations);
  status.air = `OK 측정소 ${Object.keys(stations).length} · 시도 ${Object.keys(bySido).length}`;
  return { stations, bySido };
});

// 캠핑장 → [격자, 육상 구역, 기온 도시, 미세먼지 키("s:측정소"|"d:시도"), 특보 여부]
const campRows = {};
const airOut = {};
const landOut = {};
for (const [id, m] of camps) {
  let a = null;
  if (m.air && air?.stations?.[m.air]) { a = `s:${m.air}`; airOut[a] = air.stations[m.air]; }
  else if (air?.bySido) { const k = sidoKey(air.bySido, m.sido); if (k) { a = `d:${k}`; airOut[a] = air.bySido[k]; } }
  const w = warn?.text && m.sigungu && warn.text.includes(m.sigungu.replace(/(시|군|구)$/, "")) ? 1 : 0;
  campRows[id] = [gridOf(m), m.land ?? null, m.ta ?? null, a, w];
  const ls = landslide ? landslideFor(landslide, m.sido, m.sigungu) : null;
  if (ls) landOut[id] = [ls.level, new Date(ls.at).toISOString()];
}
const out = {
  generated_at: new Date(now).toISOString(), today, status, calls,
  sources: {
    short: "기상청 단기예보(공공데이터포털 15084084)", mid: "기상청 중기예보(15059468)", warn: "기상청 기상특보(15000415)", landslide: "산림청 산사태예측정보(15074800)",
    air: "한국환경공단 에어코리아 대기오염정보(15073861)", sun: "일출·일몰·달: 화면에서 천문 계산(근사, ±2분)",
  },
  short: short ?? (prev?.short ? { ...prev.short, grids: Object.fromEntries(Object.entries(prev.short.grids ?? {}).map(([g, d]) => [g, Object.fromEntries(Object.entries(d).filter(([x]) => x >= today))])), stale: true } : null),
  mid: mid ?? null,
  warn: warn?.text ? { text: warn.text.slice(0, 4000), at: warn.at } : null,
  air: airOut,
  landslide: landslide ? landOut : null,
  camps: campRows,
};
writeFileSync(outPath, `${JSON.stringify(out)}\n`);
const days = new Set(Object.values(out.short?.grids ?? {}).flatMap((g) => Object.keys(g)));
console.log(`주간 날씨: 단기 ${days.size}일(${[...days].sort().join(",")}) · 중기 ${out.mid ? "있음" : "없음"} · 캠핑장 ${Object.keys(campRows).length}곳 · 호출 ${JSON.stringify(calls)}`);
for (const [k, v] of Object.entries(status)) console.log(`  ${k}: ${v}`);
