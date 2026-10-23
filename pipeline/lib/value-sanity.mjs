// t41u-2: 이름표 값 상식 검사. 사람이 보면 바로 틀린 값(전기 100W·사이트 6,367개·퇴실 21:00·1인 1만원 화장실 상품 등)을
// 화면에서만 숨긴다. 원본은 지우지 않고 _hid[경로] = {v, why}로 보관(배포 산출물 안). 규칙은 아래 RANGES 한 곳.
import { feeFloor } from "./fee-sanity.mjs";

export const RANGES = {
  power_w: [400, 3000],          // 전기 W: 400W 미만·3kW 초과는 오기(법정 600W, 고용량 1~2kW)
  breaker_a: [3, 30],            // 차단기 A
  site_count: [1, 1000],         // 형태별 사이트 수
  site_m: [2, 30],               // 사이트 가로·세로(m)
  checkin_h: [9, 20],            // 입실 시각(시)
  checkout_h: [8, 16],           // 퇴실 시각(시)
  manner_start_h: [20, 25],      // 매너타임 시작(20~01시, 0시=24·1시=25) — spec-extractor nightStart와 같은 범위(2026-10-23: 01:00부터를 위반으로 잘못 세어 매일 발행이 막힘)
  manner_end_h: [5, 10],         // 매너타임 끝
  people: [1, 20],               // 기준·최대 인원
  pet_kg: [1, 60],               // 반려견 무게 제한
  altitude_m: [0, 1950],         // 해발(한라산 1,947m)
  sanitary: [0, 300],            // 화장실·샤워·개수대 수
  near_m: [0, 100000],           // 주변 시설 거리(m)
  fee_max: 2000000,              // 1박 상한
};
export const BAD_SOURCE = /(^|\.)kimgoon\.kr$/i; // 캠핑 안내 블로그(업장 아님) — ‘전기 1,100W 기준’ 같은 일반 안내가 업장 사실로 붙었음
export const DAYS_OK = new Set(["평일+주말", "주말", "평일"]);
const host = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
const badSrc = (o) => { const u = o?.u ?? o?.url ?? o?.source?.url; return Boolean(u && BAD_SOURCE.test(host(u))); };
const inR = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;
const hourOf = (s) => { const m = String(s ?? "").match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) + Number(m[2]) / 60 : null; };
const SITE_NOT = /(화장실|샤워|주차|추가|전기|장작|대여|렌탈|보증|입장|체험|조식|바베큐|그릴|숯)/;

function hide(o, path, why, report, field) {
  const ks = path.split(".");
  let x = o; for (const k of ks.slice(0, -1)) { x = x?.[k]; if (x == null) return; }
  const last = ks.at(-1); if (x[last] === undefined) return;
  (o._hid ??= {})[path] = { v: x[last], why };
  if (Array.isArray(x)) x.splice(Number(last), 1); else delete x[last];
  report?.(field, why);
}

