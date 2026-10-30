// 방문후기 썸네일 채우기(소유자 2026-10-21, 2026-10-30 정기 실행·전 블로그로 확대): 검색 API 후기 글 중 썸네일이 없는 글은
// 글의 대표 이미지(og:image)를 읽어 ‘비어 있을 때만’ 채운다. 네이버 블로그는 고화질 주소(postfiles …?type=w773)로 바꾼다.
// - 소유자 2026-10-30: “후기 섹션에 썸네일이 안 나오는 게 너무 많다” — 10-21에 한 번만 돌고 정기 실행이 없어 새 글(약 3만 건)이 비어 있었다.
//   이제 data-sync가 매일 돈다(REVIEW_FILL_MAX, 기본 8000건/실행).
// - robots.txt를 지킨다(호스트별로 읽어 우리 봇 이름·* 규칙으로 판정, 막힌 경로는 열지 않음). 봇 이름을 밝히고 호스트당 동시 2건·간격을 둔다.
// - 로그인이 필요한 카페(cafe.naver.com·cafe.daum.net)·지식iN은 열지 않는다. 기본·프로필 이미지는 쓰지 않는다.
// - 데이터 정책: 지우거나 덮지 않는다(fill only). 결과는 pipeline/registry/review-thumbs.json(url→thumb)에 쌓고,
//   찾지 못한 글(miss)은 30일 뒤 다시 본다. --apply 면 발행된 상세 파일(camps/*.json)의 빈 thumb 에도 넣는다.
//   build-explore-data·apply-review-thumbs 가 같은 기록을 다시 붙인다.
// 사용: node scripts/fill-review-thumbs.mjs [--apply] [--limit=N]
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseRobots, robotsAllows } from "../lib/operator-site.mjs";

const p = (x) => fileURLToPath(new URL(x, import.meta.url));
const REG = p("../registry/review-thumbs.json");
const CAMPS = p("../../camping-atlas/public/explore/data/camps/");
const UA = "Mozilla/5.0 (compatible; MoyeoraCampBot/1.0; +https://github.com/pyw31337/camp; review thumbnail)";
const MISS_RETRY_DAYS = 30;
const PER_HOST = 2, GAP_MS = 250;

