import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("../pipeline/node_modules/sharp");

const root = fileURLToPath(new URL("../", import.meta.url));
const source = `${root}assets/branding/lets-camp-og-source.jpg`;
const outDir = `${root}camping-atlas/public/images/`;

// 카카오톡·SNS 공유 표준(1.91:1)에 맞춘 1200×630 이미지.
// 첨부된 오픈그래프 원본의 타이포그래피와 구성은 그대로 보존하고,
// 공유 플랫폼에서 안정적으로 읽히도록 크기와 압축만 정규화한다.
const image = sharp(source).resize(1200, 630, { fit: "cover", position: "center" });

await image.clone().jpeg({ quality: 88, mozjpeg: true }).toFile(`${outDir}og-image.jpg`);
await image.clone().webp({ quality: 86, effort: 5 }).toFile(`${outDir}og-image.webp`);
// 기존 캐시·클라이언트 호환용 PNG도 함께 유지한다.
await image.clone().png({ compressionLevel: 9, palette: true }).toFile(`${outDir}og-image.png`);

console.log("✓ og-image.jpg (1200×630) 생성 완료");
console.log("✓ og-image.webp (1200×630) 생성 완료");
console.log("✓ og-image.png (1200×630) 호환본 생성 완료");
