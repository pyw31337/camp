#!/usr/bin/env node
// 공공데이터 여가 시설 수집 → pipeline/registry/public-leisure.json (build-public-leisure.mjs가 탐색 데이터에 붙인다)
// 소유자 2026-10-22: 국립·공립·사립 휴양림을 모두 서비스에 포함, 실내놀이터·수영장·박물관 등은 주변 시설에 연동.
// 원천(원본만 — 재가공 사이트는 쓰지 않는다. k-data.aljal.kr은 robots.txt가 AI 크롤러를 이름으로 막아 수집 경로로 쓰지 않음):
//  - 전국휴양림표준데이터(공공데이터포털, 산림청·지자체) tn_pubr_public_rcrfrst_api
//  - 전국박물관미술관정보표준데이터 tn_pubr_public_museum_artgr_info_api
//  - 전국공공시설개방정보표준데이터(tn_pubr_public_pblfclt_opn_info_api): 지자체가 개방한 수영장·실내 놀이 시설
//  - (선택) 행정안전부 LOCALDATA 인허가 업종 slug를 LD_POOL_SLUGS·LD_KIDS_SLUGS로 주면 보탠다
// 키가 없거나 응답이 부족하면 해당 항목은 기존 파일 값을 유지한다(DATA_MERGE_POLICY: 줄이지 않는다).
import { isKidsPlay, isPool } from "../lib/leisure-filter.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { downloadLocaldata } from "../lib/localdata.mjs";
import { placeOf } from "../lib/nearby-licensed.mjs";
import { sidoShort } from "../lib/conditions.mjs";

const key = process.env.DATA_GO_KR_SERVICE_KEY;
const outPath = fileURLToPath(new URL("../registry/public-leisure.json", import.meta.url));
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
const today = new Date().toISOString().slice(0, 10);
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const pick = (row, names) => { for (const n of names) { const v = clean(row?.[n]); if (v) return v; } return ""; };
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) && n !== 0 ? n : null; };
const coord = (row) => { const lat = num(pick(row, ["latitude", "lat", "위도"])), lng = num(pick(row, ["longitude", "lng", "lon", "경도"])); return lat > 33 && lat < 39 && lng > 124 && lng < 132 ? [+lat.toFixed(5), +lng.toFixed(5)] : null; };
const hash = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(36);

async function standard(api, label) {
  if (!key) { console.log(`${label}: DATA_GO_KR_SERVICE_KEY 없음 — 기존 값 유지`); return null; }
  const all = []; let total = Infinity;
  for (let page = 1; page <= 30 && all.length < total; page++) {
    let body, txt = "";
    for (let t = 0; t < 4 && !body; t++) {
      try { const { res } = await fetchDataGoKr(`https://api.data.go.kr/openapi/${api}?pageNo=${page}&numOfRows=1000&type=json`, key, { timeoutMs: 90000 }); txt = await res.text(); const j = JSON.parse(txt); body = j?.response?.body ?? j?.body; } catch (e) { txt = String(e); }
      if (!body) await new Promise((r) => setTimeout(r, 3000 * (t + 1)));
    }
    if (!body) { console.log(`${label}: ${page}쪽 응답 오류 ${txt.slice(0, 200)}`); return null; }
    const items = [].concat(body.items?.item ?? body.items ?? []);
    total = Number(body.totalCount ?? 0);
    if (!items.length) break;
    all.push(...items);
  }
  if (!all.length || all.length < total * 0.9) { console.log(`${label}: 일부만 받음 ${all.length}/${total} — 기존 값 유지`); return null; }
  console.log(`${label}: ${all.length}/${total}건 · 칸 ${Object.keys(all[0]).join(",")}`);
  return { rows: all, total };
}

