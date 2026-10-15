#!/usr/bin/env node
// 공개 탐색 데이터(camps/{id}.json)에 스펙 시트(spec)를 붙인다. data-sync가 탐색 발행·조건 재계산 뒤 실행한다.
// 입력: 운영자 공지 레지스트리(registry/campground-notices.json, 등급 OPERATOR), 고캠핑 공식 소개(intro, 등급 OFFICIAL_TEXT),
//       Daum 검색 후기 요약(reviews·cafe, 등급 MENTION). 원문 문장·출처·날짜를 값마다 남긴다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSpecSheet, SPEC_FIELDS } from "../lib/spec-extractor.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const camps = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const noticesPath = join(root, "pipeline/registry/campground-notices.json");
const notices = existsSync(noticesPath) ? JSON.parse(readFileSync(noticesPath, "utf8")).campgrounds ?? {} : {};
const now = process.env.SPEC_NOW ?? new Date().toISOString();

const count = Object.fromEntries(Object.keys(SPEC_FIELDS).map((k) => [k, { official: 0, mention: 0 }]));
let withAny = 0, roundups = 0;
for (const c of camps) {
  const path = join(dataDir, "camps", `${c.id}.json`);
  if (!existsSync(path)) continue;
  const d = JSON.parse(readFileSync(path, "utf8"));
  const docs = [];
  for (const item of notices[c.id]?.items ?? []) {
    if (!item?.source?.url || !item?.source?.checked_at) continue; // 원문·확인일 없는 공지는 쓰지 않는다
    docs.push({ text: `${item.title ?? ""}. ${item.summary ?? ""}. ${item.body ?? ""}`, grade: "OPERATOR", source: { kind: "operator_notice", label: item.source.label ?? "운영자 공지", url: item.source.url, date: item.source.checked_at } });
  }
  if (d.intro) docs.push({ text: d.intro, grade: "OFFICIAL_TEXT", source: { kind: "gocamping_intro", label: "고캠핑 운영자 소개글", url: c.gc_url ?? null, date: c.modified_at ?? null } });
  const reviews = [...(d.reviews ?? []), ...(d.cafe ?? [])];
  const spec = buildSpecSheet({ name: c.name, docs, reviews, now });
  roundups += spec.stats.roundups_skipped;
  if (Object.keys(spec.fields).length) { withAny++; d.spec = spec; } else delete d.spec;
  for (const [code, f] of Object.entries(spec.fields)) { if (f.values.length) count[code].official++; if (f.mentions.length) count[code].mention++; }
  writeFileSync(path, JSON.stringify(d));
}
const metaPath = join(dataDir, "meta.json");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
meta.spec_sheet = { generated_at: now, campgrounds_with_spec: withAny, roundup_reviews_skipped: roundups, fields: count };
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(`스펙 시트: ${withAny}/${camps.length}곳 · 묶음 글 제외 ${roundups}건`);
for (const [k, v] of Object.entries(count)) console.log(`  ${SPEC_FIELDS[k].label}: 공식 ${v.official} · 후기 언급 ${v.mention}`);
