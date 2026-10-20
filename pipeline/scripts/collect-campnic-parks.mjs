// 전국 도시공원·공공시설개방·물놀이 후보를 공공데이터포털에서 받아
// pipeline/registry/campnic-parks.json 에 쓴다.
// 사용: DATA_GO_KR_SERVICE_KEY=... node scripts/collect-campnic-parks.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";

const key = process.env.DATA_GO_KR_SERVICE_KEY;
if (!key) { console.log("DATA_GO_KR_SERVICE_KEY 없음"); process.exit(0); }

const ENDPOINTS = [
  { id: "urban-park", url: "https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api" },
  { id: "public-facility", url: "https://api.data.go.kr/openapi/tn_pubr_public_pblfclt_opn_info_api" },
];

async function pull(url, maxPages = 40) {
  const all = [];
  let total = Infinity;
  for (let page = 1; page <= maxPages && all.length < total; page++) {
    let res;
    try {
      ({ res } = await fetchDataGoKr(`${url}?pageNo=${page}&numOfRows=1000&type=json`, key, { timeoutMs: 45000 }));
    } catch (e) {
      return { error: e.message, items: all };
    }
    const text = await res.text();
    let body;
    try { body = JSON.parse(text)?.response?.body ?? JSON.parse(text)?.body; } catch { return { error: text.slice(0, 180), items: all }; }
    if (!body) return { error: `HTTP ${res.status} ${text.slice(0, 160)}`, items: all };
    const items = Array.isArray(body.items) ? body.items : body.items?.item ? [].concat(body.items.item) : [];
    total = Number(body.totalCount ?? items.length);
    if (!items.length) break;
    all.push(...items);
  }
  return { total, items: all };
}

const out = {};
for (const ep of ENDPOINTS) {
  console.log(`pull ${ep.id}`);
  const r = await pull(ep.url);
  if (r.error) { console.log(`  fail ${r.error}`); out[ep.id] = { error: r.error, count: r.items.length }; continue; }
  const sample = r.items[0] ? Object.keys(r.items[0]) : [];
  console.log(`  ${r.items.length}/${r.total} fields=${sample.slice(0, 8).join(",")}`);
  // 물놀이·캠핑·피크닉·무료 후보만 추림
  const hit = r.items.filter((row) => /물놀이|수영|분수|캠핑|피크닉|야영|캠크닉|취사/i.test(Object.values(row).join(" ")));
  out[ep.id] = { total: r.total, received: r.items.length, keyword_hits: hit.length, fields: sample, hits: hit.slice(0, 800) };
}

const dir = fileURLToPath(new URL("../registry/", import.meta.url));
await mkdir(dir, { recursive: true });
await writeFile(`${dir}campnic-parks.json`, JSON.stringify({ collected_at: new Date().toISOString(), sources: out }, null, 2));
console.log("wrote campnic-parks.json");
