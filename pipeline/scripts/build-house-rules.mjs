#!/usr/bin/env node
// 업장 이용 규칙(금지·이용제한·이용수칙)·운영 안내·공지 → 상세(camps/{id}.json의 house_rules) + 목록(campgrounds.json의 nr).
// 원천: 운영자 홈페이지 문장(registry/operator-site-snippets.json·operator-deep.json, 등급 c),
//       고캠핑 등록값(반려동물·장작·숯·전기, 등급 c). 블로그 후기 스니펫은 쓰지 않는다 — 표본 점검(2026-10-19)에서
//       여러 캠핑장을 묶은 글의 규칙이 엉뚱한 곳에 붙는 일이 잦았다.
// 공지는 운영자 게시판 줄(날짜·[공지])만, 18개월 지난 것은 뺀다. 멱등. build-site-types.mjs 뒤에 실행한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { houseRules } from "../lib/house-rules.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const read = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
const camps = read(join(dataDir, "campgrounds.json"), []);
const sites = read(join(root, "pipeline/registry/operator-site-snippets.json"), {}).campgrounds ?? {};
const deep = read(join(root, "pipeline/registry/operator-deep.json"), {}).campgrounds ?? {};
const NOTICE_DAYS = 548;

const OK_STATE = new Set(["CONFIRMED", "VERIFIED", "OPERATOR"]);
function structuredOf(c) {
  const out = [], fc = c.field_conditions ?? {}, of = c.of ?? {};
  const gc = { url: c.gc_url ?? "https://www.gocamping.or.kr/", src: "한국관광공사 고캠핑 운영자 등록값", at: c.modified_at ?? null, g: "c" };
  const fcSrc = { url: fc.source?.url ?? gc.url, src: fc.source?.label ?? gc.src, at: fc.source?.checked_at ?? null, g: "c" };
  if (c.pets === "불가능") out.push({ k: "NO_PET", quote: "반려동물 동반: 불가능", ...gc });
  if (c.pets === "가능(소형견)") out.push({ k: "BIG_DOG", quote: "반려동물 동반: 가능(소형견)", ...gc });
  if (of.fire) {
    const src = { url: of.fire.u, src: "운영자 홈페이지", at: of.fire.t ?? null, g: "c", quote: of.fire.q ?? null };
    if (of.fire.v === "NO_FIRE") out.push({ k: "NO_FIRE", ...src });
    if (of.fire.v === "CHARCOAL_ONLY") out.push({ k: "NO_FIREWOOD", ...src });
  } else {
    const fw = fc.firewood ?? {}, cc = fc.charcoal ?? {};
    const quote = fc.fire_pit?.arrangement ?? null;
    if (fw.allowed === false && OK_STATE.has(fw.state) && cc.allowed === false && OK_STATE.has(cc.state)) out.push({ k: "NO_FIRE", quote: quote ?? "장작·숯 사용 불가", ...fcSrc });
    else if (fw.allowed === false && OK_STATE.has(fw.state)) out.push({ k: "NO_FIREWOOD", quote: quote ?? "장작 사용 불가", ...fcSrc });
    else if (cc.allowed === false && OK_STATE.has(cc.state)) out.push({ k: "NO_CHARCOAL", quote: quote ?? "숯 사용 불가", ...fcSrc });
  }
  if (fc.power?.available === false && OK_STATE.has(fc.power.state)) out.push({ k: "NO_POWER", quote: "전기 사용: 없음", ...fcSrc });
  return out;
}
function positivesOf(c) {
  const fc = c.field_conditions ?? {}, of = c.of ?? {};
  const petOk = /가능/.test(c.pets ?? "") && !/불가/.test(c.pets ?? "");
  return {
    pet: petOk,
    bigDog: c.pets === "가능",
    firewood: of.fire ? of.fire.v === "FIREWOOD_OK" : fc.firewood?.allowed === true,
    charcoal: of.fire ? of.fire.v !== "NO_FIRE" : fc.charcoal?.allowed === true,
    power: fc.power?.available === true || Boolean(of.w),
  };
}

let files = 0, withTags = 0, withRules = 0, withNotices = 0, withOps = 0;
const tagCount = {};
const cutoff = Date.now() - NOTICE_DAYS * 864e5;
for (const c of camps) {
  const path = join(dataDir, "camps", `${c.id}.json`);
  if (!existsSync(path)) { delete c.nr; continue; }
  let d; try { d = JSON.parse(readFileSync(path, "utf8")); } catch { continue; }
  const lines = [];
  for (const reg of [sites[c.id], deep[c.id]]) {
    if (reg?.status !== "OK") continue;
    for (const s of reg.snippets ?? []) lines.push({ text: s.text, url: s.url ?? reg.url, at: reg.checked_at ?? null, g: "c", src: "운영자 홈페이지", ...(s.locator ? { locator: s.locator } : {}) });
  }
  const h = houseRules(lines, structuredOf(c), positivesOf(c));
  // 크롤러가 게시판에서 직접 찾은 공지 글(제목·글 주소·날짜)이 먼저, 문장에서 찾은 공지는 그 뒤에(같은 제목은 하나로)
  const linked = [sites[c.id], deep[c.id]].flatMap((reg) => (reg?.status === "OK" ? (reg.notices ?? []).map((n) => ({ title: n.title, date: n.date ?? null, url: n.url, at: reg.checked_at ?? null, direct: true })) : []));
  const key = (t) => String(t).replace(/[^가-힣a-z0-9]/gi, "").slice(0, 16);
  const seenN = new Set();
  h.notices = [...linked, ...h.notices]
    .filter((n) => !n.date || Date.parse(n.date) >= cutoff)
    .filter((n) => { const k = key(n.title); if (!k || seenN.has(k)) return false; seenN.add(k); return true; })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
    .slice(0, 8);
  const has = h.tags.length || h.rules.length || h.ops.length || h.notices.length;
  const before = JSON.stringify(d.house_rules ?? null);
  if (has) d.house_rules = { v: 1, ...h };
  else delete d.house_rules;
  if (JSON.stringify(d.house_rules ?? null) !== before) { writeFileSync(path, JSON.stringify(d)); files++; }
  // 목록 카드·필터용: 공식(c) 불가 태그 키만
  const nr = h.tags.filter((t) => t.g !== "m").map((t) => t.k);
  if (nr.length) c.nr = nr; else delete c.nr;
  if (h.tags.length) withTags++;
  if (h.rules.length) withRules++;
  if (h.notices.length) withNotices++;
  if (h.ops.length) withOps++;
  for (const t of h.tags) tagCount[t.k] = (tagCount[t.k] ?? 0) + 1;
}
writeFileSync(join(dataDir, "campgrounds.json"), JSON.stringify(camps));
const metaPath = join(dataDir, "meta.json");
if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  meta.stats ??= {};
  Object.assign(meta.stats, { with_house_rules: withRules, with_no_tags: withTags, with_notices: withNotices });
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
}
console.log(`업장 규칙: 불가 태그 ${withTags}곳 · 이용 규칙 ${withRules}곳 · 운영 안내 ${withOps}곳 · 공지 ${withNotices}곳 · 상세 ${files}개 갱신`);
console.log("  태그별", JSON.stringify(tagCount));
