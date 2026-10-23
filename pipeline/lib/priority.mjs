// 찜한 업장 우선 수집(소유자 2026-10-23: “찜한 업장에 수집 가중치를 두어 각종 플랫폼에서 최대한 빠르게 수집”).
// 우선 목록: 환경 변수 PRIORITY_IDS(쉼표) + data/priority/saved-camps.json(공용 찜 스냅숏, scripts/sync-saved-priority.mjs).
// 수집기는 이 목록을 대기열 맨 앞에 두고, 우선 업장은 짧은 주기(PRIORITY_MAX_AGE_DAYS, 기본 1일)로 다시 확인한다.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
export const SAVED_PRIORITY_PATH = join(root, "data/priority/saved-camps.json");
export const PRIORITY_MAX_AGE_DAYS = Number(process.env.PRIORITY_MAX_AGE_DAYS ?? 1);

/** 우선 업장 id 집합(문자열) */
export function priorityIds() {
  const ids = new Set(String(process.env.PRIORITY_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean));
  if (process.env.PRIORITY_IGNORE_SAVED !== "1" && existsSync(SAVED_PRIORITY_PATH)) {
    try { for (const x of JSON.parse(readFileSync(SAVED_PRIORITY_PATH, "utf8")).ids ?? []) ids.add(String(x)); } catch {}
  }
  return ids;
}

/** 목록에서 우선 업장을 맨 앞으로(나머지 순서는 그대로) */
export function prioritize(list, idOf = (x) => x.id, ids = priorityIds()) {
  if (!ids.size) return list;
  const head = [], tail = [];
  for (const x of list) (ids.has(String(idOf(x))) ? head : tail).push(x);
  return [...head, ...tail];
}

/** 우선 업장은 maxAge 대신 짧은 주기로 ‘갱신할 때’가 된다 */
export function isDueWithPriority(id, fetchedAt, maxAgeDays, ids = priorityIds(), now = Date.now()) {
  const age = (now - (Date.parse(fetchedAt ?? "") || 0)) / 864e5;
  return age >= (ids.has(String(id)) ? Math.min(maxAgeDays, PRIORITY_MAX_AGE_DAYS) : maxAgeDays);
}
