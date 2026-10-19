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
// 운영자 자체 홈페이지 문장(crawl-operator-sites.mjs). 운영자가 스스로 공개한 글이므로 공식 소개와 같은 OFFICIAL_TEXT 등급으로 쓴다.
const sitesPath = join(root, "pipeline/registry/operator-site-snippets.json");
const sites = existsSync(sitesPath) ? JSON.parse(readFileSync(sitesPath, "utf8")).campgrounds ?? {} : {};
// 여러 캠핑장이 함께 쓰는 홈페이지(시·군 통합 예약 등)는 문장이 어느 시설 것인지 알 수 없어 쓰지 않는다.
const hostOf = (u) => { try { return new URL(/^[a-z]+:\/\//i.test(u) ? u : `http://${u}`).hostname.replace(/^www\./, ""); } catch { return null; } };
const hostCount = new Map();
for (const c of camps) { const h = c.homepage && hostOf(c.homepage); if (h) hostCount.set(h, (hostCount.get(h) ?? 0) + 1); }

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
  const site = sites[c.id];
  if (site?.status === "OK" && site.snippets?.length && (hostCount.get(hostOf(c.homepage)) ?? 0) <= 1 && (hostCount.get(hostOf(site.url)) ?? 0) <= 1) {
    // 쪽(URL)마다 한 문서로 묶어 원문 링크가 정확한 쪽을 가리키게 한다.
    // 이미지 안내문 OCR 문장은 이미지마다 한 문서로 두고 원본 이미지 주소를 근거에 남긴다(화면 (i)에서 원본 이미지를 본다).
    const byUrl = new Map();
    for (const sn of site.snippets) { const k = sn.image ? `img|${sn.image}` : sn.url; const cur = byUrl.get(k) ?? { url: sn.url, image: sn.image ?? null, text: "" }; cur.text += `\n${sn.text}`; byUrl.set(k, cur); }
    for (const { url, image, text } of byUrl.values()) docs.push({ text, grade: "OFFICIAL_TEXT", source: { kind: "operator_homepage", label: image ? "운영자 안내 이미지(글자 인식)" : "운영자 홈페이지", url, date: site.checked_at, ...(image ? { image } : {}) } });
  }
  if (d.intro) docs.push({ text: d.intro, grade: "OFFICIAL_TEXT", source: { kind: "gocamping_intro", label: "고캠핑 운영자 소개글", url: c.gc_url ?? null, date: c.modified_at ?? null } });
  const reviews = [...(d.reviews ?? []), ...(d.cafe ?? []), ...(d.web ?? [])];
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
