import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const R = fileURLToPath(new URL("../../", import.meta.url));
const J = (p) => JSON.parse(readFileSync(R + p, "utf8"));
test("수기 사진 판정은 보존되고 상세에 숨김 표시(삭제 아님)", () => {
  const j = J("pipeline/registry/photo-judgments.json").photos;
  const d = J("camping-atlas/public/explore/data/camps/102377.json");
  const man = d.sns_images.filter((x) => j[x.thumb]?.manual);
  assert.ok(man.length >= 16);
  for (const x of man) assert.ok(x.ng, x.thumb);
  assert.ok(d.sns_images.length >= 42, "사진 항목은 남아 있다");
  assert.match(readFileSync(R + "pipeline/scripts/judge-review-photos.mjs", "utf8"), /manual/);
});
test("102229 배치 이미지 맨 앞은 운영 기관 조감도, 기존 이미지 보존", () => {
  const d = J("camping-atlas/public/explore/data/camps/102229.json");
  assert.match(d.layout.images[0].img, /hsecofarm\.hscity\.go\.kr/);
  assert.ok(d.layout.images.length >= 3);
});
