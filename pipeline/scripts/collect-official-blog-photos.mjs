#!/usr/bin/env node
// 공식 네이버 블로그 상품 사진 후보(2026-11-11 t60).
// 공개 RSS(rss.blog.naver.com/<id>.xml)를 쓰려 했으나, 2026-11-11 확인 시점의 robots.txt 가
// User-agent: * Disallow: / 이라 로봇으로는 받지 않는다. 이 스크립트는 robots 를 먼저 읽고,
// 막혀 있으면 후보를 모으지 않은 채 이유를 기록한다. 허용으로 바뀌면 글 제목·주소·사진 주소만
// registry/official-blog-photos.json 에 남기고(파일은 받지 않음) collect-site-photos 가
// 출처 official_blog 로 판정 큐에 넣는다. 화면에는 원문 핫링크+출처만(R2 재호스팅 안 함).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRobots, robotsAllows } from "../lib/operator-site.mjs";
import { parseRss, LEGAL } from "../lib/official-channels.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const UA = "MoyeoraCampBot/1.0 (+https://github.com/pyw31337/camp; official blog RSS if robots allow)";
const regDir = join(root, "pipeline/registry");
const outPath = join(regDir, "official-blog-photos.json");
const force = process.argv.includes("--force"); // 문서화용. robots 를 무시하지 않는다.

const chPath = join(regDir, "official-channels.json");
if (!existsSync(chPath)) {
  console.error("먼저 discover-official-channels.mjs 를 실행하세요.");
  process.exit(1);
}
const channels = JSON.parse(readFileSync(chPath, "utf8"));
const blogs = [];
for (const [id, e] of Object.entries(channels.camps ?? {})) {
  for (const ch of e.channels ?? []) {
    if (ch.verified && ch.type === "naver_blog" && ch.id) blogs.push({ campId: id, name: e.name, blogId: ch.id, url: ch.url });
  }
}

const origin = "https://rss.blog.naver.com";
let robotsTxt = "";
try {
  const r = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  robotsTxt = r.ok ? await r.text() : "";
} catch (e) {
  console.error("robots.txt 를 읽지 못했습니다:", e.message);
  process.exit(1);
}
const rules = parseRobots(robotsTxt);
const allowed = robotsAllows(rules, "/seonjangnoel.xml") && robotsAllows(rules, "/example.xml");
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : { campgrounds: {} };

const out = {
  note: "공식 네이버 블로그 RSS 사진 후보(주소·글 제목·글 주소만). robots 가 막으면 비어 있다.",
  generated_at: new Date().toISOString(),
  legal: LEGAL.official_blog,
  robots_allowed: allowed,
  robots_excerpt: robotsTxt.split(/\n/).slice(0, 8).join("\n"),
  verified_blogs: blogs.length,
  campgrounds: { ...prev.campgrounds },
};

if (!allowed) {
  out.skipped = "rss.blog.naver.com robots.txt User-agent: * Disallow: / — RSS를 받지 않음.";
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`공식 블로그 ${blogs.length}곳 확인됨. robots 가 RSS를 막아 사진을 모으지 않음. ${outPath}`);
  if (force) console.error("--force 는 robots 를 우회하지 않습니다.");
  process.exit(0);
}

// 아래는 robots 가 허용할 때만 실행된다.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fetched = 0, photos = 0;
for (const b of blogs) {
  if (!robotsAllows(rules, `/${b.blogId}.xml`)) continue;
  await sleep(1100);
  try {
    const r = await fetch(`${origin}/${b.blogId}.xml`, { headers: { "user-agent": UA, accept: "application/rss+xml,application/xml,text/xml" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) continue;
    const rss = parseRss(await r.text());
    const images = [];
    const seen = new Set();
    for (const item of rss.items) for (const u of item.images) {
      if (seen.has(u)) continue;
      seen.add(u);
      images.push({ url: u, cap: item.title, page: item.link, src: "official_blog" });
    }
    out.campgrounds[b.campId] = {
      blog: b.url, blog_title: rss.title, checked_at: new Date().toISOString().slice(0, 10), images,
    };
    fetched++; photos += images.length;
  } catch {}
}
out.stats = { blogs_fetched: fetched, photos };
writeFileSync(outPath, JSON.stringify(out) + "\n");
console.log(`RSS 허용 · ${fetched}곳 · 사진 후보 ${photos}장`);
