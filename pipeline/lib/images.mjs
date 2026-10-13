// 공식 캠핑장 이미지(한국관광공사 고캠핑 firstImageUrl·imageList)를 webp 파생본으로 자체 호스팅하기 위한 순수 함수 모음.
// 네트워크·sharp는 scripts/sync-images.mjs에서만 쓴다(테스트는 이 파일만 불러 네트워크·sharp 없이 돈다).
// 권리 조건과 금지 사항은 docs/IMAGE_PIPELINE.md 참고. 공식 호스트가 아닌 URL(인스타그램·블로그 등)은 받지 않는다.

import { createHash } from "node:crypto";

export const IMAGE_CREDIT = "한국관광공사 고캠핑";
export const LICENSE_NOTE =
  "캠핑장 사진 출처: 한국관광공사 고캠핑(gocamping.or.kr) — 공공데이터포털 '한국관광공사_고캠핑 정보 조회서비스'(data.go.kr/data/15101933) 제공 이미지를 " +
  "축소·webp 변환만 하여 게시. 사진의 저작권은 한국관광공사 및 각 캠핑장 운영자에게 있으며, 피사체 명예훼손·인격권 침해 용도와 기업 CI/BI 이용을 금지한다.";

export const VARIANTS = Object.freeze({
  thumb: { suffix: "t", width: 480, quality: 60 },
  large: { suffix: "l", width: 1280, quality: 70 },
});

export const DEFAULTS = Object.freeze({
  concurrency: 4,
  timeoutMs: 20000,
  maxBytes: 8 * 1024 * 1024,
  maxDownloads: 1500,
  imageListMaxCalls: 900,
  imageListTtlDays: 30,
  maxPerCamp: 6, // imageList 추가 사진 상한(대표 사진 제외)
  failureRetryDays: 7,
});

// 공식 출처 호스트만 허용. 고캠핑 업로드 서버와 한국관광공사 관광정보 이미지 서버.
const OFFICIAL_HOSTS = [/^(www\.)?gocamping\.or\.kr$/i, /(^|\.)visitkorea\.or\.kr$/i];

export function isOfficialImageUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && OFFICIAL_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** http → https 로 정규화(고캠핑 업로드 서버는 https 제공). 공백 제거. */
export function normalizeSrcUrl(url) {
  const s = String(url ?? "").trim();
  if (!s) return null;
  return s.replace(/^http:\/\/(www\.)?gocamping\.or\.kr\//i, "https://gocamping.or.kr/");
}

/**
 * 내려받기 후보 URL(앞에서부터 시도). 고캠핑 업로드 원본(/upload/camp/{id}/{file})은 5~10MB인 경우가 많아,
 * 고캠핑이 직접 만들어 둔 1000px 파생본(/upload/camp/{id}/thumb/thumb_1000_{file})이 있으면 그것을 먼저 받는다.
 */
export function candidateUrls(src) {
  const u = normalizeSrcUrl(src);
  if (!u) return [];
  const m = u.match(/^(https:\/\/gocamping\.or\.kr\/upload\/camp\/[^/]+\/)([^/]+\.(?:jpe?g|png|webp))$/i);
  return m ? [`${m[1]}thumb/thumb_1000_${m[2]}`, u] : [u];
}

/** 원본 바이트의 sha256 앞 8자. 같은 원본이면 같은 파일명 → 다시 쓰지 않는다. */
export function hash8(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

/** 디렉터리 이름에 쓸 수 있는 캠핑장 ID(숫자·영문·-_만). 아니면 null. */
export function safeCampId(id) {
  const s = String(id ?? "").trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : null;
}

/** MEDIA_DIR 기준 상대 경로. 매니페스트·웹은 이 상대 경로를 쓴다(웹 경로는 `${base}media/${path}`). */
export function variantPaths(campId, hash) {
  const id = safeCampId(campId);
  if (!id) throw new Error(`잘못된 캠핑장 ID: ${campId}`);
  if (!/^[0-9a-f]{8}$/.test(hash)) throw new Error(`잘못된 해시: ${hash}`);
  return {
    thumb: `camps/${id}/${hash}-${VARIANTS.thumb.suffix}.webp`,
    large: `camps/${id}/${hash}-${VARIANTS.large.suffix}.webp`,
  };
}

/** 확대하지 않는 목표 크기(가로 기준). */
export function fitWidth(srcW, srcH, maxW) {
  if (!(srcW > 0) || !(srcH > 0)) return null;
  const w = Math.min(srcW, maxW);
  return { w, h: Math.max(1, Math.round((srcH * w) / srcW)) };
}

/**
 * 고캠핑 imageList 응답 → [{imageUrl, serialnum, createdtime, modifiedtime}]
 * 결과 없음은 body.items가 "" 이거나 totalCount 0. 오류 코드면 예외(code 속성 포함).
 */
export function parseImageListResponse(json) {
  const header = json?.response?.header;
  const code = header?.resultCode;
  if (code && code !== "0000" && code !== "00") {
    const err = new Error(`고캠핑 imageList 오류 ${code}: ${header.resultMsg ?? ""}`);
    err.code = code === "22" || /LIMITED_NUMBER|EXCEEDS/i.test(header.resultMsg ?? "") ? "QUOTA" : "API";
    throw err;
  }
  // data.go.kr 게이트웨이 오류는 OpenAPI_ServiceResponse 형태로 온다.
  const gw = json?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gw) {
    const err = new Error(`data.go.kr 오류 ${gw.returnReasonCode}: ${gw.returnAuthMsg ?? gw.errMsg ?? ""}`);
    err.code = String(gw.returnReasonCode) === "22" ? "QUOTA" : "API";
    throw err;
  }
  const raw = json?.response?.body?.items?.item;
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const seen = new Set();
  const out = [];
  for (const it of arr) {
    const url = normalizeSrcUrl(it?.imageUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ imageUrl: url, serialnum: it.serialnum != null ? String(it.serialnum) : null, createdtime: it.createdtime ?? null, modifiedtime: it.modifiedtime ?? null });
  }
  return out;
}

