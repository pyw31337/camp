// 캠핑장 카드 대표 썸네일 검증 및 선별 모듈 (소유자 2026-11-24: 썸네일 진위 검증 로직)
// - 블로그 작성자 프로필/아바타, AI 인물 일러스트, 캐리커처, 음식 클로즈업 등 캠핑장과 무관한 엉뚱한 이미지 차단
// - 공식 예약/운영사 CDN 및 고캠핑 정품 사진 우선 순위화
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");

// 프로필/아바타/작성자 아이콘 URL 패턴
const AVATAR_PATTERNS = [
  /blogpfthumb/i,
  /dthumb-phinf\.pstatic\.net/i,
  /static\.nid\.naver\.com/i,
  /profile_images/i,
  /user_avatar/i,
  /icon_profile/i,
  /profile_thumb/i,
];

// 공식 운영/예약사 및 신뢰할 수 있는 캠핑장 CDN 패턴
const AUTHENTIC_PATTERNS = [
  /dul339flcqmyl\.cloudfront\.net\/hotel_photos/i, // 그래가 직영/공식 예약사 CDN
  /gocamping\.or\.kr\/upload\/camp/i, // 한국관광공사 고캠핑 공식 사진
  /camfit\.co\.kr/i, // 캠핏 공식 사이트 이미지
  /thankqcamping\.com/i, // 땡큐캠핑 공식 이미지
  /campun\.net/i, // 캠프운 공식 이미지
];

let cachedJudgments = null;
let cachedPins = null;

function loadRegistries() {
  if (!cachedJudgments) {
    const jp = join(root, "pipeline/registry/photo-judgments.json");
    cachedJudgments = existsSync(jp) ? (JSON.parse(readFileSync(jp, "utf8")).photos ?? {}) : {};
  }
  if (!cachedPins) {
    const pp = join(root, "pipeline/registry/card-photo-pins.json");
    cachedPins = existsSync(pp) ? (JSON.parse(readFileSync(pp, "utf8")).camps ?? {}) : {};
  }
}

/**
 * 특정 이미지 URL이 프로필/아바타 또는 거절 목록에 해당하는지 판별
 */
export function isRejectedThumbnail(url) {
  if (!url || typeof url !== "string") return false;
  const raw = url.trim();
  if (!raw) return false;

  // 1. 프로필/아바타 URL 패턴
  for (const pat of AVATAR_PATTERNS) {
    if (pat.test(raw)) return { rejected: true, reason: "프로필/아바타 URL 패턴" };
  }

  loadRegistries();

  // 2. photo-judgments.json 판정 결과 검사 (ok === false)
  const j = cachedJudgments[raw];
  if (j && j.ok === false) {
    return { rejected: true, reason: `내용 판정 거절 (${j.why || j.top || "부적합"})` };
  }

  // 3. card-photo-pins.json의 reject 목록 검사
  for (const pin of Object.values(cachedPins)) {
    if (Array.isArray(pin.reject) && pin.reject.includes(raw)) {
      return { rejected: true, reason: `수기 검수 거절 목록 (${pin.why || "캠핑장 무관"})` };
    }
  }

  return { rejected: false };
}

/**
 * 공식 운영사/예약사/고캠핑 정품 사진인지 여부
 */
export function isAuthenticOperatorPhoto(url) {
  if (!url || typeof url !== "string") return false;
  return AUTHENTIC_PATTERNS.some((pat) => pat.test(url));
}

/**
 * 캠핑장 레코드와 상세 레코드에서 최적의 진짜 캠핑장 대표 썸네일을 선별
 */
export function pickValidCampThumbnail(camp, detail = null) {
  loadRegistries();
  const id = String(camp?.id ?? "");

  // 1. card-photo-pins에 고정된 사진이 있으면 최우선
  const pin = cachedPins[id]?.pin;
  if (pin?.i || pin?.t) {
    const pinnedUrl = pin.i || pin.t;
    const chk = isRejectedThumbnail(pinnedUrl);
    if (!chk.rejected) {
      return { img: pinnedUrl, sn: pin.t || pinnedUrl, source: "PINNED" };
    }
  }

  // 2. detail.photos 및 camp.photos 후보 수집
  const candidates = [];
  if (Array.isArray(detail?.photos)) candidates.push(...detail.photos);
  if (Array.isArray(camp?.photos)) candidates.push(...camp.photos);
  if (camp?.img) candidates.push(camp.img);
  if (camp?.sn) candidates.push(camp.sn);

  // 3. 거절된 이미지 제외 및 중복 제거
  const valid = [];
  const seen = new Set();
  for (const u of candidates) {
    if (!u || typeof u !== "string") continue;
    const s = u.trim();
    if (seen.has(s)) continue;
    seen.add(s);
    if (isRejectedThumbnail(s).rejected) continue;
    valid.push(s);
  }

  // 4. 공식 운영사/고캠핑 정품 사진 우선 탐색
  const authentic = valid.find(isAuthenticOperatorPhoto);
  if (authentic) {
    return { img: authentic, sn: authentic, source: "AUTHENTIC_OPERATOR" };
  }

  // 5. 일반 유효 사진 반환
  if (valid.length > 0) {
    return { img: valid[0], sn: valid[0], source: "VALID_FALLBACK" };
  }

  return { img: null, sn: null, source: "EMPTY" };
}
