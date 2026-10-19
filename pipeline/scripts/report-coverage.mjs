#!/usr/bin/env node
// 업장 정보 커버리지 측정(목표: 2,500곳 이상, 2026-10-19 소유자). meta.json의 coverage에 남기고 로그로 보인다.
// 항목마다 “값이 있는 캠핑장 수”를 근거 등급과 무관하게 센다(후기 언급 포함). 확정값만 따로 confirmed로 센다.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const camps = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8")).filter((c) => c.status !== "폐업");
const GOAL = 2500;
const F = {
  price: { any: 0, confirmed: 0 }, checkin: { any: 0, confirmed: 0 }, checkout: { any: 0, confirmed: 0 }, manner: { any: 0, confirmed: 0 },
  extra_fee: { any: 0, confirmed: 0 }, refund: { any: 0, confirmed: 0 }, parking: { any: 0, confirmed: 0 }, power_w: { any: 0, confirmed: 0 },
  site_types: { any: 0, confirmed: 0 }, reviews: { any: 0, confirmed: 0 }, rich5: { any: 0, confirmed: 0 },
};
const files = new Set(readdirSync(join(dataDir, "camps")));
for (const c of camps) {
  const d = files.has(`${c.id}.json`) ? JSON.parse(readFileSync(join(dataDir, "camps", `${c.id}.json`), "utf8")) : {};
  const pf = d.profile?.fields ?? {}, sp = d.spec?.fields ?? {};
  const has = (code, specCode) => ({ any: Boolean(pf[code] || sp[specCode]?.values?.length || sp[specCode]?.mentions?.length), confirmed: Boolean(pf[code] && pf[code].grade !== "MENTION") || Boolean(sp[specCode]?.values?.length) });
  const row = {
    price: { any: Boolean(c.fee || d.prices?.length || pf.PRICE), confirmed: Boolean((c.fee && c.fee.grade !== "MENTION") || d.products?.some((p) => p.price)) },
    checkin: has("CHECKIN", "CHECKIN_TIME"), checkout: has("CHECKOUT", "CHECKOUT_TIME"), manner: has("MANNER", "MANNER_TIME"),
    extra_fee: has("EXTRA_FEE", "EXTRA_PERSON_FEE"), refund: has("REFUND", "REFUND_POLICY"),
    parking: { any: Boolean(pf.PARKING || sp.PARKING || (c.field_conditions?.parking?.mode && c.field_conditions.parking.mode !== "UNKNOWN")), confirmed: Boolean(pf.PARKING || c.of?.parking) },
    power_w: { any: Boolean(c.field_conditions?.power?.limit_w || c.of?.power || sp.POWER_W), confirmed: Boolean(c.of?.power) },
    site_types: { any: Boolean(c.st?.length), confirmed: Boolean(c.st?.some((t) => t[2] !== "m")) },
    reviews: { any: Boolean(d.reviews?.length || d.cafe?.length || d.web?.length), confirmed: false },
  };
  const filled = ["price", "checkin", "checkout", "manner", "extra_fee", "refund", "parking", "power_w", "site_types"].filter((k) => row[k].any).length;
  row.rich5 = { any: filled >= 5, confirmed: false };
  for (const [k, v] of Object.entries(row)) { if (v.any) F[k].any++; if (v.confirmed) F[k].confirmed++; }
}
const label = { price: "1박 요금", checkin: "입실", checkout: "퇴실", manner: "매너타임", extra_fee: "추가 요금", refund: "환불", parking: "주차", power_w: "전기 W", site_types: "사이트 타입", reviews: "후기·게시글", rich5: "9개 중 5개 이상" };
console.log(`업장 정보 커버리지 (전체 ${camps.length}곳 · 목표 ${GOAL}곳)`);
for (const [k, v] of Object.entries(F)) console.log(`  ${label[k].padEnd(10)} ${String(v.any).padStart(5)}곳${v.any >= GOAL ? " ✓" : ""}  (확정값 ${v.confirmed})`);
const metaPath = join(dataDir, "meta.json");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
meta.coverage = { measured_at: new Date().toISOString(), total: camps.length, goal: GOAL, fields: F };
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
