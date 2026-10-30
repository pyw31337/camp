import test from "node:test";
import assert from "node:assert/strict";
import { badThumb, fetchUrlOf, hiRes, ogImage } from "../scripts/fill-review-thumbs.mjs";

test("후기 썸네일: 읽을 주소(네이버 블로그는 모바일 글, 로그인 카페·지식iN은 열지 않음)", () => {
  assert.equal(fetchUrlOf("https://blog.naver.com/abc/223556331453?x=1"), "https://m.blog.naver.com/abc/223556331453");
  assert.equal(fetchUrlOf("https://zoozp.tistory.com/123"), "https://zoozp.tistory.com/123");
  assert.equal(fetchUrlOf("https://cafe.naver.com/club/1"), null);
  assert.equal(fetchUrlOf("https://cafe.daum.net/x/1"), null);
  assert.equal(fetchUrlOf("https://kin.naver.com/qna/1"), null);
  assert.equal(fetchUrlOf("not a url"), null);
});
test("후기 썸네일: 대표 이미지 읽기·기본 그림 빼기·네이버 고화질", () => {
  assert.equal(ogImage('<meta property="og:image" content="https://img1.daumcdn.net/a.jpg?x=1&amp;y=2">'), "https://img1.daumcdn.net/a.jpg?x=1&y=2");
  assert.equal(ogImage('<meta content="https://b/c.png" name="twitter:image">'), "https://b/c.png");
  assert.equal(ogImage("<html></html>"), null);
  assert.ok(badThumb("https://ssl.pstatic.net/static/blog/og_image_default.png"));
  assert.ok(badThumb("https://blogpfthumb-phinf.pstatic.net/x.jpg"));
  assert.ok(!badThumb("https://blogthumb.pstatic.net/MjAy/a.JPEG?type=w2"));
  assert.equal(hiRes("https://blogthumb.pstatic.net/MjAy/a.JPEG?type=w2"), "https://postfiles.pstatic.net/MjAy/a.JPEG?type=w773");
});
