// 행정안전부 공중화장실정보(전국 파일) 정규화.
// 파일 머리글은 판(版)마다 조금씩 달라 정확한 이름 대신 패턴으로 열을 찾는다.

import { createHash } from "node:crypto";
import { epsg5174ToWgs84 } from "./crs.mjs";
import { inKorea } from "./geo.mjs";

const pick = (row, patterns) => {
  for (const re of patterns) {
    const k = Object.keys(row).find((key) => re.test(key.replace(/\s+/g, "")));
    if (k && row[k] !== "") return row[k];
  }
  return null;
};
const sumCols = (row, re) => Object.keys(row).filter((k) => re.test(k.replace(/\s+/g, ""))).reduce((s, k) => s + (Number(String(row[k]).replace(/[^\d]/g, "")) || 0), 0);
const yes = (v) => (v == null ? null : /^(y|yes|유|있음|설치|o|1|true)$/i.test(String(v).trim()) ? true : /^(n|no|무|없음|미설치|x|0|false)$/i.test(String(v).trim()) ? false : null);

/** 화장실 데이터임을 보증하는 열(칸 수·개방시간 등). 이름+주소만 있는 다른 업종 파일을 걸러낸다. */
export function isToiletRow(row) {
  return Object.keys(row).some((k) => /화장실|대변기|소변기|개방시간|기저귀|비상벨/.test(k.replace(/\s+/g, "")));
}

export function normalizeToilet(row) {
  if (!isToiletRow(row)) return null;
  const name = pick(row, [/^화장실명$/, /^(사업장명|시설명|명칭)$/, /화장실명/]);
  const road = pick(row, [/소재지도로명주소/, /도로명(전체)?주소/, /^도로명주소$/]);
  const jibun = pick(row, [/소재지지번주소/, /지번(전체)?주소/, /^소재지(전체)?주소$/]);
  if (!name || !(road || jibun)) return null;
  const status = pick(row, [/영업상태명/, /^상태$/]);
  if (status && /폐업|폐쇄|휴업|철거/.test(status)) return null;
  const openText = pick(row, [/개방시간상세/, /^개방시간$/, /개방시간/]);
  const disabled = sumCols(row, /장애인/);
  const child = sumCols(row, /어린이/);
  const id = createHash("sha1").update(`${name}|${road ?? ""}|${jibun ?? ""}`).digest("hex").slice(0, 16);
  // LOCALDATA 계열 파일의 좌표정보(X)/(Y)는 EPSG:5174. 있으면 지오코딩 없이 쓴다.
  const tx = Number(pick(row, [/좌표정보\(?X\)?/i, /^X좌표$/]));
  const ty = Number(pick(row, [/좌표정보\(?Y\)?/i, /^Y좌표$/]));
  let coord = null;
  if (tx > 0 && ty > 0) {
    const [la, ln] = epsg5174ToWgs84(tx, ty);
    if (inKorea(la, ln)) coord = { lat: Math.round(la * 1e6) / 1e6, lng: Math.round(ln * 1e6) / 1e6, precision: "EPSG5174" };
  }
  return {
    id,
    name,
    ...(coord ?? {}),
    road_address: road,
    jibun_address: jibun,
    open_hours: openText,
    open_24h: openText ? /24\s*시간|00:00\s*[~-]\s*24:00|연중\s*무휴\s*24|상시/.test(openText) : null,
    kind: pick(row, [/^구분(명)?$/, /화장실구분/, /^구분/]),
    owner: pick(row, [/화장실소유구분/, /소유구분/]),
    disabled_stalls: disabled,
    child_stalls: child,
    emergency_bell: yes(pick(row, [/비상벨설치여부/, /비상벨/])),
    cctv: yes(pick(row, [/CCTV/i])),
    diaper_table: yes(pick(row, [/기저귀교환대(유무|여부)/, /기저귀/])),
    manager: pick(row, [/관리기관명/, /관리기관/]),
    tel: pick(row, [/전화번호/]),
    data_date: pick(row, [/데이터기준일자/, /최종수정(시점|일자)/, /기준일/]),
  };
}

/**
 * 전국공중화장실표준데이터 API(영문 필드) → normalizeToilet이 읽는 한글 머리글로 바꾼다.
 * 필드명은 표준데이터 명세 기준이며, 모르는 필드는 그대로 둔다. 위도·경도가 있으면 지오코딩 없이 쓴다.
 */
const STD_FIELD = [
  [/^toiletnm$/i, "화장실명"], [/^rdnmadr$/i, "소재지도로명주소"], [/^lnmadr$/i, "소재지지번주소"],
  [/^(opentime|openhrdetail|opentimedetail)$/i, "개방시간"], [/^toilettype$/i, "구분"], [/^(toiletposstype|ownertype)$/i, "화장실소유구분"],
  [/^institutionnm$/i, "관리기관명"], [/^phonenumber$/i, "전화번호"], [/^(referencedate|datastddt)$/i, "데이터기준일자"],
  [/^emgbellyn$/i, "비상벨설치여부"], [/^(enterentcctvyn|cctvyn)$/i, "화장실입구CCTV설치유무"], [/^(dipersexchgposi|diaperexchgyn)$/i, "기저귀교환대유무"],
];

export function fromStandardApi(item) {
  const row = {};
  for (const [key, value] of Object.entries(item)) {
    const hit = STD_FIELD.find(([pattern]) => pattern.test(key));
    if (hit) row[hit[1]] = value ?? "";
    else if (/disabled/i.test(key)) row[`장애인_${key}`] = value ?? "";
    else if (/child/i.test(key)) row[`어린이_${key}`] = value ?? "";
    else row[key] = value ?? "";
  }
  const toilet = normalizeToilet(row);
  if (!toilet) return null;
  const lat = Number(item.latitude), lng = Number(item.longitude);
  if (!Number.isFinite(toilet.lat) && inKorea(lat, lng)) Object.assign(toilet, { lat, lng, precision: "SOURCE" });
  return toilet;
}

/** 지오코딩 질의용 주소(도로명 우선). 괄호 속 부가 설명은 지운다. */
export function geocodeQuery(t) {
  const base = t.road_address || t.jibun_address || "";
  return base.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}