// ── 휴양림 ─────────────────────────────────────────────────
// 구분 칸(rcrfrstType): 국유림·공유림·사유림(2026-10-22 CI 프로브로 확인) → 국립·공립·사립
const CLS = (s) => (/국립|국유/.test(s) ? "국립" : /공립|공유|도립|시립|군립|구립/.test(s) ? "공립" : /사립|사유|민간|개인|법인/.test(s) ? "사립" : s || null);
let forests = prev.forests ?? [];
const fr = await standard("tn_pubr_public_rcrfrst_api", "휴양림");
if (fr) {
  forests = fr.rows.map((r) => {
    const name = pick(r, ["rcrfrstNm", "frstNm", "휴양림명"]);
    const addr = pick(r, ["rdnmadr", "lnmadr", "소재지도로명주소", "소재지지번주소"]);
    const c = coord(r);
    if (!name || !c) return null;
    const sido = sidoShort(pick(r, ["ctprvnNm", "시도명"]) || addr.split(" ")[0]) ?? null;
    const sigungu = addr.match(/^\S+\s+(\S+?(?:시|군|구))(?:\s|$)/)?.[1] ?? null;
    const stay = pick(r, ["stayngPosblYn", "stayngPsblYn", "lodgePosblYn", "숙박가능여부"]);
    return {
      id: `rf-${hash(`${name}|${addr}`)}`, name, cls: CLS(pick(r, ["rcrfrstType", "rcrfrstSe", "휴양림구분"])),
      sido, sigungu, addr, lat: c[0], lng: c[1],
      tel: pick(r, ["telephoneNumber", "phoneNumber", "휴양림전화번호"]) || null,
      homepage: (pick(r, ["homepageUrl", "hmpgAddr"]).replace(/\.$/, "") || null),
      fee: pick(r, ["admfee", "entrncFeeInfo", "입장료"]) || null,
      stay: /^(Y|y|가능|있음)$/.test(stay) ? "가능" : /^(N|n|불가|없음)$/.test(stay) ? "불가" : stay || null,
      facilities: pick(r, ["mainFcltyNm", "mainFclty", "주요시설명"]) || null,
      capacity: num(pick(r, ["aceptncCo", "aceptncPosblCo", "수용가능인원수"])),
      area: num(pick(r, ["rcrfrstAr", "휴양림면적"])),
      inst: pick(r, ["institutionNm", "insttNm", "관리기관명"]) || null,
      ref: pick(r, ["referenceDate", "데이터기준일자"]) || today,
    };
  }).filter(Boolean);
}

// ── 박물관·미술관 ───────────────────────────────────────────
let museums = prev.museums ?? [];
const mu = await standard("tn_pubr_public_museum_artgr_info_api", "박물관·미술관");
if (mu) {
  museums = mu.rows.map((r) => {
    const name = pick(r, ["fcltyNm", "시설명"]); const c = coord(r);
    if (!name || !c) return null;
    // fcltyType은 운영 주체(국립·공립·사립·대학) — 화면 부제로 쓴다
    const type = pick(r, ["fcltyType"]);
    return { name, kind: type ? `${type} ${/미술/.test(name) ? "미술관" : "박물관"}` : null, addr: pick(r, ["rdnmadr", "lnmadr"]) || null, lat: c[0], lng: c[1], tel: pick(r, ["operPhoneNumber", "phoneNumber"]) || null, homepage: pick(r, ["homepageUrl"]) || null, ref: pick(r, ["referenceDate"]) || today };
  }).filter(Boolean);
}

