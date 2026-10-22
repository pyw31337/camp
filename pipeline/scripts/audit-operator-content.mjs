#!/usr/bin/env node
// 공용 운영 포털의 다른 시설 공지·푸터가 특정 캠핑장 사실로 섞이는 것을 막는다.
// 사용: node scripts/audit-operator-content.mjs [--apply]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeDisplayEntities, isOperatorContentNoise, nameTokens } from "../lib/detail-text-review.mjs";
import { PROFILE_FIELDS, summaryOf, tagsOf } from "../lib/campground-profile.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const catalogPath = join(dataDir, "campgrounds.json");
const registryPath = join(root, "pipeline/registry/operator-site-snippets.json");
const apply = process.argv.includes("--apply");
const now = new Date().toISOString();
const read = (p, fallback) => existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback;
const camps = read(catalogPath, []);
const registry = read(registryPath, { campgrounds: {} });
const fold = (s) => decodeDisplayEntities(s).toLowerCase().replace(/[^0-9a-z가-힣]/gi, "");
const hostOf = (url) => { try { return new URL(String(url)).hostname.replace(/^www\./, ""); } catch { return ""; } };
const homesPerHost = new Map();
for (const c of camps) { const h = hostOf(c.homepage); if (h) homesPerHost.set(h, (homesPerHost.get(h) ?? 0) + 1); }
const namesMatch = (c, text) => {
  const body = fold(text), whole = fold(c.name);
  if (whole.length >= 4 && body.includes(whole)) return true;
  const tokens = nameTokens(c.name, c.sigungu).map(fold).filter((x) => x.length >= 2);
  return tokens.length >= 2 && tokens.every((t) => body.includes(t));
};
const isSharedPortal = (url) => (homesPerHost.get(hostOf(url)) ?? 0) > 1;
const conflictsWithCampIdentity = (c, text) => {
  if (!/(캠핑장|야영장|글램핑|카라반|캠프)/.test(String(c.name ?? ""))) return false;
  const s = decodeDisplayEntities(text).replace(/\s+/g, " ");
  return !/(캠핑|야영|글램핑|카라반|캠프)/i.test(s) && /(정원|수목원|파크골프|체육관|운동장|박물관|관광지시설)/.test(s);
};
function verdict(c, row) {
  const text = decodeDisplayEntities(row?.text ?? row?.title ?? row ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [false, "빈 문장"];
  if (isOperatorContentNoise(text)) return [false, "공용 포털 푸터·다른 시설 문구"];
  if (/^(?:공지사항|이용안내|예약안내|바로가기|더보기|목록)$/u.test(text)) return [false, "내용 없는 메뉴명"];
  if (conflictsWithCampIdentity(c, text)) return [false, "같은 지명의 다른 시설 문구"];
  if (isSharedPortal(row?.url) && !namesMatch(c, text)) return [false, "공유 포털에서 업장 식별 근거 없음"];
  return [true, null];
}
function quarantine(target, type, row, reason) {
  if (!target) return;
  target.integrity_quarantine ??= [];
  const value = typeof row === "string" ? { text: row } : row;
  const key = `${type}|${value.url ?? ""}|${value.text ?? value.title ?? ""}`;
  if (target.integrity_quarantine.some((x) => x.key === key)) return;
  target.integrity_quarantine.push({ key, type, reason, text: decodeDisplayEntities(value.text ?? value.title ?? "").slice(0, 240), url: value.url ?? null, audited_at: now });
}
function rowsOf(c, rows, type, target, title = false) {
  const kept = [];
  for (const raw of rows ?? []) {
    const row = typeof raw === "string" ? { text: raw } : { ...raw };
    const key = title ? "title" : "text";
    row[key] = decodeDisplayEntities(row[key]).replace(/\s+/g, " ").trim();
    const [ok, why] = verdict(c, row);
    if (ok) kept.push(row); else quarantine(target, type, row, why);
  }
  return kept;
}
function cleanProfile(c, detail, target) {
  const profile = detail.profile;
  if (!profile?.fields) return 0;
  let removed = 0;
  const dropped = new Set();
  for (const [code, field] of Object.entries(profile.fields)) {
    const source = field?.source ?? {};
    if (!/운영자|표준\s*운영|공공야영장/.test(String(source.label ?? ""))) continue;
    const row = { text: source.quote ?? field.value, url: source.url };
    const [ok, why] = verdict(c, row);
    if (ok) continue;
    dropped.add(code); removed++;
    quarantine(target, `profile_${code.toLowerCase()}`, row, why);
    delete profile.fields[code];
  }
  if (!removed) return 0;
  const tagFor = { FIRE: "FIREWOOD", PARKING: "SITE_PARKING", POWER: "HIGH_POWER", CAR_CAMPING: "CAR_CAMPING", PET: "PET_OK" };
  const forbidden = new Set([...dropped].map((x) => tagFor[x]).filter(Boolean));
  profile.tags = tagsOf(c, profile.fields, null, null).filter((tag) => !forbidden.has(tag.code));
  profile.summary = summaryOf(profile.fields);
  profile.score = { known: PROFILE_FIELDS.filter(([code]) => profile.fields[code]).length, facts: PROFILE_FIELDS.filter(([code]) => profile.fields[code] && profile.fields[code].grade !== "MENTION").length, total: PROFILE_FIELDS.length };
  return removed;
}

const stats = { details: 0, registry: 0, detail: 0, rules: 0, notices: 0, profile: 0 };
for (const c of camps) {
  const id = String(c.id), reg = registry.campgrounds?.[id];
  if (reg?.status === "OK") {
    const snippets = rowsOf(c, reg.snippets, "operator_snippet", reg);
    stats.registry += (reg.snippets?.length ?? 0) - snippets.length;
    const notices = rowsOf(c, reg.notices, "operator_notice", reg, true);
    stats.notices += (reg.notices?.length ?? 0) - notices.length;
    if (apply) { reg.snippets = snippets; if (notices.length) reg.notices = notices; else delete reg.notices; if (!snippets.length) reg.status = "NO_RELEVANT_TEXT"; }
  }
  const path = join(dataDir, "camps", `${id}.json`);
  if (!existsSync(path)) continue;
  const detail = read(path, null); if (!detail) continue;
  const before = JSON.stringify(detail);
  const quarantineTarget = reg ?? { status: "QUARANTINED", integrity_quarantine: [] };
  const op = rowsOf(c, detail.operator_snippets, "detail_operator", quarantineTarget);
  stats.detail += (detail.operator_snippets?.length ?? 0) - op.length;
  if (op.length) detail.operator_snippets = op; else delete detail.operator_snippets;
  const h = detail.house_rules;
  if (h) {
    for (const key of ["rules", "ops"]) { const clean = rowsOf(c, h[key], `house_${key}`, quarantineTarget); stats.rules += (h[key]?.length ?? 0) - clean.length; if (clean.length) h[key] = clean; else delete h[key]; }
    const notices = rowsOf(c, h.notices, "house_notices", quarantineTarget, true); stats.notices += (h.notices?.length ?? 0) - notices.length;
    if (notices.length) h.notices = notices; else delete h.notices;
    if (!(h.tags?.length || h.rules?.length || h.ops?.length || h.notices?.length)) delete detail.house_rules;
  }
  stats.profile += cleanProfile(c, detail, quarantineTarget);
  if (!reg && quarantineTarget.integrity_quarantine.length && apply) { registry.campgrounds ??= {}; registry.campgrounds[id] = quarantineTarget; }
  if (JSON.stringify(detail) !== before) { stats.details++; if (apply) writeFileSync(path, JSON.stringify(detail)); }
}
if (apply) { registry.generated_at = now; writeFileSync(registryPath, JSON.stringify(registry, null, 1)); }
console.log(`${apply ? "적용" : "점검"}: 상세 ${stats.details} · 운영자 ${stats.registry} · 안내 ${stats.detail} · 규칙 ${stats.rules} · 공지 ${stats.notices} · 프로필 ${stats.profile}`);
