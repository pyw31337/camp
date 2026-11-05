#!/usr/bin/env node
// 공식 사진·검증된 후기 사진·아직 비어 있는 사진 후보를 매 실행 수치화한다.
// 원본 데이터는 건드리지 않고, 다음 수집 실행의 우선순위와 회귀 감시에 쓴다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const catalog = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const photos = existsSync(join(dataDir, "photos.json")) ? JSON.parse(readFileSync(join(dataDir, "photos.json"), "utf8")) : {};
const fallbackPath = join(root, "pipeline/registry/card-fallback.json");
const fallback = existsSync(fallbackPath) ? JSON.parse(readFileSync(fallbackPath, "utf8")).camps ?? {} : {};
const outPath = join(root, "pipeline/registry/thumbnail-coverage.json");
const now = new Date().toISOString();
const summary = { total: catalog.length, official: 0, fallback: 0, pending: 0, no_candidate: 0, rejected: 0, broken_media_refs: 0 };
const pending = [], noCandidate = [];
for (const c of catalog) {
  const id = String(c.id);
  const official = Boolean(c.ph || c.img || (photos[id]?.length));
  if (official) { summary.official++; continue; }
  const f = fallback[id];
  if (f?.blocked) { summary.rejected++; continue; }
  if (c.pt?.t || c.sn || f?.t) { summary.fallback++; continue; }
  const p = join(dataDir, "camps", `${id}.json`);
  const d = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
  const candidates = [...(d.sns_images ?? []), ...(d.reviews ?? []), ...(d.cafe ?? []), ...(d.web ?? [])].filter((x) => x?.thumb || x?.img);
  if (candidates.length) { summary.pending++; if (pending.length < 100) pending.push({ id, name: c.name, candidates: candidates.length }); }
  else { summary.no_candidate++; if (noCandidate.length < 100) noCandidate.push({ id, name: c.name }); }
}
const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
writeFileSync(outPath, JSON.stringify({ generated_at: now, summary, pending, no_candidate: noCandidate, previous: previous.summary ?? null }, null, 2) + "\n");
console.log(`썸네일 커버리지: 전체 ${summary.total} · 공식 ${summary.official} · 대체 ${summary.fallback} · 후보 대기 ${summary.pending} · 후보 없음 ${summary.no_candidate} · 판정 제외 ${summary.rejected}`);
