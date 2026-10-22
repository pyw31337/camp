#!/usr/bin/env node
// 발행 전 상식 검사·정리(QA 2026-10-20). 사람이 보면 바로 틀린 값을 지운다. 멱등.
//   node pipeline/scripts/publish-sanity.mjs          → 고쳐서 저장(data-sync 마지막 단계)
//   node pipeline/scripts/publish-sanity.mjs --check  → 고칠 게 남아 있으면 실패(CI 회귀 검사)
// 규칙
//  R1 당일 장소(du: park·water)는 캠핑장이 아니다 → 캠핑장용 일괄 요금(조례 기준)·입퇴실·법정 기준 스펙(600W·사이트 옆 주차·환불)을 붙이지 않는다.
//  R2 관광공사(visitkorea) 페이지 광고 문구(예: 다른 여행상품 185,000원)를 '운영자 홈페이지 요금'으로 쓴 값은 지운다.
//  R3 업장 공지 없이 운영 주체만 보고 붙인 일괄 요금은 '공식 등록'이 아니라 참고값(REFERENCE)이다.
//  R4 '숯만 가능' 문구와 숯 불가(charcoal.allowed=false)가 함께 있으면 문구를 사실에 맞춘다.
//  R5 좌표가 한국 밖이거나 시·도 범위를 크게 벗어나면(오타) 지도에 잘못 찍히지 않게 좌표를 비운다.
//  R6 시·도는 화면과 같은 짧은 이름(서울·경기·강원…)으로 통일. '전남광주통합특별시'는 광주 5개 구면 광주, 나머지는 전남(2026-10-21 소유자).
//  R10 캠핑장 아님(서류상 등록: 도심 사무실 주소·근거 없음 — lib/camp-reality.mjs, registry/not-campgrounds.json)은 카탈로그에서 뺀다.
//  R11 고캠핑 상세(2026-10 확인)가 ‘현재 휴업 중’인데 목록이 ‘운영’이면 ‘휴장’으로 맞춘다.
//  R7 같은 곳 중복 등록(registry/duplicate-camps.json — 주소·좌표·전화로 확인한 쌍만)은 하나로 합치고 남는 행에 mg(합친 id)를 남긴다.
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const CHECK = process.argv.includes("--check");
const dataDir = process.env.EXPLORE_DIR || `${root}camping-atlas/public/explore/data`;
const catPath = `${dataDir}/campgrounds.json`;
const BLANKET = /조례 기준 요금|표준 야영 요금|표준 야영장 요금/;
const STD_LABEL = /표준 운영조례|표준 운영규정|표준 이용안내/;
const VK = /(^|\.)visitkorea\.or\.kr$/i;
const host = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
import { badCoord, sidoStd } from "../lib/geo-sanity.mjs";
import { SITE_TYPE_LABEL } from "../lib/site-types.mjs";
import { logReview } from "../lib/merge-policy.mjs";
import { paperRegistration } from "../lib/camp-reality.mjs";
// 지우는 값은 병합 정책(docs/DATA_MERGE_POLICY.md)대로 검토 기록에 이유와 함께 남긴다 → field-guard가 정당한 정정으로 통과시킨다.
const rm = (id, field, reason, file = "campgrounds.json") => { if (!CHECK) logReview({ action: "removed", file, id: String(id), field, reason, by: "publish-sanity" }); };
const DUP = (() => { try { return JSON.parse(readFileSync(`${root}pipeline/registry/duplicate-camps.json`, "utf8")).pairs ?? []; } catch { return []; } })();
const isDay = (c) => c.du === "park" || c.du === "water";
const issues = {};
const hit = (k, id) => { (issues[k] ??= []).push(id); };

