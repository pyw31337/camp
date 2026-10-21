#!/usr/bin/env node
// 공용 운영 포털의 다른 시설 공지·푸터가 특정 캠핑장 사실로 섞이는 것을 막는다.
// 원문을 삭제하지 않고 registry/detail의 integrity_quarantine에 원문 URL·사유·감사 시각을 보존한다.
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

function namesMatch(c, text) {
  const body = fold(text), whole = fold(c.name);
  if (whole.length >= 4 && body.includes(whole)) return true;
  const tokens = nameTokens(c.name, c.sigungu).map(fold).filter((x) => x.length >= 2);
  return tokens.length >= 2 && tokens.every((t) => body.includes(t));
}
function conflictsWithCampIdentity(c, text) {
  // "자라섬 캠핑장"의 공지에 "자라섬정원"만 나오는 것처럼, 지명은 같지만
  // 다른 시설인 공용 포털 문구를 업장 안내로 쓰지 않는다.
  if (!/(캠핑장|야영장|글램핑|카라반|캠프)/.test(String(c.name ?? ""))) return false;
  const s = decodeDisplayEntities(text).replace(/\s+/g, " ");
  return !/(캠핑|야영|글램핑|카라반|캠프)/i.test(s) && /(정원|수목원|파크골프|체육관|운동장|박물관|관광지시설)/.test(s);
}
function verdict(c, row) {
  const text = decodeDisplayEntities(row?.text ?? row?.title ?? row ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [false, "빈 문장"];
  if (isOperatorContentNoise(text)) return [false, "공용 포털 푸터·다른 시설 문구"];
  if (/^(?:공지사항|이용안내|예약안내|바로가기|더보기|목록)$/u.test(text)) return [false, "내용 없는 메뉴명"];
  if (conflictsWithCampIdentity(c, text)) return [false, "같은 지명의 다른 시설 문구"];
  if (namesMatch(c, text)) return [true, null];
  return [false, "업장 식별 근거 없는 공용 포털 문장"];
}
function sharedPortal(c, url) {
  const host = hostOf(url);
  return host && (homesPerHost.get(host) ?? 0) > 1;
}
function profileFactNeedsAudit(field) {
  const source = field?.source ?? {};
  const label = String(source.label ?? "");
  // 고캠핑 구조화 값과 사람이 별도 대조한 파일럿 값은 이 감사 범위가 아니다.
  // 공용 포털의 운영자 문장·표준 규정으로부터 파생한 값만 엄격하게 소유권을 재확인한다.
  return /운영자|표준\s*운영|공공야영장/.test(label) && !/고캠핑|파일럿 검증/.test(label);
}
function cleanProfile(c, detail, target) {
  const profile = detail.profile;
  if (!profile?.fields) return 0;
  let removed = 0;
  const removedCodes = new Set();
  for (const [code, field] of Object.entries(profile.fields)) {
    if (!profileFactNeedsAudit(field)) continue;
    const src = field.source ?? {};
    const row = { text: src.quote ?? field.value, url: src.url };
    const [ok, reason] = verdict(c, row);
    // 공용 포털에서 여러 시설이 같은 경로를 쓰는 경우, 이름 없는 '표준 운영' 값은
    // 해당 캠핑장 확정 사실이 아니다. 전용 URL 또는 캠핑장명이 있는 문장만 남긴다.
    const sharedWithoutName = sharedPortal(c, src.url) && !namesMatch(c, src.quote ?? "");
    if (!ok || sharedWithoutName) {
      removed++;
      removedCodes.add(code);
      pushQuarantine(target, `profile_${code.toLowerCase()}`, { text: src.quote ?? field.value, url: src.url }, sharedWithoutName ? "공용 포털 공통 규정에 업장 식별 근거 없음" : reason);
      delete profile.fields[code];
    }
  }
  if (!removed) return 0;
  const tagForField = { FIRE: "FIREWOOD", PARKING: "SITE_PARKING", POWER: "HIGH_POWER", CAR_CAMPING: "CAR_CAMPING", PET: "PET_OK" };
  const forbidden = new Set([...removedCodes].map((code) => tagForField[code]).filter(Boolean));
  // 파생 태그·요약도 같은 남은 사실만으로 다시 만든다. 이전 태그를 부분 유지하면
  // 삭제한 전력/주차 값이 카드까지 남을 수 있다.
  profile.tags = tagsOf(c, profile.fields, null, null).filter((tag) => !forbidden.has(tag.code));
  profile.summary = summaryOf(profile.fields);
  profile.score = {
    known: PROFILE_FIELDS.filter(([code]) => profile.fields[code]).length,
    facts: PROFILE_FIELDS.filter(([code]) => profile.fields[code] && profile.fields[code].grade !== "MENTION").length,
    total: PROFILE_FIELDS.length,
  };
  return removed;
}
function pushQuarantine(target, type, row, reason) {
  if (!target) return;
  const value = typeof row === "string" ? { text: row } : row;
  target.integrity_quarantine ??= [];
  const key = `${type}|${value.url ?? ""}|${value.text ?? value.title ?? ""}`;
  if (target.integrity_quarantine.some((x) => x.key === key)) return;
  target.integrity_quarantine.push({ key, type, reason, text: decodeDisplayEntities(value.text ?? value.title ?? "").slice(0, 240), url: value.url ?? null, audited_at: now });
}
function cleanRows(c, rows, type, target, { title = false, trusted = false } = {}) {
  const keep = [];
  for (const raw of rows ?? []) {
    const row = typeof raw === "string" ? { text: raw } : { ...raw };
    const field = title ? "title" : "text";
    row[field] = decodeDisplayEntities(row[field]).replace(/\s+/g, " ").trim();
    const [ok, reason] = trusted ? [true, null] : verdict(c, row);
    if (ok) keep.push(row); else pushQuarantine(target, type, row, reason);
  }
  return keep;
}

const stats = { camps: 0, registry_removed: 0, detail_removed: 0, rules_removed: 0, notices_removed: 0, profile_removed: 0, entity_normalized: 0 };
for (const c of camps) {
  const id = String(c.id), reg = registry.campgrounds?.[id];
  if (reg?.status === "OK") {
    const before = reg.snippets?.length ?? 0;
    const cleaned = cleanRows(c, reg.snippets, "operator_snippet", reg);
    stats.registry_removed += before - cleaned.length;
    if (apply) {
      reg.snippets = cleaned;
      if (!cleaned.length) {
        reg.status = "NO_RELEVANT_TEXT";
        reg.reason = "업장 식별 근거 없는 공용 포털 문장을 격리함";
      }
      const notices = cleanRows(c, reg.notices, "operator_notice", reg, { title: true });
      if (reg.notices?.length) stats.notices_removed += reg.notices.length - notices.length;
      if (notices.length) reg.notices = notices; else delete reg.notices;
    }
  }

  const path = join(dataDir, "camps", `${id}.json`);
  if (!existsSync(path)) continue;
  const detail = read(path, null);
  if (!detail) continue;
  const beforeText = JSON.stringify(detail);
  // curated-camp-facts는 사람이 운영자·공공 원문을 대조해 작성한 예외 보정이다.
  // 자동 크롤 본문과 섞지 않으며, 같은 파이프라인의 문장 소유권 추정으로 다시 지우지 않는다.
  const trustedCurated = detail.curated_source === "operator_or_public_primary";
  // 상세 발행본에는 격리 원문을 다시 싣지 않는다. 원문·URL·사유는 레지스트리 quarantine에만
  // 남겨 Pages 용량과 사용자 노출을 함께 통제한다.
  const op = cleanRows(c, detail.operator_snippets, "detail_operator", null, { trusted: trustedCurated });
  stats.detail_removed += (detail.operator_snippets?.length ?? 0) - op.length;
  if (op.length) detail.operator_snippets = op; else delete detail.operator_snippets;
  const h = detail.house_rules;
  if (h) {
    for (const key of ["rules", "ops"]) {
      const before = h[key]?.length ?? 0;
      const rows = cleanRows(c, h[key], `house_${key}`, null, { trusted: trustedCurated });
      stats.rules_removed += before - rows.length;
      if (rows.length) h[key] = rows; else delete h[key];
    }
    const before = h.notices?.length ?? 0;
    const notices = cleanRows(c, h.notices, "house_notices", null, { title: true, trusted: trustedCurated });
    stats.notices_removed += before - notices.length;
    if (notices.length) h.notices = notices; else delete h.notices;
    if (!(h.tags?.length || h.rules?.length || h.ops?.length || h.notices?.length)) delete detail.house_rules;
  }
  const profileQuarantine = reg ?? { status: "QUARANTINED", integrity_quarantine: [] };
  const profileRemoved = trustedCurated ? 0 : cleanProfile(c, detail, profileQuarantine);
  stats.profile_removed += profileRemoved;
  if (profileRemoved && !reg) {
    registry.campgrounds ??= {};
    registry.campgrounds[id] = profileQuarantine;
  }
  if (JSON.stringify(detail) !== beforeText) {
    stats.camps++;
    if (apply) writeFileSync(path, JSON.stringify(detail));
  }
}
if (apply) {
  registry.generated_at = now;
  writeFileSync(registryPath, JSON.stringify(registry, null, 1));
}
console.log(`${apply ? "적용" : "점검"}: ${stats.camps}개 상세 · 레지스트리 격리 ${stats.registry_removed} · 상세 안내 격리 ${stats.detail_removed} · 규칙 격리 ${stats.rules_removed} · 공지 격리 ${stats.notices_removed} · 프로필 사실 격리 ${stats.profile_removed}`);
