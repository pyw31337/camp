// 배포용 정적 사이트(site/)를 조립한다.
//   /            전국 캠핑장 탐색(design/explore, 실데이터: pipeline/out/explore)
//   /mockup/     디자인 시안 v2(예약 오픈 일정·예시 화면)
//   /ics/        캘린더 구독 피드
//   /data/       탐색 데이터(campgrounds.json, meta.json)
// 사용: node scripts/assemble-site.mjs  (먼저 design에서 build-explore, pipeline에서 ics·build:explore)
// KAKAO_JS_KEY 환경변수가 있으면 지도 키를 메타 태그로 넣는다(브라우저 노출용 키, 도메인 제한으로 보호).
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const site = `${root}site/`;
await rm(site, { recursive: true, force: true });
await mkdir(`${site}mockup`, { recursive: true });

const doc = (body, { description, extraHead = "" }) => `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="description" content="${description}">\n<meta name="theme-color" content="#1f9d5c">\n${extraHead}</head>\n<body>\n${body}\n</body>\n</html>\n`;
const kakaoKey = (process.env.KAKAO_JS_KEY ?? "").replace(/[^A-Za-z0-9]/g, "");

// 시안 HTML은 Artifact 형식(<head> 없음)이라 문서 골격을 씌운다.
const mockup = await readFile(`${root}design/mockup-v2/index.html`, "utf8");
await writeFile(`${site}mockup/index.html`, doc(mockup, { description: "전국 캠핑장 예약 오픈 일정·예약 방법·사이트 크기(디자인 시안)." }));
await cp(`${root}design/mockup-v2/assets`, `${site}mockup/assets`, { recursive: true });

const explorePath = `${root}design/explore/index.html`;
const hasData = existsSync(`${root}pipeline/out/explore/campgrounds.json`);
if (existsSync(explorePath) && hasData) {
  const explore = await readFile(explorePath, "utf8");
  await writeFile(`${site}index.html`, doc(explore, {
    description: "전국 캠핑장을 지도와 목록으로 찾고, 사이트 크기·시설·공식 안내 요금을 비교해 공식 예약처로 바로 예약하세요.",
    extraHead: `<meta name="kakao-js-key" content="${kakaoKey}">\n`,
  }));
  await cp(`${root}pipeline/out/explore`, `${site}data`, { recursive: true });
} else {
  // 데이터가 없으면 시안을 첫 화면으로 둔다(로컬 조립·데이터 수집 실패 시).
  await writeFile(`${site}index.html`, doc(mockup.replaceAll('src="assets/', 'src="mockup/assets/'), { description: "전국 캠핑장 예약 오픈 일정·예약 방법·사이트 크기를 한곳에서." }));
  await cp(`${root}design/mockup-v2/assets`, `${site}assets`, { recursive: true });
}
if (existsSync(`${root}pipeline/out/ics`)) {
  await cp(`${root}pipeline/out/ics`, `${site}ics`, { recursive: true });
}
// .ics는 캘린더 앱이 인식하도록 MIME과 캐시를, 데이터는 짧은 캐시를 지정한다(Cloudflare Pages _headers).
await writeFile(`${site}_headers`, "/ics/*\n  Content-Type: text/calendar; charset=utf-8\n  Cache-Control: public, max-age=3600\n/data/*\n  Cache-Control: public, max-age=600\n");
console.log(`site/ 조립 완료 · 첫 화면 ${hasData ? "탐색(실데이터)" : "시안(탐색 데이터 없음)"}${kakaoKey ? " · 지도 키 있음" : " · 지도 키 없음"}${existsSync(`${site}ics`) ? " · ics 포함" : ""}`);
