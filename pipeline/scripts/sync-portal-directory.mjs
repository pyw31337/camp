#!/usr/bin/env node
// 공용 예약 사이트 업장 목록 갱신 → registry/portal-directory.json (lib/portal-links.mjs가 읽음)
// - 숲나들e: 첫 화면(main.do)의 휴양림 지도 목록(이름·휴양림 페이지 주소). robots.txt 허용 경로.
// - 국립공원: 야영장 이용안내(contents/C/serviceGuide.do?parkId=B..)의 야영장 선택 목록(deptId).
// 받기에 실패하면 기존 목록을 그대로 둔다(지우지 않음). 사용: node scripts/sync-portal-directory.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const outPath = join(root, "pipeline/registry/portal-directory.json");
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { foresttrip: [], knps: [] };
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; booking directory)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "ko" }, signal: AbortSignal.timeout(25000) });
      const t = await r.text();
      if (r.ok && t.length > 1000) return t;
    } catch {}
    await sleep(2000 * (i + 1));
  }
  return "";
}

// 숲나들e 휴양림 목록: { name: '흑석산', url: 'https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030045', today: "fn_goRsvrtTheme('1','ID02030045', '흑석산자연휴양림', …" }
async function foresttrip() {
  const t = await get("https://www.foresttrip.go.kr/main.do");
  const seen = new Map();
  const re = /\{\s*name:\s*'([^']+)',\s*position:[^}]*?url:\s*'([^']*)',\s*today:\s*'fn_goRsvrtTheme\(\\'(\d)\\',\s*\\'([^\\]+)\\',\s*\\'([^\\]+)\\'/g;
  for (const m of t.matchAll(re)) {
    const [, short, url, , id, name] = m;
    if (!seen.has(id)) seen.set(id, { id, name, short, kind: /^ID/.test(id) ? "public" : "national", page: url.replace(/^http:/, "https:") });
  }
  return [...seen.values()];
}

// 국립공원 야영장: 공원별 이용안내 화면의 <option value="B091004">구계등</option>
const PARKS = { B01: "지리산", B02: "한려해상", B03: "설악산", B04: "내장산", B05: "덕유산", B06: "오대산", B07: "주왕산", B08: "태안해안", B09: "다도해해상", B10: "치악산", B11: "월악산", B12: "소백산", B13: "가야산", B14: "북한산", B15: "경주", B16: "계룡산", B17: "무등산", B18: "변산반도", B19: "속리산", B20: "월출산", B21: "한라산", B22: "태백산", B23: "", B24: "", B25: "팔공산" };
async function knps() {
  const out = [];
  for (const [parkId, park] of Object.entries(PARKS)) {
    const t = await get(`https://reservation.knps.or.kr/contents/C/serviceGuide.do?prdDvcd=C&parkId=${parkId}`, 3);
    for (const m of t.matchAll(/<option value="(B\d{6})"[^>]*>([^<]+)</g)) {
      out.push({ parkId, park, deptId: m[1], name: m[2].trim(), page: `https://reservation.knps.or.kr/contents/C/serviceGuide.do?prdDvcd=C&parkId=${parkId}&deptId=${m[1]}` });
    }
    await sleep(1000);
  }
  return out;
}

const [ft, kn] = [await foresttrip(), await knps()];
// 받은 목록이 기존보다 크게 작으면(사이트 오류·차단) 기존 목록을 쓴다
const keep = (now, old, label) => { if (now.length >= Math.max(1, (old?.length ?? 0) * 0.8)) return now; console.log(`::warning::${label} 목록이 ${now.length}곳 — 기존 ${old?.length ?? 0}곳 유지`); return old ?? []; };
const out = { ...prev, updated_at: new Date().toISOString(), foresttrip: keep(ft, prev.foresttrip, "숲나들e"), knps: keep(kn, prev.knps, "국립공원") };
writeFileSync(outPath, `${JSON.stringify(out, null, 1)}\n`);
console.log(`공용 예약 사이트 목록: 숲나들e ${out.foresttrip.length}곳 · 국립공원 야영장 ${out.knps.length}곳`);
