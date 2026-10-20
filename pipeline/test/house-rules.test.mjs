import assert from "node:assert/strict";
import { test } from "node:test";
import { houseRules, noTagsOf, noticeOf, ruleCategory } from "../lib/house-rules.mjs";
import { noticeLinks } from "../lib/operator-site.mjs";

test("불가 태그: 시설 전체 단정문만", () => {
  assert.deepEqual(noTagsOf("반려동물 동반 불가입니다."), ["NO_PET"]);
  assert.deepEqual(noTagsOf("수영장은 애견 이용이 불가합니다."), []); // 부분 금지
  assert.deepEqual(noTagsOf("- 숯불가격 : 2~3만원"), []); // ‘숯불가격’은 숯 불가가 아님
  assert.deepEqual(noTagsOf("부탄, LPG 가스통 (1kg 이상) 반입 절대 금지"), []); // 대형견 아님
  assert.deepEqual(noTagsOf("애견동반 시 추가 요금 1만원 (대형견 입장 금지)"), ["BIG_DOG"]);
  assert.deepEqual(noTagsOf("* 기후 악화로 장작 사용이 불가능한 경우 환불해 드립니다"), []); // 조건부
  assert.deepEqual(noTagsOf("- 장작사용은 절대 불가 합니다."), ["NO_FIREWOOD"]);
  assert.deepEqual(noTagsOf("개인 숯, 장작 반입금지"), ["BYO_FUEL"]);
  assert.deepEqual(noTagsOf("보호자를 동반하지 않은 미성년자는 어떤 경우에도 입실이 불가합니다."), ["NO_MINOR"]);
  assert.deepEqual(noTagsOf("캠핑카, 카라반, 트레일러는 진입 불가 입니다."), ["NO_CARAVAN"]);
  assert.deepEqual(noTagsOf("고출력 전기 사용금지 입니다."), ["HIGH_POWER"]);
  assert.deepEqual(noTagsOf("데크 및 잔디밭 위에서 화로대사용은 금지되어 있습니다."), []);
  assert.deepEqual(noTagsOf("조용해서 좋았어요, 매너타임에 음향기기 사용 금지라 최고"), []); // 후기
});

test("규칙 문장 분류", () => {
  assert.equal(ruleCategory("텐트 안에서 버너·숯·난로 사용은 절대 금지 입니다."), "ban");
  assert.equal(ruleCategory("기준 인원을 초과한 방문객은 입장이 제한됩니다."), "limit");
  assert.equal(ruleCategory("퇴실 시 쓰레기는 분리수거해 주세요."), "rule");
  assert.equal(ruleCategory("당일 취소는 환불이 불가합니다."), null); // 환불은 따로
  assert.equal(ruleCategory("이용수칙"), null); // 제목만
});

test("공지 줄: 번호·조회수 떼고 날짜", () => {
  assert.deepEqual(noticeOf("409 망상오토캠핑리조트 2024년 물놀이장 운영공지 2024-06-05 19957"), { title: "망상오토캠핑리조트 2024년 물놀이장 운영공지", date: "2024-06-05" });
  assert.equal(noticeOf("공지사항 - 담양금성산성 오토캠핑장"), null);
});

test("공식 ‘가능’과 어긋나는 문장 태그는 버리고, 등록값은 남긴다", () => {
  const lines = [{ text: "반려동물 동반 불가입니다.", url: "https://x.kr/a", g: "c" }];
  assert.equal(houseRules(lines, [], { pet: true }).tags.length, 0);
  const h = houseRules([], [{ k: "NO_PET", g: "c", quote: "반려동물 동반: 불가능", url: "https://gc" }]);
  assert.equal(h.tags[0].label, "반려동물 불가");
  // 장작·숯 둘 다 불가면 ‘화기 불가’ 하나
  const f = houseRules([{ text: "장작 사용은 금지되어 있습니다.", url: "u", g: "c" }, { text: "숯 사용 불가합니다.", url: "u", g: "c" }]);
  assert.deepEqual(f.tags.map((t) => t.k), ["NO_FIRE"]);
});

test("게시판 공지 링크·날짜", () => {
  const html = `<table><tr><td>12</td><td><a href="/bbs/board.php?bo_table=notice&wr_id=33">2026 동계 휴장 안내</a></td><td>2026-10-01</td></tr>
  <tr><td><a href="/about.php">오시는 길 안내</a></td></tr></table>`;
  assert.deepEqual(noticeLinks(html, "https://camp.example.kr/bbs/board.php?bo_table=notice"), [{ title: "2026 동계 휴장 안내", url: "https://camp.example.kr/bbs/board.php?bo_table=notice&wr_id=33", date: "2026-10-01" }]);
});
