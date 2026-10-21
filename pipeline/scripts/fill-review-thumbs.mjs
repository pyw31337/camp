// 방문후기 썸네일 채우기(소유자 2026-10-21): 네이버 검색 API ‘웹 언급’ 글은 썸네일이 없다.
// 블로그 글의 대표 이미지(og:image)를 읽어 고화질 주소(postfiles …?type=w773)로 바꿔 ‘비어 있을 때만’ 채운다.
// 데이터 정책: 지우거나 덮지 않는다(fill only). 결과는 pipeline/registry/review-thumbs.json(url→thumb)에 쌓고,
// --apply 면 발행된 상세 파일(camps/*.json)의 빈 thumb 에도 넣는다. build-explore-data 가 같은 기록을 다시 붙인다.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const p = (x) => fileURLToPath(new URL(x, import.meta.url));
const REG = p("../registry/review-thumbs.json");
const CAMPS = p("../../camping-atlas/public/explore/data/camps/");
const apply = process.argv.includes("--apply");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? Infinity);
const reg = await readFile(REG, "utf8").then(JSON.parse).catch(() => ({ updated_at: null, thumbs: {}, miss: {} }));
export const hiRes = (u) => {
  if (!u) return u;
  // 네이버 블로그 썸네일(blogthumb …?type=w2)은 같은 경로의 postfiles 에서 큰 크기로 받을 수 있다.
  const m = String(u).match(/^https?:\/\/(?:blogthumb|postfiles|mblogthumb-phinf)\.pstatic\.net(\/[^?]+)/);
  if (m) return `https://postfiles.pstatic.net${m[1]}?type=w773`;
  return String(u).replace(/^http:/, "https:");
};
const blogKey = (url) => { const m = String(url).match(/blog\.naver\.com\/([\w-]+)\/(\d+)/); return m ? `https://m.blog.naver.com/${m[1]}/${m[2]}` : null; };
const files = (await readdir(CAMPS)).filter((f) => f.endsWith(".json"));
const need = new Set();
for (const f of files) {
  const d = JSON.parse(await readFile(CAMPS + f, "utf8"));
  for (const k of ["web", "reviews", "cafe"]) for (const x of d[k] ?? []) if (!x.thumb && x.url && blogKey(x.url) && !reg.thumbs[x.url] && !reg.miss[x.url]) need.add(x.url);
}
const todo = [...need].slice(0, limit);
console.log(`camps ${files.length} · 새로 찾을 글 ${todo.length}`);
let done = 0, got = 0;
const one = async (url) => {
  try {
    const r = await fetch(blogKey(url), { headers: { "user-agent": "Mozilla/5.0 (compatible; camp-atlas thumbnail bot)" }, signal: AbortSignal.timeout(15000) });
    const html = r.ok ? await r.text() : "";
    const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    if (og && !/blogpfthumb|profile|default/i.test(og)) { reg.thumbs[url] = hiRes(og); got++; } else reg.miss[url] = new Date().toISOString().slice(0, 10);
  } catch { /* 다음 실행에서 다시 */ }
  if (++done % 500 === 0) { console.log(`${done}/${todo.length} · 찾음 ${got}`); await save(); }
};
const save = () => writeFile(REG, `${JSON.stringify({ ...reg, updated_at: new Date().toISOString() })}\n`);
const queue = [...todo];
await Promise.all(Array.from({ length: 10 }, async () => { while (queue.length) await one(queue.shift()); }));
await save();
console.log(`끝 · 찾음 ${got} · 기록 ${Object.keys(reg.thumbs).length}`);
if (apply) {
  let filled = 0;
  for (const f of files) {
    const d = JSON.parse(await readFile(CAMPS + f, "utf8")); let ch = false;
    for (const k of ["web", "reviews", "cafe"]) for (const x of d[k] ?? []) if (!x.thumb && reg.thumbs[x.url]) { x.thumb = reg.thumbs[x.url]; ch = true; filled++; }
    if (ch) await writeFile(CAMPS + f, JSON.stringify(d));
  }
  console.log(`상세 파일에 채움 ${filled}`);
}
