#!/usr/bin/env node
// 공공데이터 여가 시설(registry/public-leisure.json, sync-public-leisure.mjs 산출)을 탐색 데이터에 붙인다. 멱등.
// 소유자 2026-10-22: “국립·공립·사립 휴양림 정보를 모두 서비스에 포함, 휴게소·실내놀이터·수영장 등은 주변 시설에 연동.”
// 1) 휴양림: 이미 있는 캠핑장(이름 핵심어가 같고 3km 안)이면 그 행에 rf(국립·공립·사립)·op만 보탠다.
//    없으면 새 행(id rf-…)으로 추가한다 — 원천 URL·기준일(src_url·src_at)과 함께. 레지스트리에서 빠진 rf- 행은 지운다.
//    상세 camps/{id}.json의 rf에는 표준데이터 원문 값(구분·입장료·숙박 가능·주요 시설·수용 인원·면적·관리기관·기준일)을 둔다.
// 2) 상세 camps/{id}.json의 rf에 표준데이터 원문 값을 둔다(주변 공공시설 칩은 nearby-context.mjs의 nearby.public).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GridIndex } from "../lib/geo.mjs";
import { sidoStd } from "../lib/geo-sanity.mjs";
import { areaOf } from "../lib/explore-data.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = process.env.EXPLORE_DIR || join(root, "camping-atlas/public/explore/data");
const regPath = join(root, "pipeline/registry/public-leisure.json");
if (!existsSync(regPath)) { console.log("public leisure: registry/public-leisure.json 없음 — 건너뜀"); process.exit(0); }
const reg = JSON.parse(readFileSync(regPath, "utf8"));
const catPath = join(dataDir, "campgrounds.json");
const cat = JSON.parse(readFileSync(catPath, "utf8"));

// ── 1) 휴양림 ───────────────────────────────────────────────
const CLS_OP = "NATURAL_RECREATION_FOREST";
const core = (s) => String(s ?? "").replace(/\s+/g, "").replace(/(국립|공립|사립|도립|군립|시립|자연휴양림|휴양림|야영장|캠핑장|오토캠핑장|숲속|산림욕장)/g, "");
const forests = (reg.forests ?? []).filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng) && f.name);
const live = new Set(forests.map((f) => f.id));
for (let i = cat.length - 1; i >= 0; i--) if (/^rf-/.test(String(cat[i].id)) && !live.has(String(cat[i].id))) cat.splice(i, 1);
const byId = new Map(cat.map((c, i) => [String(c.id), i]));
const campIdx = new GridIndex(cat.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && !/^rf-/.test(String(c.id))), 0.05);
let matched = 0, added = 0;
const detailPatch = new Map(); // id → rf 상세
for (const f of forests) {
  const k = core(f.name);
  const near = campIdx.within(f.lat, f.lng, 3000).map((x) => x.point).filter((c) => k.length >= 2 && (core(c.name).includes(k) || (core(c.name).length >= 2 && k.includes(core(c.name)))));
  const rf = { cls: f.cls ?? null, fee: f.fee ?? null, stay: f.stay ?? null, fac: f.facilities ?? null, cap: f.capacity ?? null, area: f.area ?? null, inst: f.inst ?? null, tel: f.tel ?? null, home: f.homepage ?? null, ref: f.ref ?? null, src: { label: reg.sources?.forest?.label ?? "전국휴양림표준데이터", url: reg.sources?.forest?.url ?? null, at: f.ref ?? reg.collected_at ?? null } };
  if (near.length) {
    for (const c of near) {
      c.rf = f.cls ?? c.rf ?? "휴양림";
      if (!c.op || c.op === "UNKNOWN") c.op = CLS_OP;
      detailPatch.set(String(c.id), rf);
    }
    matched++;
    continue;
  }
  const rec = {
    id: f.id, name: f.name, sido: f.sido ? sidoStd({ sido: f.sido, addr: f.addr }) : null, sigungu: f.sigungu ?? null, area: areaOf(f.sido ?? f.addr),
    addr: f.addr ?? null, lat: f.lat, lng: f.lng, tel: f.tel ?? null, homepage: f.homepage ?? null,
    op: CLS_OP, status: "운영", types: ["자연휴양림"], rf: f.cls ?? "휴양림",
    src_url: reg.sources?.forest?.url ?? null, src_at: f.ref ?? reg.collected_at ?? null,
  };
  for (const k2 of Object.keys(rec)) if (rec[k2] == null) delete rec[k2];
  if (byId.has(f.id)) cat[byId.get(f.id)] = { ...cat[byId.get(f.id)], ...rec };
  else { cat.push(rec); byId.set(f.id, cat.length - 1); added++; }
  detailPatch.set(f.id, rf);
}

// ── 2) 상세 휴양림 정보(d.rf) ──────────────────────────────
// 주변 휴양림·박물관·수영장·실내놀이터 칩은 main의 nearby.public(nearby-context.mjs)이 맡는다 — 여기서는 만들지 않는다.
for (const [id, rf] of detailPatch) {
  const dp = join(dataDir, "camps", `${id}.json`);
  const d = existsSync(dp) ? JSON.parse(readFileSync(dp, "utf8")) : {};
  if (JSON.stringify(d.rf ?? null) !== JSON.stringify(rf)) { d.rf = rf; writeFileSync(dp, JSON.stringify(d)); }
}
writeFileSync(catPath, JSON.stringify(cat));
console.log(`public leisure → 휴양림 ${forests.length}곳(기존 캠핑장에 연결 ${matched} · 새로 추가 ${added})`);
