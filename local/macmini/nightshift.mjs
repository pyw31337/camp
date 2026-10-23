#!/usr/bin/env node
// 맥미니 야간·주말 데이터 품질 작업(소유자 2026-10-23). launchd가 15분마다 깨우고, 이 파일이 “지금 돌려도 되나”를 판단한다.
//  - 시간: 평일 18:00~다음 날 08:00, 토·일·공휴일(holidays-kr.json + ~/.letscamp/holidays.txt)은 하루 종일
//  - 맥에 원래 있던 작업(detect-existing.mjs가 찾은 launchd·cron 시각과 프로세스)과 겹치면 쉬고, 부하가 높아도 쉰다
//  - 작업 중에도 1분마다 확인해 다른 작업이 시작되면 양보(중단·저장, 다음 차례에 이어서)
//  - 결과는 데이터 봇과 같은 길로 올린다(.github/scripts/land-on-main.sh → 검사 통과 후 main 병합, field-guard로 값 보존)
// 사용: node nightshift.mjs [--dry-run] [--force <작업id>]
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync, unlinkSync } from "node:fs";
import { cpus, homedir, loadavg } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const home = join(homedir(), ".letscamp");
// launchd는 plist에서 env를 읽지만, 사용자가 README의 명령을 직접 실행할 때도
// 같은 로컬 비전 모델을 쓰도록 간단한 export 설정을 먼저 적용한다.
const envFile = join(home, "env");
if (existsSync(envFile)) for (const raw of readFileSync(envFile, "utf8").split("\n")) {
  const m = raw.trim().match(/^export\s+([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const { budgetOf, clashesWith, idle, isDayOff, kst, pickJob, window } = await import(join(repo, "pipeline/lib/nightshift.mjs"));
mkdirSync(join(home, "logs"), { recursive: true });
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const DRY = process.argv.includes("--dry-run"), FORCE = arg("--force");
const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const now = new Date();
const logFile = join(home, "logs", `${kst(now).ymd}.log`);
const log = (...a) => { const line = `[${new Date().toISOString()}] ${a.join(" ")}`; console.log(line); appendFileSync(logFile, `${line}\n`); };

// ── 작업 목록(데이터 품질에 도움이 큰 순) ─────────────────────────
// avoid: 같은 파일을 쓰는 CI 작업 시각(한국 시간). 그 시간에 걸리지 않게 끝낸다(겹치면 한쪽 결과가 덮일 수 있음).
const H = (h, m = 0) => h * 60 + m;
const JOBS = [
  { id: "nearby-photos", title: "주변시설 사진 판독(Apple Vision 간판 글자 + 로컬 비전 모델)", everyHours: 4, minMinutes: 45, maxMinutes: 360,
    avoid: [{ dow: 5, hm: H(5, 23), minutes: 200 }], cmd: ["node", "scripts/judge-nearby-photos-mac.mjs"], files: ["pipeline/registry/nearby-photos.json"] },
  { id: "review-photos", title: "후기 사진 판정 밀린 것 전부(CLIP)", everyHours: 6, minMinutes: 60, maxMinutes: 300,
    avoid: [{ dow: 2, hm: H(4, 17), minutes: 200 }], cmd: ["node", "scripts/judge-review-photos.mjs"], env: { PHOTO_JUDGE_MAX: "40000" }, files: ["pipeline/registry/photo-judgments.json"] },
  { id: "texts", title: "후기·카페·웹문서 글 판정 밀린 것 전부", everyHours: 6, minMinutes: 30, maxMinutes: 180,
    avoid: [{ dow: 2, hm: H(4, 17), minutes: 200 }], cmd: ["node", "scripts/judge-texts.mjs"], env: { TEXT_JUDGE_MAX: "200000", HF_CACHE: ".cache/hf-text" }, files: ["pipeline/registry/text-judgments.json"] },
  { id: "operator-sites", title: "운영자 홈페이지 다시 읽기 + 요금표 이미지 Apple Vision OCR", everyHours: 24 * 6, dayOffOnly: true, minMinutes: 240, maxMinutes: 600,
    avoid: [{ dow: 0, hm: H(3, 41), minutes: 240 }], setup: ["npx", "playwright", "install", "chromium"],
    cmd: ["node", "scripts/crawl-operator-sites.mjs", "--concurrency", "4", "--render", "--retry-failed", "--ocr", "--max-age-days", "10"], env: { OCR_ENGINE: "apple" },
    files: ["pipeline/registry/operator-site-snippets.json"] },
  // 주말·공휴일 추가(2026-10-23 소유자: “토·일·월 08시까지 로컬 자원을 최대한”): CI에 없는 무거운 수집 두 가지.
  { id: "operator-gaps", title: "정보 빠진 캠핑장 150곳 운영자 홈페이지 깊게 읽기(요금·이용 수칙)", everyHours: 48, dayOffOnly: true, minMinutes: 60, maxMinutes: 360,
    cmd: ["bash", "scripts/crawl-operator-gaps.sh"], files: ["pipeline/registry/operator-deep.json"] },
  { id: "gocamping-detail", title: "고캠핑 상세 다시 읽기(겨울 운영·난방·시설, 30일 캐시)", everyHours: 24 * 6, dayOffOnly: true, minMinutes: 90, maxMinutes: 300,
    cmd: ["node", "scripts/crawl-gocamping-detail.mjs"], files: ["data/gocamping-detail.ndjson"] },
];

// ── 지금 돌려도 되나 ───────────────────────────────────────────
const holidays = [
  ...(readJson(join(here, "holidays-kr.json"), {}).days ?? []),
  ...(existsSync(join(home, "holidays.txt")) ? readFileSync(join(home, "holidays.txt"), "utf8").match(/\d{4}-\d{2}-\d{2}/g) ?? [] : []),
];
// 기존 작업 목록은 하루에 한 번 새로 찾는다(새로 생긴 작업도 피하게)
if (Date.now() - (Date.parse(readJson(join(home, "busy.json"), {}).at ?? 0) || 0) > 864e5) {
  try { execFileSync(process.execPath, [join(here, "detect-existing.mjs")], { stdio: "ignore" }); } catch {}
}
const busy = readJson(join(home, "busy.json"), { schedule: [], processes: [] });
const running = () => {
  const pats = (busy.processes ?? []).filter((p) => p && p.length >= 3);
  if (!pats.length) return [];
  let ps = ""; try { ps = execFileSync("ps", ["-axo", "command="], { encoding: "utf8" }); } catch { return []; }
  // 이 클론(야간 작업 자신)에서 띄운 프로세스는 빼고 본다
  return pats.filter((p) => ps.split("\n").some((l) => l.includes(p) && !l.includes(repo) && !l.includes("caffeinate -i nice")));
};
const lockPath = join(home, "run.lock");
if (existsSync(lockPath)) {
  const pid = Number(readFileSync(lockPath, "utf8"));
  try { process.kill(pid, 0); process.exit(0); } catch { /* 지난 실행이 비정상 종료 — 잠금 풀기 */ }
}
const w = window(now, { holidays });
const dayOff = isDayOff(kst(now).ymd, holidays);
if (!FORCE) {
  if (!w.open) process.exit(0);
  const clash = clashesWith(now, busy.schedule ?? []);
  if (clash) { log(`쉼: 기존 작업 ${clash.label} 시간`); process.exit(0); }
  const st = idle({ load1: loadavg()[0], cpus: cpus().length, running: running() });
  if (!st.ok) { log(`쉼: ${st.why}`); process.exit(0); }
}
const statePath = join(home, "state.json"), state = readJson(statePath, {});
const job = FORCE ? JOBS.find((j) => j.id === FORCE) : pickJob(JOBS, state, { now, minutesLeft: w.minutesLeft, dayOff });
if (!job) process.exit(0);
const budget = FORCE ? (job.maxMinutes ?? 120) : budgetOf(job, now, w.minutesLeft) - 10;
const deadline = Date.now() + budget * 60e3;
log(`시작: ${job.id} — ${job.title} (최대 ${budget}분, ${new Date(deadline).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}까지)`);
if (DRY) process.exit(0);
writeFileSync(lockPath, String(process.pid));

// ── 실행 ──────────────────────────────────────────────────────
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
let result = "실패";
try {
  // 이 클론은 야간 작업 전용(install.sh가 ~/.letscamp/camp에 만든다) — 늘 최신 main에서 시작한다.
  sh("git", ["fetch", "-q", "origin", "main"]);
  sh("git", ["checkout", "-q", "-B", "nightshift", "origin/main"]);
  sh("git", ["reset", "-q", "--hard", "origin/main"]);
  const lockHash = sh("git", ["hash-object", "pipeline/package-lock.json"]);
  if (state._npm !== lockHash || !existsSync(join(repo, "pipeline/node_modules"))) {
    log("npm ci");
    sh("npm", ["ci", "--silent"], { cwd: join(repo, "pipeline") });
    sh("npm", ["i", "--no-save", "--silent", "@huggingface/transformers@3.8.1"], { cwd: join(repo, "pipeline") });
    state._npm = lockHash;
  }
  if (job.setup) try { sh(job.setup[0], job.setup.slice(1), { cwd: join(repo, "pipeline") }); } catch {}
  const code = await new Promise((done) => {
    // caffeinate -i: 작업 중 잠자기 방지 · nice: 다른 작업보다 낮은 우선순위
    const p = spawn("caffeinate", ["-i", "nice", "-n", "10", ...job.cmd], {
      cwd: join(repo, "pipeline"), env: { ...process.env, ...job.env, NIGHTSHIFT_DEADLINE: String(deadline) }, stdio: ["ignore", "pipe", "pipe"],
    });
    p.stdout.on("data", (b) => appendFileSync(logFile, b)); p.stderr.on("data", (b) => appendFileSync(logFile, b));
    // 1분마다: 끝낼 시각이 지났거나 기존 작업이 시작되면 양보(작업은 중간 저장을 하므로 다음에 이어서)
    const tick = setInterval(() => {
      const r = running();
      if (Date.now() > deadline || r.length) { log(`양보: ${r.length ? `기존 작업 시작(${r[0]})` : "시간 다 됨"}`); p.kill("SIGTERM"); setTimeout(() => p.kill("SIGKILL"), 60e3); }
    }, 60e3);
    p.on("close", (c) => { clearInterval(tick); done(c); });
  });
  log(`작업 끝: 코드 ${code}`);
  // 결과 올리기(바뀐 파일만). land-on-main.sh가 최신 main 위로 옮기고, 줄어든 값은 field-guard로 되살리고, 검사 통과 후 병합한다.
  sh("git", ["add", ...job.files]);
  let changed = true; try { sh("git", ["diff", "--cached", "--quiet"]); changed = false; } catch {}
  if (changed) {
    sh("git", ["commit", "-q", "-m", `chore(data): macmini ${job.id}`]);
    const token = sh("gh", ["auth", "token"]);
    sh("bash", [".github/scripts/land-on-main.sh", `macmini-${job.id}`], {
      env: { ...process.env, GITHUB_REPOSITORY: "pyw31337/camp", GITHUB_REF_NAME: "main", GH_TOKEN: token }, timeout: 45 * 60e3,
    });
    result = "올림";
  } else result = "변경 없음";
} catch (e) {
  log(`오류: ${String(e.stderr || e.message).slice(0, 600)}`);
} finally {
  state[job.id] = { last: new Date().toISOString(), result };
  writeFileSync(statePath, JSON.stringify(state, null, 1));
  writeFileSync(join(home, "status.json"), JSON.stringify({ at: new Date().toISOString(), job: job.id, result, state }, null, 1));
  try { unlinkSync(lockPath); } catch {}
  log(`마침: ${job.id} → ${result}`);
}
