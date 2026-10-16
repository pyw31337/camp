import assert from "node:assert/strict";
import test from "node:test";
import { indexFacts, matchCampgrounds, parseCondition, PRESETS, resolveFact } from "../lib/fact-query.mjs";
import { ATTR } from "../lib/fact-store.mjs";

const F = (cid, attr, value, grade, extra = {}) => ({ cid, attr, value, grade, src: grade === "MENTION" ? "review_search" : "gocamping", url: "https://x", ...extra });
const store = {
  camps: new Map([["a", { cid: "a", name: "가" }], ["b", { cid: "b", name: "나" }], ["c", { cid: "c", name: "다" }]]),
  facts: indexFacts([
    F("a", "FIRE_RULE", "FIREWOOD_OK", "OPERATOR", { quote: "장작 사용 가능" }), F("a", "PET_POLICY", "SMALL_ONLY", "CONFIRMED"), F("a", "POWER_MAX_W", 600, "OPERATOR"),
    F("b", "FIRE_RULE", "NO_FIRE", "OPERATOR"), F("b", "PET_POLICY", "ALLOWED", "CONFIRMED"),
    F("c", "PET_POLICY", "ALLOWED", "OPERATOR"), F("c", "PET_POLICY", "NOT_ALLOWED", "OPERATOR"), F("c", "POWER_MAX_W", 1000, "MENTION"),
    F("c", "REVIEW_COUNT", 5, "MENTION"), F("c", "REVIEW_PRO_QUIET", 2, "MENTION"),
  ]),
};

test("결정값: 가장 높은 등급, 같은 등급에서 갈리면 conflict, 아래 등급 반대값은 따로 표시", () => {
  const r = resolveFact(store.facts.get("c").get("PET_POLICY"));
  assert.equal(r.conflict, true);
  assert.equal(resolveFact(store.facts.get("c").get("POWER_MAX_W")), null);
  assert.equal(resolveFact(store.facts.get("c").get("POWER_MAX_W"), { minGrade: "MENTION" }).value, 1000);
});

test("필수 조건이 확인된 값으로 어긋나면 제외, 모르면 확인필요로 뒤에", () => {
  const rows = matchCampgrounds(store, [...PRESETS.firewood.conditions, ...PRESETS.pet.conditions]);
  assert.deepEqual(rows.map((r) => r.cid), ["a"]); // b는 화기 불가로 제외, c는 둘 다 확인 안 됨(값 충돌·화기 미상)
  assert.equal(rows[0].matched.length, 2);
  assert.equal(rows[0].matched[0].evidence.quote, "장작 사용 가능");
});

test("strict는 후기 언급을 근거로 쓰지 않고, lenient는 쓴다. 후기 주제 언급 없음은 0건", () => {
  const cond = [parseCondition("POWER_MAX_W min 800", { must: true })];
  assert.equal(matchCampgrounds(store, cond).length, 0);
  const l = matchCampgrounds(store, cond, { mode: "lenient" });
  assert.equal(l[0].cid, "c");
  assert.equal(l[0].matched[0].grade, "MENTION");
  const noise = matchCampgrounds(store, [parseCondition("REVIEW_CON_NOISE max 0"), parseCondition("REVIEW_PRO_QUIET min 1")], { mode: "lenient" });
  assert.equal(noise[0].matched.length, 2);
});

test("갈린 값 모두가 조건을 만족하면 맞음, 일부만 만족하면 확인필요", () => {
  const rows = matchCampgrounds(store, [parseCondition("PET_POLICY in ALLOWED,NOT_ALLOWED", { must: true })]);
  assert.ok(rows.find((r) => r.cid === "c").matched.length === 1);
  const rows2 = matchCampgrounds(store, [parseCondition("PET_POLICY eq ALLOWED"), parseCondition("FIRE_RULE has")]);
  assert.equal(rows2.find((r) => r.cid === "c"), undefined);
});

test("조건 파서와 묶음은 사전에 있는 속성만 쓴다", () => {
  assert.deepEqual(parseCondition("PET_POLICY in ALLOWED,SMALL_ONLY"), { attr: "PET_POLICY", op: "in", value: ["ALLOWED", "SMALL_ONLY"], must: false });
  assert.deepEqual(parseCondition("ENV_VALLEY eq true", { must: true }).value, true);
  for (const p of Object.values(PRESETS)) for (const c of p.conditions) assert.ok(ATTR.has(c.attr), c.attr);
  assert.throws(() => matchCampgrounds(store, [{ attr: "NOPE", op: "eq", value: 1 }]));
});
