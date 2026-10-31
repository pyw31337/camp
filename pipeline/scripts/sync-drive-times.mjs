#!/usr/bin/env node
// 출발 도시 → 캠핑장 자동차 이동 시간(카카오내비 자동차 길찾기, 소유자 2026-10-31: 직선거리는 밀집 지역에서 의미가 없다).
// - 공식 API(apis-navi.kakaomobility.com/v1/directions, KAKAO_REST_API_KEY)만 쓴다. 무료 일간 쿼터 10,000건.
// - 출발 도시는 lib/drive-hubs.mjs(전국 43곳). 직선 MAX_KM(250km) 넘는 쌍은 묻지 않는다(도로로 3시간을 넘어 화면 필터 밖).
// - 하루 호출량(소유자 2026-10-31): 처음 채우는 동안은 8,000건, 다 채운 뒤에는 5,000건 이하로 줄여
//   전체를 STALE_DAYS(45일)마다 한 번 다시 묻도록 매일 조금씩 나눠 묻는다(도로는 잘 안 바뀌므로 1~2달 주기면 충분).
// - 실행 시각의 교통이 반영된 ‘추천 경로’ 소요 시간(매일 오전 실행 → 나들이 출발 시간대에 가깝게).
// - 결과: registry/drive-times.json(원장, 시각 포함) → explore/data/drive/{도시}.json(화면용, 캠핑장 id → 분) + drive/hubs.json(도시 목록·채움 비율).
// - 지우지 않는다: 이번에 못 물은 쌍은 예전 값을 그대로 둔다(docs/DATA_MERGE_POLICY.md ①).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HUBS, MAX_KM, km } from "../lib/drive-hubs.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const REG = join(root, "pipeline/registry/drive-times.json");
const PUB_DIR = join(root, "camping-atlas/public/explore/data/drive");
const FILL_MAX = Number(process.env.DRIVE_FILL_MAX ?? 8000);
const KEEP_MAX = Number(process.env.DRIVE_KEEP_MAX ?? 5000);
const STALE_DAYS = Number(process.env.DRIVE_STALE_DAYS ?? 45);
const KEY = process.env.KAKAO_REST_API_KEY;

/** 처음 채우는 중이면 FILL_MAX, 다 채웠으면 ‘전체 쌍 ÷ 갱신 주기’(최대 KEEP_MAX) — 매일 고르게 나눠 묻는다. */
export function dailyBudget({ neverAsked, totalPairs, fillMax = FILL_MAX, keepMax = KEEP_MAX, staleDays = STALE_DAYS }) {
  if (neverAsked > 0) return fillMax;
  return Math.min(keepMax, Math.ceil(totalPairs / staleDays) + 50);
}
export function inRange(hub, c) { return km(hub[3], hub[4], +c.lat, +c.lng) <= MAX_KM; }

