#!/usr/bin/env node
// OSM 당일 나들이 장소(registry/dayuse-osm.json)의 시도·시군구를 카카오 coord2regioncode(법정동)로 채운다. 이미 채운 곳(rg)은 건너뛴다. 멱등.
// 키 없으면 아무 것도 하지 않는다. 카카오 응답은 행정구역명만 저장한다(좌표·원문 응답 저장 안 함).
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const key = process.env.KAKAO_REST_API_KEY, max = Number(process.env.GEOCODE_MAX_CALLS ?? 2000);
const p = join(root, "pipeline/registry/dayuse-osm.json"), reg = JSON.parse(readFileSync(p, "utf8"));
if (!key || !max) { console.log("dayuse geocode: 키 없음/한도 0 — 건너뜀"); process.exit(0); }
let n = 0, ok = 0;
for (const x of reg.places) {
  if (x.rg || n >= max) continue; n++;
  try {
    const r = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${x.lng}&y=${x.lat}`, { headers: { Authorization: `KakaoAK ${key}` } });
    if (!r.ok) { console.log("kakao", r.status); if (r.status === 429 || r.status === 401) break; continue; }
    const d = (await r.json()).documents?.find((v) => v.region_type === "B") ?? null;
    if (d) { x.sido = d.region_1depth_name; x.sigungu = d.region_2depth_name; x.rg = "kakao"; ok++; }
  } catch (e) { console.log(String(e)); }
  await new Promise((s) => setTimeout(s, 60));
}
writeFileSync(p, JSON.stringify(reg));
console.log(`dayuse geocode: 호출 ${n} · 반영 ${ok} · 남음 ${reg.places.filter((x) => !x.rg).length}`);