const camps = JSON.parse(readFileSync(catPath, "utf8"));
for (const c of camps) {
  if (isDay(c)) {
    if (c.fee && c.fee.g !== "FREE" && (BLANKET.test(c.fee.basis ?? "") || !c.fee.url)) { hit("R1 당일 장소 일괄 요금", c.id); rm(c.id, "fee", "당일 장소(공원·물놀이터)에 붙은 야영장 조례 일괄 요금 — 무료 공원이 유료로 보임(QA 2026-10-20 R1)"); delete c.fee; }
    // 야영장 표준값(14:00/11:00·참고값)만 지운다 — 예약 화면 등 그 장소 원문 시간은 둔다.
    if (c.ti && (c.ti.i?.[1] === "r" || (c.ti.i?.[0] === "14:00" && c.ti.o?.[0] === "11:00" && !c.fee?.url))) { hit("R1 당일 장소 입·퇴실", c.id); rm(c.id, "ti", "당일 장소에 붙은 야영장 표준 입·퇴실 시각(QA R1)"); delete c.ti; }
  }
  if (c.fee?.url && VK.test(host(c.fee.url)) && /운영자/.test(c.fee.basis ?? "")) { hit("R2 관광공사 광고 요금", c.id); rm(c.id, "fee", "관광공사 소개 페이지 광고(제주 원데이투어 185,000원 등)를 운영자 요금으로 잘못 수집(QA R2)"); delete c.fee; }
  if (c.fee && BLANKET.test(c.fee.basis ?? "") && c.fee.grade !== "REFERENCE") { hit("R3 일괄 요금 공식 표기", c.id); c.fee.grade = "REFERENCE"; }
  const fc = c.field_conditions;
  if (fc?.fire_pit?.arrangement && /숯만 가능/.test(fc.fire_pit.arrangement) && fc.charcoal?.allowed === false) {
    hit("R4 숯 문구 모순", c.id); fc.fire_pit.arrangement = fc.fire_pit.arrangement.replace(/,?\s*숯만 가능/, "").replace(/\(\s*/, "(").trim();
  }
  if (badCoord(c)) { hit("R5 좌표 오류", c.id); rm(c.id, "lat", `좌표가 시·도(${c.sido}) 범위 밖 — 오타(QA R5)`); rm(c.id, "lng", "좌표 오타(QA R5)"); c.lat = null; c.lng = null; }
  // R9 사이트 타입 코드는 사전(lib/site-types.mjs)에 있는 것만 — 모르는 코드는 화면 오류(비교 화면 pageerror)를 낸다. GENERAL은 일반(PITCH).
  if (Array.isArray(c.st) && c.st.some((t) => !SITE_TYPE_LABEL[t[0]])) {
    hit("R9 모르는 사이트 타입", c.id);
    const m = new Map();
    for (const t of c.st) { const k = t[0] === "GENERAL" ? "PITCH" : t[0]; if (SITE_TYPE_LABEL[k] && !m.has(k)) m.set(k, [k, ...t.slice(1)]); }
    c.st = [...m.values()];
  }
  const sd = sidoStd(c);
  if (c.sido && sd !== c.sido) { hit("R6 시·도 표기", c.id); c.sido = sd; }
}
for (const { keep, drop } of DUP) {
  const i = camps.findIndex((c) => String(c.id) === String(drop)), k = camps.find((c) => String(c.id) === String(keep));
  if (i < 0 || !k) continue;
  hit("R7 중복 등록", drop); rm(drop, "*", `같은 곳 중복 등록 — ${keep}로 합침(registry/duplicate-camps.json)`);
  const d = camps[i];
  for (const [key, v] of Object.entries(d)) if (k[key] == null && v != null && key !== "id") k[key] = v; // 남는 행에 없는 값만 채운다
  k.mg = [...new Set([...(k.mg ?? []), String(drop)])];
  camps.splice(i, 1);
}
const campsDir = `${dataDir}/camps`;
// R10·R11 캠핑장 실체·휴업(전수 검수 2026-10-22)
{
  const reg = (p) => { try { return JSON.parse(readFileSync(`${root}pipeline/registry/${p}`, "utf8")); } catch { return {}; } };
  const K = reg("kakao-places.json").campgrounds ?? {}, N = reg("naver-places.json").campgrounds ?? {};
  const NOT = new Map((reg("not-campgrounds.json").items ?? []).map((x) => [String(x.id), x.why]));
  const detail = (id) => { try { return JSON.parse(readFileSync(`${campsDir}/${id}.json`, "utf8")); } catch { return null; } };
  for (let i = camps.length - 1; i >= 0; i--) {
    const c = camps[i], id = String(c.id);
    if (c.du) continue;
    const d = detail(id);
    const why = NOT.get(id) ?? paperRegistration(c, { kakao: K[id], naver: N[id], n5: d?.nearby_licensed?.CONVENIENCE?.n5 });
    if (why) { hit("R10 캠핑장 아님(서류상 등록)", id); rm(id, "*", `캠핑장 아님 — ${why}`); camps.splice(i, 1); continue; }
    if (c.status === "운영" && /휴업/.test(d?.gcd?.info?.["운영기간"] ?? "")) { hit("R11 고캠핑 휴업 반영", id); c.status = "휴장"; }
  }
}
// 상세 파일: 당일 장소의 법정·표준 스펙, 관광공사 광고 요금
const byId = new Map(camps.map((c) => [String(c.id), c]));
const dirty = [];
if (existsSync(campsDir)) for (const f of readdirSync(campsDir)) {
  if (!f.endsWith(".json")) continue;
  const id = f.slice(0, -5), c = byId.get(id);
  if (!c) continue;
  const raw = readFileSync(`${campsDir}/${f}`, "utf8");
  if (!(isDay(c) && /public_standard|표준 운영/.test(raw)) && !/visitkorea/.test(raw)) continue;
  const d = JSON.parse(raw); let ch = false;
  if (isDay(c)) {
    for (const [k, v] of Object.entries(d.spec?.fields ?? {})) {
      const vals = (v.values ?? []).filter((x) => x.source?.kind !== "public_standard");
      if (vals.length !== (v.values ?? []).length) { ch = true; if (vals.length || v.mentions?.length) v.values = vals; else delete d.spec.fields[k]; }
    }
    for (const [k, v] of Object.entries(d.profile?.fields ?? {})) if (STD_LABEL.test(v.source?.label ?? "")) { delete d.profile.fields[k]; ch = true; }
    if (ch && d.profile) { d.profile.tags = (d.profile.tags ?? []).filter((t) => t.why !== "운영자 안내"); d.profile.summary = ""; }
    if (ch) hit("R1 당일 장소 법정 스펙", id);
  }
  if (Array.isArray(d.operator_snippets)) {
    const keep = d.operator_snippets.filter((x) => !VK.test(host(x?.url)));
    if (keep.length !== d.operator_snippets.length) { d.operator_snippets = keep; ch = true; hit("R2 관광공사 페이지 문구(상세)", id); }
  }
  const pr = d.profile?.fields?.PRICE;
  if (pr?.source?.url && VK.test(host(pr.source.url))) { delete d.profile.fields.PRICE; ch = true; hit("R2 관광공사 광고 요금(상세)", id); }
  if (ch) dirty.push([`${campsDir}/${f}`, d]);
}
// R5: 좌표가 없는(오류로 비운) 곳은 좌표로 구한 주변 정보(편의점·축제 거리 등)도 틀렸다 → 지운다.
const noGeo = new Set(camps.filter((c) => c.lat == null || c.lng == null).map((c) => String(c.id)));
for (const id of noGeo) {
  const f = `${campsDir}/${id}.json`;
  if (!existsSync(f)) continue;
  const d = dirty.find(([p]) => p === f)?.[1] ?? JSON.parse(readFileSync(f, "utf8"));
  if (!d.nearby && !d.nearby_licensed) continue;
  delete d.nearby; delete d.nearby_licensed; hit("R5 좌표 없는 곳 주변 정보", id); rm(id, "nearby", "틀린 좌표로 구한 주변 시설(QA R5)", `camps/${id}.json`);
  if (!dirty.some(([p]) => p === f)) dirty.push([f, d]);
}
const ctxDir = `${dataDir}/../../context`, ctxDirty = [];
for (const n of ["events", "extras"]) {
  const f = `${ctxDir}/${n}.json`;
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, "utf8"));
  const gone = Object.keys(j.camps ?? {}).filter((id) => noGeo.has(id));
  if (!gone.length) continue;
  for (const id of gone) { delete j.camps[id]; hit(`R5 좌표 없는 곳 ${n}`, id); }
  ctxDirty.push([f, j]);
}
// R8 카탈로그에 있는데 상세 파일이 없으면 상세 화면이 404를 낸다(파일럿 5곳) → 빈 상세를 둔다.
const missingDetail = existsSync(campsDir) ? camps.map((c) => String(c.id)).filter((id) => !existsSync(`${campsDir}/${id}.json`)) : [];
for (const id of missingDetail) hit("R8 상세 파일 없음", id);
const total = Object.values(issues).reduce((n, a) => n + a.length, 0);
for (const [k, a] of Object.entries(issues)) console.log(`  ${k}: ${a.length}곳 (예: ${a.slice(0, 4).join(", ")})`);
if (CHECK) {
  if (total) { console.log(`::error::발행 전 상식 검사 실패 ${total}건 — node pipeline/scripts/publish-sanity.mjs 로 정리하세요.`); process.exit(1); }
  console.log("발행 전 상식 검사 통과."); process.exit(0);
}
if (total) {
  writeFileSync(catPath, JSON.stringify(camps));
  for (const [p, d] of dirty) writeFileSync(p, JSON.stringify(d));
  for (const [p, j] of ctxDirty) writeFileSync(p, JSON.stringify(j));
  for (const id of missingDetail) writeFileSync(`${campsDir}/${id}.json`, "{}");
}
console.log(`발행 전 상식 정리: ${total}건 고침.`);
