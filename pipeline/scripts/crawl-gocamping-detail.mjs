#!/usr/bin/env node
// 고캠핑 상세 화면 수집 → data/gocamping-detail.ndjson (출처 주소·확인 시각 포함)
// 예의: 한 번에 하나, 요청 간 GC_DELAY_MS(기본 1200ms), robots.txt 확인(/*search* 만 금지), 캐시 GC_CACHE(기본 ~/.cache/gocamping-detail, TTL 30일).
import fs from "node:fs"; import { execFile } from "node:child_process"; import path from "node:path"; import os from "node:os";
import { parseGocampingDetail } from "../lib/gocamping-detail.mjs";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const CAT = path.join(ROOT, "camping-atlas/public/explore/data/campgrounds.json");
const OUT = path.join(ROOT, "data/gocamping-detail.ndjson");
const CACHE = process.env.GC_CACHE || path.join(os.homedir(), ".cache/gocamping-detail");
const DELAY = +(process.env.GC_DELAY_MS || 1200), TTL = 30 * 864e5, LIMIT = +(process.env.GC_LIMIT || 0);
const UA = "camp-atlas/1.0 (+https://pyw31337.github.io/camp/; non-commercial open-source; attribution to GoCamping)";
fs.mkdirSync(CACHE, { recursive: true });
const robots = await (await fetch("https://www.gocamping.or.kr/robots.txt", { headers: { "user-agent": UA } })).text();
const disallow = [...robots.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => new RegExp("^" + m[1].replace(/[.?+^$()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")));
if (disallow.some((r) => r.test("/bsite/camp/info/read.do?c_no=1"))) { console.error("robots.txt disallows detail pages; stopping"); process.exit(2); }
let ids = JSON.parse(fs.readFileSync(CAT, "utf8")).filter((c) => c.gc_url).map((c) => new URL(c.gc_url).searchParams.get("c_no")).filter(Boolean);
if (process.env.GC_IDS) ids = process.env.GC_IDS.split(",");
if (LIMIT) ids = ids.slice(0, LIMIT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// GC_WORKERS(기본 2)명이 각자 한 번에 1건씩 — 전체 초당 1건 아래. GC_CACHE_ONLY=1이면 내려받지 않고 캐시만 읽는다.
const WORKERS = +(process.env.GC_WORKERS || 2), CACHE_ONLY = process.env.GC_CACHE_ONLY === "1";
const rows = new Map(); let net = 0, fail = 0, done = 0;
async function one(id) {
  const f = path.join(CACHE, `${id}.html`); let html, at;
  if (fs.existsSync(f) && (CACHE_ONLY || Date.now() - fs.statSync(f).mtimeMs < TTL)) { html = fs.readFileSync(f, "utf8"); at = fs.statSync(f).mtime.toISOString(); }
  else if (CACHE_ONLY || (fs.existsSync(f + ".gone") && Date.now() - fs.statSync(f + ".gone").mtimeMs < TTL)) return;
  else {
    net++; await sleep(DELAY);
    for (let t = 0; t < 3 && !html; t++) {
      // curl -m 40: Node fetch가 본문에서 멈추는 일이 있어(2026-10-20 수집 중 두 번) 시간 제한을 프로세스 단위로 건다.
      const out = await new Promise((ok) => execFile("curl", ["-s", "-m", "40", "-A", UA, "-w", "\n%{http_code}", `https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=${id}`], { maxBuffer: 2e7 }, (e, so) => ok(e ? null : String(so))));
      const code = out ? +out.slice(out.lastIndexOf("\n") + 1) : 0;
      if (code === 200) html = out.slice(0, out.lastIndexOf("\n"));
      else if (code >= 300 && code < 500) { fs.writeFileSync(f + ".gone", String(code)); break; } // 302(삭제·비공개 업장)·404는 다시 묻지 않는다
      else { console.log(`retry ${id} code=${code}`); await sleep(10000 * (t + 1)); }
    }
    if (!html) { if (!fs.existsSync(f + ".gone")) fail++; return; }
    fs.writeFileSync(f, html); at = new Date().toISOString();
  }
  try { const d = parseGocampingDetail(html, id); if (d.info || d.facilities) rows.set(id, { ...d, checked_at: at, source: "gocamping_detail" }); } catch { fail++; }
}
const queue = [...ids];
await Promise.all(Array.from({ length: WORKERS }, async () => { while (queue.length) { const id = queue.shift(); await Promise.race([one(id), sleep(150000).then(() => { fail++; console.log(`stuck ${id}`); })]); if (++done % 100 === 0) console.log(`${done}/${ids.length} fetched=${net} fail=${fail}`); } }));
const ordered = ids.map((id) => rows.get(id)).filter(Boolean);
fs.writeFileSync(OUT, ordered.map((r) => JSON.stringify(r)).join("\n") + "\n");
const cnt = (k) => ordered.filter((r) => r[k]?.length ?? (r[k] ? 1 : 0)).length;
console.log(JSON.stringify({ total: ids.length, ok: ordered.length, fail, fees: cnt("fees"), layout: cnt("layout"), photos: cnt("photos"), facilities: cnt("facilities"), intro: cnt("intro") }));
