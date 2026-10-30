#!/usr/bin/env node
// 매일 아침 운영 브리핑 메일(소유자 2026-10-31: 렛츠캘린더처럼 신규 등록·수집량·오류를 매일 아침 메일로).
// - 새로 등록된 장소: 24시간 전 카탈로그(git)와 지금 카탈로그를 비교한 새 id.
// - 수집량: 수집 현황 이력(collect-history.json) 마지막 두 날짜의 차이 + 수집처별 오늘 처리 건수(collect-stats.json).
// - 오류: 지난 24시간 실패한 GitHub Actions 실행(GITHUB_TOKEN).
// - 진단: 수집 현황판과 같은 규칙 일부(목표의 60% 미만·7일 감소).
// 보내기: 네이버 SMTP(587, STARTTLS) — 렛츠캘린더 functions/index.js와 같은 방식. 앱 비밀번호가 없으면 본문만 출력하고 끝낸다.
// 사용: node pipeline/scripts/daily-brief.mjs [--send] [--out file.html]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const SITE = "https://pyw31337.github.io/camp/";
const args = process.argv.slice(2);
const SEND = args.includes("--send");
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n, d = 0) => (Number.isFinite(+n) ? (+n).toLocaleString("ko-KR", { maximumFractionDigits: d }) : "-");
const sgn = (n, d = 0) => (n > 0 ? `+${fmt(n, d)}` : n < 0 ? `−${fmt(-n, d)}` : "0");
const readJson = (p, d = null) => { try { return JSON.parse(readFileSync(join(root, p), "utf8")); } catch { return d; } };
const kst = new Date(Date.now() + 9 * 3600e3);
const today = kst.toISOString().slice(0, 10);

