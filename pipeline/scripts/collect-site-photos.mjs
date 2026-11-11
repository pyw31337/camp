#!/usr/bin/env node
// 캠핑장 ‘상품(사이트 유형·구역)’별 사진 수집·판정·선정 (2026-11-11 소유자 t55:
// “업장별 사진뿐 아니라, 이제 업장별 상품들의 사진도 충분히 수집되어야 하는 단계야. 수집범위를 최대로 넓혀서 모든 수집 가능한 사진들을 모두 수집해줘.”)
//
// 1) 후보: 캠핑장마다 쓸 수 있는 공식 사진을 모두 모은다(사진 이름 키로 중복 제거).
//    - 운영자 홈페이지(registry/operator-site-photos.json, alt·바로 앞 글·쪽 이름 포함)
//    - 고캠핑 이용요금 블록 사진(gcd.guide[].images, 블록 제목 포함) · 고캠핑 사진 갤러리(gcd.photos) · 고캠핑 imageList(photos_remote)
//    - TourAPI 객실 사진(products[].photos, 객실 이름 포함) · TourAPI 상세 사진(tour_photos)
//    네이버·카카오 장소 사진, 캠핏, 땡큐캠핑 상품 사진, 인스타그램 프로필 수집은 약관·robots 때문에 쓰지 않는다.
//    공식 블로그 RSS(official_blog)는 robots 가 허용되고 registry/official-blog-photos.json 이 있을 때만 후보에 넣고, R2 에 다시 올리지 않는다(핫링크+출처, docs/SITE_PHOTOS.md).
// 2) 판정: CLIP 두 모델(base·large)이 같은 상품 부류(글램핑·카라반·객실/방갈로·노지 사이트)로 볼 때만 쓴다(lib/site-photo-classify.mjs).
//    글 단서(블록 제목·alt)가 유형을 말하면 그 유형을 먼저, 글이 지도·요금표·매점 등을 말하면 버린다. 저해상도·배너 비율은 버린다.
//    판정은 registry/site-photo-judgments.json에 쌓여 다시 받지 않는다(같은 RULE_VERSION).
// 3) 선정: 캠핑장에 실제로 있는 유형(c.st·site_types)에만, 유형당 최대 6장, 같은 사진(dHash ≤ 6)은 한 번만, 여러 캠핑장(3곳↑)에
//    똑같이 붙은 사진은 뺀다 → registry/site-photos.json (원본 주소·출처·쪽 주소·판정 점수). 파일 굽기는 bake-site-photos.mjs.
//
// 사용: node scripts/collect-site-photos.mjs [--only id,id] [--limit-camps N] [--max-judge N] [--select-only]
//   MEDIA_MANIFEST: media 브랜치 manifest.json 경로(있으면 고캠핑 원본 대신 이미 R2에 있는 사본을 받는다)
//   R2_PUBLIC_BASE: R2 공개 주소(기본: 사이트 배포 값)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { photoKey, dhash, hamming } from "../lib/photo-dedupe.mjs";
import { isDocOrLayoutPhoto } from "../lib/site-products.mjs";
import { isDocumentOrCertificate } from "../lib/image-document-filter.mjs";
import { LABELS, MODEL, RULE_VERSION, summarize, verdictFor } from "../lib/site-photo-classify.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const only = arg("--only", "") ? new Set(arg("--only", "").split(",")) : null;
const LIMIT_CAMPS = Number(arg("--limit-camps", 0)) || Infinity;
const MAX_JUDGE = Number(arg("--max-judge", process.env.SITE_PHOTO_MAX_JUDGE || 0)) || Infinity;
const TIME_BUDGET = Number(process.env.SITE_PHOTO_TIME_BUDGET_MIN || 0) * 60e3 || Infinity;
const SELECT_ONLY = flag("--select-only");
const R2 = (process.env.R2_PUBLIC_BASE || "https://pub-46b84a5cb8044697938f82dc0a10abb4.r2.dev").replace(/\/$/, "");
const MODEL_L = "Xenova/clip-vit-large-patch14";
const dataDir = join(root, "camping-atlas/public/explore/data");
const regDir = join(root, "pipeline/registry");
const judgPath = join(regDir, "site-photo-judgments.json");
const outPath = join(regDir, "site-photos.json");
const UA = "MoyeoraCampBot/1.0 (+https://github.com/[REDACTED]/camp; operator-published facts only)";
const PER_TYPE = 6;
const t0 = Date.now();

