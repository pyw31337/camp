// Pages 산출물 안의 실제 데이터가 참조하는 자체 보관 공식 사진을 전수 확인한다.
// 카드·상세는 썸네일(-t)과 큰 사진(-l)을 함께 쓰므로 둘 중 하나라도 빠지면
// 배포를 중단한다. 외부 플랫폼 미디어는 이 검사 대상이 아니다.
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";

const [outArg] = process.argv.slice(2);
if (!outArg) {
  console.error("사용법: node scripts/verify-official-media.mjs <Pages 산출물>");
  process.exit(2);
}

const output = resolve(outArg);
const dataRoot = resolve(output, "explore/data");
const mediaRoot = resolve(output, "media");
if (!existsSync(dataRoot) || !existsSync(mediaRoot)) {
  console.error(`탐색 데이터 또는 공식 사진 폴더가 없습니다: ${output}`);
  process.exit(1);
}

const jsonFiles = [];
const visit = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.isFile() && entry.name.endsWith(".json")) jsonFiles.push(path);
  }
};
await visit(dataRoot);

const photoPaths = new Set();
const collect = (value) => {
  if (typeof value === "string") {
    // 발행 데이터의 공식 파생 사진 경로만 수집한다. URL과 사용자 콘텐츠는 제외한다.
    if (/^camps\/\d+\/[a-z0-9_-]+(?:-[tl])?\.webp$/i.test(value)) {
      photoPaths.add(value);
      if (/-t\.webp$/i.test(value)) photoPaths.add(value.replace(/-t\.webp$/i, "-l.webp"));
    }
    return;
  }
  if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === "object") Object.values(value).forEach(collect);
};

for (const file of jsonFiles) {
  try {
    collect(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    console.error(`JSON을 읽을 수 없습니다: ${relative(output, file)}`);
    throw error;
  }
}

const missing = [];
for (const path of photoPaths) {
  const target = resolve(mediaRoot, path);
  if (!target.startsWith(`${mediaRoot}/`) || !existsSync(target) || !(await stat(target)).isFile()) missing.push(path);
}

if (missing.length) {
  console.error(`공식 사진 ${missing.length}개가 Pages 산출물에 없습니다.`);
  console.error(missing.slice(0, 30).map((path) => `- media/${path}`).join("\n"));
  if (missing.length > 30) console.error(`… 외 ${missing.length - 30}개`);
  process.exit(1);
}

console.log(`공식 사진 검증 완료: 데이터 ${jsonFiles.length}개 · 파일 ${photoPaths.size}개`);
