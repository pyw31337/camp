#!/usr/bin/env node
// 전국도시공원정보표준데이터(공공데이터포털 15012890, 이용허락범위 제한 없음) → pipeline/registry/urban-parks.json
// 당일 나들이에 맞는 공원만: 면적 3만㎡ 이상, 어린이·소공원·묘지공원 제외, 좌표 있는 곳. 키 없으면 기존 파일 유지.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { mergeList } from "../lib/merge-policy.mjs";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
const key = process.env.DATA_GO_KR_SERVICE_KEY;
if (!key) { console.log("urban parks: DATA_GO_KR_SERVICE_KEY 없음 — 건너뜀"); process.exit(0); }
const URL0 = "https://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api";
const all = []; let total = Infinity;
for (let page = 1; page <= 40 && all.length < total; page++) {
  let body, txt = "";
  for (let t = 0; t < 4 && !body; t++) {
    try { const { res } = await fetchDataGoKr(`${URL0}?pageNo=${page}&numOfRows=1000&type=json`, key, { timeoutMs: 90000 }); txt = await res.text(); const j = JSON.parse(txt); body = j?.response?.body ?? j?.body; } catch (e) { txt = String(e); }
    if (!body) await new Promise((r) => setTimeout(r, 3000 * (t + 1)));
  }
  if (!body) { console.log(`urban parks: ${page}쪽 응답 오류 ${txt.slice(0, 200)}`); process.exit(0); }
  const items = [].concat(body.items?.item ?? body.items ?? []);
  total = Number(body.totalCount ?? 0); if (!items.length) break; all.push(...items);
}
if (all.length < total * 0.9) { console.log(`urban parks: 일부만 받음 ${all.length}/${total} — 기존 파일 유지`); process.exit(0); }
const keep = all.filter((r) => Number(r.parkAr) >= 30000 && !/어린이|소공원|묘지/.test(r.parkSe) && Number(r.latitude) > 33 && Number(r.longitude) > 124)
  .map((r) => ({ no: r.manageNo, name: r.parkNm, se: r.parkSe, addr: r.rdnmadr || r.lnmadr, lat: +Number(r.latitude).toFixed(5), lng: +Number(r.longitude).toFixed(5), area: Number(r.parkAr),
    fac: [r.mvmFclty, r.amsmtFclty, r.cnvnncFclty, r.cltrFclty, r.etcFclty].filter(Boolean).join(" · ").slice(0, 200), inst: r.institutionNm, tel: r.phoneNumber, ref: r.referenceDate }));
// 기존 파일 위에 누적한다(DATA_MERGE_POLICY): 이번 응답에 없는 공원·빈 칸은 지우지 않고, 같은 공원은 기준일(ref)이 더 최근일 때만 바꾼다.
const outPath = fileURLToPath(new URL("../registry/urban-parks.json", import.meta.url));
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")).parks ?? [] : [];
const pkey = (p) => `${p.no}|${p.name}|${p.addr ?? ""}`;
const { list: parks } = mergeList(prev, keep, pkey, (o, n) => ({ old: { src: "urban_parks", at: o.ref }, next: { src: "urban_parks", at: n.ref } }));
writeFileSync(outPath, JSON.stringify({ source: "전국도시공원정보표준데이터 (공공데이터포털 15012890)", url: "https://www.data.go.kr/data/15012890/standard.do", collected_at: new Date().toISOString().slice(0, 10), total, parks }));
console.log(`urban parks: 전체 ${total} · 이번 ${keep.length} · 누적 ${parks.length}`);