const ageDays = (iso, now) => (iso ? (now - Date.parse(iso)) / 864e5 : Infinity);

/**
 * imageList를 새로 불러야 할 캠핑장 ID(캐시 없음 → 오래된 순), 최대 maxCalls개.
 * priorityIds에 넣은 ID는 같은 캐시 상태라면 먼저 조회한다. 매니페스트에 사진이
 * 없는 시설을 먼저 보강할 때 사용한다.
 * cache: { [id]: { fetched_at, images: [...] } }
 */
export function selectImageListTargets(campIds, cache, {
  now = Date.now(), maxCalls = DEFAULTS.imageListMaxCalls, ttlDays = DEFAULTS.imageListTtlDays, priorityIds = [],
} = {}) {
  if (!(maxCalls > 0)) return [];
  const priority = new Set(priorityIds.map(safeCampId).filter(Boolean));
  const seen = new Set();
  const stale = campIds
    .filter((id) => {
      if (!safeCampId(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => ({ id, age: ageDays(cache?.[id]?.fetched_at, now) }))
    .filter((x) => !(x.age <= ttlDays));
  stale.sort((a, b) => {
    const priorityDiff = Number(priority.has(b.id)) - Number(priority.has(a.id));
    return priorityDiff || b.age - a.age;
  }); // 우선 보강 대상 → 캐시 없음 → 오래된 순. 같은 순위는 입력 순서를 유지한다.
  return stale.slice(0, maxCalls).map((x) => x.id);
}

/**
 * 캠핑장마다 원하는 원본 목록(순서 = 표시 순서): 대표 사진(firstImageUrl) 다음 imageList 사진 maxPerCamp장.
 * @returns {Map<string, Array<{src_url, source}>>}
 */
export function desiredImages(campgrounds, imageListCache = {}, {
  maxPerCamp = DEFAULTS.maxPerCamp,
  // 0이면 전체 갤러리를 원한다. 1이면 대표 1장(대표가 없으면 imageList 첫 사진)만
  // 남겨 초기 전국 커버리지를 먼저 완성한다.
  maxTotalPerCamp = 0,
} = {}) {
  const out = new Map();
  for (const c of campgrounds) {
    const id = safeCampId(c?.external_id?.id);
    if (!id) continue;
    const list = [];
    const seen = new Set();
    const hero = normalizeSrcUrl(c.hero_image_url);
    if (hero && isOfficialImageUrl(hero)) { list.push({ src_url: hero, source: "gocamping" }); seen.add(hero); }
    let extra = 0;
    for (const img of imageListCache?.[id]?.images ?? []) {
      if (extra >= maxPerCamp || (maxTotalPerCamp > 0 && list.length >= maxTotalPerCamp)) break;
      const u = normalizeSrcUrl(img.imageUrl);
      if (!u || seen.has(u) || !isOfficialImageUrl(u)) continue;
      seen.add(u);
      list.push({ src_url: u, source: "gocamping-imageList" });
      extra++;
    }
    if (list.length) out.set(id, list);
  }
  return out;
}

/**
 * 이번 실행에서 받을 작업. 이미 매니페스트에 있고 파일이 있는 원본은 건너뛴다.
 * 우선순위: (1) 사진이 하나도 없는 캠핑장의 대표 사진 (2) 나머지 대표 사진 (3) imageList 추가 사진(순번이 앞선 것 먼저).
 * failures: { [src_url]: { last_at, count } } — failureRetryDays 안에는 재시도하지 않는다.
 */
export function planDownloads(desired, manifest, { fileExists = () => true, failures = {}, now = Date.now(), maxDownloads = DEFAULTS.maxDownloads, failureRetryDays = DEFAULTS.failureRetryDays } = {}) {
  const done = new Set();
  for (const entries of Object.values(manifest?.camps ?? {})) {
    for (const e of entries) if (fileExists(e.thumb) && fileExists(e.large)) done.add(e.src_url);
  }
  const jobs = [];
  for (const [id, list] of desired) {
    const hasAny = (manifest?.camps?.[id] ?? []).some((e) => done.has(e.src_url));
    list.forEach((img, i) => {
      if (done.has(img.src_url)) return;
      if (ageDays(failures[img.src_url]?.last_at, now) < failureRetryDays) return;
      // 대표 URL이 없는 시설도 imageList의 첫 사진이면 최우선으로 보강한다.
      const tier = hasAny ? (img.source === "gocamping" ? 1 : 3) : (i === 0 ? 0 : 2);
      jobs.push({ campId: id, ...img, tier, order: i });
    });
  }
  jobs.sort((a, b) => a.tier - b.tier || a.order - b.order);
  return { jobs: jobs.slice(0, Math.max(0, maxDownloads)), pending: jobs.length, alreadyDone: done.size };
}

/**
 * 매니페스트 병합. desired에 있는 캠핑장·원본만 남기고 desired 순서로 정렬한다.
 * results: Map<src_url, entry>(이번 실행 결과). 이전 매니페스트 항목은 그대로 재사용.
 */
export function mergeManifest(prev, desired, results, {
  now = new Date().toISOString(),
  licenseNote = LICENSE_NOTE,
  // imageList는 30일 캐시라 한 실행에서 모든 시설의 추가 사진을 알 수 없다. 이 값을
  // 켜면 이번에 확인하지 않은 기존 공식 사진은 유지하고, 실제로 재조회한 시설에서
  // 사라진 imageList 항목만 정리한다.
  preserveUnseen = false,
  refreshedImageListIds = [],
} = {}) {
  const prevBySrc = new Map();
  for (const entries of Object.values(prev?.camps ?? {})) for (const e of entries) prevBySrc.set(e.src_url, e);
  const camps = {};
  const refreshed = new Set(refreshedImageListIds.map(safeCampId).filter(Boolean));
  const ids = new Set(desired.keys());
  if (preserveUnseen) for (const id of Object.keys(prev?.camps ?? {})) ids.add(id);
  for (const id of ids) {
    const list = desired.get(id) ?? [];
    const entries = [];
    for (const img of list) {
      const e = results.get(img.src_url) ?? prevBySrc.get(img.src_url);
      if (!e) continue;
      // 같은 원본이 다른 캠핑장 경로에 저장돼 있으면(드묾) 재사용하지 않는다.
      if (!e.thumb?.startsWith(`camps/${id}/`)) continue;
      entries.push({ ...e, source: img.source });
    }
    if (preserveUnseen) {
      const desiredUrls = new Set(list.map((img) => img.src_url));
      const heroRefreshed = list.some((img) => img.source === "gocamping");
      for (const e of prev?.camps?.[id] ?? []) {
        if (!e?.src_url || desiredUrls.has(e.src_url) || entries.some((x) => x.src_url === e.src_url)) continue;
        // 새 대표 사진은 basedList의 현재 값으로 교체하고, 새 imageList를 받은 시설은
        // 그 목록에서 빠진 추가 사진을 제거한다. 아직 재조회하지 않은 시설만 보존한다.
        if ((e.source === "gocamping" && heroRefreshed) || (e.source === "gocamping-imageList" && refreshed.has(id))) continue;
        if (!e.thumb?.startsWith(`camps/${id}/`)) continue;
        entries.push(e);
      }
    }
    if (entries.length) camps[id] = entries;
  }
  const sortedIds = Object.keys(camps).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const sorted = Object.fromEntries(sortedIds.map((id) => [id, camps[id]]));
  return { generated_at: now, license_note: licenseNote, credit: IMAGE_CREDIT, camps: sorted };
}

/** 매니페스트가 참조하지 않는 webp 파일(MEDIA_DIR 상대 경로) — 정리 대상. */
export function orphanFiles(manifest, existingFiles) {
  const keep = new Set();
  for (const entries of Object.values(manifest?.camps ?? {})) for (const e of entries) { keep.add(e.thumb); keep.add(e.large); }
  return existingFiles.filter((f) => f.startsWith("camps/") && f.endsWith(".webp") && !keep.has(f));
}

/**
 * 전체 사진 수보다 시설 커버리지를 먼저 늘릴 때 쓰는 비파괴적 매니페스트 뷰.
 * maxImagesPerCamp가 0이면 제한하지 않는다. 첫 항목은 대표 사진 또는 imageList의
 * 첫 공식 사진이므로, 1로 제한하면 사진 없는 시설에 저장 공간을 우선 배정할 수 있다.
 */
export function limitManifestPerCamp(manifest, maxImagesPerCamp = 0) {
  const max = Math.floor(Number(maxImagesPerCamp));
  if (!(max > 0)) return manifest;
  const camps = Object.fromEntries(Object.entries(manifest?.camps ?? {})
    .map(([id, entries]) => [id, (entries ?? []).slice(0, max)])
    .filter(([, entries]) => entries.length));
  return { ...manifest, camps };
}

/** 목록 화면용 작은 색인: { [id]: thumb 상대 경로 } (대표 1장). */
export function heroIndex(manifest) {
  const out = {};
  for (const [id, entries] of Object.entries(manifest?.camps ?? {})) if (entries[0]) out[id] = entries[0].thumb;
  return out;
}

/** 동시성 제한 map. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

/**
 * 크기 제한·시간 제한 다운로드. 실패 시 한 번 재시도(4xx는 재시도 안 함).
 * @returns {Promise<Buffer>}
 */
export async function downloadImage(url, { fetchImpl = fetch, timeoutMs = DEFAULTS.timeoutMs, maxBytes = DEFAULTS.maxBytes, retries = 1, userAgent = "moyeora-camping-image-sync/1.0 (+https://pyw31337.github.io/camp/)" } = {}) {
  if (!isOfficialImageUrl(url)) throw Object.assign(new Error(`공식 호스트가 아님: ${url}`), { permanent: true });
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": userAgent, accept: "image/*" } });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        if (res.status >= 400 && res.status < 500) err.permanent = true;
        throw err;
      }
      const type = res.headers?.get?.("content-type") ?? "";
      if (type && !/^image\//i.test(type)) throw Object.assign(new Error(`이미지 아님: ${type}`), { permanent: true });
      const len = Number(res.headers?.get?.("content-length") ?? 0);
      if (len > maxBytes) throw Object.assign(new Error(`너무 큼: ${len}B`), { permanent: true });
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) throw Object.assign(new Error(`너무 큼: ${buf.length}B`), { permanent: true });
      if (!buf.length) throw new Error("빈 응답");
      return buf;
    } catch (e) {
      lastErr = e;
      if (e.permanent) break;
    }
  }
  throw lastErr;
}

/** 크기 추정(바이트). */
export function estimateBytes({ camps, extrasPerCamp = 0, thumbKB = 25, largeKB = 120 }) {
  return Math.round(camps * (1 + extrasPerCamp) * (thumbKB + largeKB) * 1024);
}
