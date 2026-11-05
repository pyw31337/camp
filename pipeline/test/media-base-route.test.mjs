import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// t43(2026-11-04): media-base(R2)를 켠 뒤 R2에는 .webp만 올라가는데, 앱이 media/… 전부를 R2로 보내서
// 저장소에 직접 넣은 jpg(평택캠핑성 camps/102377/img*.jpg)가 404 → 상세 대표 사진이 빈칸이 됐다.
const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const loadPhotoUrl = (file) => {
  const js = readFileSync(root(file), "utf8");
  const m = js.match(/const photoUrl = \(u\) => \{[\s\S]*?\n\};/);
  assert.ok(m, `${file}에서 photoUrl을 찾지 못했습니다`);
  return new Function("MEDIA", "MEDIA_FILES", `${m[0]}; return photoUrl;`)("/camp/media/", "https://r2.example/");
};

for (const file of ["design/renewal/app.js", "camping-atlas/public/app.js"]) {
  test(`${file}: webp만 R2, 그 밖의 media 파일은 Pages`, () => {
    const photoUrl = loadPhotoUrl(file);
    assert.equal(photoUrl("media/camps/1/a-t.webp"), "https://r2.example/camps/1/a-t.webp");
    assert.equal(photoUrl("./media/cards/1/x.webp?v=2"), "https://r2.example/cards/1/x.webp?v=2");
    assert.equal(photoUrl("media/camps/102377/img1.jpg"), "/camp/media/camps/102377/img1.jpg");
    assert.equal(photoUrl("../media/camps/102377/img2.JPG"), "/camp/media/camps/102377/img2.JPG");
    assert.equal(photoUrl("https://x.y/a.jpg"), "https://x.y/a.jpg");
    assert.equal(photoUrl(""), "");
  });
}

test("데이터가 가리키는 webp 아닌 media 파일은 Pages(public/media)에 실제로 있다", () => {
  const dir = root("camping-atlas/public/explore/data");
  const files = ["photos.json", "campgrounds.json", "photo-gallery.json"].filter((f) => existsSync(`${dir}/${f}`));
  const camps = existsSync(`${dir}/camps`) ? readdirSync(`${dir}/camps`).map((f) => `camps/${f}`) : [];
  const missing = new Set();
  for (const f of [...files, ...camps]) {
    const text = readFileSync(`${dir}/${f}`, "utf8");
    for (const [, p] of text.matchAll(/"(?:\.{0,2}\/)?media\/([^"?#]+)"/g)) {
      if (/\.webp$/i.test(p)) continue;
      if (!existsSync(root(`camping-atlas/public/media/${p}`))) missing.add(p);
    }
  }
  assert.deepEqual([...missing].slice(0, 20), [], "Pages에 없는 사진 파일을 데이터가 가리킵니다");
});