// 1) 새로 등록된 장소
// campgrounds.json(전체 카탈로그, git에 있음)으로 비교한다. lite판은 발행 때 만들어져 git에 없다.
const CAT = "camping-atlas/public/explore/data/campgrounds.json";
const liteNow = readJson(CAT, []);
let added = [], prevN = null;
try {
  const rev = execFileSync("git", ["rev-list", "-1", "--before=24 hours ago", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (rev) {
    const old = JSON.parse(execFileSync("git", ["show", `${rev}:${CAT}`], { cwd: root, encoding: "utf8", maxBuffer: 512 << 20 }));
    const was = new Set(old.map((c) => String(c.id))); prevN = old.length;
    added = liteNow.filter((c) => !was.has(String(c.id)));
  }
} catch (e) { console.error(`(참고) 24시간 전 카탈로그를 읽지 못함: ${String(e.message).slice(0, 120)}`); }

// 2) 수집량
const stats = readJson("camping-atlas/public/data/collect-stats.json", {});
const hist = readJson("camping-atlas/public/data/collect-history.json", { days: {} });
const days = Object.keys(hist.days ?? {}).sort();
const [dPrev, dLast] = [days.at(-2), days.at(-1)];
const val = (x) => (Array.isArray(x) ? x[0] : x);
const delta = (k) => (dPrev && dLast ? (val(hist.days[dLast]?.[k]) ?? 0) - (val(hist.days[dPrev]?.[k]) ?? 0) : null);
const ROWS = [
  ["catalog.camps", "캠핑장·숙박"], ["catalog.dayuse", "당일 나들이 장소"], ["review.posts", "후기 글"], ["review.thumb", "후기 썸네일"],
  ["video.playable", "재생 영상"], ["video.shorts", "쇼츠"], ["photo.official", "공식 사진 보유 캠핑장"], ["field.tel", "전화번호 있는 곳"],
  ["field.homepage", "홈페이지 있는 곳"], ["field.fee", "요금 있는 곳"], ["quality.facts", "원자 사실"], ["quality.conflicts", "값 충돌 대기"],
];
const metricRows = ROWS.map(([k, label]) => ({ label, now: val(hist.days[dLast]?.[k]) ?? stats.metrics?.[k]?.value, d1: delta(k) })).filter((r) => r.now != null);
const srcRows = (stats.sources ?? []).map((s) => ({ name: s.name, today: s.byDay?.[stats.date] ?? 0, d7: s.d7, total: s.total, every: s.every ?? 1 }));

// 3) 오류: 지난 24시간 실패한 워크플로 실행
let failed = [];
const repo = process.env.GITHUB_REPOSITORY || "pyw31337/camp";
if (process.env.GITHUB_TOKEN) {
  try {
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=100&created=>=${since}`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } });
    const runs = (await r.json()).workflow_runs ?? [];
    failed = runs.filter((x) => x.conclusion === "failure" && x.event !== "pull_request").map((x) => ({ name: x.name, at: x.created_at, url: x.html_url }));
  } catch (e) { console.error(`(참고) 워크플로 실행 기록을 읽지 못함: ${e.message}`); }
}

// 4) 진단(현황판 규칙 일부)
const M = stats.metrics ?? {};
const LABEL = { "field.sizes": "사이트 크기", "field.floors": "바닥 재질", "field.booking": "예약 링크", "field.pets": "반려견 정보", "field.amenities": "편의시설", "video.per_camp": "캠핑장당 영상 수", "video.short_camps": "쇼츠 있는 캠핑장", "video.playable_camps": "영상 있는 캠핑장", "operator.ok": "운영자 홈페이지 수집 성공", "booking.verified": "예약 링크 업장 확인", "place.kakao": "카카오 플레이스 매칭", "place.naver": "네이버 플레이스 매칭", "quality.confirmed_pct": "확정 비율", "quality.iq": "평균 정보량", "quality.confidence": "평균 신뢰도", "catalog.camps": "캠핑장 수" };
const diag = [];
for (const [k, x] of Object.entries(M)) {
  const label = ROWS.find((r) => r[0] === k)?.[1] ?? LABEL[k] ?? k;
  if (x.target && x.progress != null && x.progress < 60) diag.push(["문제", `${label}: 목표의 ${fmt(x.progress)}%`]);
  if (x.d7 != null && x.d7 < 0 && !["quality.conflicts", "booking.hidden_links"].includes(k)) diag.push(["주의", `${label}: 7일 사이 ${fmt(x.d7, 1)} 감소`]);
}
const stalled = srcRows.filter((s) => s.every === 1 && s.d7 > 0 && s.today === 0).map((s) => s.name);

// 본문
const subject = `[렛츠캠핑] ${today} 아침 브리핑 · 새 장소 ${fmt(added.length)}곳 · 실패 ${fmt(failed.length)}건`;
const td = "padding:6px 10px;border-bottom:1px solid #eee;font-size:13px";
const html = `<!doctype html><html><body style="margin:0;background:#f5f6f4;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#101414">
<div style="max-width:640px;margin:0 auto;padding:20px">
<h1 style="font-size:20px;margin:0 0 4px">렛츠캠핑 아침 브리핑</h1>
<p style="margin:0 0 16px;color:#747c78;font-size:13px">${esc(today)} · 수집 현황 기준 ${esc(stats.date ?? "-")} · <a href="${SITE}admin/collect/">수집 현황판</a></p>
<h2 style="font-size:15px;margin:18px 0 8px">새로 등록된 장소 ${fmt(added.length)}곳${prevN != null ? ` <small style="color:#747c78">(전체 ${fmt(prevN)} → ${fmt(liteNow.length)})</small>` : ""}</h2>
${added.length ? `<table style="width:100%;border-collapse:collapse;background:#fff">${added.slice(0, 30).map((c) => `<tr><td style="${td}"><a href="${SITE}place/${encodeURIComponent(c.id)}">${esc(c.name)}</a></td><td style="${td};color:#4b5350">${esc([c.sido, c.sigungu].filter(Boolean).join(" "))}</td><td style="${td};color:#4b5350">${esc(c.du ? "당일 나들이" : (c.types ?? [])[0] ?? "캠핑장")}</td></tr>`).join("")}</table>${added.length > 30 ? `<p style="font-size:12px;color:#747c78">외 ${fmt(added.length - 30)}곳</p>` : ""}` : `<p style="font-size:13px;color:#4b5350">어제 대비 새로 등록된 장소가 없습니다.</p>`}
<h2 style="font-size:15px;margin:18px 0 8px">수집량 (${esc(dPrev ?? "-")} → ${esc(dLast ?? "-")})</h2>
<table style="width:100%;border-collapse:collapse;background:#fff">${metricRows.map((r) => `<tr><td style="${td}">${esc(r.label)}</td><td style="${td};text-align:right"><b>${fmt(r.now)}</b></td><td style="${td};text-align:right;color:${r.d1 > 0 ? "#00875a" : r.d1 < 0 ? "#d92d20" : "#747c78"}">${r.d1 == null ? "" : sgn(r.d1)}</td></tr>`).join("")}</table>
<h2 style="font-size:15px;margin:18px 0 8px">수집처별 오늘 처리</h2>
<table style="width:100%;border-collapse:collapse;background:#fff">${srcRows.map((s) => `<tr><td style="${td}">${esc(s.name)}</td><td style="${td};text-align:right">${fmt(s.today)}건</td><td style="${td};text-align:right;color:#747c78">7일 ${fmt(s.d7)}</td></tr>`).join("")}</table>
<h2 style="font-size:15px;margin:18px 0 8px">오류 · 실패한 자동 작업 ${fmt(failed.length)}건</h2>
${failed.length ? `<ul style="font-size:13px;padding-left:18px">${failed.map((f) => `<li><a href="${esc(f.url)}">${esc(f.name)}</a> <span style="color:#747c78">${esc(new Date(Date.parse(f.at) + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " "))}</span></li>`).join("")}</ul>` : `<p style="font-size:13px;color:#00875a">지난 24시간 실패한 자동 작업이 없습니다.</p>`}
${stalled.length ? `<p style="font-size:13px;color:#c2410c">매일 도는데 오늘 처리 0건: ${esc(stalled.join(", "))}</p>` : ""}
<h2 style="font-size:15px;margin:18px 0 8px">진단</h2>
${diag.length ? `<ul style="font-size:13px;padding-left:18px">${diag.slice(0, 15).map(([k, t]) => `<li><b style="color:${k === "문제" ? "#d92d20" : "#c2410c"}">${k}</b> ${esc(t)}</li>`).join("")}</ul>` : `<p style="font-size:13px">특이사항 없음</p>`}
<p style="margin-top:24px;font-size:11px;color:#747c78">이 메일은 GitHub Actions(daily-brief.yml)가 매일 아침 자동으로 보냅니다.</p>
</div></body></html>`;
const text = [subject, "", `새로 등록 ${added.length}곳: ${added.slice(0, 15).map((c) => c.name).join(", ")}`, "", ...metricRows.map((r) => `${r.label} ${fmt(r.now)} (${r.d1 == null ? "-" : sgn(r.d1)})`), "", `실패한 자동 작업 ${failed.length}건`, ...failed.map((f) => `- ${f.name} ${f.url}`), "", ...diag.map(([k, t]) => `[${k}] ${t}`)].join("\n");

if (OUT) writeFileSync(OUT, html);
console.log(text);
if (!SEND) process.exit(0);
const user = process.env.NAVER_SMTP_ACCOUNT, pass = process.env.NAVER_SMTP_APP_PASSWORD, to = process.env.BRIEF_TO || user;
if (!user || !pass) { console.log("::warning::NAVER_SMTP_ACCOUNT·NAVER_SMTP_APP_PASSWORD가 없어 메일을 보내지 않았습니다(본문은 위에 출력)."); process.exit(0); }
const { default: nodemailer } = await import("nodemailer");
const transport = nodemailer.createTransport({ host: "smtp.naver.com", port: 587, secure: false, requireTLS: true, auth: { user, pass }, connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 60_000 });
const info = await transport.sendMail({ from: `렛츠캠핑 브리핑 <${user}>`, to, subject, text, html });
console.log(`메일 보냄 → ${to} (${info.messageId})`);
