// 2026-10-21 run 39501816566 회귀 방지: 사진 백필 프로필이 기존 사진을 지우거나 요금 단계를 꺼서 커버리지를 떨어뜨리지 않는다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareManifests, lostFiles } from "../../.github/scripts/media-guard.mjs";

const wf = readFileSync(new URL("../../.github/workflows/data-sync.yml", import.meta.url), "utf8");
const profile = (name) => {
  const m = wf.match(new RegExp(`\\n\\s*${name}\\)\\n(?:\\s*#.*\\n)*\\s*(.+);;`));
  assert.ok(m, `profile ${name} not found`);
  return Object.fromEntries(m[1].split(";").map((x) => x.trim().split("=")).filter((x) => x.length === 2));
};

test("모든 정기 프로필은 기존 사진을 줄이지 않는다", () => {
  for (const p of ["media-backfill", "tour-enrichment", "free-audit", "verify"]) assert.equal(profile(p).max_stored_per_camp, "0", p);
});

test("media-backfill은 요금·상품 단계를 캐시로 이어받는다", () => {
  assert.equal(profile("media-backfill").collect_tour, "true");
});

test("media 브랜치 푸시는 데이터 발행 성공 뒤, 사진 감소 검사와 함께", () => {
  const pub = wf.indexOf("id: publish-data");
  const media = wf.indexOf("- name: Publish the media branch");
  assert.ok(pub > 0 && media > pub, "media publish must come after data publish");
  const step = wf.slice(media, wf.indexOf("\n      - name:", media + 10));
  assert.match(step, /steps\.publish-data\.outcome == 'success'/);
  assert.match(step, /media-guard\.mjs/);
  assert.ok(step.indexOf("media-guard") < step.indexOf("git push --force"));
});

test("sync-images는 IMAGE_ALLOW_SHRINK 없이는 정리하지 않는다", () => {
  const src = readFileSync(new URL("../scripts/sync-images.mjs", import.meta.url), "utf8");
  assert.match(src, /STORED_CAP = ALLOW_SHRINK \? MAX_STORED_PER_CAMP : 0/);
  assert.doesNotMatch(src, /limitManifestPerCamp\([^)]*MAX_STORED_PER_CAMP\)/);
});

test("media guard는 사진 감소를 잡는다", () => {
  const e = (n) => ({ thumb: `t${n}`, large: `l${n}` });
  const prev = { camps: { a: [e(1), e(2), e(3)], b: [e(4)] } };
  assert.equal(compareManifests(prev, { camps: { a: [e(1), e(2), e(3), e(5)], b: [e(4)] } }).lostPhotos, 0);
  assert.equal(compareManifests(prev, { camps: { a: [e(1)], b: [e(4)] } }).lostPhotos, 2);
});

test("media guard는 매니페스트 밖 사진 파일이 사라지는 것도 잡는다(2026-10-24)", () => {
  assert.deepEqual(lostFiles(["camps/10/a-t.webp", "camps/10/b-t.webp", "manifest.json"], ["camps/10/a-t.webp"]), ["camps/10/b-t.webp"]);
  assert.deepEqual(lostFiles(["camps/10/a-t.webp"], ["camps/10/a-t.webp", "camps/11/c-t.webp"]), []);
  for (const f of ["data-sync.yml", "card-photos.yml"]) {
    const y = readFileSync(new URL(`../../.github/workflows/${f}`, import.meta.url), "utf8");
    assert.match(y, /media-guard\.mjs"[^\n]*media-prev-files\.txt[^\n]*media-next-files\.txt/, f);
  }
});

test("sync-images는 매니페스트 밖 사진 파일을 IMAGE_ALLOW_SHRINK 없이 지우지 않는다", () => {
  const src = readFileSync(new URL("../scripts/sync-images.mjs", import.meta.url), "utf8");
  assert.match(src, /if \(ALLOW_SHRINK\) for \(const f of orphans\)/);
});
