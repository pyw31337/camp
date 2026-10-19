#!/usr/bin/env node
// 주변시설 실제 모습 사진(카카오 Daum 블로그 검색의 대표 썸네일, 이름 대조) → registry/nearby-photos.json
// 상세 주변시설 칸에 보이는 장소 중 사진이 없는 곳만, 여러 캠핑장에 걸친 장소부터 묻는다.
// 한도: Daum 검색은 종류별 일 20,000건 무료. 이 작업은 실행당 NEARBY_PHOTO_MAX_CALLS(기본 4,000) — 소셜 수집(blog·image 각 약 2천)과 합쳐도 절반 이하.
// 원칙: 썸네일 URL·원문 링크만 저장(내려받기·재호스팅 금지), 이름이 맞는 글만, 결과 없는 곳은 60일 뒤 다시.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { UNIQUE_KINDS, pickBlogPhoto, pickImagePhoto, placeKey } from "../lib/nearby-photos.mjs";
import { kakaoSearch } from "../lib/social-search.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const regPath = join(root, "pipeline/registry/nearby-photos.json");
const key = process.env.KAKAO_REST_API_KEY;
const MAX = Number(process.env.NEARBY_PHOTO_MAX_CALLS ?? 4000);
const MISS_DAYS = 60, KEEP_DAYS = 180;
if (!key) { console.log("KAKAO_REST_API_KEY 없음 — 건너뜁니다."); process.exit(0); }
if (process.env.NEARBY_PHOTOS_ENABLED === "off") { console.log("NEARBY_PHOTOS_ENABLED=off — 건너뜁니다."); process.exit(0); }

const camps = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const sggOf = new Map(camps.map((c) => [String(c.id), c.sigungu || c.sido || ""]));
const reg = existsSync(regPath) ? JSON.parse(readFileSync(regPath, "utf8")) : {};
reg.places ??= {};
const now = Date.now();
const due = (e) => !e || (e.none ? now - Date.parse(e.at) > MISS_DAYS * 864e5 : now - Date.parse(e.at) > KEEP_DAYS * 864e5);

// 화면에 보이는 장소(상세 nearbyHubHtml과 같은 범위)
const want = new Map();
for (const f of readdirSync(join(dataDir, "camps"))) {
  const id = f.replace(/\.json$/, "");
  let d; try { d = JSON.parse(readFileSync(join(dataDir, "camps", f), "utf8")); } catch { continue; }
  const n = d.nearby ?? {}, L = d.nearby_licensed ?? {};
  const add = (kind, x) => {
    const name = x?.name ?? x?.n;
    if (!name || !Number.isFinite(Number(x?.lat)) || x?.img) return;
    const k = placeKey(name, x.lat, x.lng);
    const w = want.get(k) ?? { name, kind, sgg: sggOf.get(id) ?? "", camps: 0 };
    w.camps++; want.set(k, w);
  };
  for (const [t, x] of Object.entries(L)) add(t, x);
  for (const k of ["conv", "mart", "medical", "vet", "rest", "fuel"]) (n[k] ?? []).slice(0, 2).forEach((x) => add(k, x));
  for (const k of ["tour", "food"]) (n[k] ?? []).slice(0, 4).forEach((x) => add(k, x));
}
const queue = [...want.entries()].filter(([k]) => due(reg.places[k])).sort((a, b) => b[1].camps - a[1].camps);
console.log(`주변 장소 ${want.size}곳(사진 없음) · 이번 대상 ${queue.length}곳 · 호출 상한 ${MAX}`);

let calls = 0, found = 0, miss = 0, stop = null;
const save = () => { reg.updated_at = new Date().toISOString(); writeFileSync(regPath, `${JSON.stringify(reg)}\n`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [k, w] of queue) {
  if (calls >= MAX) { stop = "호출 상한"; break; }
  const q = `${w.name} ${w.sgg}`.trim();
  try {
    calls++;
    let photo = pickBlogPhoto(await kakaoSearch("blog", q, { sort: "accuracy", size: 10 }, { key }), w.name);
    if (!photo && UNIQUE_KINDS.has(w.kind) && calls < MAX) { calls++; photo = pickImagePhoto(await kakaoSearch("image", q, { sort: "accuracy", size: 5 }, { key })); }
    reg.places[k] = photo ? { ...photo, at: new Date().toISOString() } : { none: 1, at: new Date().toISOString() };
    photo ? found++ : miss++;
  } catch (e) {
    if (e.code === "RATE_LIMIT" || e.code === "AUTH") { stop = `${e.code} ${String(e.message).slice(0, 120)}`; break; }
  }
  if ((found + miss) % 200 === 0) save();
  await sleep(60);
}
save();
const total = Object.values(reg.places).filter((e) => !e.none).length;
console.log(`사진 찾음 ${found} · 맞는 글 없음 ${miss} · 호출 ${calls}${stop ? ` · 중단: ${stop}` : ""} · 누적 사진 ${total}곳`);
