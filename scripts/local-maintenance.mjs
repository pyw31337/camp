#!/usr/bin/env node
// 로컬 폴더 정리·백업 도구(소유자 2026-10-23: “불필요한 파일 제거, 전후 파일 수·용량 비교, 다른 PC에서 백지 상태로 이어 갈 수 있게 깃에 전부 백업”).
// 기본은 미리 보기(아무것도 안 지움·안 올림). 실제로 하려면 --apply.
//
//   node scripts/local-maintenance.mjs report            지금 상태(추적·추적 안 됨·다시 만들 수 있는 것·.git 크기)
//   node scripts/local-maintenance.mjs clean [--apply]   다시 만들 수 있는 것만 지움(node_modules·빌드·캐시·OS 찌꺼기) + git 정리(gc·병합된 로컬 브랜치)
//   node scripts/local-maintenance.mjs backup [--apply]  깃에 없는 작업(새 파일·고친 파일·stash·안 올린 커밋)을 backup/<기기>-<날짜> 브랜치로 올림(main에는 안 올림)
//
// 지우지 않는 것: 깃이 추적하는 파일, 추적 안 된 새 파일(→ backup으로 올림), 비밀(.env 등). 비밀은 백업에서도 빼고 이름만 알려 준다.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const [cmd = "report", ...rest] = process.argv.slice(2);
const APPLY = rest.includes("--apply");
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 256e6, stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return ""; } };
const mb = (b) => `${(b / 1e6).toFixed(1)}MB`;

// 다시 만들 수 있는 것(지워도 npm ci·빌드·첫 실행이 되살림). 깃이 무시하는 것 중 이 목록에 맞는 것만 지운다.
const REGEN = [
  /(^|\/)node_modules\//, /(^|\/)\.next\//, /(^|\/)dist\//, /(^|\/)\.sites-runtime\//, /(^|\/)\.cache\//, /^pipeline\/out\//,
  /^camping-atlas\/public\/explore\/data\/campgrounds\.lite\.json$/, /^camping-atlas\/public\/explore\/data\/catx\//, /^camping-atlas\/public\/place\//,
  /^camping-atlas\/next-env\.d\.ts$/, /^design\/explore\//, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/, /(^|\/)npm-debug\.log/, /\.tsbuildinfo$/,
];
const SECRET = /(^|\/)\.env(\.|$)|\.pem$|\.p12$|\.key$|id_rsa|credentials|secret|token/i;
const BIG = 50e6; // GitHub은 100MB 넘는 파일을 거절 — 50MB 넘으면 백업에서 빼고 알려 준다

function sizeOf(p) {
  let n = 0, b = 0;
  const walk = (q) => {
    let st; try { st = lstatSync(q); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) { for (const e of readdirSync(q)) walk(join(q, e)); return; }
    n++; b += st.size;
  };
  walk(p);
  return { n, b };
}
function snapshot() {
  const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
  let tb = 0; for (const f of tracked) { try { tb += statSync(join(root, f)).size; } catch {} }
  const untracked = tryGit("ls-files", "-o", "--exclude-standard", "-z").split("\0").filter(Boolean);
  let ub = 0; for (const f of untracked) { try { ub += statSync(join(root, f)).size; } catch {} }
  const ignored = tryGit("ls-files", "-o", "-i", "--exclude-standard", "--directory", "-z").split("\0").filter(Boolean);
  const regen = ignored.filter((p) => REGEN.some((re) => re.test(p.replace(/\\/g, "/"))));
  const other = ignored.filter((p) => !regen.includes(p));
  const sum = (list) => list.reduce((a, p) => { const s = sizeOf(join(root, p)); return { n: a.n + s.n, b: a.b + s.b }; }, { n: 0, b: 0 });
  const all = sizeOf(root), dotgit = sizeOf(join(root, ".git"));
  return {
    at: new Date().toISOString(), folder: root,
    total: all, git: dotgit,
    tracked: { n: tracked.length, b: tb },
    untracked: { n: untracked.length, b: ub, list: untracked.slice(0, 200) },
    regenerable: { ...sum(regen), list: regen },
    ignoredOther: { ...sum(other), list: other },
  };
}
const line = (k, s) => `  ${k.padEnd(28)} ${String(s.n).padStart(7)}개  ${mb(s.b).padStart(10)}`;
function print(s, title) {
  console.log(`\n[${title}] ${s.folder}`);
  console.log(line("폴더 전체", s.total));
  console.log(line("  .git(변경 이력)", s.git));
  console.log(line("  깃이 추적하는 파일", s.tracked));
  console.log(line("  깃에 없는 새 파일(백업 대상)", s.untracked));
  console.log(line("  다시 만들 수 있는 것(정리 대상)", s.regenerable));
  console.log(line("  깃이 무시하는 기타(그대로 둠)", s.ignoredOther));
}
function save(name, data) {
  const dir = join(homedir(), ".letscamp", "maintenance");
  try { mkdirSync(dir, { recursive: true }); const p = join(dir, `${name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`); writeFileSync(p, JSON.stringify(data, null, 1)); return p; } catch { return null; }
}

