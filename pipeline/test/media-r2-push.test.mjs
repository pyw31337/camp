import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// t43: 카드 사진 작업은 cards/만 R2에서 받아 오므로 camps/ 폴더가 없다. 그때 push가 메시지 없이 exit 1 하던 회귀.
const script = fileURLToPath(new URL("../../.github/scripts/media-r2.sh", import.meta.url));
const setup = (keys) => {
  const t = mkdtempSync(join(tmpdir(), "r2-")), bin = join(t, "bin"), dir = join(t, "media");
  mkdirSync(bin); mkdirSync(join(dir, "cards/1"), { recursive: true });
  writeFileSync(join(dir, "cards/1/a.webp"), "x");
  // 가짜 aws: sync는 성공, ls는 주어진 키 목록을 S3 ls 형식으로
  writeFileSync(join(bin, "aws"), `#!/usr/bin/env bash\nif [ "$2" = ls ]; then ${keys.map((k) => `echo "2026-11-04 00:00:00 1 ${k}"`).join(";") || ":"}; fi\nexit 0\n`);
  chmodSync(join(bin, "aws"), 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_BUCKET: "camp", R2_PUBLIC_BASE: "https://r2.example" };
  return { dir, env };
};
test("camps/ 폴더가 없어도 push 확인이 통과한다", () => {
  const { dir, env } = setup(["cards/1/a.webp", "camps/9/z-t.webp"]);
  const out = execFileSync("bash", [script, "push", dir], { env, encoding: "utf8" });
  assert.match(out, /로컬 1장 · R2 2장 · R2에 없는 로컬 사진 0장/);
});
test("R2에 없는 로컬 사진이 있으면 여전히 실패한다(사진 보호)", () => {
  const { dir, env } = setup([]);
  assert.throws(() => execFileSync("bash", [script, "push", dir], { env, encoding: "utf8", stdio: "pipe" }));
});