export const CREDIT = { gocamping: "한국관광공사 고캠핑", tourapi: "한국관광공사 TourAPI", operator: "캠핑장 공식 홈페이지", official_blog: "캠핑장 공식 블로그" };
const urlHash = (u) => createHash("sha256").update(String(u)).digest("hex").slice(0, 10);

// ---------- 입력 ----------
const catalog = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const byId = new Map(catalog.map((c) => [String(c.id), c]));
const opPath = join(regDir, "operator-site-photos.json");
const operator = existsSync(opPath) ? JSON.parse(readFileSync(opPath, "utf8")).campgrounds ?? {} : {};
const blogPath = join(regDir, "official-blog-photos.json");
const officialBlog = existsSync(blogPath) ? JSON.parse(readFileSync(blogPath, "utf8")).campgrounds ?? {} : {};
const cardsPath = join(regDir, "cards-deduped.json");
const cards = existsSync(cardsPath) ? JSON.parse(readFileSync(cardsPath, "utf8")).camps ?? {} : {};
const manifestPath = process.env.MEDIA_MANIFEST;
const r2Copy = new Map(); // 원본 photoKey → R2 경로
if (manifestPath && existsSync(manifestPath)) {
  const m = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const list of Object.values(m.camps ?? {})) for (const p of list ?? []) if (p.src_url && p.large) r2Copy.set(photoKey(p.src_url), p.large);
}
const J = existsSync(judgPath) ? JSON.parse(readFileSync(judgPath, "utf8")) : { v: RULE_VERSION, items: {} };
if (J.v !== RULE_VERSION) { J.v = RULE_VERSION; J.items = {}; }
J.models = [MODEL, MODEL_L];

const normUrl = (u) => String(u ?? "").trim().replace(/^http:\/\/(www\.)?gocamping\.or\.kr\//i, "https://gocamping.or.kr/").replace(/^https:\/\/www\.gocamping\.or\.kr\//i, "https://gocamping.or.kr/");
const gocampThumb = (u) => { const m = u.match(/^(https:\/\/gocamping\.or\.kr\/upload\/camp\/[^/]+\/)([^/]+\.(?:jpe?g|png|webp))$/i); return m ? `${m[1]}thumb/thumb_1000_${m[2]}` : null; };

function campTypes(c, d) {
  const set = new Set();
  for (const t of c?.st ?? []) if (t[0] && t[0] !== "PRIVATE_BATH") set.add(t[0]);
  for (const t of d?.site_types ?? []) if (t.code && t.code !== "PRIVATE_BATH") set.add(t.code);
  return [...set];
}

/** 캠핑장 하나의 후보 사진 목록 */
function candidatesOf(id, c, d) {
  const out = [], seen = new Set();
  const add = (raw, src, extra = {}) => {
    const u = normUrl(typeof raw === "string" ? raw : "");
    if (!/^https?:\/\//i.test(u)) return;
    const key = photoKey(u);
    if (!key || seen.has(key)) return;
    if (isDocOrLayoutPhoto(u, c, d) || isDocumentOrCertificate(u, c, d)) return;
    seen.add(key);
    out.push({ u, key, src, ...extra });
  };
  const op = operator[id];
  for (const im of op?.images ?? []) add(im.url, "operator", { cap: im.alt, ctx: [im.near, im.cap].filter(Boolean).join(" | "), page: im.page });
  // 공식 블로그 RSS 후보(robots 가 허용되어 모인 경우만). 파일은 받지 않고 주소·글 제목·글 주소만. 화면은 핫링크+출처.
  for (const im of officialBlog[id]?.images ?? []) add(im.url, "official_blog", { cap: im.cap, page: im.page, hotlink: true });
  // 고캠핑 이용요금 블록 사진은 블록 제목(예: ‘오토캠핑’)과 다른 매점·개수대 사진도 섞여 있어 제목을 약한 단서(ctx)로만 쓴다.
  for (const g of d.gcd?.guide ?? []) for (const im of g.images ?? []) add(im, "gocamping", { ctx: g.title, page: d.gcd?.url });
  for (const p of d.products ?? []) for (const im of p.photos ?? []) add(im, "tourapi", { cap: p.name });
  for (const im of d.tour_photos ?? []) add(im, "tourapi");
  for (const im of d.gcd?.photos ?? []) add(im, "gocamping", { page: d.gcd?.url });
  for (const im of d.photos_remote ?? []) add(im, "gocamping", { page: `https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=${id}` });
  for (const x of out) {
    const r2 = r2Copy.get(x.key) ?? (cards[id] ?? []).find((f) => f.includes(`/${urlHash(x.u)}.webp`)) ?? (cards[id] ?? []).find((f) => f.includes(`/${urlHash(x.u.replace("https://gocamping.or.kr/", "https://www.gocamping.or.kr/"))}.webp`));
    if (r2) x.r2 = r2;
  }
  return out;
}

// ---------- 내려받기(호스트별 1.1초 간격, R2는 간격 없음) ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostNext = new Map();
async function fetchBuf(url) {
  const h = new URL(url).hostname;
  if (!h.endsWith("r2.dev")) {
    for (;;) { const t = hostNext.get(h) ?? 0; if (Date.now() >= t) break; await sleep(t - Date.now() + Math.random() * 50); }
    hostNext.set(h, Date.now() + 1100);
  }
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "image/*" }, signal: ctl.signal, redirect: "follow" });
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.permanent = r.status === 404 || r.status === 410 || r.status === 403; throw e; }
    const len = Number(r.headers.get("content-length") || 0);
    if (len > 15_000_000) throw Object.assign(new Error("too large"), { permanent: true });
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(timer); }
}

