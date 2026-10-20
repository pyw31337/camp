#!/usr/bin/env node
// 수도권(서울·경기·인천) 사설 유료 당일 나들이(당일 바베큐·캠크닉) 후보 찾기 — 카카오 로컬 + 네이버 지역검색.
// 약관: 검색 결과는 저장소에 커밋하지 않는다. Actions 결과 파일(review-queue.json, 보관 14일)로만 남겨 사람이 공식 페이지에서 검증한다.
// 검증된 곳만 registry/dayuse-seed.json 에 du:"private" + 원문 URL + 확인일로 넣는다.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const K = process.env.KAKAO_REST_API_KEY, NI = process.env.NAVER_API_HUB_CLIENT_ID, NS = process.env.NAVER_API_HUB_CLIENT_SECRET;
const out = process.argv[2] || "review-queue.json";
const cat = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const seed = JSON.parse(readFileSync(join(root, "pipeline/registry/dayuse-seed.json"), "utf8")).places;
const SIDO = /^(서울|경기|인천)/;
const sgg = [...new Set(cat.filter((c) => SIDO.test(c.sido ?? "") && c.sigungu).map((c) => `${String(c.sido).slice(0, 2)} ${String(c.sigungu).split(" ")[0]}`))];
const KW = ["당일캠핑", "캠크닉", "캠프닉", "당일 바베큐", "셀프바베큐", "데이캠핑", "당일치기 바베큐"];
const STRONG = /당일|캠크닉|캠프닉|데이\s*캠|셀프\s*바베|바베큐장|BBQ|피크닉/i;
const BADCAT = /펜션|호텔|모텔|여관|콘도|리조트|게스트|민박|한옥|유스|화장실|공원|보드카페|정육|마트|슈퍼|입출구|도로/;
const OKCAT = /육류|고기|장소대여|공간대여|놀이시설|키즈카페|관광농원|테마파크|체험|야영|캠핑|카페|레저/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const C = new Map();
const strip = (s) => String(s).replace(/<\/?b>/g, "").replace(/&amp;/g, "&");
const norm = (s) => strip(s).replace(/\s|캠핑장|바베큐장|점$/g, "");
function add(src, d) { const k = norm(d.name) + "|" + String(d.addr).split(" ").slice(0, 3).join(" "); const c = C.get(k) ?? { ...d, hits: [], src: [] }; c.hits.push(d.kw); c.src.push(src); for (const f of ["lat", "lng", "kakao", "link", "tel", "cat2"]) c[f] ??= d[f]; C.set(k, c); }
let kc = 0, nc = 0;
for (const s of sgg) for (const kw of KW) {
  if (K) for (let p = 1; p <= 2; p++) { kc++;
    const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(`${s} ${kw}`)}&page=${p}&size=15`, { headers: { Authorization: `KakaoAK ${K}` } });
    if (!r.ok) { console.log("kakao", r.status); break; } const j = await r.json();
    for (const d of j.documents ?? []) if (SIDO.test(d.address_name)) add("kakao", { name: d.place_name, cat: d.category_name, addr: d.address_name, lat: +d.y, lng: +d.x, kakao: d.place_url, tel: d.phone, kw });
    if (j.meta?.is_end) break; await sleep(40); }
  if (NI) { nc++;
    for (const path of ["/search/v1/local", "/v1/search/local.json"]) { const r = await fetch(`https://naverapihub.apigw.ntruss.com${path}?query=${encodeURIComponent(`${s} ${kw}`)}&display=5`, { headers: { "X-NCP-APIGW-API-KEY-ID": NI, "X-NCP-APIGW-API-KEY": NS } });
      if (!r.ok) continue; const j = await r.json();
      for (const d of j.items ?? []) if (SIDO.test(d.address ?? "")) add("naver", { name: strip(d.title), cat: d.category, cat2: d.category, addr: d.address, link: d.link, kw, lat: d.mapy ? d.mapy / 1e7 : undefined, lng: d.mapx ? d.mapx / 1e7 : undefined });
      break; }
    await sleep(60); }
}
const dist = (a, b) => Math.hypot((a.lat - b.lat) * 111000, (a.lng - b.lng) * 88000);
const known = [...cat.filter((c) => !/^(osm|park)-/.test(String(c.id))), ...seed];
const rows = [...C.values()].map((c) => {
  let score = 0; const why = [];
  if (STRONG.test(c.name)) { score += 3; why.push("이름"); }
  const strongKw = new Set(c.hits.filter((h) => !/셀프바베큐/.test(h))).size; score += Math.min(3, strongKw); if (strongKw) why.push(`검색어 ${strongKw}`);
  if (new Set(c.src).size > 1) { score += 2; why.push("카카오+네이버"); }
  if (OKCAT.test(c.cat ?? "")) score += 1; if (BADCAT.test(c.cat ?? "")) { score -= 5; why.push("제외 업종"); }
  if (/야영|캠핑/.test(c.cat ?? "") && !STRONG.test(c.name)) { score -= 2; why.push("숙박형 캠핑장 가능성"); }
  const dup = Number.isFinite(c.lat) ? known.find((k) => dist(k, c) < 250 || norm(k.name) === norm(c.name)) : known.find((k) => norm(k.name) === norm(c.name));
  return { ...c, score, why, dup: dup ? `${dup.id} ${dup.name}` : null };
}).filter((r) => r.score >= 3 && !r.dup).sort((a, b) => b.score - a.score);
writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), calls: { kakao: kc, naver: nc }, sigungu: sgg.length, raw: C.size, queue: rows }, null, 1));
console.log(`수도권 ${sgg.length}개 시군구 · 호출 카카오 ${kc}/네이버 ${nc} · 원 후보 ${C.size} · 검토 대기 ${rows.length}`);
