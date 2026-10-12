// 배포용 정적 사이트(site/)를 조립한다: 디자인 시안 v2 + 이미지 + 캘린더 구독 피드.
// 앱(camping-atlas) 이식이 끝나면 이 스크립트 대신 앱 빌드 결과를 배포한다.
// 사용: node scripts/assemble-site.mjs  (먼저 pipeline에서 npm run ics 실행)
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const site = `${root}site/`;
await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });

// 시안 HTML은 Artifact 형식(<head> 없음)이라 문서 골격을 씌운다.
const body = await readFile(`${root}design/mockup-v2/index.html`, "utf8");
await writeFile(
  `${site}index.html`,
  `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="description" content="전국 캠핑장 예약 오픈 일정·예약 방법·사이트 크기를 한곳에서.">\n<meta name="theme-color" content="#1f9d5c">\n</head>\n<body>\n${body}\n</body>\n</html>\n`,
);
await cp(`${root}design/mockup-v2/assets`, `${site}assets`, { recursive: true });
if (existsSync(`${root}pipeline/out/ics`)) {
  await cp(`${root}pipeline/out/ics`, `${site}ics`, { recursive: true });
}
// .ics는 캘린더 앱이 인식하도록 MIME과 캐시를 지정한다(Cloudflare Pages _headers).
await writeFile(`${site}_headers`, "/ics/*\n  Content-Type: text/calendar; charset=utf-8\n  Cache-Control: public, max-age=3600\n");
console.log(`site/ 조립 완료${existsSync(`${site}ics`) ? " (ics 포함)" : " (ics 없음: pipeline에서 npm run ics 먼저 실행)"}`);