// ---------- 판정 ----------
async function loadJudges() {
  const tf = await import("@huggingface/transformers");
  tf.env.cacheDir = process.env.HF_CACHE || join(root, "pipeline/.cache/hf");
  const b = await tf.pipeline("zero-shot-image-classification", MODEL, { dtype: "fp32" });
  const l = await tf.pipeline("zero-shot-image-classification", MODEL_L, { dtype: "fp32" });
  return { tf, b, l };
}

async function judgeAll(jobs) {
  if (!jobs.length) return;
  const { default: sharp } = await import("sharp");
  const { tf, b, l } = await loadJudges();
  console.log(`판정기 준비 ${(Date.now() - t0) / 1000 | 0}초 · 판정할 사진 ${jobs.length}장`);
  let judged = 0, failed = 0;
  const ready = []; let producersDone = 0;
  // 호스트 줄(lane): 고캠핑·관광공사 서버는 한 줄로 1.1초 간격, 나머지(R2·운영자 홈페이지 여러 곳)는 여러 줄로 나눠 받는다.
  const laneOf = (j) => (j.r2 ? "fast" : /gocamping\.or\.kr/.test(j.u) ? "gocamping" : /visitkorea\.or\.kr/.test(j.u) ? "tour" : "fast");
  const lanes = { gocamping: [], tour: [], fast: [] };
  for (const j of jobs) lanes[laneOf(j)].push(j);
  console.log(`  받을 곳: R2·운영자 ${lanes.fast.length} · 고캠핑 ${lanes.gocamping.length} · 관광공사 ${lanes.tour.length}`);
  const plan = [["gocamping", 1], ["tour", 1], ["fast", 8]];
  const PROD = plan.reduce((n, [, k]) => n + k, 0);
  const cursor = { gocamping: 0, tour: 0, fast: 0 };
  const producer = async (lane) => {
    const list = lanes[lane];
    while (cursor[lane] < list.length) {
      if (Date.now() - t0 > TIME_BUDGET) break;
      while (ready.length > 40) await sleep(100);
      const j = list[cursor[lane]++];
      if (!j) break;
      const urls = j.r2 ? [`${R2}/${j.r2}`] : [gocampThumb(j.u), j.u].filter(Boolean);
      let buf = null, err = null;
      for (const u of urls) { try { buf = await fetchBuf(u); break; } catch (e) { err = e; } }
      if (!buf) { J.items[j.key] = { err: String(err?.message ?? err).slice(0, 40), perm: Boolean(err?.permanent), at: new Date().toISOString().slice(0, 10) }; failed++; continue; }
      ready.push({ j, buf });
    }
    producersDone++;
  };
  const consumer = async () => {
    let lastSave = Date.now();
    for (;;) {
      if (!ready.length) { if (producersDone === PROD) break; await sleep(50); continue; }
      const { j, buf } = ready.shift();
      try {
        const meta = await sharp(buf).metadata();
        const w = meta.autoOrient?.width ?? meta.width, h = meta.autoOrient?.height ?? meta.height;
        const h64 = await dhash(buf);
        const entry = { w, h, d: h64, at: new Date().toISOString().slice(0, 10) };
        if (!(w >= 400 && h >= 260) || w / h > 2.6 || w / h < 0.5) entry.skip = "size";
        else {
          const small = await sharp(buf).rotate().resize({ width: 448, height: 448, fit: "inside" }).jpeg({ quality: 88 }).toBuffer();
          const img = await tf.RawImage.fromBlob(new Blob([small]));
          entry.b = summarize(await b(img, LABELS));
          // 작은 모델이 상품 사진이 아니라고 뚜렷하게 보면(사이트 부류 합 < 0.25) 큰 모델은 돌리지 않는다 — 두 모델이 같은 부류여야만 쓰므로 결과가 같다.
          if (entry.b.site >= 0.25) entry.l = summarize(await l(img, LABELS)); else entry.lskip = 1;
        }
        J.items[j.key] = entry;
        judged++;
      } catch (e) { J.items[j.key] = { err: String(e.message).slice(0, 40), perm: true, at: new Date().toISOString().slice(0, 10) }; failed++; }
      if (judged % 200 === 0 && judged) console.log(`  판정 ${judged}/${jobs.length} · 실패 ${failed} · ${((Date.now() - t0) / 60000).toFixed(1)}분`);
      if (Date.now() - lastSave > 120000) { saveJ(); lastSave = Date.now(); }
    }
  };
  await Promise.all([...plan.flatMap(([lane, k]) => Array.from({ length: k }, () => producer(lane))), consumer()]);
  saveJ();
  console.log(`판정 끝: ${judged}장 · 실패 ${failed}장`);
}
function saveJ() { J.generated_at = new Date().toISOString(); writeFileSync(`${judgPath}.tmp`, JSON.stringify(J)); renameSync(`${judgPath}.tmp`, judgPath); }

