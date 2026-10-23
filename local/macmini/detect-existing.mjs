#!/usr/bin/env node
// 맥에 원래 있던 정기 작업(launchd·cron)을 찾아 ~/.letscamp/busy.json에 적는다 → nightshift.mjs가 그 시간과 프로세스를 피한다.
// install.sh가 실행하고, 매일 한 번 nightshift가 다시 실행한다(새 작업이 생겨도 따라간다).
// 직접 더 적을 것: ~/.letscamp/avoid.txt
//   시간대:   <요일> <HH:MM> <분> <이름>      예) 평일 21:00 90 코덱스 정리 · 매일 02:30 60 백업 · 토,일 10:00 120 사진 동기화
//   프로세스: proc <명령어 일부>              예) proc codex · proc /Users/me/scripts/sync.py
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const home = join(homedir(), ".letscamp");
mkdirSync(home, { recursive: true });
const schedule = [], processes = new Set(), sources = [];
// 너무 흔한 이름은 프로세스로 피하지 않는다(모든 node·python이 걸림)
const GENERIC = /^(node|python3?|bash|sh|zsh|osascript|open|env|ruby|perl|npx|npm|java|caffeinate)$/;
const patternOf = (args = []) => {
  const script = args.find((a) => /\.(sh|py|mjs|js|ts|rb|command|scpt)$/.test(a) || (a.startsWith("/") && !GENERIC.test(basename(a))));
  const p = script ?? args.find((a) => !GENERIC.test(basename(a)) && !a.startsWith("-"));
  return p && p.length >= 4 ? p : null;
};
const DOW = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const add = (label, dow, hm, minutes = 60) => schedule.push({ label, dow, hm, minutes });

// ── launchd ────────────────────────────────────────────────
const dirs = [join(homedir(), "Library/LaunchAgents"), "/Library/LaunchAgents", "/Library/LaunchDaemons"];
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".plist") && !/^com\.(apple|letscamp)\./.test(x))) {
    let j; try { j = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", join(dir, f)], { encoding: "utf8" })); } catch { continue; }
    const label = j.Label ?? f, args = j.ProgramArguments ?? (j.Program ? [j.Program] : []);
    const cal = j.StartCalendarInterval ? [].concat(j.StartCalendarInterval) : [];
    const userDir = dir.startsWith(homedir());
    // 시스템 폴더의 상시 서비스(업데이트 도우미 등)는 빼고, 정기 실행 작업만 본다. 사용자 폴더는 상시 작업도 프로세스로 피한다.
    if (!userDir && !cal.length && !j.StartInterval) continue;
    for (const c of cal) {
      const hours = c.Hour == null ? [...Array(24).keys()] : [c.Hour];
      for (const h of hours) add(label, c.Weekday == null ? null : c.Weekday % 7, h * 60 + (c.Minute ?? 0), c.Hour == null ? 30 : 60);
    }
    // 상시 실행(KeepAlive) 앱은 늘 떠 있으니 피하지 않는다(피하면 영영 못 돈다) — 정기 실행 작업만 프로세스로 피한다.
    const pat = patternOf(args);
    if (pat && (cal.length || j.StartInterval)) processes.add(pat);
    sources.push({ from: "launchd", label, when: cal.length ? cal : j.StartInterval ? `${j.StartInterval}초마다` : "상시", pattern: pat });
  }
}

// ── cron ───────────────────────────────────────────────────
const expand = (f, max) => (f === "*" ? null : f.split(",").flatMap((p) => { const [a, b] = p.split("-").map(Number); return b == null ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i); }));
let crontab = ""; try { crontab = execFileSync("crontab", ["-l"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch {}
for (const line of crontab.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !/^\w+=/.test(l))) {
  const [m, h, , , dw, ...cmd] = line.split(/\s+/);
  if (!cmd.length || /letscamp/.test(line)) continue;
  const mins = expand(m) ?? [0], hours = expand(h) ?? [...Array(24).keys()], dows = expand(dw)?.map((d) => d % 7) ?? [null];
  for (const d of dows) for (const hh of hours) add(`cron: ${cmd.join(" ").slice(0, 40)}`, d, hh * 60 + mins[0], h === "*" ? 30 : 60);
  const pat = patternOf(cmd);
  if (pat) processes.add(pat);
  sources.push({ from: "cron", line, pattern: pat });
}

// ── 소유자가 직접 적은 것 ──────────────────────────────────
const avoid = join(home, "avoid.txt");
if (existsSync(avoid)) for (const raw of readFileSync(avoid, "utf8").split("\n")) {
  const l = raw.replace(/#.*/, "").trim();
  if (!l) continue;
  if (/^proc\s+/.test(l)) { processes.add(l.replace(/^proc\s+/, "")); continue; }
  const m = l.match(/^(\S+)\s+(\d{1,2}):(\d{2})\s+(\d+)\s*(.*)$/);
  if (!m) continue;
  const [, days, hh, mm, dur, name] = m, hm = Number(hh) * 60 + Number(mm), label = name || "직접 적은 작업";
  const list = /매일|daily/i.test(days) ? [null] : /평일|weekdays/i.test(days) ? [1, 2, 3, 4, 5] : /주말|weekend/i.test(days) ? [0, 6] : days.split(/[,·]/).map((d) => DOW[d.toLowerCase()]).filter((d) => d != null);
  for (const d of list) add(label, d, hm, Number(dur));
  sources.push({ from: "avoid.txt", line: l });
}

writeFileSync(join(home, "busy.json"), JSON.stringify({ at: new Date().toISOString(), schedule, processes: [...processes], sources }, null, 1));
console.log(`기존 작업 ${sources.length}개 찾음 → 피할 시간대 ${schedule.length}개 · 피할 프로세스 ${processes.size}개 (~/.letscamp/busy.json)`);
for (const s of sources) console.log(` - [${s.from}] ${s.label ?? s.line}${s.when ? ` · ${typeof s.when === "string" ? s.when : JSON.stringify(s.when)}` : ""}${s.pattern ? ` · 프로세스: ${s.pattern}` : ""}`);
