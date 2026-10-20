#!/usr/bin/env node
// media 브랜치 강제 푸시 전 검사: 직전 manifest보다 사진이 줄면 멈춘다.
// 권리자 요청 등 의도적 삭제는 MEDIA_ALLOW_SHRINK=1로만 허용한다.
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [prevPath, nextPath] = process.argv.slice(2);
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const r = compareManifests(read(prevPath), read(nextPath));
  console.log(`media guard: ${r.prevTotal} → ${r.nextTotal}장, 사라짐 ${r.lostPhotos}장(${r.lostCamps}곳)`);
  if (r.lostPhotos > 0 && process.env.MEDIA_ALLOW_SHRINK !== "1") {
    console.log(`::error::media 브랜치에서 사진 ${r.lostPhotos}장이 사라져 푸시하지 않습니다(MEDIA_ALLOW_SHRINK=1로만 허용).`);
    process.exit(1);
  }
}
