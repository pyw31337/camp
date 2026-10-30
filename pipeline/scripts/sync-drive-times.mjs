#!/usr/bin/env node
// 출발 도시 → 캠핑장 자동차 이동 시간(카카오내비 자동차 길찾기, 소유자 2026-10-31: 직선거리는 밀집 지역에서 의미가 없다).
// - 공식 API(apis-navi.kakaomobility.com/v1/directions, KAKAO_REST_API_KEY)만 쓴다. 무료 일간 쿼터 10,000건 → 실행당 DRIVE_MAX(기본 8,000)건.
// - 한 쌍(도시·캠핑장)은 30일마다 다시 묻는다. 실행 시각의 교통이 반영된 ‘추천 경로’ 소요 시간이다(주말 오전 실행 → 나들이 출발 시간대에 가깝게).
// - 결과: registry/drive-times.json(원장, 시각 포함) → camping-atlas/public/explore/data/drive-times.json(화면용, 분 단위 배열).
// - 지우지 않는다: 이번에 못 물은 쌍은 예전 값을 그대로 둔다(docs/DATA_MERGE_POLICY.md ①).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
// 출발 도시(시청 좌표). 화면의 ‘내 위치’는 가장 가까운 도시를 골라 그 시간을 쓴다. 순서가 화면용 배열의 순서다 — 화면은 키로 찾으므로 도시를 늘릴 때는 끝에 붙이고 app.js HUB_PTS·ORIGINS에도 넣는다.
export const HUBS = [
  ["seoul", "서울", 37.5665, 126.978], ["goyang", "고양·일산", 37.6584, 126.832], ["incheon", "인천", 37.4563, 126.7052], ["suwon", "수원", 37.2636, 127.0286],
  ["daejeon", "대전", 36.3504, 127.3845], ["daegu", "대구", 35.8714, 128.6014], ["gwangju", "광주", 35.1595, 126.8526], ["busan", "부산", 35.1796, 129.0756],
  ["paju", "파주", 37.7599, 126.78], // 2026-10-31 소유자: 파주 추가(배열 끝에 붙인다 — 기존 순서 유지)
];
const REG = join(root, "pipeline/registry/drive-times.json");
const PUB = join(root, "camping-atlas/public/explore/data/drive-times.json");
const MAX = Number(process.env.DRIVE_MAX ?? 8000);
const STALE_DAYS = Number(process.env.DRIVE_STALE_DAYS ?? 30);
const KEY = process.env.KAKAO_REST_API_KEY;

export function publicFile(reg, ids) {
  const t = {};
  for (const id of ids) {
    const row = reg.t[id]; if (!row) continue;
    const arr = HUBS.map(([k]) => (Number.isFinite(row[k]?.[0]) ? row[k][0] : null));
    if (arr.some((x) => x != null)) t[id] = arr;
  }
  return { hubs: HUBS.map(([k, l]) => [k, l]), unit: "min", src: "카카오내비 자동차 길찾기(추천 경로, 조회 시점 교통 반영)", updated_at: reg.updated_at, t };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cat = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
  const camps = cat.filter((c) => !c.du && Number.isFinite(+c.lat) && Number.isFinite(+c.lng) && c.status !== "폐업");
  const reg = existsSync(REG) ? JSON.parse(readFileSync(REG, "utf8")) : { t: {} };
  reg.t ??= {};
  const now = Date.now(), staleMs = STALE_DAYS * 864e5;
  const due = [];
  for (const [k, , hlat, hlng] of HUBS) for (const c of camps) {
    const prev = reg.t[c.id]?.[k];
    if (prev && now - Date.parse(prev[2] ?? 0) < staleMs) continue;
    due.push({ k, hlat, hlng, c, age: prev ? Date.parse(prev[2] ?? 0) : 0 });
  }
  // 한 번도 안 물은 쌍 먼저, 그다음 오래된 순. 같은 조건이면 도시 순서대로(서울·고양 먼저 채워진다).
  due.sort((a, b) => a.age - b.age);
  let calls = 0, ok = 0, noRoute = 0, stop = "";
  if (!KEY) stop = "KAKAO_REST_API_KEY 없음";
  for (const d of due) {
    if (stop || calls >= MAX) break;
    const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${d.hlng},${d.hlat}&destination=${+d.c.lng},${+d.c.lat}&priority=RECOMMEND&summary=true`;
    let r;
    try { r = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` }, signal: AbortSignal.timeout(15000) }); } catch (e) { stop = `네트워크 ${e.message}`; break; }
    calls++;
    if (r.status === 401 || r.status === 403) { stop = `권한 없음(${r.status}) — 카카오 개발자 콘솔에서 앱의 ‘카카오내비(길찾기)’ 사용 설정 필요: ${(await r.text()).slice(0, 160)}`; break; }
    if (r.status === 429) { stop = "일간 쿼터 소진(429)"; break; }
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    const route = j?.routes?.[0];
    const at = new Date().toISOString();
    (reg.t[d.c.id] ??= {});
    if (route?.result_code === 0 && route.summary) { reg.t[d.c.id][d.k] = [Math.round(route.summary.duration / 60), Math.round(route.summary.distance / 100) / 10, at]; ok++; }
    else { noRoute++; if (!reg.t[d.c.id][d.k]) reg.t[d.c.id][d.k] = [null, null, at, route?.result_code ?? -1]; }
    if (calls % 500 === 0) { reg.updated_at = at; writeFileSync(REG, `${JSON.stringify(reg)}\n`); }
    await new Promise((res) => setTimeout(res, 60)); // 초당 15건 이하
  }
  reg.updated_at = new Date().toISOString();
  writeFileSync(REG, `${JSON.stringify(reg)}\n`);
  const pub = publicFile(reg, camps.map((c) => String(c.id)));
  writeFileSync(PUB, `${JSON.stringify(pub)}\n`);
  const pairs = camps.length * HUBS.length, have = Object.values(pub.t).reduce((n, a) => n + a.filter((x) => x != null).length, 0);
  console.log(`내비 이동 시간: 이번 ${calls}건(성공 ${ok} · 경로 없음 ${noRoute}) · 남은 대상 ${Math.max(0, due.length - calls)}쌍 · 채움 ${have}/${pairs}쌍(${((have / pairs) * 100).toFixed(1)}%)`);
  if (stop) { console.log(`::warning::${stop}`); if (/권한 없음/.test(stop)) process.exitCode = 1; }
}
