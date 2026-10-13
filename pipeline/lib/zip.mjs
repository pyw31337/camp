// 의존성 없는 ZIP 읽기(중앙 디렉터리 기준). LOCALDATA ZIP은 UTF-8 플래그 없이
// 한글 파일명을 넣을 수 있어 원본 바이트를 UTF-8 → EUC-KR 순서로 해석한다.
import { inflateRawSync } from "node:zlib";
import { decodeKoreanText } from "./csv.mjs";

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

export function listZip(buf) {
  let eocd = -1;
  for (let index = buf.length - 22; index >= Math.max(0, buf.length - 65557); index--) {
    if (buf.readUInt32LE(index) === EOCD) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("ZIP 끝 레코드를 찾지 못함");
  const count = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index++) {
    if (buf.readUInt32LE(cursor) !== CEN) throw new Error(`중앙 디렉터리 손상(${index}번째)`);
    const flags = buf.readUInt16LE(cursor + 8);
    const nameLength = buf.readUInt16LE(cursor + 28);
    const extraLength = buf.readUInt16LE(cursor + 30);
    const commentLength = buf.readUInt16LE(cursor + 32);
    const rawName = buf.subarray(cursor + 46, cursor + 46 + nameLength);
    entries.push({
      name: flags & 0x800 ? rawName.toString("utf8") : decodeKoreanText(rawName),
      method: buf.readUInt16LE(cursor + 10), compressedSize: buf.readUInt32LE(cursor + 20),
      size: buf.readUInt32LE(cursor + 24), offset: buf.readUInt32LE(cursor + 42),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function readZipEntry(buf, entry) {
  if (buf.readUInt32LE(entry.offset) !== LOC) throw new Error(`로컬 헤더 손상: ${entry.name}`);
  const start = entry.offset + 30 + buf.readUInt16LE(entry.offset + 26) + buf.readUInt16LE(entry.offset + 28);
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`지원하지 않는 압축 방식 ${entry.method}: ${entry.name}`);
}
