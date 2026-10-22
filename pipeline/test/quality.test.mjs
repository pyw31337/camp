import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assess, regressions } from "../lib/quality.mjs";
import { openClaims, readBoard, unanswered } from "../scripts/agent-board.mjs";

const PET = { code: "PET_POLICY", type: "enum" };
const now = Date.parse("2026-10-22T00:00:00Z");

test("독립 원천이 같은 값을 말할수록 신뢰도가 오른다(수집할수록 품질↑)", () => {
  const one = assess([{ value: "ALLOWED", grade: "MENTION", src: "blog_mention", url: "https://a.tistory.com/1" }], PET, now);
  const two = assess([{ value: "ALLOWED", grade: "MENTION", src: "blog_mention", url: "https://a.tistory.com/1" }, { value: "ALLOWED", grade: "MENTION", src: "cafe_mention", url: "https://cafe.naver.com/x" }], PET, now);
  const off = assess([{ value: "ALLOWED", grade: "MENTION", src: "blog_mention", url: "https://a.tistory.com/1" }, { value: "ALLOWED", grade: "OPERATOR", src: "operator_homepage", url: "https://camp.kr/rule" }], PET, now);
  assert.ok(two.confidence > one.confidence);
  assert.equal(two.status, "CORROBORATED");
  assert.ok(off.confidence > 0.9);
  // 같은 호스트의 같은 원천은 한 번만 센다
  const dup = assess([{ value: "ALLOWED", grade: "MENTION", src: "blog_mention", url: "https://a.tistory.com/1" }, { value: "ALLOWED", grade: "MENTION", src: "blog_mention", url: "https://a.tistory.com/2" }], PET, now);
  assert.equal(dup.sources, 1);
});

test("값이 하나여야 하는 속성에 공식 값이 엇갈리면 CONFLICT, 여러 값이 정상인 속성은 충돌 아님", () => {
  const c = assess([{ value: "ALLOWED", grade: "OPERATOR", src: "operator_homepage", url: "https://x.kr/a" }, { value: "NOT_ALLOWED", grade: "OPERATOR", src: "gocamping", url: "https://gc/1" }], PET, now);
  assert.equal(c.status, "CONFLICT");
  assert.equal(c.rival.value === "ALLOWED" || c.rival.value === "NOT_ALLOWED", true);
  const st = assess([{ value: "DECK", grade: "CONFIRMED", src: "gocamping", url: "u" }, { value: "AUTO", grade: "CONFIRMED", src: "gocamping", url: "u" }], { code: "SITE_TYPE", type: "enum" }, now);
  assert.notEqual(st.status, "CONFLICT");
  // 숫자는 20% 안이면 같은 값
  const n = assess([{ value: 50, grade: "CONFIRMED", src: "gocamping", url: "u" }, { value: 52, grade: "OPERATOR", src: "operator_homepage", url: "v" }], { code: "SITE_TOTAL", type: "count" }, now);
  assert.notEqual(n.status, "CONFLICT");
});

test("오래된 값은 신뢰도가 내려간다", () => {
  const fresh = assess([{ value: "14:00", grade: "CONFIRMED", src: "gocamping", url: "u", at: "2026-09-01" }], { type: "time" }, now);
  const old = assess([{ value: "14:00", grade: "CONFIRMED", src: "gocamping", url: "u", at: "2023-01-01" }], { type: "time" }, now);
  assert.ok(old.confidence < fresh.confidence);
});

test("회귀: 커버리지가 max(20, 2%) 넘게 줄거나 신뢰도·충돌이 나빠지면 잡는다", () => {
  const prev = { A: { coverage: 1000, mean_confidence: 0.8, conflicts: 10 } };
  assert.equal(regressions(prev, { A: { coverage: 990, mean_confidence: 0.8, conflicts: 10 } }).length, 0);
  assert.deepEqual(regressions(prev, { A: { coverage: 950, mean_confidence: 0.75, conflicts: 30 } }).map((r) => r.kind), ["coverage", "confidence", "conflicts"]);
});

test("게시판: 해제되지 않은 3일 안 선점과 답 없는 질문", () => {
  const dir = mkdtempSync(join(tmpdir(), "board-"));
  const p = join(dir, "b.ndjson");
  const t = new Date().toISOString();
  writeFileSync(p, [
    { id: "a1", at: t, agent: "Codex", kind: "claim", topic: "nearby", files: ["pipeline/lib/nearby-context.mjs"], text: "주변 칩" },
    { id: "a2", at: t, agent: "Claude", kind: "claim", topic: "fee", text: "요금" },
    { id: "a3", at: t, agent: "Claude", kind: "release", reply: "a2", text: "끝" },
    { id: "a4", at: t, agent: "Gemini", kind: "question", text: "?" },
    { id: "a5", at: "2020-01-01T00:00:00Z", agent: "Grok", kind: "claim", text: "오래됨" },
  ].map((x) => JSON.stringify(x)).join("\n") + "\n");
  const posts = readBoard(p);
  assert.deepEqual(openClaims(posts).map((x) => x.id), ["a1"]);
  assert.deepEqual(unanswered(posts).map((x) => x.id), ["a4"]);
});
