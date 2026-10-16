import assert from "node:assert/strict";
import test from "node:test";
import { isBillingError, judgeFreeTier, monthKey, recordUsage, remainingBudget } from "../lib/naver-guard.mjs";

const NOW = "<p>NAVER API HUB 서비스는 한시적으로 무료로 제공되며, 유료 전환 시 사전에 별도 공지로 안내될 예정입니다.</p>";

test("지금 가이드 문장은 무료로 판정(‘유료 전환 시 공지’ 예정 표현은 통과)", () => {
  const r = judgeFreeTier(NOW);
  assert.equal(r.free, true);
  assert.match(r.quote, /한시적으로 무료/);
});

test("무료 문장이 사라지거나 유료 전환 표현이 보이거나 접근 거부면 중단", () => {
  assert.equal(judgeFreeTier("<p>NAVER API HUB 서비스 요금 안내</p>").free, false);
  assert.equal(judgeFreeTier(`${NOW}<p>2027년 1월 1일부터 유료로 전환됩니다.</p>`).free, false);
  assert.equal(judgeFreeTier(`${NOW}<p>무료 제공 기간이 종료되었습니다.</p>`).free, false);
  assert.equal(judgeFreeTier(`${NOW}<p>과금이 시작됩니다.</p>`).free, false);
  assert.equal(judgeFreeTier("<title>Access Denied - Error Page</title>").free, false);
});

test("월 예산: 같은 달 누적, 달이 바뀌면 다시 시작, 무료 한도를 넘지 않는다", () => {
  const oct = new Date("2026-10-16T05:00:00Z"), nov = new Date("2026-11-01T00:00:00Z");
  let u = recordUsage(null, 3000, { now: oct });
  u = recordUsage(u, 2000, { now: oct });
  assert.equal(u.months[monthKey(oct)].calls, 5000);
  assert.equal(remainingBudget(u, 20000, oct), 15000);
  assert.equal(remainingBudget(u, 20000, nov), 20000);
  assert.equal(remainingBudget(null, 10_000_000, oct), 775000);
  assert.equal(monthKey(new Date("2026-10-31T16:00:00Z")), "2026-11"); // KST 기준
});

test("402·결제 관련 응답은 즉시 중단 신호", () => {
  assert.equal(isBillingError(402, ""), true);
  assert.equal(isBillingError(403, '{"error":"Payment method required"}'), true);
  assert.equal(isBillingError(429, "Too Many Requests"), false);
  assert.equal(isBillingError(200, "요금"), false);
});

test("공식 요금표: 검색 API 무료 0원 행이면 통과, 금액·유료 구간·행 없음이면 중단", async () => {
  const { judgePricingTable } = await import("../lib/naver-guard.mjs");
  const intro = "<p>검색 API 블로그, 뉴스, 이미지, 지역 등 네이버의 검색 결과를 가져오는 API 묶음입니다.</p>";
  const head = "<table><tr><th>API</th><th>구간</th><th>호출량 구간·한도</th><th>요금</th><th>비고</th></tr>";
  const trend = "<tr><td>검색어 트렌드</td><td>무료</td><td>0 ~ 30,000건</td><td>0원</td><td>기본 무료 제공</td></tr>";
  const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  const tail = "</table><p>(VAT 별도)</p><p>이용 안내</p>";
  const now = intro + head + trend + row(["검색 API", "무료", "0 ~ 775,000건", "0원", "일 최대 25,000건 호출 제한"]) + tail;
  const ok = judgePricingTable(now);
  assert.equal(ok.free, true);
  assert.equal(ok.monthly_free, 775000);
  assert.equal(ok.daily_limit, 25000);
  const paidTier = intro + head + row(["검색 API", "무료", "0 ~ 775,000건", "0원", ""]) + row(["", "유료", "775,001건 ~", "1건당 0.5원", ""]) + tail;
  assert.equal(judgePricingTable(paidTier).free, false);
  const priced = intro + head + row(["검색 API", "무료", "0 ~ 100,000건", "0원", ""]) + row(["", "", "100,001건 ~", "2원", ""]) + tail;
  assert.equal(judgePricingTable(priced).free, false);
  assert.equal(judgePricingTable(intro + head + trend + tail).free, false);
  assert.equal(judgePricingTable("<title>Access Denied</title>").free, false);
});