// ---------- 선정 ----------
function select(all) {
  // 여러 캠핑장(3곳↑)에 똑같이 붙은 사진(체인 공통·‘사진 준비중’·오매칭) 거르기
  const hashCamps = new Map();
  for (const { id, cands } of all) for (const x of cands) { const d = J.items[x.key]?.d; if (d) { if (!hashCamps.has(d)) hashCamps.set(d, new Set()); hashCamps.get(d).add(id); } }
  const stock = new Set([...hashCamps].filter(([, s]) => s.size >= 3).map(([d]) => d));
  const camps = {}, why = {};
  let nPhotos = 0;
  for (const { id, cands, types } of all) {
    const picked = [];
    for (const x of cands) {
      const ent = J.items[x.key];
      const v = verdictFor(x, ent, types);
      if (v.no) { why[v.no] = (why[v.no] ?? 0) + 1; continue; }
      if (stock.has(ent.d)) { why.stock = (why.stock ?? 0) + 1; continue; }
      picked.push({ x, v, ent });
    }
    picked.sort((a, b) => (b.v.by === "caption+image") - (a.v.by === "caption+image") || a.v.in - b.v.in || (b.x.src === "operator") - (a.x.src === "operator") || b.v.s - a.v.s || (b.ent.w ?? 0) - (a.ent.w ?? 0));
    const hashes = [], byType = {};
    for (const p of picked) {
      if (hashes.some((h) => hamming(h, p.ent.d) <= 6)) { why.dup = (why.dup ?? 0) + 1; continue; }
      const list = (byType[p.v.type] ??= []);
      if (list.length >= PER_TYPE) continue;
      hashes.push(p.ent.d);
      list.push({
        u: p.x.u, k: urlHash(p.x.u), src: p.x.src, ...(p.x.r2 ? { r2: p.x.r2 } : {}), ...(p.x.page ? { page: p.x.page } : {}),
        ...(p.x.cap ? { cap: String(p.x.cap).slice(0, 80) } : {}), cls: p.v.cls, s: p.v.s, by: p.v.by,
        ...(p.v.floor ? { f: p.v.floor } : {}), ...(p.v.in ? { in: 1 } : {}), w: p.ent.w, h: p.ent.h,
      });
    }
    if (Object.keys(byType).length) { camps[id] = byType; nPhotos += Object.values(byType).reduce((n, l) => n + l.length, 0); }
  }
  return { camps, why, nPhotos, stock: stock.size };
}

