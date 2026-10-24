#!/usr/bin/env node
// media 브랜치 강제 푸시 전 검사: 직전 manifest보다 사진이 줄거나, 직전 브랜치에 있던 사진 파일이 사라지면 멈춘다.
// 매니페스트 밖 파일도 화면 데이터가 가리킬 수 있어 파일 목록도 본다(2026-10-24 매니페스트는 그대로인데 파일 7,274장 삭제).
// 권리자 요청 등 의도적 삭제는 MEDIA_ALLOW_SHRINK=1로만 허용한다.
// 사용: media-guard.mjs <이전 manifest> <새 manifest> [이전 파일 목록 txt] [새 파일 목록 txt]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const keys = (list) => new Set((list ?? []).map((e) => e?.large ?? e?.thumb ?? e?.src_url).filter(Boolean));

export function compareManifests(prev, next) {
  const lost = [];
  let prevTotal = 0, nextTotal = 0;
  for (const [id, list] of Object.entries(prev?.camps ?? {})) {
    const before = keys(list), after = keys(next?.camps?.[id]);
    prevTotal += before.size;
    const gone = [...before].filter((k) => !after.has(k));
    if (gone.length) lost.push({ id, gone: gone.length });
  }
  for (const list of Object.values(next?.camps ?? {})) nextTotal += keys(list).size;
  return { prevTotal, nextTotal, lostPhotos: lost.reduce((n, x) => n + x.gone, 0), lostCamps: lost.length };
}

/** 직전에 있던 사진 파일(camps/…webp) 중 새 목록에 없는 것 */
export function lostFiles(prevFiles, nextFiles) {
  const next = new Set(nextFiles);
  return prevFiles.filter((f) => /^camps\/.+\.webp$/.test(f) && !next.has(f));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [prevPath, nextPath, prevFilesPath, nextFilesPath] = process.argv.slice(2);
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const lines = (p) => readFileSync(p, "utf8").split("\n").map((x) => x.trim()).filter(Boolean);
  const r = compareManifests(read(prevPath), read(nextPath));
  const gone = prevFilesPath && nextFilesPath ? lostFiles(lines(prevFilesPath), lines(nextFilesPath)) : [];
  console.log(`media guard: ${r.prevTotal} → ${r.nextTotal}장, 사라짐 ${r.lostPhotos}장(${r.lostCamps}곳) · 사라진 파일 ${gone.length}개`);
  if ((r.lostPhotos > 0 || gone.length > 0) && process.env.MEDIA_ALLOW_SHRINK !== "1") {
    console.log(`::error::media 브랜치에서 사진 ${r.lostPhotos}장·파일 ${gone.length}개가 사라져 푸시하지 않습니다(MEDIA_ALLOW_SHRINK=1로만 허용). 예: ${gone.slice(0, 3).join(", ")}`);
    process.exit(1);
  }
}
