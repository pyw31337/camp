// 중복 사진 거르기.
// 1) 같은 파일: 고캠핑은 대표 사진을 thumb/thumb_720_{파일}로, imageList는 {파일}로 내려준다 → 파일 이름 키로 같게 본다.
// 2) 같은 장면: 자체 저장한 공식 사진(webp)은 차이 해시(dHash 64비트)로 해밍 거리 ≤ 6이면 같은 사진으로 본다.
// 3) 여러 캠핑장에 똑같이 붙은 사진(“사진 준비중”, 체인 공통 이미지, 잘못 매칭된 검색 사진)은 대표 사진으로 쓰지 않는다.
import { readFile } from "node:fs/promises";

/** URL → 파일 이름 키(쿼리 제거, 고캠핑 thumb_N_ 접두어 제거, 소문자) */
export function photoKey(url) {
  const path = String(url ?? "").split(/[?#]/)[0];
  const raw = path.slice(path.lastIndexOf("/") + 1) || path;
  let base;
  try { base = decodeURIComponent(raw); } catch { base = raw; } // 잘못된 % 인코딩(예: "50%할인.jpg")은 그대로 비교
  base = base.toLowerCase();
  return base.replace(/^thumb_\d+_/, "");
}

/** 순서를 지키며 키가 같은 항목을 뺀다. seen에 이미 있는 키도 뺀다(다른 묶음과의 중복). */
export function uniqueBy(items, keyOf, seen = new Set()) {
  const out = [];
  for (const x of items) {
    const k = keyOf(x);
    if (!k) { out.push(x); continue; }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/** 이미지 버퍼 → dHash(16자리 16진수). sharp는 호출할 때만 불러온다. */
export async function dhash(input) {
  const { default: sharp } = await import("sharp");
  const px = await sharp(input).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return bits.toString(16).padStart(16, "0");
}
export const dhashFile = async (path) => dhash(await readFile(path));

export function hamming(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** 해시가 서로 가까운(≤ max) 항목은 처음 것만 남긴다. 해시가 없는 항목은 그대로 둔다. */
export function uniqueByHash(items, hashOf, max = 6) {
  const kept = [], hashes = [];
  for (const x of items) {
    const h = hashOf(x);
    if (h && hashes.some((k) => hamming(k, h) <= max)) continue;
    if (h) hashes.push(h);
    kept.push(x);
  }
  return kept;
}

/**
 * 여러 묶음(테마 등)에 캠핑장을 나눠 담는다. 앞 묶음부터 한 곳씩 번갈아 고르고, 이미 다른 묶음에 나온 곳은 건너뛴다.
 * 고를 곳이 모자란 묶음만 마지막에 겹치는 곳으로 채운다(fillWithRepeats).
 * @param {{id:string, candidates:{id:string}[]}[]} groups 후보는 선호 순서
 */
export function allocateUnique(groups, perGroup, { fillWithRepeats = false } = {}) {
  const used = new Set(), out = new Map(groups.map((g) => [g.id, []])), cursor = new Map(groups.map((g) => [g.id, 0]));
  for (let round = 0; round < perGroup; round++) {
    for (const g of groups) {
      const list = out.get(g.id);
      let i = cursor.get(g.id);
      while (i < g.candidates.length && used.has(g.candidates[i].id)) i++;
      if (i < g.candidates.length) { list.push(g.candidates[i]); used.add(g.candidates[i].id); i++; }
      cursor.set(g.id, i);
    }
  }
  if (fillWithRepeats) for (const g of groups) {
    const list = out.get(g.id), have = new Set(list.map((x) => x.id));
    for (const c of g.candidates) { if (list.length >= perGroup) break; if (!have.has(c.id)) { list.push(c); have.add(c.id); } }
  }
  return out;
}
