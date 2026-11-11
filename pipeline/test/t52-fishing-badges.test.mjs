import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const js = readFileSync(new URL("../../camping-atlas/public/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../../camping-atlas/public/index.html", import.meta.url), "utf8");
const inv = readFileSync(new URL("../../docs/ICON_INVENTORY.md", import.meta.url), "utf8");

function extractFn(name) {
  const start = js.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} 함수가 없습니다`);
  let i = js.indexOf("{", start), depth = 0;
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") {
      depth--;
      if (depth === 0) return js.slice(start, i + 1);
    }
  }
  throw new Error(`failed to extract ${name}`);
}

const stayBadgeKey = new Function(`${extractFn("stayBadgeKey")}; return stayBadgeKey;`)();
const dedupeStayBadgeList = new Function(`${extractFn("stayBadgeKey")}; ${extractFn("dedupeStayBadgeList")}; return dedupeStayBadgeList;`)();
const isFishingTasteCamp = new Function(`${extractFn("isFishingTasteCamp")}; return isFishingTasteCamp;`)();

test("취향 모달 체험 칩: 낚시에 fish 아이콘, 잡기는 합쳐 제거", () => {
  assert.match(js, /\["fishing","fish","낚시"\]/);
  assert.doesNotMatch(js, /\["catch","water","잡기"\]/);
  assert.match(html, /id="i-fish"/);
  const sprite = html.slice(html.indexOf('id="i-fish"'), html.indexOf("</symbol>", html.indexOf('id="i-fish"')));
  assert.doesNotMatch(sprite, /stroke=/);
  assert.match(sprite, /fill="currentColor"/);
  assert.match(inv, /낚시\(물고기 잡기 포함\).*fish/);
});

test("취향 모달 칩 아이콘이 스프라이트에 있다", () => {
  const ids = new Set([...html.matchAll(/id="(i-[^"]+)"/g)].map((m) => m[1]));
  const sliceArr = (name) => {
    const start = js.indexOf(`const ${name} = `);
    assert.ok(start >= 0, `${name} 없음`);
    const i = js.indexOf("[", start);
    const j = js.indexOf("];", i);
    return Function(`return ${js.slice(i, j + 1)}`)();
  };
  for (const name of ["TASTE_TYPES", "TASTE_EXPS", "TASTE_FACS"]) {
    for (const [, icon, label] of sliceArr(name)) {
      if (!icon || String(icon).startsWith("th:")) continue;
      assert.ok(ids.has(`i-${icon}`), `${name} '${label}' 아이콘 #i-${icon} 없음`);
    }
  }
});

test("저장된 catch 취향은 fishing으로 이어 준다", () => {
  assert.match(js, /if \(parsed\.catch\) parsed\.fishing = true;/);
  assert.match(js, /\(taste\.fishing \|\| taste\.catch\) && !isFishingTasteCamp/);
});

test("isFishingTasteCamp는 낚시·물고기 잡기 합집합", () => {
  assert.equal(isFishingTasteCamp({ th: ["fishing"] }, ""), true);
  assert.equal(isFishingTasteCamp({}, "계곡 낚시터 운영"), true);
  assert.equal(isFishingTasteCamp({}, "송어 잡기 체험"), true);
  assert.equal(isFishingTasteCamp({}, "미꾸라지 잡기"), true);
  assert.equal(isFishingTasteCamp({}, "수영장만 있는 곳"), false);
});

test("전기 배지 툴팁은 정확한 W 제한을 쓰고 카드 클릭을 막는다", () => {
  assert.match(js, /const voltLimitText = \(w\) => \(Number\(w\) > 0 \? `\$\{kw\(Number\(w\)\)\} 제한` : ""\)/);
  assert.match(js, /function voltTip\(/);
  assert.match(js, /has-volt-tip/);
  assert.match(js, /data-volt-spec/);
  assert.match(js, /showTipPop/);
  assert.match(js, /e\.preventDefault\(\); e\.stopPropagation\(\);/);
});

test("숙박 배지 라벨 중복을 정규화 후 제거한다", () => {
  const out = dedupeStayBadgeList([
    { k: "BUNGALOW", label: "방갈로" },
    { k: "AUTO", label: "오토캠핑" },
    { k: "HOUSE", label: "방갈로" },
  ]);
  assert.deepEqual(out.map((x) => x.label), ["방갈로", "오토캠핑"]);
  assert.equal(stayBadgeKey("방갈로 5"), "방갈로");
});

test("비발디캠핑파크 미루나무점(100912)은 방갈로 배지가 하나다", () => {
  const data = JSON.parse(readFileSync(new URL("../../camping-atlas/public/explore/data/campgrounds.json", import.meta.url), "utf8"));
  const c = data.find((x) => String(x.id) === "100912");
  assert.ok(c, "100912 없음");
  const house = (c.st ?? []).find((t) => t[0] === "HOUSE");
  assert.equal(house?.[3], "방갈로");
  assert.ok(js.includes("if (bungSrc) shownStays.add(bungSrc);"));
  assert.ok(js.includes("dedupeStayBadgeList(list)"));
});
