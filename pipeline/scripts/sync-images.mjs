// 공식 캠핑장 이미지(고캠핑 대표 사진 + imageList)를 받아 webp(480/1280)로 변환해 MEDIA_DIR에 쌓는다.
// MEDIA_DIR은 워크플로에서 orphan 브랜치 `media`를 체크아웃한 폴더(main 이력에 이미지가 들어가지 않게). docs/IMAGE_PIPELINE.md 참고.
//
// 환경 변수
//   MEDIA_DIR               출력 루트(기본 pipeline/out/media)
//   CAMPGROUNDS_JSON        입력(기본 pipeline/out/campgrounds.json)
//   DATA_GO_KR_SERVICE_KEY  있으면 imageList 호출(없으면 대표 사진만)
//   IMAGE_LIST_MAX_CALLS    하루 imageList 호출 상한(기본 900; 0이면 캐시만)
//   IMAGE_MAX_DOWNLOADS     실행당 다운로드 상한(기본 1500; 며칠에 걸쳐 채움)
//   IMAGE_MAX_PER_CAMP      캠핑장당 imageList 추가 사진 상한(기본 6)
//   IMAGE_BUDGET_MB         camps/ 전체 용량 상한(기본 900MB, GitHub Pages 사이트 1GB 제한 안). 넘으면 새 다운로드 중단
//   IMAGE_MAX_BYTES         원본 1장 최대 바이트(기본 8MB, 넘으면 건너뜀)
//   IMAGE_PRUNE             "0"이면 매니페스트가 참조하지 않는 파일을 지우지 않음(기본 지움)
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";
import { GOCAMPING_BASE } from "../lib/gocamping.mjs";
import {
  DEFAULTS, IMAGE_CREDIT, candidateUrls, VARIANTS, desiredImages, downloadImage, hash8, heroIndex, mapLimit, mergeManifest,
  orphanFiles, parseImageListResponse, planDownloads, safeCampId, selectImageListTargets, variantPaths,
} from "../lib/images.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const envNum = (k, d) => { const n = Number(process.env[k]); return process.env[k] != null && process.env[k] !== "" && Number.isFinite(n) ? n : d; };
const warn = (t, m) => console.log(`::warning title=${t}::${m}`);

const MEDIA_DIR = resolve(process.env.MEDIA_DIR || here("../out/media"));
const CAMP_JSON = resolve(process.env.CAMPGROUNDS_JSON || here("../out/campgrounds.json"));
const CACHE_PATH = here("../.cache/gocamping-images.json");
const key = process.env.DATA_GO_KR_SERVICE_KEY;
const LIST_MAX = envNum("IMAGE_LIST_MAX_CALLS", DEFAULTS.imageListMaxCalls);
const MAX_DL = envNum("IMAGE_MAX_DOWNLOADS", DEFAULTS.maxDownloads);
const PER_CAMP = envNum("IMAGE_MAX_PER_CAMP", DEFAULTS.maxPerCamp);
const PRUNE = process.env.IMAGE_PRUNE !== "0";
const MAX_BYTES = envNum("IMAGE_MAX_BYTES", DEFAULTS.maxBytes);
const BUDGET = envNum("IMAGE_BUDGET_MB", 900) * 1024 * 1024;

/** MEDIA_DIR/camps 아래 파일 [{rel, size}] */
async function listMedia() {
  const files = [];
  const walk = async (dir) => {
    for (const d of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = join(dir, d.name);
      if (d.isDirectory()) await walk(p);
      else files.push({ rel: relative(MEDIA_DIR, p).split(sep).join("/"), size: (await stat(p)).size });
    }
  };
  await walk(join(MEDIA_DIR, "camps"));
  return files;
}

