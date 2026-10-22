import assert from "node:assert/strict";
import test from "node:test";
import { refineCampFacts, refinePet, tenantFilter, timeScope } from "../lib/fact-refine.mjs";
import { compatible } from "../lib/quality.mjs";
import { clearRule } from "../scripts/quality-auto-decide.mjs";

const op = (value, quote, url = "https://camp.example/info") => ({ cid: "7029", attr: "PET_POLICY", value, grade: "OPERATOR", src: "operator_homepage", url, quote });

test("같은 예약 플랫폼의 다른 업장 페이지(detail_id)는 뺀다 — 용인반딧불(7029) 2026-10-22", () => {
  const facts = [op("NOT_ALLOWED", "반려동물 출입 불가능", "https://campweek.co.kr/detail_info_1.php?detail_id=3007029"), op("ALLOWED", "반려동물 출입 가능", "https://campweek.co.kr/detail_info_1.php?detail_id=3007643&ptype=web")];
  const r = tenantFilter(facts, { cid: "7029" });
  assert.deepEqual(r.kept.map((f) => f.value), ["NOT_ALLOWED"]);
  assert.equal(r.dropped.length, 1);
  // 한 페이지만 있으면 건드리지 않는다
  assert.equal(tenantFilter([facts[1]], { cid: "7029" }).kept.length, 1);
});

test("범위가 좁은 금지·크기 제한·구역 한정·홍보 제목을 바로 읽는다", () => {
  assert.equal(refinePet(op("NOT_ALLOWED", "※ 애견 입수 불가"))?.drop, true);
  assert.equal(refinePet(op("NOT_ALLOWED", "(카라반 내부에는 반려동물 입실이 불가합니다.)"))?.drop, true);
  assert.equal(refinePet(op("NOT_ALLOWED", "애견동반 시 추가 요금 1만원 (대형견 입장 금지)"))?.value, "SMALL_ONLY");
  assert.equal(refinePet(op("NOT_ALLOWED", "A사이트 외 애완견 동반 출입 금지"))?.value, "ZONE_ONLY");
  assert.equal(refinePet(op("ALLOWED", "파쇄석캠핑장만 반려동물 동반 가능합니다."))?.value, "ZONE_ONLY");
  assert.equal(refinePet(op("ALLOWED", "애견은 5kg 이하의 소형견만 가능합니다."))?.value, "SMALL_ONLY");
  assert.equal(refinePet(op("ALLOWED", "반려견·반려묘 동반 가능 캠핑장 모음"))?.drop, true);
  assert.equal(refinePet(op("NOT_ALLOWED", "반려동물 동반 불가합니다.")), null);
  assert.equal(refinePet({ ...op("NOT_ALLOWED", "불가능"), src: "gocamping" }), null);
});

test("숙박형·성수기·당일 이용 입퇴실 시각에는 범위를 붙인다(대표값 경쟁에서 제외)", () => {
  const t = (value, quote) => ({ cid: "1", attr: "CHECKIN_TIME", value, src: "operator_homepage", quote });
  assert.match(timeScope(t("15:00", "에코하우스/글램핑 : 입실 15:00 이후, 퇴실 11:00 이전")), /숙박형/);
  assert.equal(timeScope(t("14:00", "데크/파쇄석 : 입실 14:00 이후, 퇴실 12:00 이전")), null);
  assert.match(timeScope(t("15:00", "입·퇴실 시간 : 15:00 ~ 익일 11:00(성수기, 주말·공휴일)")) ?? "", /성수기|숙박형/);
  assert.match(timeScope(t("14:00", "당일치기 입실 시간은 오후 2시부터입니다.")), /당일/);
  const r = refineCampFacts([t("15:00", "카라반: 입실 15시 이후")], { id: "1" });
  assert.ok(r.facts[0].scope);
});

test("반려견 ‘가능·소형견만·지정 구역만’은 서로 모순이 아니다", () => {
  const def = { code: "PET_POLICY" };
  assert.equal(compatible(def, "ALLOWED", "SMALL_ONLY"), true);
  assert.equal(compatible(def, "ZONE_ONLY", "SMALL_ONLY"), true);
  assert.equal(compatible(def, "ALLOWED", "NOT_ALLOWED"), false);
});

test("자동 판정은 분명한 규칙 문장만(후기 말투·질문·시설 목록 제외)", () => {
  assert.equal(clearRule("PET_POLICY", "NOT_ALLOWED", "반려동물 출입 불가능"), true);
  assert.equal(clearRule("PET_POLICY", "ALLOWED", "* 애견동반 사용이 가능합니다."), true);
  assert.equal(clearRule("PET_POLICY", "ALLOWED", "🐶 애견 동반 가능한 객실이 있나요?"), false);
  assert.equal(clearRule("PET_POLICY", "SMALL_ONLY", "10kg이하의 애견 동반이 가능한 캠핑장이여서 좋을것 같네요."), false);
  assert.equal(clearRule("CHECKIN_TIME", "14:00", "입실 14시"), false);
});