if (cmd === "report") {
  const s = snapshot(); print(s, "지금 상태");
  if (s.untracked.n) console.log(`\n깃에 없는 새 파일 ${s.untracked.n}개 — 'backup --apply'로 올리세요:\n${s.untracked.list.slice(0, 30).map((x) => `  ${x}`).join("\n")}`);
  if (s.ignoredOther.list.length) console.log(`\n무시되지만 정리 목록에 없는 것(손대지 않음):\n${s.ignoredOther.list.map((x) => `  ${x}`).join("\n")}`);
} else if (cmd === "clean") {
  const before = snapshot(); print(before, "정리 전");
  const merged = tryGit("branch", "--merged", "origin/main", "--format=%(refname:short)").split("\n").filter((b) => b && !/^(main|master)$/.test(b) && b !== tryGit("branch", "--show-current"));
  console.log(`\n지울 것(다시 만들 수 있음) ${before.regenerable.list.length}곳 ${mb(before.regenerable.b)} · main에 이미 합쳐진 로컬 브랜치 ${merged.length}개 · git gc`);
  for (const p of before.regenerable.list) console.log(`  - ${p}`);
  for (const b of merged) console.log(`  - 브랜치 ${b}`);
  if (!APPLY) { console.log("\n미리 보기만 했어요. 실제로 지우려면 --apply"); process.exit(0); }
  for (const p of before.regenerable.list) { const abs = resolve(root, p); if (abs.startsWith(root + sep)) rmSync(abs, { recursive: true, force: true }); }
  for (const b of merged) tryGit("branch", "-d", b); // -d: 합쳐진 것만(안 합쳐진 브랜치는 깃이 거절)
  tryGit("worktree", "prune"); tryGit("remote", "prune", "origin"); tryGit("gc", "--quiet"); // gc는 2주 지난 버려진 객체만 지운다(기본값)
  const after = snapshot(); print(after, "정리 후");
  const d = (k) => `${k}: ${before[k].n}→${after[k].n}개, ${mb(before[k].b)}→${mb(after[k].b)} (${mb(after[k].b - before[k].b)})`;
  console.log(`\n변화\n  ${d("total")}\n  ${d("git")}\n  ${d("regenerable")}`);
  console.log(`  기록: ${save("clean", { before, after, removed: before.regenerable.list, branches: merged })}`);
  console.log("\n되살리기: (cd pipeline && npm ci) · (cd camping-atlas && npm ci) — docs/SETUP_NEW_PC.md");
} else if (cmd === "backup") {
  // 앞의 공백(" M 파일")이 상태 칸이라 trim하면 안 된다
  const status = execFileSync("git", ["status", "--porcelain", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8", maxBuffer: 256e6 }).split("\0").filter(Boolean);
  const files = status.map((x) => x.slice(3)).filter((f) => f && !f.endsWith("/"));
  const secrets = files.filter((f) => SECRET.test(f));
  const big = files.filter((f) => { try { return statSync(join(root, f)).size > BIG; } catch { return false; } });
  const keep = files.filter((f) => !secrets.includes(f) && !big.includes(f));
  const stashes = tryGit("stash", "list").split("\n").filter(Boolean);
  const unpushed = tryGit("log", "--branches", "--not", "--remotes", "--oneline").split("\n").filter(Boolean);
  const branch = `backup/${hostname().replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;
  console.log(`깃에 없는 작업: 파일 ${keep.length}개 · stash ${stashes.length}개 · 안 올린 커밋 ${unpushed.length}개`);
  keep.slice(0, 50).forEach((f) => console.log(`  + ${f}`));
  if (secrets.length) console.log(`비밀로 보여 올리지 않음(${secrets.length}): ${secrets.join(", ")} — 비밀은 GitHub Secrets·비밀번호 관리자에 보관`);
  if (big.length) console.log(`50MB 넘어 올리지 않음(${big.length}): ${big.join(", ")}`);
  if (!keep.length && !stashes.length && !unpushed.length) { console.log("올릴 것 없음 — 이 폴더의 작업은 모두 GitHub에 있어요."); process.exit(0); }
  if (!APPLY) { console.log(`\n미리 보기만 했어요. --apply 하면 ${branch} 브랜치로 올립니다(main은 그대로).`); process.exit(0); }
  // 현재 작업 폴더를 건드리지 않게 임시 인덱스로 커밋을 만들어 올린다(체크아웃·stash 안 함)
  const env = { ...process.env, GIT_INDEX_FILE: join(root, ".git", "backup-index") };
  const g = (...a) => execFileSync("git", a, { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  g("read-tree", "HEAD");
  if (keep.length) g("add", "-A", "--", ...keep);
  const tree = g("write-tree");
  const parents = ["HEAD", ...stashes.map((_, i) => `stash@{${i}}`)].flatMap((p) => ["-p", p]);
  const commit = execFileSync("git", ["commit-tree", tree, ...parents, "-m", `backup: ${hostname()} ${new Date().toISOString()} — 깃에 없던 작업 ${keep.length}개 파일, stash ${stashes.length}개, 안 올린 커밋 ${unpushed.length}개`], { cwd: root, env, encoding: "utf8" }).trim();
  rmSync(env.GIT_INDEX_FILE, { force: true });
  git("push", "origin", `${commit}:refs/heads/${branch}`);
  for (const b of tryGit("for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").filter(Boolean)) {
    if (tryGit("log", b, "--not", "--remotes", "--oneline")) tryGit("push", "origin", `${b}:refs/heads/${branch}--${b.replace(/[^a-z0-9._-]/gi, "-")}`);
  }
  console.log(`올림: ${branch} (${commit.slice(0, 7)}) · 기록 ${save("backup", { branch, commit, files: keep, secrets, big, stashes, unpushed })}`);
} else {
  console.log("사용: report | clean [--apply] | backup [--apply]");
  process.exit(1);
}