/** 카탈로그 한 행. report(field, why) */
export function sanitizeCampValues(c, report) {
  const p = c.field_conditions?.power;
  if (p && p.limit_w != null && !inR(p.limit_w, RANGES.power_w)) { (c._hid ??= {})["field_conditions.power.limit_w"] = { v: p.limit_w, why: "전기 W 범위 밖" }; p.limit_w = null; report?.("전기 W", "범위 밖"); }
  if (p && typeof p.breaker_capacity === "number" && !inR(p.breaker_capacity, RANGES.breaker_a)) { (c._hid ??= {})["field_conditions.power.breaker_capacity"] = { v: p.breaker_capacity, why: "차단기 A 범위 밖" }; p.breaker_capacity = null; report?.("전기 A", "범위 밖"); }
  for (const k of Object.keys(c.of ?? {})) {
    const v = c.of[k];
    if (badSrc(v)) hide(c, `of.${k}`, "업장이 아닌 안내 블로그 문장", report, k === "w" ? "전기 W" : `업장 사실(${k})`);
    else if (k === "w" && !inR(Number(v?.v), RANGES.power_w)) hide(c, "of.w", "전기 W 범위 밖", report, "전기 W");
  }
  if (Array.isArray(c.kinds)) for (let i = c.kinds.length - 1; i >= 0; i--) if (c.kinds[i][1] != null && !inR(c.kinds[i][1], RANGES.site_count)) hide(c, `kinds.${i}`, "사이트 수 범위 밖", report, "사이트 수");
  if (Array.isArray(c.sizes)) for (let i = c.sizes.length - 1; i >= 0; i--) {
    const [w, h, n] = c.sizes[i];
    if (!inR(w, RANGES.site_m) || !inR(h, RANGES.site_m)) hide(c, `sizes.${i}`, "사이트 규격(m) 범위 밖", report, "사이트 규격");
    else if (n != null && !inR(n, RANGES.site_count)) { (c._hid ??= {})[`sizes.${i}.2`] = { v: n, why: "규격별 사이트 수 범위 밖" }; c.sizes[i] = [w, h, null]; report?.("사이트 수", "규격별 수 범위 밖"); }
  }
  if (c.ti?.i && !inR(hourOf(c.ti.i[0]), RANGES.checkin_h)) hide(c, "ti.i", "입실 시각 범위 밖", report, "입실 시각");
  if (c.ti?.o && !inR(hourOf(c.ti.o[0]), RANGES.checkout_h)) hide(c, "ti.o", "퇴실 시각 범위 밖", report, "퇴실 시각");
  if (c.ti?.m) { const h = hourOf(c.ti.m[0]); if (h != null && !inR(h <= 1 ? h + 24 : h, RANGES.manner_start_h)) hide(c, "ti.m", "매너타임 시작 범위 밖", report, "매너타임"); }
  if (c.ti && !c.ti.i && !c.ti.o && !c.ti.m) delete c.ti;
  for (const k of ["toilets", "showers", "sinks"]) if (c[k] != null && !inR(c[k], RANGES.sanitary)) hide(c, k, "편의시설 수 범위 밖", report, "화장실·샤워 수");
  if (Array.isArray(c.days)) for (let i = c.days.length - 1; i >= 0; i--) if (!DAYS_OK.has(c.days[i])) hide(c, `days.${i}`, "운영일 코드값(표기 아님)", report, "운영기간·운영일");
  if (c.tq) {
    const fl = feeFloor(c);
    if (c.tq.lo != null && (c.tq.lo < fl || c.tq.lo > RANGES.fee_max)) {
      if (c.tq.hi >= fl && c.tq.hi <= RANGES.fee_max) { (c._hid ??= {})["tq.lo"] = { v: c.tq.lo, why: "1박 하한 미만(부대 상품가)" }; c.tq.lo = c.tq.hi; }
      else hide(c, "tq", "1박 요금 범위 밖", report);
      report?.("요금(예약 상품)", "하한 미만");
    }
    if (Array.isArray(c.tq.mx) && c.tq.mx.some((m) => !inR(m, RANGES.site_m))) hide(c, "tq.mx", "사이트 규격(m) 범위 밖", report, "사이트 규격");
  }
  const nt = c.nearby_toilets?.nearest;
  if (Array.isArray(nt)) for (let i = nt.length - 1; i >= 0; i--) if (!inR(nt[i].m, RANGES.near_m)) hide(c, `nearby_toilets.nearest.${i}`, "거리 범위 밖", report, "거리");
  for (const [k, v] of Object.entries(c.nl ?? {})) if (k.length === 1 && typeof v === "number" && !inR(v, RANGES.near_m)) hide(c, `nl.${k}`, "거리 범위 밖", report, "거리");
  return c;
}

