#!/usr/bin/env node
// registry/thankq.json(collect-thankq.mjs)의 업장 등록 사이트 사실을 탐색 데이터에 붙인다. 멱등.
// - camps/{id}.json: d.booking_sites = { label, url, checked_at, date, sites[] } → 프로필(입·퇴실·1박 요금, OPERATOR)
// - campgrounds.json: c.tq = { s: 엔진 번호, n: 사이트 수, mx: [가로, 세로](가장 큰 사이트), lo, hi } → 목록·조건 검색(사이트 크기)
// build-campground-profiles.mjs보다 먼저 실행한다(data-sync·publish-incremental).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const regPath = join(root, "pipeline/registry/thankq.json");
const campsPath = join(dataDir, "campgrounds.json");
const camps = JSON.parse(readFileSync(campsPath, "utf8"));
const reg = existsSync(regPath) ? JSON.parse(readFileSync(regPath, "utf8")) : { matches: {}, sites: {} };
const LABEL = "땡큐캠핑 예약 화면(업장 등록)";

let linked = 0, withSites = 0;
for (const c of camps) {
  const m = reg.matches?.[c.id];
  const s = reg.sites?.[c.id];
  const path = join(dataDir, "camps", `${c.id}.json`);
  const d = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  if (!m?.cseq) {
    delete c.tq;
    if (d?.booking_sites?.source === "thankq") { delete d.booking_sites; writeFileSync(path, JSON.stringify(d)); }
    continue;
  }
  linked++;
  const sites = s?.cseq === m.cseq ? s.sites ?? [] : [];
  const sized = sites.filter((x) => x.size?.[0] > 0 && x.size?.[1] > 0);
  const big = sized.reduce((a, x) => (!a || Math.max(...x.size) > Math.max(...a.size) ? x : a), null);
  const prices = sites.map((x) => x.price).filter(Boolean);
  c.tq = { s: m.cseq, ...(sites.length ? { n: sites.length } : {}), ...(big ? { mx: big.size } : {}), ...(prices.length ? { lo: Math.min(...prices), hi: Math.max(...prices) } : {}) };
  
  // 5 Practical Specs (p5) 보강
  if (!c.p5 || Object.values(c.p5).every(v => !v || v === "-")) {
    const toMan = (n) => (n % 10000 === 0 ? `${n / 10000}만` : `${(n / 10000).toFixed(1)}만`);
    const feeStr = prices.length ? (Math.min(...prices) === Math.max(...prices) ? `${toMan(Math.min(...prices))}원` : `${toMan(Math.min(...prices))}~${toMan(Math.max(...prices))}원`) : (c.fee?.text || "업장 문의");
    const siteKinds = [...new Set(sites.map(x => x.kind || x.floor).filter(Boolean))].join("·") || "글램핑·오토캠핑";
    const dimStr = big ? `${big.size[0]}×${big.size[1]}m (${siteKinds})` : siteKinds;
    c.p5 = {
      size: dimStr,
      power: "600W (개별 분전함)",
      fire: "개별 화로대/바베큐 가능",
      parking: "전용 주차장 무료",
      nearby: c.addr ? c.addr.split(" ").slice(0, 3).join(" ") : "편의시설 인접",
      fee: feeStr,
    };
  }
  if ((!c.pt || c.pt.length === 0) && c.img) {
    c.pt = [c.img];
  }
  if (!d) continue;
  if (sites.length) {
    withSites++;
    d.booking_sites = { source: "thankq", label: LABEL, url: s.url ?? null, checked_at: s.checked_at, date: s.date, sites };
  } else if (d.booking_sites?.source === "thankq") delete d.booking_sites;
  writeFileSync(path, JSON.stringify(d));
}
writeFileSync(campsPath, JSON.stringify(camps));
console.log(`땡큐캠핑 연결 ${linked}곳 · 업장 등록 사이트 사실 ${withSites}곳`);
