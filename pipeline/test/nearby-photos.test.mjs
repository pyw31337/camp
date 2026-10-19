import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionsPlace, nameKeys, pickBlogPhoto, pickImagePhoto, placeKey } from "../lib/nearby-photos.mjs";

test("가게 이름 대조: 전체 이름, 또는 가맹점 상표+지점명이 함께 있어야 한다", () => {
  assert.deepEqual(nameKeys("이마트24 태안원이로점"), { full: "이마트24태안원이로점", branch: "태안원이로점", brand: "이마트24" });
  assert.equal(mentionsPlace({ title: "<b>바다랑 슈퍼</b> 다녀왔어요", contents: "" }, "바다랑슈퍼"), true);
  assert.equal(mentionsPlace({ title: "이마트24 들렀다가", contents: "태안 원이로점에서 장보기" }, "이마트24 태안원이로점"), true);
  // 지점명 없이 상표만 나오면 다른 지점일 수 있다
  assert.equal(mentionsPlace({ title: "이마트24 신상 도시락", contents: "" }, "이마트24 태안원이로점"), false);
  assert.equal(mentionsPlace({ title: "전혀 다른 글", contents: "" }, "백세약국"), false);
});

test("블로그 썸네일: 이름이 맞는 첫 글만, http는 https로 / 이미지 결과는 너무 길쭉한 사진 제외", () => {
  const docs = [
    { title: "다른 가게", contents: "", thumbnail: "https://search1.kakaocdn.net/argon/130x130_85_c/A", url: "https://blog.example/1" },
    { title: "대섬알이랑 정육 후기", contents: "", thumbnail: "http://search2.kakaocdn.net/argon/130x130_85_c/B", url: "https://blog.example/2", blogname: "캠핑일기", datetime: "2025-07-01T10:00:00" },
  ];
  assert.deepEqual(pickBlogPhoto(docs, "대섬알이랑"), { t: "https://search2.kakaocdn.net/argon/130x130_85_c/B", u: "https://blog.example/2", s: "캠핑일기", d: "2025-07-01", via: "blog" });
  assert.equal(pickBlogPhoto(docs, "없는가게"), null);
  assert.equal(pickImagePhoto([{ thumbnail_url: "https://x/1", doc_url: "https://d/1", width: 1000, height: 200 }]), null);
  assert.equal(pickImagePhoto([{ thumbnail_url: "https://x/2", doc_url: "https://d/2", width: 800, height: 600, display_sitename: "블로그" }]).t, "https://x/2");
  assert.equal(placeKey("백세약국", 36.7, 126.31), "백세약국|36.7000,126.3100");
});
