#!/usr/bin/env node
// 한국관광공사 관광사진 정보_GW(포토코리아, data.go.kr 15101914) → registry/photo-gallery.json
// 지역(시도)·테마 키워드별 공공누리 1유형 실사 사진 목록. 히어로·테마 표지·지역 페이지용(캠핑장 썸네일 아님).
// 이미지는 내려받지 않고 웹용 URL·제목·촬영지·촬영자·촬영월만 저장한다. 화면은 “사진: 촬영자 / 한국관광공사” 출처 표기 필수.
// 키: DATA_GO_KR_SERVICE_KEY(저장소 비밀값). 없으면 이전 결과 유지.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { gallerySearchUrl, normalizeGalleryPhoto, parsePhotoGalleryBody, SOURCE } from "../lib/photo-gallery.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const outPath = join(root, "pipeline/registry/photo-gallery.json");
const key = process.env.DATA_GO_KR_SERVICE_KEY;
if (!key) { console.log("::notice title=관광사진 건너뜀::DATA_GO_KR_SERVICE_KEY 없음 — 이전 결과 유지"); process.exit(0); }

export const KEYWORDS = {
  theme: ["캠핑", "글램핑", "오토캠핑", "캠핑장", "계곡", "해수욕장", "호수", "숲", "휴양림", "단풍", "눈꽃", "벚꽃", "일출", "일몰", "은하수", "별"],
  region: ["서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "대구", "울산", "부산", "제주"],
};
const PER = 30;
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { keywords: {} };
const out = { ...prev, keywords: { ...(prev.keywords ?? {}) } };
let calls = 0, fail = 0;
for (const [kind, words] of Object.entries(KEYWORDS)) for (const w of words) {
  try {
    const { res } = await fetchDataGoKr(gallerySearchUrl(w, 1, PER, "C"), key, { timeoutMs: 20000 });
    calls++;
    const { items, total } = parsePhotoGalleryBody(await res.text(), res.status);
    const photos = items.map(normalizeGalleryPhoto).filter(Boolean);
    out.keywords[w] = { kind, total, fetched_at: new Date().toISOString(), photos };
    console.log(`${kind} ${w}: ${photos.length}/${total}`);
  } catch (e) {
    fail++;
    console.log(`::warning title=관광사진 ${w} 실패::${e.message.slice(0, 200)}`);
    if (/SERVICE_KEY|NOT_REGISTERED|등록되지 않은|LIMITED/.test(e.message)) break;
  }
  await new Promise((r) => setTimeout(r, 300));
}
out.version = 1;
out.generated_at = new Date().toISOString();
out.source = { ...SOURCE, attribution: "사진: {photographer} / 한국관광공사(포토코리아)", note: "웹용 URL만 저장·이미지 미저장. 캠핑장 사진이 아니므로 ‘주변 풍경’ 등으로 구분 표기." };
writeFileSync(outPath, `${JSON.stringify(out, null, 1)}\n`);
console.log(`호출 ${calls} · 실패 ${fail} · 키워드 ${Object.keys(out.keywords).length}`);
