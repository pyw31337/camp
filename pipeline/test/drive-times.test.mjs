import test from "node:test";
import assert from "node:assert/strict";
import { HUBS, MAX_KM, km } from "../lib/drive-hubs.mjs";
import { dailyBudget, inRange, publicFiles } from "../scripts/sync-drive-times.mjs";

test("출발 도시: 키 중복 없음·좌표가 한국 안", () => {
  assert.equal(new Set(HUBS.map((h) => h[0])).size, HUBS.length);
  for (const [, , , lat, lng] of HUBS) assert.ok(lat > 33 && lat < 39 && lng > 125 && lng < 130);
  assert.ok(HUBS.length >= 40);
});
test("하루 호출량: 채우는 중 8000, 다 채운 뒤 45일 주기로 5000 이하", () => {
  assert.equal(dailyBudget({ neverAsked: 1, totalPairs: 100000 }), 8000);
  const keep = dailyBudget({ neverAsked: 0, totalPairs: 104775 });
  assert.ok(keep <= 5000 && keep * 45 >= 104775);
  assert.equal(dailyBudget({ neverAsked: 0, totalPairs: 10_000_000 }), 5000);
});
test("직선 250km 밖은 묻지 않고, 화면 파일에는 아는 시간만", () => {
  const seoul = HUBS.find((h) => h[0] === "seoul");
  assert.ok(inRange(seoul, { lat: 37.9, lng: 127.3 }));
  assert.ok(!inRange(seoul, { lat: 33.4, lng: 126.5 })); // 제주
  assert.ok(km(37.5665, 126.978, 35.1796, 129.0756) > MAX_KM);
  const reg = { updated_at: "x", t: { a: { seoul: [95, 80, "2026-10-31"] }, b: { seoul: [null, null, "2026-10-31", 104] } } };
  const { files, hubs } = publicFiles(reg, [{ id: "a", lat: 37.9, lng: 127.3 }, { id: "b", lat: 37.8, lng: 127.2 }]);
  assert.deepEqual(files.seoul.t, { a: 95 });
  assert.equal(hubs.hubs.find((h) => h[0] === "seoul")[5], 50);
});
