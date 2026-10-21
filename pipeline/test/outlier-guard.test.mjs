import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const camps = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const unverified = new Set(["MENTION", "SURVEYED", "", null, undefined]);

test("비공식 2만원 미만 1박 요금은 노출·필터에서 제외한다", () => {
  const unsafe = camps.filter((camp) => {
    const fee = camp.fee;
    return fee && !camp.du && Number(fee.min) > 0 && Number(fee.min) < 20_000
      && unverified.has(fee.grade) && fee.visibility !== "HIDDEN_PENDING_RECHECK";
  });
  assert.deepEqual(unsafe, [], "후기·검색 언급의 저가를 1박 요금으로 확정 표시하면 안 됩니다");
});

test("요금 범위와 전기 제한값의 물리적 이상치를 남기지 않는다", () => {
  const invalidFees = camps.filter((camp) => {
    const fee = camp.fee;
    return fee && Number.isFinite(Number(fee.min)) && Number.isFinite(Number(fee.max))
      && Number(fee.min) > Number(fee.max);
  });
  const invalidPower = camps.filter((camp) => {
    const watts = Number(camp.field_conditions?.power?.limit_w ?? camp.of?.w?.v);
    return Number.isFinite(watts) && watts > 0 && watts < 400;
  });
  assert.deepEqual(invalidFees, [], "최저 요금이 최고 요금보다 클 수 없습니다");
  assert.deepEqual(invalidPower, [], "400W 미만 전기 제한은 원천 재검증 대상입니다");
});

test("화성에코팜은 운영자 원문의 사이트·요금·규칙을 쓴다", () => {
  const camp = camps.find((item) => String(item.id) === "102229");
  const detail = JSON.parse(readFileSync(join(dataDir, "camps/102229.json"), "utf8"));
  assert.equal(camp?.fee?.min, 35_000);
  assert.equal(camp?.fee?.max, 50_000);
  assert.equal(camp?.field_conditions?.power?.limit_w, 600);
  assert.notEqual(camp?.field_conditions?.parking?.tent_side, true);
  assert.equal(detail?.gcd?.fees?.length, 6);
  assert.ok(detail?.house_rules?.rules?.some((rule) => rule.text.includes("장작·숯")));
});

test("평택캠핑성은 확인되지 않은 전기·사이트 규격을 단정하지 않는다", () => {
  const camp = camps.find((item) => String(item.id) === "102377");
  const detail = JSON.parse(readFileSync(join(dataDir, "camps/102377.json"), "utf8"));
  assert.equal(camp?.fee?.min, 20_000);
  assert.equal(camp?.fee?.grade, "MENTION");
  assert.equal(camp?.field_conditions?.power?.available, null);
  assert.equal(camp?.status, "운영 여부 확인 필요");
  assert.deepEqual(camp?.booking?.methods, ["전화 문의"]);
  assert.equal(detail?.profile?.fields?.AMENITIES?.value, "20m 온수 수영장 · 실내놀이터");
});

test("비정상 사이트 수·규격과 대한민국 밖 좌표는 화면 사실로 발행하지 않는다", () => {
  const asan = camps.find((item) => String(item.id) === "1993");
  const chilgok = camps.find((item) => String(item.id) === "3016");
  const badCoordinatePark = camps.find((item) => String(item.id) === "park-43113-00080-15jti");
  assert.deepEqual(asan?.sizes, [[7, 5, 67]]);
  assert.deepEqual(chilgok?.sizes, [[10, 15, 9], [10, 10, 40], [10, 8, 20], [7, 8, 30]]);
  assert.equal(badCoordinatePark?.lat, undefined);
  assert.equal(badCoordinatePark?.lng, undefined);
});