// ── 공공시설개방정보 표준데이터(tn_pubr_public_pblfclt_opn_info_api, 지자체가 개방한 시설): 수영장·실내 놀이 시설 ──
let poolsStd = null, kidsStd = null;
const po = await standard("tn_pubr_public_pblfclt_opn_info_api", "공공시설개방");
if (po) {
  const types = {};
  for (const r of po.rows) { const t = pick(r, ["openFcltyType"]) || "?"; types[t] = (types[t] ?? 0) + 1; }
  console.log(`공공시설개방 유형: ${Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t, n]) => `${t} ${n}`).join(" · ")}`);
  const rec = (r) => { const c = coord(r); const name = pick(r, ["openFcltyNm"]); const place = pick(r, ["openLcNm"]); if (!c || !name) return null; return { name: place && !name.includes(place) ? `${place} ${name}` : name, kind: pick(r, ["openFcltyType"]) || null, addr: pick(r, ["rdnmadr", "lnmadr"]) || null, lat: c[0], lng: c[1], tel: pick(r, ["phoneNumber"]) || null, homepage: pick(r, ["homepageUrl"]) || null, fee: pick(r, ["pchrgUseYn"]) === "N" ? "무료" : null, ref: pick(r, ["referenceDate"]) || today }; };
  const hay = (r) => `${pick(r, ["openFcltyType"])} ${pick(r, ["openFcltyNm"])}`;
  poolsStd = po.rows.filter((r) => /수영/.test(hay(r))).map(rec).filter((p) => p && isPool(p.name));
  kidsStd = po.rows.map(rec).filter((p) => p && isKidsPlay(p.name));
}

// ── LOCALDATA: 수영장·실내놀이터 보강(업종 slug를 환경 변수로 줄 때만) ──
const LD = { pools: (process.env.LD_POOL_SLUGS ?? "").split(/[\s,]+/).filter(Boolean), kids: (process.env.LD_KIDS_SLUGS ?? "").split(/[\s,]+/).filter(Boolean) };
const fromLocaldata = async (slugs, label) => {
  const out = [];
  for (const slug of slugs) {
    try { const r = await downloadLocaldata(slug, { pick: () => true }); const ps = r.rows.map(placeOf).filter(Boolean); out.push(...ps.map((p) => ({ name: p.name, addr: p.addr, lat: p.lat, lng: p.lng }))); console.log(`${label} ${slug}: ${r.rows.length}행 → 영업·좌표 ${ps.length}`); }
    catch (e) { console.log(`::warning title=LOCALDATA ${slug} 실패::${String(e.message).slice(0, 200)}`); return null; }
  }
  return slugs.length ? out : null;
};
const ldPools = await fromLocaldata(LD.pools, "수영장");
const pools = poolsStd || ldPools ? [...(poolsStd ?? []), ...(ldPools ?? [])] : prev.pools ?? [];
const ldKids = await fromLocaldata(LD.kids, "실내놀이터");
const kids = kidsStd || ldKids ? [...(kidsStd ?? []), ...(ldKids ?? [])] : prev.kids ?? [];

writeFileSync(outPath, JSON.stringify({
  collected_at: today,
  sources: {
    forest: { label: "전국휴양림표준데이터(공공데이터포털)", url: `https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=${encodeURIComponent("전국휴양림표준데이터")}`, total: fr?.total ?? prev.sources?.forest?.total ?? null },
    museum: { label: "전국박물관미술관정보표준데이터(공공데이터포털)", url: `https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=${encodeURIComponent("전국박물관미술관정보표준데이터")}`, total: mu?.total ?? prev.sources?.museum?.total ?? null },
    pool: { label: "전국공공시설개방정보표준데이터(공공데이터포털)", url: `https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=${encodeURIComponent("전국공공시설개방정보표준데이터")}`, slugs: LD.pools },
    kids: { label: "전국공공시설개방정보표준데이터(공공데이터포털)", url: `https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=${encodeURIComponent("전국공공시설개방정보표준데이터")}`, slugs: LD.kids },
  },
  forests, museums, pools, kids,
}));
const by = (k) => forests.reduce((a, f) => ((a[f[k] ?? "?"] = (a[f[k] ?? "?"] ?? 0) + 1), a), {});
console.log(`public leisure: 휴양림 ${forests.length}(${JSON.stringify(by("cls"))}) · 박물관 ${museums.length} · 수영장 ${pools.length} · 실내놀이터 ${kids.length}`);