const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; } };
async function writeJsonAtomic(p, data, pretty = false) {
  await mkdir(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  await writeFile(tmp, pretty ? `${JSON.stringify(data, null, 1)}\n` : JSON.stringify(data));
  await rename(tmp, p);
}

if (!existsSync(CAMP_JSON)) { warn("이미지 동기화 건너뜀", `${CAMP_JSON} 없음`); process.exit(0); }
const { campgrounds = [] } = await readJson(CAMP_JSON, {});
await mkdir(MEDIA_DIR, { recursive: true });
const startedAt = new Date().toISOString();

// 1) imageList(캐시 30일, 하루 호출 상한)
const cache = await readJson(CACHE_PATH, {});
const ids = campgrounds.map((c) => safeCampId(c?.external_id?.id)).filter(Boolean);
if (key && LIST_MAX > 0) {
  const targets = selectImageListTargets(ids, cache, { maxCalls: LIST_MAX });
  let calls = 0, failed = 0;
  for (const id of targets) {
    const url = `${GOCAMPING_BASE}/imageList?${new URLSearchParams({ numOfRows: "30", pageNo: "1", MobileOS: "ETC", MobileApp: "moyeora-camping", _type: "json", contentId: id })}`;
    try {
      const { res } = await fetchDataGoKr(url, key, { timeoutMs: 20000 });
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status} ${text.slice(0, 120).replace(/\s+/g, " ")}`); }
      const images = parseImageListResponse(json);
      calls++;
      cache[id] = { fetched_at: new Date().toISOString(), images };
    } catch (e) {
      failed++;
      if (e.code === "QUOTA") { warn("고캠핑 imageList 일일 한도", e.message); break; }
      if (e.code === "DATA_GO_KR_UNREACHABLE") { warn("고캠핑 imageList 연결 실패", e.message); break; }
      if (failed <= 3) console.log(`  imageList ${id}: ${e.message}`);
      if (failed >= 20 && calls === 0) { warn("고캠핑 imageList 중단", "연속 실패"); break; }
    }
  }
  await writeJsonAtomic(CACHE_PATH, cache);
  console.log(`imageList: 호출 ${calls}건(실패 ${failed}), 대상 ${targets.length}건, 캐시 ${Object.keys(cache).length}곳`);
} else {
  console.log(`imageList: ${key ? "IMAGE_LIST_MAX_CALLS=0" : "인증키 없음"} → 캐시(${Object.keys(cache).length}곳)만 사용`);
}

// 2) 다운로드 계획
const manifestPath = join(MEDIA_DIR, "manifest.json");
const failuresPath = join(MEDIA_DIR, "failures.json");
const prev = await readJson(manifestPath, { camps: {} });
const failures = await readJson(failuresPath, {});
const desired = desiredImages(campgrounds, cache, { maxPerCamp: PER_CAMP });
const fileExists = (rel) => typeof rel === "string" && existsSync(join(MEDIA_DIR, rel));
const { jobs, pending, alreadyDone } = planDownloads(desired, prev, { fileExists, failures, maxDownloads: MAX_DL });
console.log(`원하는 사진 ${[...desired.values()].reduce((n, l) => n + l.length, 0)}장(${desired.size}곳), 이미 있음 ${alreadyDone}, 남은 ${pending}, 이번 실행 ${jobs.length}`);

// 3) 다운로드·변환(sharp는 여기서만 지연 로딩)
const results = new Map();
let ok = 0, bad = 0, written = 0, skippedBudget = 0;
let usedBytes = (await listMedia()).reduce((n, f) => n + f.size, 0);
console.log(`현재 용량 ${(usedBytes / 1048576).toFixed(1)}MB / 상한 ${(BUDGET / 1048576).toFixed(0)}MB`);
if (jobs.length) {
  let sharp;
  try { sharp = (await import("sharp")).default; } catch {
    console.error("sharp가 설치돼 있지 않습니다. pipeline에서 `npm i --no-save sharp` 또는 package.json 의존성 추가 후 다시 실행하세요.");
    process.exit(1);
  }
  sharp.cache(false);
  sharp.concurrency(1);
  await mapLimit(jobs, DEFAULTS.concurrency, async (job) => {
    if (usedBytes >= BUDGET) { skippedBudget++; return; }
    try {
      // 공식 1000px 파생본 → 원본 순으로 시도(404·용량 초과면 다음 후보).
      let buf, fetchedFrom, lastErr;
      for (const u of candidateUrls(job.src_url)) {
        try { buf = await downloadImage(u, { maxBytes: MAX_BYTES }); fetchedFrom = u; break; } catch (e) { lastErr = e; }
      }
      if (!buf) throw lastErr ?? new Error("후보 URL 없음");
      const h = hash8(buf);
      const paths = variantPaths(job.campId, h);
      const meta = await sharp(buf, { failOn: "error" }).metadata();
      if (!meta.width || !meta.height) throw new Error("이미지 크기를 읽을 수 없음");
      let w = 0, hgt = 0;
      for (const [name, v] of Object.entries(VARIANTS)) {
        const abs = join(MEDIA_DIR, paths[name]);
        if (existsSync(abs)) {
          if (name === "large") { const m = await sharp(abs).metadata(); w = m.width; hgt = m.height; }
          continue;
        }
        await mkdir(dirname(abs), { recursive: true });
        const info = await sharp(buf).rotate().resize({ width: v.width, withoutEnlargement: true }).webp({ quality: v.quality, effort: 5 }).toFile(`${abs}.tmp`); // 메타데이터(EXIF·GPS)는 기본으로 제거됨
        await rename(`${abs}.tmp`, abs);
        written++;
        usedBytes += info.size;
        if (name === "large") { w = info.width; hgt = info.height; }
      }
      results.set(job.src_url, { src_url: job.src_url, ...(fetchedFrom !== job.src_url ? { fetched_from: fetchedFrom } : {}), thumb: paths.thumb, large: paths.large, w, h: hgt, source: job.source, credit: IMAGE_CREDIT, checked_at: new Date().toISOString() });
      delete failures[job.src_url];
      ok++;
    } catch (e) {
      bad++;
      const f = failures[job.src_url] ?? { count: 0 };
      failures[job.src_url] = { count: f.count + 1, last_at: new Date().toISOString(), reason: String(e.message).slice(0, 120) };
      if (bad <= 5) console.log(`  실패 ${job.campId} ${job.src_url}: ${e.message}`);
    }
  });
}

// 4) 매니페스트·색인
const manifest = mergeManifest(prev, desired, results, { now: startedAt });
await writeJsonAtomic(manifestPath, manifest);
await writeJsonAtomic(join(MEDIA_DIR, "hero.json"), { generated_at: startedAt, credit: IMAGE_CREDIT, thumbs: heroIndex(manifest) });
// 원하는 목록에서 빠진 원본의 실패 기록은 버린다.
const wanted = new Set([...desired.values()].flatMap((l) => l.map((x) => x.src_url)));
for (const k of Object.keys(failures)) if (!wanted.has(k)) delete failures[k];
await writeJsonAtomic(failuresPath, failures);

// 5) 정리(매니페스트가 참조하지 않는 파일)
let pruned = 0;
if (PRUNE) {
  const files = (await listMedia()).map((f) => f.rel);
  for (const f of orphanFiles(manifest, files)) { await rm(join(MEDIA_DIR, f), { force: true }); pruned++; }
  for (const f of files.filter((x) => x.endsWith(".tmp"))) await rm(join(MEDIA_DIR, f), { force: true });
}

const total = Object.values(manifest.camps).reduce((n, l) => n + l.length, 0);
if (skippedBudget) warn("이미지 용량 상한", `IMAGE_BUDGET_MB에 닿아 ${skippedBudget}건을 건너뜀`);
console.log(`이미지: 성공 ${ok}, 실패 ${bad}, 새 파일 ${written}, 정리 ${pruned} → 매니페스트 ${Object.keys(manifest.camps).length}곳 ${total}장 (${MEDIA_DIR})`);
