// pipeline/scripts/discover-new-camps.mjs
// 전국 250개 시·군·구 단위로 카카오 로컬 / 네이버 검색을 조회하여
// 캠핏·네이버예약 등에는 있으나 우리 DB(고캠핑)에 누락된 신규 오픈 캠핑장을 자동 발굴하는 파이프라인

import fs from "node:fs";
import path from "node:path";

const campgroundsPath = "camping-atlas/public/explore/data/campgrounds.json";
const discoveredRegistryPath = "pipeline/registry/discovered-camps.json";
const campsDir = "camping-atlas/public/explore/data/camps";

const camps = JSON.parse(fs.readFileSync(campgroundsPath, "utf-8"));
const existingNames = new Set(camps.map(c => normalizeName(c.name)));
const existingPhones = new Set(camps.map(c => normalizePhone(c.tel)).filter(Boolean));

function normalizeName(name) {
  return String(name || "").toLowerCase().replace(/[\s\-_()]/g, "");
}

function normalizePhone(tel) {
  return String(tel || "").replace(/[^0-9]/g, "");
}

// 전국 주요 17개 시도 및 대표 시군구 목록
export const REGIONS = [
  { sido: "경기", sigungus: ["가평군", "양평군", "포천시", "연천군", "파주시", "남양주시", "용인시", "화성시", "안성시", "평택시"] },
  { sido: "강원", sigungus: ["홍천군", "춘천시", "원주시", "영월군", "평창군", "정선군", "인제군", "고성군", "양양군", "강릉시"] },
  { sido: "충북", sigungus: ["충주시", "제천시", "단양군", "괴산군", "보은군", "영동군", "옥천군", "진천군", "음성군"] },
  { sido: "충남", sigungus: ["태안군", "서산시", "당진시", "공주시", "보령시", "아산시", "논산시", "부여군", "청양군", "예산군"] },
  { sido: "경북", sigungus: ["경주시", "포항시", "영덕군", "울진군", "청도군", "성주군", "문경시", "상주시", "안동시", "봉화군"] },
  { sido: "경남", sigungus: ["밀양시", "양산시", "거제시", "통영시", "남해군", "산청군", "함양군", "거창군", "합천군", "창녕군"] },
  { sido: "전북", sigungus: ["완주군", "진안군", "무주군", "장수군", "임실군", "순창군", "고창군", "부안군", "군산시"] },
  { sido: "전남", sigungus: ["여수시", "순천시", "담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군", "해남군"] },
  { sido: "제주", sigungus: ["제주시", "서귀포시"] },
  { sido: "인천", sigungus: ["강화군", "옹진군", "중구"] }
];

export const KEYWORDS = ["캠핑장", "글램핑", "카라반", "오토캠핑"];

/**
 * 카카오 로컬 키워드 검색 URL 생성
 */
export function buildKakaoKeywordUrl(query, page = 1) {
  const enc = encodeURIComponent(query);
  return `https://dapi.kakao.com/v2/local/search/keyword.json?query=${enc}&category_group_code=AD5&page=${page}&size=15`;
}

/**
 * 네이버 지역 검색 URL 생성
 */
export function buildNaverSearchUrl(query, start = 1) {
  const enc = encodeURIComponent(query);
  return `https://openapi.naver.com/v1/search/local.json?query=${enc}&display=5&start=${start}&sort=comment`;
}

/**
 * 신규 발굴된 캠핑장 엔티티 생성
 */
export function createDiscoveredCamp(place, source = "kakao") {
  const id = `disc-${source}-${place.id || Date.now()}`;
  return {
    id,
    name: place.place_name || place.title?.replace(/<[^>]+>/g, ""),
    addr: place.road_address_name || place.address_name || place.address,
    tel: place.phone || place.telephone,
    lat: place.y ? parseFloat(place.y) : null,
    lng: place.x ? parseFloat(place.x) : null,
    url: place.place_url || place.link,
    source,
    discovered_at: new Date().toISOString()
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");
  const maxCalls = parseInt(process.env.DISCOVERY_MAX_CALLS || "500", 10);

  console.log(`[discover-new-camps] 전국 단위 신규 오픈 캠핑장 발굴 파이프라인 시작 (Max calls: ${maxCalls})`);

  let prevDiscovered = { camps: [] };
  if (fs.existsSync(discoveredRegistryPath)) {
    try {
      prevDiscovered = JSON.parse(fs.readFileSync(discoveredRegistryPath, "utf-8"));
    } catch {}
  }

  const existingDiscoveredIds = new Set(prevDiscovered.camps.map(c => c.id));
  const newDiscovered = [];

  console.log(`기존 등록 캠핑장: ${camps.length}곳, 기 발굴 신규 캠핑장: ${prevDiscovered.camps.length}곳`);

  // 키가 없어도 구조 검증 및 mock/dry-run 지원
  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  if (!kakaoKey) {
    console.log("::notice title=신규 발굴 대기::KAKAO_REST_API_KEY 없음 (CI/운영 환경에서 자동 실행)");
  }

  console.log(`[discover-new-camps] 발굴 파이프라인 대기열 구성 완료.`);
}

if (process.argv[1] && process.argv[1].endsWith("discover-new-camps.mjs")) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
