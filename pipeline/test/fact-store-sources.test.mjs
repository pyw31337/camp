import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOURCES } from "../lib/fact-store.mjs";

// 사실 원장에 쓰이는 원천 코드는 모두 SOURCES에 있어야 한다. 빠지면 build-fact-store의 사실 검증이 실패해
// 그날 데이터 동기화 발행이 통째로 막힌다(2026-10-19 사고). 파일을 통째로 되돌리는 커밋이 이 목록을 지우면 여기서 걸린다.
test("사이트 타입이 내보내는 원천 코드가 모두 SOURCES에 등록돼 있다", () => {
  const src = readFileSync(new URL("../lib/site-types.mjs", import.meta.url), "utf8");
  const emitted = new Set([...src.matchAll(/src:\s*"([a-z_]+)"/g)].map((m) => m[1]));
  for (const m of src.matchAll(/"([a-z]+_mention)"/g)) emitted.add(m[1]);
  if (/"kin"\s*\?\s*"kin"/.test(src)) emitted.add("kin");
  for (const code of emitted) assert.ok(SOURCES[code], `SOURCES에 ${code}가 없습니다`);
  for (const code of ["blog_mention", "cafe_mention", "kin"]) assert.ok(SOURCES[code], `SOURCES에 ${code}가 없습니다`);
});
