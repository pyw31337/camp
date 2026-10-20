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
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const CHECK = process.argv.includes("--check");
const dataDir = `${root}camping-atlas/public/explore/data`;
const catPath = `${dataDir}/campgrounds.json`;
const BLANKET = /조례 기준 요금|표준 야영 요금|표준 야영장 요금/;
const STD_LABEL = /표준 운영조례|표준 운영규정|표준 이용안내/;
const VK = /(^|\.)visitkorea\.or\.kr$/i;
const host = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
// 시·도 대략 범위(위도 남·북, 경도 서·동) + 여유 0.35°
const BOX = { 서울: [37.4, 37.72, 126.76, 127.19], 부산: [34.87, 35.4, 128.75, 129.32], 대구: [35.6, 36.35, 128.35, 128.9], 인천: [37.0, 37.99, 124.6, 126.8], 광주: [35.05, 35.26, 126.64, 127.02], 대전: [36.18, 36.5, 127.24, 127.56], 울산: [35.32, 35.73, 128.95, 129.47], 세종: [36.4, 36.74, 127.13, 127.41], 경기: [36.89, 38.3, 126.37, 127.86], 강원: [37.0, 38.62, 127.08, 129.37], 충북: [36.0, 37.27, 127.27, 128.66], 충남: [35.97, 37.08, 125.5, 127.65], 전북: [35.28, 36.16, 125.9, 127.92], 전남: [33.8, 35.51, 125.0, 127.9], 경북: [35.56, 37.56, 127.79, 131.0], 경남: [34.4, 35.92, 127.55, 129.25], 제주: [33.1, 34.0, 126.1, 127.0] };
const SHORT = [[/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"], [/^광주/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"], [/^경기/, "경기"], [/^강원/, "강원"], [/^충청북|^충북/, "충북"], [/^충청남|^충남/, "충남"], [/^전라북|^전북/, "전북"], [/^전라남|^전남/, "전남"], [/^경상북|^경북/, "경북"], [/^경상남|^경남/, "경남"], [/^제주/, "제주"]];
const sidoShort = (s) => SHORT.find(([r]) => r.test(s ?? ""))?.[1];
const M = 0.35;
export function badCoord(c) {
  if (c.lat == null || c.lng == null) return false;
  if (c.lat < 33 || c.lat > 38.7 || c.lng < 124.5 || c.lng > 131) return true;
  const s = sidoShort(c.sido); if (!s) return false;
  let b = BOX[s]; if (s === "전남" && /광주/.test(c.sido)) b = [33.8, 35.51, 125.0, 127.9]; // 전남광주통합특별시
  return c.lat < b[0] - M || c.lat > b[1] + M || c.lng < b[2] - M || c.lng > b[3] + M;
}
const isDay = (c) => c.du === "park" || c.du === "water";
const issues = {};
const hit = (k, id) => { (issues[k] ??= []).push(id); };

const camps = JSON.parse(readFileSync(catPath, "utf8"));
for (const c of camps) {
  if (isDay(c)) {
    if (c.fee && c.fee.g !== "FREE" && (BLANKET.test(c.fee.basis ?? "") || !c.fee.url)) { hit("R1 당일 장소 일괄 요금", c.id); delete c.fee; }
    if (c.ti) { hit("R1 당일 장소 입·퇴실", c.id); delete c.ti; }
  }
  if (c.fee?.url && VK.test(host(c.fee.url)) && /운영자/.test(c.fee.basis ?? "")) { hit("R2 관광공사 광고 요금", c.id); delete c.fee; }
  if (c.fee && BLANKET.test(c.fee.basis ?? "") && c.fee.grade !== "REFERENCE") { hit("R3 일괄 요금 공식 표기", c.id); c.fee.grade = "REFERENCE"; }
  const fc = c.field_conditions;
  if (fc?.fire_pit?.arrangement && /숯만 가능/.test(fc.fire_pit.arrangement) && fc.charcoal?.allowed === false) {
    hit("R4 숯 문구 모순", c.id); fc.fire_pit.arrangement = fc.fire_pit.arrangement.replace(/,?\s*숯만 가능/, "").replace(/\(\s*/, "(").trim();
  }
  if (badCoord(c)) { hit("R5 좌표 오류", c.id); c.lat = null; c.lng = null; }
}
// 상세 파일: 당일 장소의 법정·표준 스펙, 관광공사 광고 요금
const campsDir = `${dataDir}/camps`;
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
const total = Object.values(issues).reduce((n, a) => n + a.length, 0);
for (const [k, a] of Object.entries(issues)) console.log(`  ${k}: ${a.length}곳 (예: ${a.slice(0, 4).join(", ")})`);
if (CHECK) {
  if (total) { console.log(`::error::발행 전 상식 검사 실패 ${total}건 — node pipeline/scripts/publish-sanity.mjs 로 정리하세요.`); process.exit(1); }
  console.log("발행 전 상식 검사 통과."); process.exit(0);
}
if (total) {
  writeFileSync(catPath, JSON.stringify(camps));
  for (const [p, d] of dirty) writeFileSync(p, JSON.stringify(d));
}
console.log(`발행 전 상식 정리: ${total}건 고침.`);
