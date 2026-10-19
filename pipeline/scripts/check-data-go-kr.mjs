// 공공데이터포털 인증키로 활용신청한 서비스가 실제로 호출되는지 확인한다. 키 값은 출력하지 않는다.
// 사용: DATA_GO_KR_SERVICE_KEY=... node scripts/check-data-go-kr.mjs
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { fetchExAll } from "../lib/ex-rest-areas.mjs";
import { kakaoGeocode } from "../lib/geocode.mjs";
import { nowInKst } from "../lib/kst.mjs";
import { midTmFc } from "../lib/conditions.mjs";

// 다른 원천 키(값은 출력하지 않음): 한국도로공사 EX_API_KEY, 카카오 REST/JS 키
async function checkOtherKeys() {
  let bad = 0;
  if (process.env.EX_API_KEY) {
    try {
      const rows = await fetchExAll("locationinfo/locationinfoRest", process.env.EX_API_KEY);
      console.log(`✓ 한국도로공사 EX_API_KEY — 휴게소 좌표 ${rows.length}건`);
    } catch (e) { bad++; console.log(`✗ 한국도로공사 EX_API_KEY — ${e.message}`); }
  } else console.log("- EX_API_KEY 없음(예제 키로 동작)");
  if (process.env.KAKAO_REST_API_KEY) {
    try {
      const r = await kakaoGeocode("서울특별시 중구 세종대로 110", { key: process.env.KAKAO_REST_API_KEY });
      if (r) console.log(`✓ 카카오 REST API 키 — 주소→좌표 정상(${r.lat.toFixed(3)}, ${r.lng.toFixed(3)})`);
      else { bad++; console.log("✗ 카카오 REST API 키 — 응답은 왔지만 결과 없음(카카오맵 사용 설정 확인)"); }
    } catch (e) { bad++; console.log(`✗ 카카오 REST API 키 — ${e.message}${e.code === "AUTH" ? " · 제품 설정 → 카카오맵 ‘사용 설정 ON’, 허용 IP 비움, REST API 키(Admin 키 아님)인지 확인" : ""}`); }
  } else console.log("- KAKAO_REST_API_KEY 없음");
  const js = process.env.KAKAO_JS_KEY;
  console.log(js ? `✓ 카카오 JavaScript 키 Variable 있음(${js.length}자, 도메인 제한이라 서버에서 호출 검사는 하지 않음)` : "- KAKAO_JS_KEY Variable 없음");
  return bad;
}
const otherBad = await checkOtherKeys();

const key = process.env.DATA_GO_KR_SERVICE_KEY;
if (!key) {
  console.log("DATA_GO_KR_SERVICE_KEY Secret이 없습니다. GitHub → Settings → Secrets and variables → Actions에 등록하세요.");
  process.exit(process.env.REQUIRE_KEY ? 1 : 0);
}
console.log(`인증키 길이 ${key.length}자 · ${key.includes("%") ? "Encoding 키" : "Decoding 키"}로 인식`);

const k = nowInKst(Date.now() - 60 * 60 * 1000); // 초단기실황은 한 시간 전 정시 자료가 안정적
const ymd = `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
const hh = `${String(k.getUTCHours()).padStart(2, "0")}00`;
const common = "MobileOS=ETC&MobileApp=moyeora&_type=json";
const checks = [
  { name: "한국관광공사 고캠핑", url: `https://apis.data.go.kr/B551011/GoCamping/basedList?numOfRows=1&pageNo=1&${common}` },
  { name: "기상청 단기예보(초단기실황)", url: `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?pageNo=1&numOfRows=1&dataType=JSON&base_date=${ymd}&base_time=${hh}&nx=60&ny=127` },
  { name: "한국관광공사 TourAPI(국문)", url: `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?numOfRows=1&pageNo=1&${common}` },
  // 주말 컨디션(sync-conditions.mjs) — 각각 data.go.kr 활용신청 필요
  { name: "기상청 중기예보(15059468)", url: `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?pageNo=1&numOfRows=1&dataType=JSON&regId=11B10101&tmFc=${midTmFc()}` },
  { name: "기상청 기상특보(15000415)", url: "https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus?pageNo=1&numOfRows=1&dataType=JSON" },
  { name: "에어코리아 대기오염정보(15073861)", url: `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?returnType=json&numOfRows=1&pageNo=1&sidoName=${encodeURIComponent("서울")}&ver=1.0` },
  { name: "에어코리아 측정소정보(15073877)", url: "https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList?returnType=json&numOfRows=1&pageNo=1" },
  { name: "산림청 산불위험예보(15084817)", url: "https://apis.data.go.kr/1400377/forestPoint/forestPointListGeongugSearch?_type=json&numOfRows=1&pageNo=1" },
  { name: "국립해양조사원 조석예보 고·저조(15156018)", url: `https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?obsCode=DT_0001&reqDate=${ymd}&type=json&numOfRows=1&pageNo=1` },
];
// 정기 수집에서는 실제 필수 원천(고캠핑)만 빠르게 점검한다. 날씨·TourAPI는
// 해당 어댑터를 도입할 때 별도 진단으로 확인해, 연결 지연이 전국 시설 적재를 막지 않게 한다.
const activeChecks = process.env.DATA_GO_KR_CHECK_SCOPE === "ESSENTIAL" ? checks.slice(0, 1) : checks;

function diagnose(status, text) {
  if (/SERVICE_KEY_IS_NOT_REGISTERED|not registered|등록되지 않은/i.test(text)) return "키 미등록: 이 서비스 활용신청이 안 됐거나 승인 대기(신청 직후 1~2시간 걸릴 수 있음)";
  if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS|EXCEEDS/i.test(text)) return "일일 호출 한도 초과";
  if (/DEADLINE_HAS_EXPIRED/i.test(text)) return "활용기간 만료";
  if (/Unauthorized/i.test(text) || status === 401) return "인증 실패: 키 값(Encoding/Decoding) 확인";
  if (status === 404 || /API not found/i.test(text)) return "주소 없음: 서비스 경로가 바뀌었을 수 있음";
  try {
    const j = JSON.parse(text);
    const h = j?.response?.header;
    if (h && ["0000", "00"].includes(String(h.resultCode))) return null;
    if (h) return `응답 코드 ${h.resultCode}: ${h.resultMsg}`;
  } catch { /* JSON이 아니면 아래에서 처리 */ }
  return `알 수 없는 응답(HTTP ${status}): ${text.slice(0, 120).replace(/\s+/g, " ")}`;
}

let failed = 0;
for (const c of activeChecks) {
  try {
    const { res, protocol } = await fetchDataGoKr(c.url, key);
    if (protocol === "http") console.log(`  (HTTPS 연결이 막혀 HTTP로 호출함)`);
    const text = await res.text();
    const problem = diagnose(res.status, text);
    if (problem) failed += 1;
    let extra = "";
    if (!problem) { try { const n = JSON.parse(text)?.response?.body?.totalCount; if (n != null) extra = ` · 전체 ${n}건`; } catch { /* 무시 */ } }
    console.log(`${problem ? "✗" : "✓"} ${c.name}${problem ? ` — ${problem}` : extra}`);
  } catch (e) {
    failed += 1;
    console.log(`✗ ${c.name} — 연결 실패: ${e.message}`);
  }
}
console.log("행정안전부 일반야영장업 조회서비스는 요청 주소 확인 후 추가 예정(활용신청 상태는 data.go.kr 마이페이지에서 확인).");
process.exit((failed || otherBad) && process.env.REQUIRE_KEY ? 1 : 0);
