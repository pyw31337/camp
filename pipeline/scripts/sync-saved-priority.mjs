#!/usr/bin/env node
// 공용 찜(Supabase shared_save — 모든 사용자의 찜)을 읽어 우선 수집 목록 data/priority/saved-camps.json을 만든다(lib/priority.mjs가 읽음).
// 읽기만 한다. 키는 SUPABASE_URL·SUPABASE_ANON_KEY(공개 키), 없으면 배포된 사이트의 공개 설정(meta)을 읽는다.
// 사용: node scripts/sync-saved-priority.mjs [--print-ids]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SAVED_PRIORITY_PATH } from "../lib/priority.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
async function config() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  const html = await (await fetch("https://pyw31337.github.io/camp/", { signal: AbortSignal.timeout(20000) })).text();
  const meta = (n) => html.match(new RegExp(`name="${n}" content="([^"]+)"`))?.[1];
  return { url: meta("supabase-url"), key: meta("supabase-anon-key") };
}
const { url, key } = await config();
if (!url || !key) { console.log("::warning::Supabase 공개 설정 없음 — 우선 목록을 갱신하지 않음"); process.exit(0); }
const r = await fetch(`${url}/rest/v1/shared_save?select=campground_id,created_at&order=created_at.desc`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
if (!r.ok) { console.log(`::warning::공용 찜 읽기 실패 ${r.status}`); process.exit(0); }
const rows = await r.json();
const cat = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const byId = new Map((Array.isArray(cat) ? cat : cat.camps ?? []).map((c) => [String(c.id), c]));
const camps = rows.map((x) => ({ id: String(x.campground_id), name: byId.get(String(x.campground_id))?.name ?? null, saved_at: x.created_at })).filter((x) => byId.has(x.id));
mkdirSync(dirname(SAVED_PRIORITY_PATH), { recursive: true });
writeFileSync(SAVED_PRIORITY_PATH, `${JSON.stringify({ note: "공용 찜(모든 사용자) 스냅숏 — 수집기가 이 업장들을 먼저·자주 수집한다(lib/priority.mjs)", updated_at: new Date().toISOString(), ids: camps.map((x) => x.id), camps }, null, 1)}\n`);
if (process.argv.includes("--print-ids")) console.log(camps.map((x) => x.id).join(","));
else console.log(`찜한 업장 ${camps.length}곳 → ${SAVED_PRIORITY_PATH}`);
