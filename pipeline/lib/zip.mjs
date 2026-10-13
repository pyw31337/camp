// 의존성 없는 ZIP 읽기(중앙 디렉터리 기준). LOCALDATA ZIP은 UTF-8 플래그 없이 한글 파일명을 넣어
// `unzip -Z1`이 러너 로캘로 잘못 디코딩한다(예: “ым╕эЩФ_…”). 원래 바이트를 UTF-8 → EUC-KR 순으로 해석한다.

import { inflateRawSync } from "node:zlib";
import { decodeKoreanText } from "./csv.mjs";

const EOCD = 0x06054b50, CEN = 0x02014b50, LOC = 0x04034b50;

/** @returns {{name: string, method: number, compressedSize: number, size: number, offset: number}[]} */
export function listZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP 끝 레코드를 찾지 못함");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== CEN) throw new Error(`중앙 디렉터리 손상(${n}번째)`);
    const flags = buf.readUInt16LE(p + 8);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const raw = buf.subarray(p + 46, p + 46 + nameLen);
    entries.push({
      name: flags & 0x800 ? raw.toString("utf8") : decodeKoreanText(raw),
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      offset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function readZipEntry(buf, e) {
  if (buf.readUInt32LE(e.offset) !== LOC) throw new Error(`로컬 헤더 손상: ${e.name}`);
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const data = buf.subarray(start, start + e.compressedSize);
  if (e.method === 0) return Buffer.from(data);
  if (e.method === 8) return inflateRawSync(data);
  throw new Error(`지원하지 않는 압축 방식 ${e.method}: ${e.name}`);
}
