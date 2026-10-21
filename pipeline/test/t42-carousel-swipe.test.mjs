import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const app = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../../camping-atlas/public/style.css", import.meta.url), "utf8");

// 탭 칸 스와이프 판정만 떼어 검사: 캐러셀이 끝에 닿은 상태에서 시작한 같은 방향 스와이프만 탭 전환
const atEdge = eval(app.match(/const atEdge = ([^;]+);/)[1]);
const sc = { scrollWidth: 1000, clientWidth: 300 };
test("캐러셀 중간: 어느 방향이든 탭 안 바뀜", () => { assert.equal(atEdge(sc, 300, 1), false); assert.equal(atEdge(sc, 300, -1), false); });
test("오른쪽 끝에서 다시 왼쪽으로 밀면 다음 탭, 처음에서 오른쪽으로 밀면 이전 탭", () => { assert.equal(atEdge(sc, 700, 1), true); assert.equal(atEdge(sc, 0, -1), true); });
test("처음 위치에서 다음 방향은 캐러셀 먼저", () => assert.equal(atEdge(sc, 0, 1), false));
test("레일(.rail)도 캐러셀로 취급하고 시작 위치를 기록", () => {
  assert.match(app, /const sc = hScrollerIn\(target, panel\)/);
  assert.match(app, /if \(st\.sc && !atEdge\(st\.sc, st\.l0, dx < 0 \? 1 : -1\)\) return;/);
  assert.doesNotMatch(app.match(/const hScrollerIn = [\s\S]*?\n};/)[0], /\.rail/);
});
test("YouTube 탭 ‘Shorts’ 소제목 제거(카드는 유지)", () => {
  assert.doesNotMatch(app, /\}Shorts <i>/);
  assert.match(app, /class="rail vids-shorts" data-shorts/);
});
test("홈 결과 줄과 첫 테마 레일 사이 간격", () => assert.match(css, /\.res-tools \+ \.trows \{ margin-top:/));
