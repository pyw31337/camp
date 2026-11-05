#!/usr/bin/env node
// 조건 시트의 근거형 필터가 전체 카탈로그를 그대로 세지 않는지 검사한다.
// VR은 실제 외부 뷰어 URL, 우수야영장은 선정 근거 배열이 있는 업장만 센다.
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "camping-atlas/public/explore/data/campgrounds.json";
const raw = JSON.parse(readFileSync(path, "utf8"));
const camps = Array.isArray(raw) ? raw : raw.camps ?? raw.campgrounds ?? raw.items ?? [];
if (!camps.length) throw new Error(`카탈로그가 비어 있습니다: ${path}`);

const vrUrl = (c) => {
  const v = c?.vr;
  const u = typeof v === "string" ? v : v?.url;
  return /^https?:\/\//i.test(u ?? "") ? u : "";
};
const vr = camps.filter((c) => vrUrl(c));
const best = camps.filter((c) => Array.isArray(c.best) ? c.best.length > 0 : Boolean(c.best));
const malformedVr = camps.filter((c) => c?.vr && !vrUrl(c));
if (malformedVr.length) throw new Error(`VR 필드에 유효한 URL이 없는 레코드 ${malformedVr.length}건`);
if (vr.length >= camps.length) throw new Error(`VR 수가 전체 카탈로그(${camps.length})와 같음: 필터 집계 회귀 의심`);

console.log(`OK filter facts — 전체 ${camps.length}곳 · 360° VR ${vr.length}곳 · 공인 우수야영장 ${best.length}곳`);
