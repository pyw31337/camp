/**
 * @fileoverview 전국야영(캠핑)장표준데이터 및 지자체 캠핑 데이터 정규화·매칭 엔진.
 * 행정안전부/문체부 국가표준데이터셋(STD), 연계데이터(LINKED), 파일데이터(FILE)로부터
 * 야영장 총 사이트 수, 일반 텐트/카라반/글램핑 세부 수량, 부지면적, 주차대수, 화로대 여부를 정형화한다.
 */

import { haversineM, inKorea } from "./geo.mjs";
import { nameSimilarity } from "./localdata-campgrounds.mjs";

const clean = (v) => {
  const t = String(v ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
};

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const pick = (row, patterns) => {
  for (const re of patterns) {
    const k = Object.keys(row).find((key) => re.test(key.replace(/\s+/g, "")));
    if (k && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return null;
};

/**
 * 표준데이터 및 연계데이터 행 정규화
 * @param {object} row 공공데이터포털 원문 행 (표준데이터셋 / 지자체 연계데이터 / 파일데이터)
 * @returns {object|null} 정규화된 캠핑장 스펙 레코드
 */
export function normalizeStandardCamp(row) {
  if (!row || typeof row !== "object") return null;

  const name = pick(row, [/^야영장명$/, /^야영\(캠핑\)장명$/, /^캠핑장명$/, /^사업장명$/, /^시설명$/]);
  if (!name) return null;

  const lat = num(pick(row, [/^위도$/, /^lat$/i, /^latitude$/i]));
  const lng = num(pick(row, [/^경도$/, /^lng$/i, /^longitude$/i, /^lon$/i]));

  const totalSites = num(pick(row, [/^야영사이트수$/, /^총사이트수$/, /^사이트수$/, /^구역수$/]));
  const glampingSites = num(pick(row, [/^글램핑시설수$/, /^글램핑수$/, /^글램핑$/]));
  const caravanSites = num(pick(row, [/^카라반시설수$/, /^카라반수$/, /^카라반$/]));
  const autoSites = num(pick(row, [/^자동차야영사이트수$/, /^오토사이트수$/, /^오토야영장수$/]));
  const generalSites = num(pick(row, [/^일반야영사이트수$/, /^일반텐트수$/, /^일반야영장수$/]));

  const parkingCount = num(pick(row, [/^주차대수$/, /^주차장수$/, /^주차가능대수$/]));
  const areaM2 = num(pick(row, [/^부지면적$/, /^시설면적$/, /^야영장면적$/, /^면적$/]));

  const rawFire = pick(row, [/^화로대사용여부$/, /^화로대$/, /^화기사용여부$/]);
  let fireAllowed = null;
  if (rawFire) {
    if (/^[Yy]|가능|허용|개별/.test(rawFire)) fireAllowed = true;
    else if (/^[Nn]|불가|금지/.test(rawFire)) fireAllowed = false;
  }

  const addrRoad = pick(row, [/^소재지도로명주소$/, /^도로명주소$/, /^도로명전체주소$/]);
  const addrJibun = pick(row, [/^소재지지번주소$/, /^지번주소$/, /^소재지전체주소$/]);
  const tel = pick(row, [/^야영장전화번호$/, /^전화번호$/, /^연락처$/]);
  const agency = pick(row, [/^관리기관명$/, /^제공기관명$/, /^운영기관명$/, /^관리부서$/]);
  const baseDate = pick(row, [/^데이터기준일자$/, /^수정일자$/, /^기준일자$/]);

  const amenities = clean(pick(row, [/^편의시설명$/, /^편의시설$/, /^부대시설$/]));
  const safety = clean(pick(row, [/^안전시설명$/, /^안전시설$/, /^소방시설$/]));
  const feeInfo = clean(pick(row, [/^이용요금$/, /^요금안내$/, /^이용료$/]));

  const forestType = clean(pick(row, [/^주요수종$/, /^수종$/, /^식생종류$/, /^임상$/, /^나무종류$/]));
  const trailInfo = clean(pick(row, [/^등산로$/, /^숲길$/, /^산책로$/, /^연계등산로$/, /^탐방로$/]));
  const valleyInfo = clean(pick(row, [/^인접계곡$/, /^계곡명$/, /^하천명$/, /^인근수계$/]));
  const natureIntro = clean(pick(row, [/^자연환경$/, /^입지환경$/, /^주변환경$/, /^산림환경$/]));

  return {
    name: clean(name),
    lat: lat && inKorea(lat, lng) ? Math.round(lat * 1e6) / 1e6 : null,
    lng: lng && inKorea(lat, lng) ? Math.round(lng * 1e6) / 1e6 : null,
    road_address: clean(addrRoad),
    jibun_address: clean(addrJibun),
    tel: clean(tel),
    agency: clean(agency),
    base_date: clean(baseDate),
    specs: {
      total_sites: totalSites,
      general_sites: generalSites,
      auto_sites: autoSites,
      glamping_sites: glampingSites,
      caravan_sites: caravanSites,
      parking_count: parkingCount,
      area_m2: areaM2,
    },
    nature: {
      forest_type: forestType,
      trail_info: trailInfo,
      valley_info: valleyInfo,
      nature_intro: natureIntro,
    },
    conditions: {
      fire_allowed: fireAllowed,
      raw_fire: clean(rawFire),
      amenities,
      safety,
      fee_info: feeInfo,
    },
  };
}

/**
 * 고캠핑 캠핑장 목록과 표준데이터 레코드 1:1 매칭
 * @param {object} stdRecord 정규화된 표준데이터 레코드
 * @param {Map<string, object>} campMap 고캠핑 캠핑장 맵 (id -> camp)
 * @param {object[]} campList 고캠핑 캠핑장 목록
 * @returns {{campId: string|null, score: number, method: string}}
 */
export function matchStandardToCamp(stdRecord, campList) {
  if (!stdRecord || !stdRecord.name) return { campId: null, score: 0, method: "NONE" };

  let best = null;
  let bestScore = 0;
  let bestMethod = "NONE";

  for (const c of campList) {
    if (!c.name) continue;

    // 1. 이름 유사도 검사
    const sim = nameSimilarity(stdRecord.name, c.name);
    if (sim < 0.5) continue;

    // 2. 거리 검사 (좌표가 둘 다 있으면)
    let distM = null;
    if (stdRecord.lat && stdRecord.lng && c.location?.lat && c.location?.lng) {
      distM = haversineM(stdRecord.lat, stdRecord.lng, c.location.lat, c.location.lng);
    }

    // 주소 시도/시군구 검사
    const addr = `${stdRecord.road_address ?? ""} ${stdRecord.jibun_address ?? ""}`;
    const sidoMatch = c.address?.sido && addr.includes(c.address.sido.slice(0, 2));

    let score = sim;
    if (distM != null) {
      if (distM <= 150) score += 0.3;
      else if (distM <= 1000) score += 0.15;
      else score -= 0.3; // 거리가 1km 넘게 멀면 동명이인일 확률 높음
    } else if (sidoMatch) {
      score += 0.15;
    }

    if (score > bestScore) {
      bestScore = score;
      best = c;
      bestMethod = distM != null && distM <= 500 ? "GEO_NAME" : "NAME_ADDR";
    }
  }

  return {
    campId: best && bestScore >= 0.75 ? String(best.external_id?.id ?? best.id) : null,
    score: Math.round(bestScore * 100) / 100,
    method: bestMethod,
  };
}