export const hiRes = (u) => {
  if (!u) return u;
  // 네이버 블로그 썸네일(blogthumb …?type=w2)은 같은 경로의 postfiles 에서 큰 크기로 받을 수 있다.
  const m = String(u).match(/^https?:\/\/(?:blogthumb|postfiles|mblogthumb-phinf)\.pstatic\.net(\/[^?]+)/);
  if (m) return `https://postfiles.pstatic.net${m[1]}?type=w773`;
  return String(u).replace(/^http:/, "https:");
};
/** 글 주소 → 대표 이미지를 읽을 주소(네이버 블로그는 모바일 글 주소). 열지 않을 글은 null */
export const fetchUrlOf = (url) => {
  const s = String(url ?? "");
  const nb = s.match(/blog\.naver\.com\/([\w-]+)\/(\d+)/);
  if (nb) return `https://m.blog.naver.com/${nb[1]}/${nb[2]}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  // 로그인 벽·검색 결과·지식iN·SNS는 열지 않는다
  if (/(^|\.)(cafe\.naver\.com|cafe\.daum\.net|kin\.naver\.com|search\.naver\.com|search\.daum\.net|instagram\.com|facebook\.com|youtube\.com|tiktok\.com)$/i.test(u.hostname)) return null;
  return u.href;
};
/** 대표 이미지로 쓰지 않을 것: 프로필·기본·로고·아이콘 */
export const badThumb = (u) => !u || !/^https?:\/\//i.test(u) || /blogpfthumb|profile|default|favicon|logo|ssl\.pstatic\.net\/static|\/static\/blog|og_image_default|noimage|blank\.gif/i.test(u);
export const ogImage = (html) => {
  const m = String(html ?? "").match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i)?.[0];
  return m?.match(/content=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&") ?? null;
};

const isMain = import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) await main();

async function main() {
  const apply = process.argv.includes("--apply");
  const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? process.env.REVIEW_FILL_MAX ?? 8000);
  const reg = await readFile(REG, "utf8").then(JSON.parse).catch(() => ({ updated_at: null, thumbs: {}, miss: {} }));
  reg.thumbs ??= {}; reg.miss ??= {};
  const now = Date.now();
  const missFresh = (url) => reg.miss[url] && now - Date.parse(reg.miss[url]) < MISS_RETRY_DAYS * 864e5;
  const files = (await readdir(CAMPS)).filter((f) => f.endsWith(".json"));
  // 네이버 블로그 먼저(후기 대부분), 그다음 다른 블로그 — 최근 글부터
  const need = new Map();
  for (const f of files) {
    const d = JSON.parse(await readFile(CAMPS + f, "utf8"));
    for (const k of ["web", "reviews", "cafe"]) for (const x of d[k] ?? []) {
      if (x.thumb || !x.url || reg.thumbs[x.url] || missFresh(x.url) || need.has(x.url)) continue;
      const fu = fetchUrlOf(x.url);
      if (fu) need.set(x.url, { fu, date: String(x.date ?? ""), nb: /m\.blog\.naver\.com/.test(fu) });
    }
  }
  const todo = [...need].sort((a, b) => Number(b[1].nb) - Number(a[1].nb) || b[1].date.localeCompare(a[1].date)).slice(0, limit);
  console.log(`camps ${files.length} · 썸네일 없는 글 ${need.size} · 이번에 볼 글 ${todo.length}`);

  const robots = new Map();
  const allowed = async (fu) => {
    const u = new URL(fu);
    if (!robots.has(u.origin)) {
      robots.set(u.origin, (async () => {
        try {
          const r = await fetch(`${u.origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10000) });
          const t = r.ok ? await r.text() : "";
          return r.ok && !/<html/i.test(t) ? parseRobots(t) : [];
        } catch { return []; }
      })());
    }
    return robotsAllows(await robots.get(u.origin), u.pathname + u.search);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let done = 0, got = 0, blocked = 0;
  const save = () => writeFile(REG, `${JSON.stringify({ ...reg, updated_at: new Date().toISOString() })}\n`);
  const one = async (url, { fu }) => {
    try {
      if (!(await allowed(fu))) { blocked++; reg.miss[url] = new Date().toISOString().slice(0, 10); return; }
      const r = await fetch(fu, { headers: { "user-agent": UA, "accept-language": "ko" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      const html = r.ok && /html/i.test(r.headers.get("content-type") ?? "") ? (await r.text()).slice(0, 300000) : "";
      let og = ogImage(html);
      if (og && og.startsWith("//")) og = `https:${og}`;
      if (og && !badThumb(og)) { reg.thumbs[url] = hiRes(og); got++; } else if (r.ok || r.status === 404 || r.status === 410) reg.miss[url] = new Date().toISOString().slice(0, 10);
    } catch { /* 네트워크 오류는 다음 실행에서 다시 */ }
    if (++done % 500 === 0) { console.log(`${done}/${todo.length} · 찾음 ${got} · robots 차단 ${blocked}`); await save(); }
  };
  // 호스트별 줄: 호스트마다 동시 PER_HOST건, 건마다 GAP_MS 쉼. 여러 호스트는 함께 진행.
  const byHost = new Map();
  for (const [url, x] of todo) { const h = new URL(x.fu).host; (byHost.get(h) ?? byHost.set(h, []).get(h)).push([url, x]); }
  await Promise.all([...byHost.values()].map((q) => Promise.all(Array.from({ length: Math.min(PER_HOST, q.length) }, async () => {
    while (q.length) { const [url, x] = q.shift(); await one(url, x); await sleep(GAP_MS); }
  }))));
  await save();
  console.log(`끝 · 찾음 ${got} · robots 차단 ${blocked} · 기록 ${Object.keys(reg.thumbs).length}`);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `### 후기 썸네일 채우기(대표 이미지)\n\n- 썸네일 없는 글: ${need.size}\n- 이번에 본 글: ${todo.length}\n- 새로 찾음: ${got}\n- robots.txt로 열지 않음: ${blocked}\n- 누적 기록: ${Object.keys(reg.thumbs).length}\n`, { flag: "a" });
  if (apply) {
    let filled = 0;
    for (const f of files) {
      const d = JSON.parse(await readFile(CAMPS + f, "utf8")); let ch = false;
      for (const k of ["web", "reviews", "cafe"]) for (const x of d[k] ?? []) if (!x.thumb && reg.thumbs[x.url]) { x.thumb = reg.thumbs[x.url]; ch = true; filled++; }
      if (ch) await writeFile(CAMPS + f, JSON.stringify(d));
    }
    console.log(`상세 파일에 채움 ${filled}`);
  }
}
