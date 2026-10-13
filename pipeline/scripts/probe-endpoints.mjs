// 요청 주소가 공개 문서에 텍스트로 없는 data.go.kr 서비스의 경로를 확인한다.
// 게이트웨이 응답: 없는 경로 → "API not found"/404, 있는 경로 → 데이터 또는 SERVICE_KEY_IS_NOT_REGISTERED.
import { fetchDataGoKr } from "../lib/datagokr.mjs";

const key = process.env.DATA_GO_KR_SERVICE_KEY;
if (!key) { console.log("키 없음 — 건너뜀"); process.exit(0); }
const q = "pageNo=1&numOfRows=1&type=json";
const groups = {
  "행안부 공중화장실정보": ["public_restroom", "public_restrooms_info", "restroom_info", "public_toilets", "public_toilet", "toilet_info", "public_restroom_infos", "pblc_restroom_info", "public_rest_rooms"],
  "행안부 일반야영장업(확인됨)": ["general_campgrounds"],
};
for (const [name, slugs] of Object.entries(groups)) {
  for (const slug of slugs) {
    for (const op of ["info"]) {
      const url = `https://apis.data.go.kr/1741000/${slug}${op ? "/" + op : ""}?${q}`;
      try {
        const { res } = await fetchDataGoKr(url, key, { timeoutMs: 15000 });
        const t = (await res.text()).replace(/\s+/g, " ");
        const verdict = /API not found|NO_OPENAPI_SERVICE|404/i.test(t) || res.status === 404 ? "없음" : /NOT_REGISTERED|등록되지 않은/.test(t) ? "있음(활용신청 필요)" : res.ok ? "있음(응답)" : `HTTP ${res.status}`;
        console.log(`${name} · ${url.split("?")[0]} → ${verdict} · ${t.slice(0, 140)}`);
        if (verdict.startsWith("있음")) break;
      } catch (e) { console.log(`${name} · ${url.split("?")[0]} → 오류 ${e.message}`); }
    }
  }
}
