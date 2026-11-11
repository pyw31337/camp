// 운영자 사이트(상품) 사진 올리기 — 소유 확인·사전 판정(2026-11-11 t62).
// 파이프라인과 브라우저(public/operator/verify.js)가 같은 파일이다. 다른 모듈을 끌어쓰지 않는다.
// 1) 고캠핑에 등록된 전화번호로만 OTP(사용자가 다른 번호를 넣을 수 없음).
// 2) 전화가 없으면(또는 문자를 받을 수 없으면) 사업자등록번호를 국세청 상태조회 API로 확인하고, 상호는 시설명과 맞춰 본다.
// 미리보기에서는 OTP·국세청 호출을 흉내 낸다. 실제 문자·API 키는 서버에서만 쓴다.

const GENERIC = /(오토)?캠핑장|캠핑|글램핑|카라반|야영장|오토|파크|리조트|펜션|빌리지|\s+/g;
const DOC_REGEX = /배치도|도면|layout|cert|등록증|신고서|사업자|허가증|안내도/i;
const AD_REGEX = /배치도|안내도|지도|약도|오시는\s*길|요금|가격|매점|편의점|화장실|샤워|개수대|관리동|주차장|수영장|놀이터|체험|이벤트|공지|로고|logo|banner|배너|icon|아이콘|btn|button|등록증|허가|보험/i;

export function nameKey(name) {
  return String(name ?? "")
    .replace(/\[[^\]]*\]|\([^)]*\)|（[^）]*）/g, "")
    .replace(/주식회사|㈜|\(주\)|농업회사법인|영농조합법인/g, "")
    .replace(GENERIC, "")
    .replace(/[^0-9a-z가-힣]/gi, "")
    .toLowerCase();
}

export function nameSimilarity(a, b) {
  const x = nameKey(a), y = nameKey(b);
  if (!x || !y) return 0;
  if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) >= 2 ? 1 : 0.5;
  const grams = (s) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const gx = grams(x), gy = grams(y);
  if (!gx.size || !gy.size) return 0;
  let hit = 0;
  for (const g of gx) if (gy.has(g)) hit++;
  return (2 * hit) / (gx.size + gy.size);
}

export const SITE_TYPE_OPTIONS = [
  ["AUTO", "오토캠핑"],
  ["PITCH", "일반 사이트"],
  ["DECK", "데크"],
  ["DUPLEX_DECK", "복층 데크"],
  ["TARP_ZONE", "타프존"],
  ["GLAMPING", "글램핑"],
  ["CARAVAN", "카라반"],
  ["RV", "캠핑카·트레일러"],
  ["HOUSE", "숙박동·펜션"],
  ["BUNGALOW", "방갈로·캐빈"],
  ["CAR_CAMP", "차박"],
  ["PET_SITE", "반려견 전용"],
  ["SOLO", "솔로·백패킹"],
  ["EQUIPPED", "장비 포함"],
];
export const SITE_TYPE_LABEL = Object.fromEntries(SITE_TYPE_OPTIONS);

const digits = (s) => String(s ?? "").replace(/\D/g, "");

/** 캠핑장 st는 코드 배열이거나 [['AUTO', 12, 'c'], ...] 형태다. 코드만 뽑는다. */
export function campSiteTypes(camp) {
  const st = camp?.st;
  if (!Array.isArray(st)) return [];
  return [...new Set(st.map((x) => (Array.isArray(x) ? x[0] : x)).filter((x) => typeof x === "string" && x))];
}


/** 고캠핑에 등록된 전화만. 카카오·네이버로 채운 번호(tel_src)는 쓰지 않는다. */
export function gocampingTel(camp) {
  if (!camp || camp.tel_src) return "";
  const t = String(camp.tel || camp.tel_raw || "").trim();
  return digits(t).length >= 8 ? t : "";
}

