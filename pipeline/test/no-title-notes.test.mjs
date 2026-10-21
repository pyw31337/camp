import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// 영우 님 2026-10-21: 상세 섹션 타이틀 오른쪽 설명 문구는 모두 없앤다(출처 ⓘ 버튼만 남김).
const app = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
test("타이틀 오른쪽 설명 문구가 다시 생기지 않는다", () => {
  for (const s of ["업장 등록 우선", "아직 확인 안 된 항목", "업장이 공개한 원문", "건 분석", "항목별 정리", "대표 채널 $", "추정 사진", "공식 배치도 없음", "라이트박스로 또렷하게", "후기 ${allItems.length}건", "30km 안 · 45일", "실시간 검색 연동", ">로그인 없이<", "현장 좌표 실시간 예보", "운영자 홈페이지 원문", "/${tiles.length} 확인"]) {
    assert.ok(!app.includes(s), s);
  }
});
test("sec-note에는 글자 없이 출처 버튼만", () => {
  for (const m of app.matchAll(/<span class="sec-note">([^<]*)/g)) assert.match(m[1], /^\s*(\$\{(srcTip|tip|main)[\s\S]*)?$/, m[1].slice(0, 60));
});
