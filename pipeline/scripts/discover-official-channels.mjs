#!/usr/bin/env node
// 카탈로그(고캠핑 홈페이지·예약 경로 등)에서 공식 채널 주소를 모아 소유를 확인한다(2026-11-11 t60).
// 결과는 pipeline/registry/official-channels.json 에 쌓기만 한다(지우지 않음).
// 네트워크: naver.me 짧은 주소만 robots 허용(Allow: /)일 때 HEAD 로 풀고, RSS·카페·인스타 본문은 받지 않는다.
// 사용: node scripts/discover-official-channels.mjs [--resolve-short] [--limit N]
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  candidatesFromCamp, verifyOwnership, sharedChannelIds, mergeRegistry,
  publicRecord, classifyUrl, CHANNEL_TYPES, LEGAL,
} from "../lib/official-channels.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RESOLVE_SHORT = process.argv.includes("--resolve-short");
const LIMIT = Number(arg("--limit", 0)) || Infinity;
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; official channel URLs already in catalog)";
const dataDir = join(root, "camping-atlas/public/explore/data");
const regDir = join(root, "pipeline/registry");
const outPath = join(regDir, "official-channels.json");
const publicPath = join(regDir, "official-channels-public.json");

const catalog = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { camps: {} };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function resolveShort(url) {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "user-agent": UA }, signal: AbortSignal.timeout(5000) });
    return r.url || url;
  } catch { return url; }
}

const raw = [];
for (const c of catalog) {
  if (raw.length >= LIMIT) break;
  for (const ch of candidatesFromCamp(c)) raw.push({ camp: c, ch });
}

if (RESOLVE_SHORT) {
  // 고캠핑 홈페이지 칸의 naver.me 만 푼다(예약·기타 짧은 주소는 공식 채널이 아닐 수 있음). robots 는 Allow: /.
  const shorts = raw.filter((x) => x.ch.type === "short" && (x.ch.source === "homepage" || x.ch.source === "homepage_raw"));
  console.log(`짧은 주소 풀기: 홈페이지 ${shorts.length}개`);
  let i = 0;
  for (const x of shorts) {
    const dest = await resolveShort(x.ch.url);
    i++;
    if (i % 5 === 0 || i === shorts.length) console.log(`  ${i}/${shorts.length}`);
    await sleep(1100);
    const hit = classifyUrl(dest);
    if (hit && hit.type !== "short") {
      x.ch = { ...hit, source: x.ch.source, campId: x.ch.campId, resolved_from: x.ch.url };
    }
  }
}

const shared = sharedChannelIds(raw.map((x) => x.ch));
const byCamp = new Map();
const typeAll = {}, typeVerified = {}, sourceAll = {};
let reviewLike = 0, sharedSkip = 0, shortLeft = 0;

for (const { camp, ch } of raw) {
  if (ch.type === "short") { shortLeft++; continue; }
  sourceAll[ch.source] = (sourceAll[ch.source] ?? 0) + 1;
  typeAll[ch.type] = (typeAll[ch.type] ?? 0) + 1;
  const v = verifyOwnership(camp, ch, { shared });
  if (v.reasons.includes("review_like")) { reviewLike++; continue; }
  if (v.reasons.includes("shared_channel")) { sharedSkip++; continue; }
  if (v.verified) typeVerified[ch.type] = (typeVerified[ch.type] ?? 0) + 1;
  const id = String(camp.id);
  if (!byCamp.has(id)) byCamp.set(id, { id, name: camp.name, channels: [] });
  const meta = CHANNEL_TYPES[ch.type];
  byCamp.get(id).channels.push({
    type: ch.type,
    url: ch.url,
    id: ch.id,
    source: ch.source,
    verified: v.verified,
    by: v.reasons,
    label: meta?.label ?? ch.type,
    ...(ch.resolved_from ? { resolved_from: ch.resolved_from } : {}),
  });
}

const nextCamps = Object.fromEntries(byCamp);
const camps = mergeRegistry(prev, nextCamps);
const publicCamps = {};
let nVerified = 0, nCampsVerified = 0;
for (const [id, e] of Object.entries(camps)) {
  const rec = publicRecord(e);
  if (rec.length) { publicCamps[id] = rec; nCampsVerified++; nVerified += rec.length; }
}

const stats = {
  camps_with_candidate: Object.keys(camps).length,
  candidates_by_type: typeAll,
  verified_by_type: typeVerified,
  candidates_by_source_field: sourceAll,
  verified_channels: nVerified,
  verified_camps: nCampsVerified,
  skipped_review_like: reviewLike,
  skipped_shared_channel: sharedSkip,
  unresolved_short: shortLeft,
  shared_channel_keys: [...shared],
};

mkdirSync(regDir, { recursive: true });
const out = {
  note: "캠핑장 공식 채널(자체 홈페이지·공식 블로그·공식 카페·공식 SNS). 카탈로그에 업장이 등록한 주소만. 후기 글은 제외. 쌓기만 함.",
  generated_at: new Date().toISOString(),
  legal: LEGAL,
  stats,
  camps,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
writeFileSync(publicPath, JSON.stringify({
  note: "소유 확인된 공식 채널만(링크). 상세 화면 배지·업체 정보용.",
  generated_at: out.generated_at,
  camps: publicCamps,
}) + "\n");

console.log(`후보 캠핑장 ${stats.camps_with_candidate}곳 · 소유 확인 ${nCampsVerified}곳 ${nVerified}개 채널`);
console.log(`유형별 후보 ${JSON.stringify(typeAll)}`);
console.log(`유형별 확인 ${JSON.stringify(typeVerified)}`);
console.log(`후기성 ${reviewLike} · 공유 채널 ${sharedSkip} · 짧은 주소 미해결 ${shortLeft}`);
console.log(`저장: ${outPath}`);
