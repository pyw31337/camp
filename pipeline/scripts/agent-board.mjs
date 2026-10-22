#!/usr/bin/env node
// 에이전트 게시판(docs/DATA_QUALITY_PROCESS.md ‘소통’). Claude·Codex·Gemini·Grok 등 여러 에이전트가 git으로 공유하는 한 줄 기록.
// 파일: data/board/board.ndjson (덧붙이기만 한다. 고치지 말고 새 줄로 답·해제한다)
//
//   node pipeline/scripts/agent-board.mjs list                       최근 글 + 열린 작업 선점 + 답 없는 질문
//   node pipeline/scripts/agent-board.mjs post --agent Claude --kind notice --topic 품질 --text "…" [--refs a,b] [--reply <글 id>]
//   node pipeline/scripts/agent-board.mjs claim --agent Codex --topic "nearby.public" --text "주변 공공시설 칩 작업" [--files a,b]
//   node pipeline/scripts/agent-board.mjs release --agent Codex --reply <선점 글 id> --text "PR #280 머지"
//   node pipeline/scripts/agent-board.mjs check --files a,b          다른 에이전트가 선점한 파일이면 exit 1(작업 전 확인)
//
// kind: notice(공지) · claim(작업 선점) · release(선점 해제) · question · answer · finding(데이터 문제 발견) · handoff(넘김) · decision(판정 요약)
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const file = process.env.BOARD_FILE || join(root, "data/board/board.ndjson");
const KINDS = new Set(["notice", "claim", "release", "question", "answer", "finding", "handoff", "decision"]);
const CLAIM_DAYS = 3; // 선점은 3일 지나면 자동으로 풀린다(잊힌 선점이 다른 에이전트를 막지 않게)

export function readBoard(p = file) {
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
/** 열린 선점: release 답이 없고 3일 안 */
export function openClaims(posts, now = Date.now()) {
  const released = new Set(posts.filter((p) => p.kind === "release" && p.reply != null).map((p) => String(p.reply)));
  return posts.filter((p) => p.kind === "claim" && !released.has(String(p.id)) && now - Date.parse(p.at) < CLAIM_DAYS * 86400e3);
}
export function unanswered(posts) {
  const answered = new Set(posts.filter((p) => p.kind === "answer" && p.reply != null).map((p) => String(p.reply)));
  return posts.filter((p) => p.kind === "question" && !answered.has(String(p.id)));
}

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--")) { o[a.slice(2)] = argv[i + 1]?.startsWith("--") || argv[i + 1] == null ? true : argv[++i]; } else o._.push(a); }
  return o;
}
const list = (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const show = (p) => `#${p.id} ${p.at.slice(0, 16).replace("T", " ")} [${p.kind}] ${p.agent} · ${p.topic ?? ""}${p.reply != null ? ` (↪ #${p.reply})` : ""}\n    ${p.text}${p.files?.length ? `\n    files: ${p.files.join(", ")}` : ""}${p.refs?.length ? `\n    refs: ${p.refs.join(", ")}` : ""}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = args(process.argv.slice(2)), cmd = o._[0] ?? "list";
  const posts = readBoard();
  if (cmd === "list") {
    const claims = openClaims(posts), qs = unanswered(posts);
    console.log(`── 열린 작업 선점 ${claims.length}개 ──`); for (const p of claims) console.log(show(p));
    console.log(`── 답 없는 질문 ${qs.length}개 ──`); for (const p of qs) console.log(show(p));
    console.log(`── 최근 글 ──`); for (const p of posts.slice(-Number(o.n ?? 20))) console.log(show(p));
  } else if (cmd === "check") {
    const files = list(o.files), me = o.agent;
    const hit = openClaims(posts).filter((p) => p.agent !== me && (p.files ?? []).some((f) => files.some((x) => x.startsWith(f) || f.startsWith(x))));
    for (const p of hit) console.log(`선점됨 → ${show(p)}`);
    process.exit(hit.length ? 1 : 0);
  } else {
    const kind = cmd === "post" ? o.kind : cmd;
    if (!KINDS.has(kind)) { console.error(`kind는 ${[...KINDS].join("·")} 중 하나`); process.exit(2); }
    if (!o.agent || !o.text) { console.error("--agent, --text 필요"); process.exit(2); }
    if ((kind === "release" || kind === "answer") && o.reply == null) { console.error(`${kind}에는 --reply <글 번호>가 필요`); process.exit(2); }
    // 여러 에이전트가 다른 브랜치에서 동시에 덧붙여도 겹치지 않는 번호(시각 + 에이전트). .gitattributes merge=union으로 줄이 합쳐진다.
    const id = `${Date.now().toString(36)}-${String(o.agent).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "agent"}`;
    const p = { id, at: new Date().toISOString(), agent: String(o.agent), kind, topic: o.topic ? String(o.topic) : null, text: String(o.text), ...(list(o.files).length ? { files: list(o.files) } : {}), ...(list(o.refs).length ? { refs: list(o.refs) } : {}), ...(o.reply != null ? { reply: String(o.reply) } : {}) };
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(p) + "\n");
    console.log(show(p));
  }
}
