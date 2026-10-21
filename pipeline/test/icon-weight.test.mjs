// 아이콘 굵기·크기 시각 일치(t39 #18): 내용 아이콘은 그림이 viewBox 한 변의 약 83%(Material 기준)를 차지하도록 viewBox 를 맞췄다.
// 측정값(2026-10-21 브라우저 getBBox)은 camp-research/icon-bbox.json, 바뀐 viewBox 는 아래 목록 — 이 값이 되돌아가면 실패.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const NORM = ["i-alert", "i-amenity", "i-booking", "i-car", "i-chat-bubble", "i-company", "i-directions", "i-door", "i-experience", "i-fest", "i-firewood", "i-flame", "i-fuel", "i-hotwater", "i-map", "i-moon", "i-paw", "i-pin", "i-playground", "i-poo", "i-restarea", "i-roadview", "i-route", "i-sitemap", "i-sitetype", "i-size", "i-spark", "i-sports", "i-store-pin", "i-themes", "i-toilet", "i-usage-info", "i-video", "i-video-slate", "i-wifi"];
for (const f of ["../../camping-atlas/public/index.html", "../../design/renewal/index.html"]) {
  const h = readFileSync(new URL(f, import.meta.url), "utf8");
  test(`${f}: 크기 맞춘 아이콘은 여백을 둔 정사각 viewBox(소수점)`, () => {
    for (const id of NORM) {
      const vb = h.match(new RegExp(`<symbol id="${id}" viewBox="([^"]+)"`))?.[1]?.split(/\s+/).map(Number);
      assert.ok(vb && vb.length === 4, id);
      assert.ok(Math.abs(vb[2] - vb[3]) < 0.01, `${id} 정사각`);
      assert.ok(!Number.isInteger(vb[2]), `${id} 맞춘 값`);
    }
  });
}