/** 041-532-0106 → 041-532-**** 처럼 끝 네 자리만 가린다. */
export function maskTel(tel) {
  const d = digits(tel);
  if (d.length < 8) return "";
  const vis = d.slice(0, -4);
  const stars = "****";
  if (d.startsWith("02")) {
    const rest = vis.startsWith("02") ? vis.slice(2) : vis;
    return rest ? `02-${rest}-${stars}` : `02-${stars}`;
  }
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${stars}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${stars}`;
  return `${vis}-${stars}`;
}

/** 사업자등록번호 10자리 검사(검증 숫자 포함). */
export function validBizNo(raw) {
  const d = digits(raw);
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

export function formatBizNo(raw) {
  const d = digits(raw);
  if (d.length !== 10) return d;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/**
 * 상호와 시설명 맞음 정도(0~1). 0.72 이상이면 같은 업장으로 본다.
 * ‘선장포노을사회적협동조합’ ↔ ‘선장포노을캠핑장’처럼 앞부분이 같으면 통과.
 */
export function bizNameMatch(campName, bizName) {
  const s = nameSimilarity(campName, bizName);
  if (s >= 0.72) return { ok: true, score: s };
  const a = String(campName ?? "").replace(/\s+/g, "").replace(/(오토)?캠핑장$|글램핑장$|야영장$/g, "");
  const b = String(bizName ?? "").replace(/\s+/g, "").replace(/(주식회사|유한회사|협동조합|사회적협동조합|농업회사법인)$/g, "");
  if (a.length >= 3 && b.includes(a)) return { ok: true, score: 1 };
  if (b.length >= 3 && a.includes(b)) return { ok: true, score: 1 };
  return { ok: false, score: s };
}

export function parseNtsStatus(item) {
  const cd = String(item?.b_stt_cd ?? "");
  const tax = String(item?.tax_type ?? "");
  if (/등록되지 않은/.test(tax) || !cd) return { ok: false, reason: "unregistered", raw: item };
  if (cd === "03") return { ok: false, reason: "closed", status: item.b_stt, raw: item };
  if (cd === "02") return { ok: false, reason: "suspended", status: item.b_stt, raw: item };
  if (cd === "01") return { ok: true, reason: "active", status: item.b_stt, raw: item };
  return { ok: false, reason: "unknown", raw: item };
}

/**
 * 국세청 상태조회 응답 + 상호를 시설명과 맞춰 소유 여부를 판단한다.
 * name_mismatch여도 계속사업자이면 대기열에는 넣되, 관리자 확인이 필요하다고 표시한다.
 */
export function decideBizOwnership({ campName, bizName, ntsItem }) {
  const st = parseNtsStatus(ntsItem);
  if (!st.ok) return { verified: false, method: "biz", ...st, name: { ok: false, score: 0 } };
  const name = bizName ? bizNameMatch(campName, bizName) : { ok: false, score: 0 };
  return { verified: true, method: "biz", pending_name: !name.ok, status: st.status, name };
}

export const NTS = {
  statusUrl: "https://api.odcloud.kr/api/nts-businessman/v1/status",
  validateUrl: "https://api.odcloud.kr/api/nts-businessman/v1/validate",
  note: "serviceKey는 서버에서만. 브라우저에 넣지 않는다. 기존 DATA_GO_KR_SERVICE_KEY에 ‘국세청_사업자등록정보 진위확인 및 상태조회 서비스’ 활용신청만 추가하면 된다.",
};

export async function fetchNtsStatus(bizNo, { serviceKey, fetchImpl = fetch } = {}) {
  if (!serviceKey) throw new Error("missing_key");
  const r = await fetchImpl(`${NTS.statusUrl}?serviceKey=${encodeURIComponent(serviceKey)}&returnType=JSON`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ b_no: [digits(bizNo)] }),
  });
  if (!r.ok) throw new Error(`nts_http_${r.status}`);
  const j = await r.json();
  return (j.data && j.data[0]) || null;
}

/** 미리보기용 국세청 흉내. 999로 시작하면 폐업, 888이면 휴업, 그 외 유효 번호는 계속사업자. */
export function mockNtsStatus(bizNo) {
  if (!validBizNo(bizNo)) return { tax_type: "국세청에 등록되지 않은 사업자등록번호입니다." };
  const d = digits(bizNo);
  if (d.startsWith("999")) return { b_stt_cd: "03", b_stt: "폐업자" };
  if (d.startsWith("888")) return { b_stt_cd: "02", b_stt: "휴업자" };
  return { b_stt_cd: "01", b_stt: "계속사업자", tax_type: "부가가치세 일반과세자" };
}

export function isDocumentOrCertificate(photo) {
  const url = typeof photo === "string" ? photo : (photo?.l || photo?.t || photo?.url || photo?.name || "");
  if (DOC_REGEX.test(url)) return true;
  if (typeof photo === "object" && photo.w && photo.h) {
    const ratio = photo.h / photo.w;
    if (ratio >= 1.35 && ratio <= 1.55) return true;
  }
  return false;
}

export function nonProductText(text) {
  return AD_REGEX.test(String(text ?? ""));
}

/** 업로드 전 파일 검사(서류·광고·너무 작거나 배너 비율). CLIP 판정은 서버·파이프라인에서. */
export function preflightPhoto({ name = "", type = "", size = 0, width = 0, height = 0 } = {}) {
  const reasons = [];
  if (type && !/^image\/(jpeg|png|webp)$/i.test(type)) reasons.push("format");
  if (size && size > 8_000_000) reasons.push("too-large");
  if (width && height) {
    if (width < 400 || height < 260) reasons.push("size");
    const r = width / height;
    if (r > 2.6 || r < 0.5) reasons.push("ratio");
    if (isDocumentOrCertificate({ url: name, w: width, h: height })) reasons.push("document");
  } else if (name && isDocumentOrCertificate({ url: name })) reasons.push("document");
  if (nonProductText(name)) reasons.push("ad-or-text");
  return { ok: reasons.length === 0, reasons };
}

export function otpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const REASON_LABEL = {
  format: "사진 파일(JPG·PNG·WebP)만 올릴 수 있어요",
  "too-large": "한 장에 8MB를 넘을 수 없어요",
  size: "너무 작은 사진이에요(가로 400, 세로 260 이상)",
  ratio: "배너처럼 길거나 너무 좁은 사진은 쓰지 않아요",
  document: "등록증·배치도·서류 사진은 상품 사진으로 올리지 않아요",
  "ad-or-text": "요금표·배너·광고처럼 보이는 파일 이름이에요",
  unregistered: "국세청에 등록되지 않은 번호예요",
  closed: "폐업으로 확인된 번호예요",
  suspended: "휴업으로 확인된 번호예요",
};

export const TEST_BIZ = {
  ok: "123-45-67891",
  closed: "999-00-00001",
  suspended: "888-00-00002",
};

export function isPreviewHost(loc = (typeof location !== "undefined" ? location : {})) {
  const host = String(loc.host || "");
  const search = String(loc.search || "");
  const protocol = String(loc.protocol || "");
  const path = String(loc.pathname || "");
  return /camp-preview/.test(host) || /camp-preview/.test(path) || /[?&]oppreview=1\b/.test(search) || protocol === "file:" || host === "127.0.0.1" || host === "localhost";
}