// ---------- 실행 ----------
const all = [];
for (const f of readdirSync(join(dataDir, "camps"))) {
  const id = f.replace(/\.json$/, "");
  if (only && !only.has(id)) continue;
  const c = byId.get(id);
  if (!c) continue;
  const d = JSON.parse(readFileSync(join(dataDir, "camps", f), "utf8"));
  const types = campTypes(c, d);
  if (!types.length) continue;
  const cands = candidatesOf(id, c, d);
  if (cands.length) all.push({ id, types, cands });
  if (all.length >= LIMIT_CAMPS) break;
}
const nCand = all.reduce((n, x) => n + x.cands.length, 0);
console.log(`대상: 유형이 있는 캠핑장 ${all.length}곳 · 후보 사진 ${nCand}장 (R2 사본 ${all.reduce((n, x) => n + x.cands.filter((c) => c.r2).length, 0)}장)`);

if (!SELECT_ONLY) {
  const fresh = (k) => { const e = J.items[k]; return e && (!e.err || e.perm || Date.now() - Date.parse(e.at) < 7 * 864e5); };
  // R2 사본(빠름)을 먼저, 그다음 글 단서가 있는 후보, 나머지 순서. 캠핑장 사이를 번갈아 돌려 한 곳에 몰리지 않게 한다.
  const queue = [];
  const seenK = new Set();
  const lists = all.map((x) => x.cands.filter((c) => !fresh(c.key)));
  for (let round = 0; ; round++) {
    let any = false;
    for (const l of lists) if (l[round]) { any = true; if (!seenK.has(l[round].key)) { seenK.add(l[round].key); queue.push(l[round]); } }
    if (!any) break;
  }
  queue.sort((a, b) => Boolean(b.r2) - Boolean(a.r2) || Boolean(b.cap) - Boolean(a.cap));
  await judgeAll(queue.slice(0, MAX_JUDGE));
}

const sel = select(all);
const typeCount = {};
for (const t of Object.values(sel.camps)) for (const [k, l] of Object.entries(t)) typeCount[k] = (typeCount[k] ?? 0) + (l.length ? 1 : 0);
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : null;
// 이번 실행에 들지 않은 캠핑장(--only·--limit-camps)은 지난 선정을 그대로 둔다. 든 곳은 같은 판정 캐시로 다시 고른다
// (선정은 판정 캐시에서 다시 만드는 파생값이다 — 판정 캐시 자체는 지우지 않는다).
const merged = { ...(prev?.camps ?? {}) };
for (const { id } of all) { if (sel.camps[id]) merged[id] = sel.camps[id]; else delete merged[id]; }
const out = {
  note: "캠핑장 상품(사이트 유형)별 사진 선정. 원본 주소·출처·쪽 주소·판정 점수. bake-site-photos.mjs가 webp로 굽고 색인(site-photos-index.json)을 만든다.",
  generated_at: new Date().toISOString(), rule: RULE_VERSION, models: [MODEL, MODEL_L], credit: CREDIT,
  stats: { camps: Object.keys(merged).length, photos: Object.values(merged).reduce((n, t) => n + Object.values(t).reduce((m, l) => m + l.length, 0), 0), candidates: nCand, rejected: sel.why, stock_hashes: sel.stock, camps_by_type: typeCount },
  camps: merged,
};
writeFileSync(outPath, JSON.stringify(out) + "\n");
console.log(`선정: ${out.stats.camps}곳 · ${out.stats.photos}장 · 유형별 캠핑장 ${JSON.stringify(typeCount)} · 버림 ${JSON.stringify(sel.why)} · 공통 사진 ${sel.stock}`);
