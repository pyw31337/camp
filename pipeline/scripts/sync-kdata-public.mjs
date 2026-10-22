#!/usr/bin/env node
// k-data.aljal.kr 공개 공공시설 색인 증분 수집기.
// 기본 지연은 1초이며, 사이트맵·상세 URL·확인 시각을 남긴다. 기존 원장은 줄이지 않는다.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { KDATA_CATEGORIES, mergePublicRecords, parseKDataDetail, parseSitemap } from "../lib/kdata-public.mjs";

const outPath = fileURLToPath(new URL("../registry/kdata-public.json", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const base = "https://k-data.aljal.kr";
const args = new Map(process.argv.slice(2).map((x, i, a) => x.startsWith("--") ? [x.slice(2), a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : true] : []));
const categories = String(args.get("categories") || Object.keys(KDATA_CATEGORIES)).split(",").map((x) => x.trim()).filter((x) => KDATA_CATEGORIES[x]);
const limit = Number(args.get("limit") || 0);
const delayMs = Math.max(1000, Number(args.get("delay") || process.env.KDATA_MIN_DELAY_MS || 1000));
const timeoutMs = Math.max(5000, Number(args.get("timeout") || 30000));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchText = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": "moyeora-camping-public-data/1.0 (+https://github.com/pyw31337/camp)" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
};
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; } };

const checkedAt = new Date().toISOString();
const previous = await readJson(outPath, { version: 1, records: [], sources: [] });
const incoming = [];
let lastRequest = 0;
for (const category of categories) {
  const cfg = KDATA_CATEGORIES[category];
  let urls;
  try {
    const xml = await fetchText(`${base}/sitemap-${category}.xml`);
    urls = parseSitemap(xml, category);
  } catch (error) {
    console.warn(`::warning title=${category} 사이트맵 실패::${error.message}`);
    continue;
  }
  const target = limit > 0 ? urls.slice(0, limit) : urls;
  console.log(`${cfg.label}: ${target.length}/${urls.length} 상세 URL`);
  for (const url of target) {
    const wait = delayMs - (Date.now() - lastRequest);
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    try {
      const html = await fetchText(url);
      const row = parseKDataDetail(html, { url, category, checkedAt });
      if (row) incoming.push(row);
    } catch (error) {
      console.warn(`::warning title=${category} 상세 실패::${url} · ${error.message}`);
    }
  }
}
await mkdir(root + "/registry", { recursive: true });
const records = mergePublicRecords(previous.records ?? [], incoming);
const sources = [...new Map([...(previous.sources ?? []), ...categories.map((category) => ({ id: `kdata-${category}`, category, url: `${base}/${category}`, checked_at: checkedAt, tier: "CONFIRMED" }))].map((x) => [x.id, x])).values()];
await writeFile(outPath, JSON.stringify({ version: 1, generated_at: checkedAt, count: records.length, sources, records }, null, 2) + "\n");
console.log(`공공시설 ${incoming.length}건 수집 · 원장 ${records.length}건(기존 ${previous.records?.length ?? 0}건 보존) → ${outPath}`);