export function publicFiles(reg, camps) {
  const files = {}, cover = {};
  for (const h of HUBS) {
    const [k] = h, t = {}; let pairs = 0, have = 0;
    for (const c of camps) {
      if (!inRange(h, c)) continue;
      pairs++;
      const v = reg.t[c.id]?.[k]?.[0];
      if (Number.isFinite(v)) { t[c.id] = v; have++; }
    }
    files[k] = { hub: k, unit: "min", updated_at: reg.updated_at, t };
    cover[k] = pairs ? Math.round((have / pairs) * 1000) / 10 : 0;
  }
  const hubs = { src: "카카오내비 자동차 길찾기(추천 경로, 조회 시점 교통 반영)", max_km: MAX_KM, updated_at: reg.updated_at, hubs: HUBS.map(([k, l, region, lat, lng]) => [k, l, region, lat, lng, cover[k]]) };
  return { files, hubs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cat = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
  const camps = cat.filter((c) => !c.du && Number.isFinite(+c.lat) && Number.isFinite(+c.lng) && c.status !== "폐업");
  const reg = existsSync(REG) ? JSON.parse(readFileSync(REG, "utf8")) : { t: {} };
  reg.t ??= {};
  const now = Date.now(), staleMs = STALE_DAYS * 864e5;
  const due = []; let totalPairs = 0, neverAsked = 0;
  HUBS.forEach((h, hi) => {
    const [k, , , hlat, hlng] = h;
    for (const c of camps) {
      if (!inRange(h, c)) continue;
      totalPairs++;
      const prev = reg.t[c.id]?.[k];
      if (!prev) neverAsked++;
      if (prev && now - Date.parse(prev[2] ?? 0) < staleMs) continue;
      due.push({ k, hi, hlat, hlng, c, age: prev ? Date.parse(prev[2] ?? 0) : 0 });
    }
  });
  // 한 번도 안 물은 쌍 먼저(도시 목록 순서 = 수도권 먼저), 그다음 오래된 순.
  due.sort((a, b) => a.age - b.age || a.hi - b.hi);
  const MAX = Number(process.env.DRIVE_MAX || 0) || dailyBudget({ neverAsked, totalPairs });
  console.log(`대상 ${totalPairs}쌍(도시 ${HUBS.length}곳 × 캠핑장 ${camps.length}곳, 직선 ${MAX_KM}km 안) · 처음 묻는 쌍 ${neverAsked} · 오늘 상한 ${MAX}건(${neverAsked ? "처음 채우는 중" : `유지 — ${STALE_DAYS}일 주기`})`);
  let calls = 0, ok = 0, noRoute = 0, stop = "";
  if (!KEY) stop = "KAKAO_REST_API_KEY 없음";
  // 카카오 응답이 건당 약 1.4초라 한 줄로 8,000건이면 3시간을 넘는다(2026-10-31 실행이 시간 초과로 취소·미저장).
  // → 동시에 CONC건씩(초당 약 10건 이하) 묻고, 시간 예산(DRIVE_MINUTES)이 되면 멈춰 모은 값을 반드시 저장한다.
  const CONC = Number(process.env.DRIVE_CONC ?? 6), DEADLINE = Date.now() + Number(process.env.DRIVE_MINUTES ?? 150) * 6e4;
  let next = 0;
  const ask = async (d) => {
    const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${d.hlng},${d.hlat}&destination=${+d.c.lng},${+d.c.lat}&priority=RECOMMEND&summary=true`;
    let r;
    try { r = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` }, signal: AbortSignal.timeout(15000) }); } catch (e) { return; }
    calls++;
    if (r.status === 401 || r.status === 403) { stop = `권한 없음(${r.status}) — 카카오 개발자 콘솔에서 앱의 ‘카카오내비(길찾기)’ 사용 설정 필요: ${(await r.text()).slice(0, 160)}`; return; }
    if (r.status === 429) { stop = "일간 쿼터 소진(429)"; return; }
    if (!r.ok) return;
    const j = await r.json().catch(() => null);
    const route = j?.routes?.[0];
    const at = new Date().toISOString();
    (reg.t[d.c.id] ??= {});
    if (route?.result_code === 0 && route.summary) { reg.t[d.c.id][d.k] = [Math.round(route.summary.duration / 60), Math.round(route.summary.distance / 100) / 10, at]; ok++; }
    else { noRoute++; if (!reg.t[d.c.id][d.k] || !Number.isFinite(reg.t[d.c.id][d.k][0])) reg.t[d.c.id][d.k] = [null, null, at, route?.result_code ?? -1]; else reg.t[d.c.id][d.k][2] = at; }
    if (calls % 500 === 0) { reg.updated_at = at; writeFileSync(REG, `${JSON.stringify(reg)}\n`); }
  };
  const worker = async () => {
    while (!stop && next < due.length && next < MAX && Date.now() < DEADLINE) {
      const d = due[next++];
      await ask(d);
      await new Promise((res) => setTimeout(res, 300)); // 일꾼당 쉬기 → 전체 초당 약 10건 이하
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
  if (Date.now() >= DEADLINE && next < Math.min(due.length, MAX)) console.log(`시간 예산(${process.env.DRIVE_MINUTES ?? 150}분) 도달 — 여기까지 저장하고 다음 실행에서 이어 묻는다`);
  reg.updated_at = new Date().toISOString();
  writeFileSync(REG, `${JSON.stringify(reg)}\n`);
  const { files, hubs } = publicFiles(reg, camps);
  mkdirSync(PUB_DIR, { recursive: true });
  for (const [k, f] of Object.entries(files)) writeFileSync(join(PUB_DIR, `${k}.json`), `${JSON.stringify(f)}\n`);
  writeFileSync(join(PUB_DIR, "hubs.json"), `${JSON.stringify(hubs)}\n`);
  const have = Object.values(files).reduce((n, f) => n + Object.keys(f.t).length, 0);
  console.log(`내비 이동 시간: 이번 ${calls}건(성공 ${ok} · 경로 없음 ${noRoute}) · 채움 ${have}/${totalPairs}쌍(${((have / totalPairs) * 100).toFixed(1)}%)`);
  if (stop) { console.log(`::warning::${stop}`); if (/권한 없음/.test(stop)) process.exitCode = 1; }
}