/** 상세 camps/{id}.json. c는 카탈로그 행(공공 여부 판단용) */
export function sanitizeDetailValues(d, c, report) {
  const f = d.profile?.fields ?? {};
  for (const [k, v] of Object.entries(f)) if (v && badSrc(v)) hide(d, `profile.fields.${k}`, "업장이 아닌 안내 블로그 문장", report, `프로필(${k})`);
  const val = (k) => String(f[k]?.value ?? "");
  if (f.POWER) { const ws = [...val("POWER").matchAll(/([\d,]+)\s*W/g)].map((m) => Number(m[1].replace(/,/g, ""))); if (ws.some((w) => !inR(w, RANGES.power_w))) hide(d, "profile.fields.POWER", "전기 W 범위 밖", report, "전기 W"); }
  if (f.CHECKIN && hourOf(val("CHECKIN")) != null && !inR(hourOf(val("CHECKIN")), RANGES.checkin_h)) hide(d, "profile.fields.CHECKIN", "입실 시각 범위 밖", report, "입실 시각");
  if (f.CHECKOUT && hourOf(val("CHECKOUT")) != null && !inR(hourOf(val("CHECKOUT")), RANGES.checkout_h)) hide(d, "profile.fields.CHECKOUT", "퇴실 시각 범위 밖", report, "퇴실 시각");
  if (f.MANNER) {
    const t = [...val("MANNER").matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => Number(m[1]));
    const s = t[0] != null && t[0] <= 1 ? t[0] + 24 : t[0], e = t[1];
    if ((s != null && !inR(s, RANGES.manner_start_h)) || (e != null && !inR(e, RANGES.manner_end_h))) hide(d, "profile.fields.MANNER", "매너타임 범위 밖", report, "매너타임");
  }
  if (f.PET) for (const m of val("PET").matchAll(/(\d+)\s*kg/g)) if (!inR(Number(m[1]), RANGES.pet_kg)) { hide(d, "profile.fields.PET", "반려견 kg 범위 밖", report, "반려동물 kg"); break; }
  const bs = d.booking_sites?.sites;
  if (Array.isArray(bs)) {
    const fl = feeFloor(c ?? {});
    for (let i = bs.length - 1; i >= 0; i--) {
      const s = bs[i];
      if (typeof s.price === "number" && (s.price < fl || s.price > RANGES.fee_max)) { hide(d, `booking_sites.sites.${i}`, SITE_NOT.test(s.name ?? "") ? "사이트가 아닌 부대 상품(화장실·주차 등)" : "1박 요금 범위 밖", report, "요금(예약 상품)"); continue; }
      const n = Number(String(s.people ?? "").match(/(\d+)/)?.[1]);
      if (Number.isFinite(n) && !inR(n, RANGES.people)) { (d._hid ??= {})[`booking_sites.sites.${i}.people`] = { v: s.people, why: "인원 범위 밖" }; s.people = null; report?.("정원(인원)", "범위 밖"); }
    }
  }
  for (const key of ["site_types", "operator_snippets"]) if (Array.isArray(d[key])) for (let i = d[key].length - 1; i >= 0; i--) if (badSrc(d[key][i])) hide(d, `${key}.${i}`, "업장이 아닌 안내 블로그 문장", report, `업장 사실(${key})`);
  for (const key of ["rules", "ops", "tags"]) { const arr = d.house_rules?.[key]; if (Array.isArray(arr)) for (let i = arr.length - 1; i >= 0; i--) if (badSrc(arr[i])) hide(d, `house_rules.${key}.${i}`, "업장이 아닌 안내 블로그 문장", report, "이용 규칙"); }
  const sf = d.spec?.fields ?? {};
  for (const [k, v] of Object.entries(sf)) if (Array.isArray(v?.values)) for (let i = v.values.length - 1; i >= 0; i--) if (badSrc(v.values[i])) hide(d, `spec.fields.${k}.values.${i}`, "업장이 아닌 안내 블로그 문장", report, `스펙(${k})`);
  const txt = JSON.stringify(d.profile ?? {});
  for (const m of txt.matchAll(/해발\s*([\d,]+)\s*m/g)) if (!inR(Number(m[1].replace(/,/g, "")), RANGES.altitude_m)) report?.("고도", "범위 밖(문장 안 — 표시 확인)");
  return d;
}
