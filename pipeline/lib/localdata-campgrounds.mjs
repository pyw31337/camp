// LOCALDATA 인허가(일반야영장업·자동차야영장업) 정규화와 고캠핑 시설 매칭.
// 목적: (1) 고캠핑에 없는 숨은 캠핑장 후보, (2) 인허가 상태(폐업·휴업)·인허가일 교차 확인, (3) 시설 규모 등 세부 정보.
// 매칭 점수 0.9 이상만 자동 연결(MATCHED), 0.6~0.9는 검수(NEEDS_REVIEW), 그 밑은 연결 없음(NEW = 숨은 후보).

import { epsg5174ToWgs84 } from "./crs.mjs";
import { GridIndex, haversineM, inKorea } from "./geo.mjs";

const pick = (row, patterns) => {
  for (const re of patterns) {
    const k = Object.keys(row).find((key) => re.test(key.replace(/\s+/g, "")));
    if (k && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return null;
};
const date = (v) => {
  const m = String(v ?? "").match(/(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

export function statusOf(text) {
  const t = String(text ?? "");
  if (/폐업|취소|말소|만료|소멸/.test(t)) return "CLOSED";
  if (/휴업|정지|중지/.test(t)) return "TEMPORARILY_CLOSED";
  if (/영업|정상|운영/.test(t)) return "OPERATING";
  return "UNKNOWN";
}

const CORE = /^(번호|개방서비스명|개방서비스아이디|개방자치단체코드|관리번호|인허가일자|인허가취소일자|영업상태구분코드|영업상태명|상세영업상태코드|상세영업상태명|폐업일자|휴업시작일자|휴업종료일자|재개업일자|소재지전화|소재지전체주소|도로명전체주소|소재지우편번호|도로명우편번호|사업장명|최종수정시점|데이터갱신구분|데이터갱신일자|좌표정보.*)$/;

/** LOCALDATA 행 → 정규화. 표준 열 외의 업종 고유 열(시설 규모·수용 인원 등)은 extra에 그대로 보관한다. */
export function normalizeLicense(row, kind) {
  const id = pick(row, [/^관리번호$/]);
  const name = pick(row, [/^사업장명$/, /사업장명/]);
  if (!id || !name) return null;
  const tx = Number(pick(row, [/좌표정보\(?x/i, /^X좌표$/i]));
  const ty = Number(pick(row, [/좌표정보\(?y/i, /^Y좌표$/i]));
  let lat = null, lng = null;
  if (tx > 0 && ty > 0) {
    const [la, ln] = epsg5174ToWgs84(tx, ty);
    if (inKorea(la, ln)) { lat = Math.round(la * 1e6) / 1e6; lng = Math.round(ln * 1e6) / 1e6; }
  }
  const statusText = [pick(row, [/^영업상태명$/]), pick(row, [/^상세영업상태명$/])].filter(Boolean).join(" / ") || null;
  const extra = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.replace(/\s+/g, "");
    if (!CORE.test(key) && String(v ?? "").trim() !== "") extra[key] = String(v).trim();
  }
  return {
    id: `${kind}:${pick(row, [/^개방자치단체코드$/]) ?? ""}:${id}`,
    kind,                                       // GENERAL | AUTO
    license_no: id,
    local_gov_code: pick(row, [/^개방자치단체코드$/]),
    name,
    status: statusOf(statusText),
    status_text: statusText,
    licensed_at: date(pick(row, [/^인허가일자$/])),
    closed_at: date(pick(row, [/^폐업일자$/])),
    suspended: { from: date(pick(row, [/^휴업시작일자$/])), to: date(pick(row, [/^휴업종료일자$/])) },
    phone: pick(row, [/^소재지전화$/, /전화번호/]),
    road_address: pick(row, [/^도로명전체주소$/, /도로명주소/]),
    parcel_address: pick(row, [/^소재지전체주소$/, /지번주소/]),
    lat, lng,
    coord_method: lat != null ? "EPSG5174" : null,
    updated_at: date(pick(row, [/^데이터갱신일자$/, /^최종수정시점$/])),
    extra,
  };
}

// ── 매칭 ────────────────────────────────────────────────────────────────

const STOP = /(주식회사|\(주\)|㈜|유한회사|농업회사법인|영농조합법인|오토캠핑장|캠핑장|야영장|캠핑|캠프|글램핑|카라반|오토|리조트|파크|\s|[·.\-_()[\]])/g;
export function normName(s) { return String(s ?? "").toLowerCase().replace(STOP, ""); }
function bigrams(s) { const out = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out.length ? out : [s]; }
export function nameSimilarity(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const A = bigrams(x), B = bigrams(y);
  const pool = [...B];
  let hit = 0;
  for (const g of A) { const i = pool.indexOf(g); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return (2 * hit) / (A.length + B.length);
}
const digits = (s) => String(s ?? "").replace(/\D/g, "");
/** 도로명 주소의 “도로명 + 건물번호” 부분 */
const roadKey = (s) => String(s ?? "").replace(/\([^)]*\)/g, "").match(/([가-힣0-9]+(?:로|길))\s*(\d+(?:-\d+)?)/)?.slice(1).join(" ") ?? null;
const districtKey = (s) => String(s ?? "").split(/\s+/).slice(0, 3).join(" ");

export function scorePair(lic, gc) {
  const name = nameSimilarity(lic.name, gc.name);
  const d = lic.lat != null && gc.lat != null ? haversineM(lic.lat, lic.lng, gc.lat, gc.lng) : null;
  const dist = d == null ? null : d <= 150 ? 1 : d <= 500 ? 0.8 : d <= 1500 ? 0.4 : 0;
  const lr = roadKey(lic.road_address), gr = roadKey(gc.address);
  const addr = lr && gr && lr === gr ? 1 : districtKey(lic.road_address || lic.parcel_address) === districtKey(gc.address) ? 0.4 : 0;
  const phone = digits(lic.phone).length >= 8 && digits(lic.phone) === digits(gc.phone) ? 1 : 0;
  // 2026-10-19: 고캠핑 인허가일(prmisnDe)·사업자번호(bizrno)를 보조 근거로 쓴다. 인허가일은 같은 지자체 등록값이라
  // 이름이 어느 정도 비슷할 때 같은 날이면 강한 근거다. 사업자번호는 LOCALDATA 표준 열에 없어 업종 고유 열(extra)에 있을 때만 비교한다.
  const licenseDate = lic.licensed_at && gc.licensed_on && lic.licensed_at === gc.licensed_on ? 1 : 0;
  const licBiz = digits(Object.entries(lic.extra ?? {}).find(([k]) => /사업자(등록)?번호/.test(k))?.[1]);
  const bizNo = licBiz.length === 10 && licBiz === digits(gc.business_no) ? 1 : 0;
  // 좌표가 없으면 이름·주소 비중을 올린다.
  let score = dist == null ? 0.6 * name + 0.3 * addr + 0.1 * phone : 0.5 * name + 0.3 * dist + 0.15 * addr + 0.05 * phone;
  if (phone && name >= 0.6) score += 0.1;
  if (addr === 1 && name >= 0.6) score += 0.1;
  if (licenseDate && name >= 0.4 && (dist == null || dist > 0 || addr > 0)) score += 0.15;
  if (bizNo) score += 0.3;
  return { score: Math.min(1, Math.round(score * 1000) / 1000), evidence: { name: Math.round(name * 100) / 100, distance_m: d == null ? null : Math.round(d), road_address_same: addr === 1, same_district: addr > 0, phone_same: Boolean(phone), license_date_same: Boolean(licenseDate), business_no_same: Boolean(bizNo) } };
}

/**
 * @param {object[]} licenses normalizeLicense 결과
 * @param {{id:string,name:string,lat:number|null,lng:number|null,address:string|null,phone:string|null,status:string|null,licensed_on?:string|null,business_no?:string|null}[]} gocamping
 */
export function matchLicenses(licenses, gocamping) {
  const located = gocamping.filter((g) => g.lat != null);
  const index = new GridIndex(located);
  const byDistrict = new Map();
  for (const g of gocamping) { const k = districtKey(g.address); if (!byDistrict.has(k)) byDistrict.set(k, []); byDistrict.get(k).push(g); }
  const taken = new Map(); // 고캠핑 id → 가장 높은 점수의 인허가 id(1:1 유지)
  const results = licenses.map((lic) => {
    const pool = new Map();
    if (lic.lat != null) for (const n of index.within(lic.lat, lic.lng, 3000)) pool.set(n.point.id, n.point);
    for (const g of byDistrict.get(districtKey(lic.road_address || lic.parcel_address)) ?? []) pool.set(g.id, g);
    let best = null;
    for (const g of pool.values()) {
      const s = scorePair(lic, g);
      if (!best || s.score > best.score) best = { gocamping_id: g.id, gocamping_name: g.name, gocamping_status: g.status ?? null, ...s };
    }
    return { lic, best };
  });
  for (const r of results) {
    if (!r.best || r.best.score < 0.6) continue;
    const prev = taken.get(r.best.gocamping_id);
    if (!prev || prev.best.score < r.best.score) taken.set(r.best.gocamping_id, r);
  }
  return results.map((r) => {
    const winner = r.best && taken.get(r.best.gocamping_id) === r;
    const state = !r.best || r.best.score < 0.6 || !winner ? "NEW" : r.best.score >= 0.9 ? "MATCHED" : "NEEDS_REVIEW";
    const flags = [];
    if (state === "MATCHED" && r.lic.status === "CLOSED" && !/폐업|폐장|종료/.test(r.best.gocamping_status ?? "")) flags.push("LICENSE_CLOSED_BUT_LISTED");
    if (state === "NEW" && r.lic.status === "OPERATING") flags.push("HIDDEN_CANDIDATE");
    return { ...r.lic, match: r.best ? { ...r.best, state, flags } : { state, flags } };
  });
}
