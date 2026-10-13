import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { listZip, readZipEntry } from "../lib/zip.mjs";

/** 최소 ZIP 작성기(테스트용): 파일명 바이트를 그대로 넣고 UTF-8 플래그는 끈다. */
function makeZip(files) {
  const locals = [], cens = [];
  let offset = 0;
  for (const { nameBytes, data, store } of files) {
    const body = store ? data : deflateRawSync(data);
    const method = store ? 0 : 8;
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(method, 8);
    loc.writeUInt32LE(body.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(nameBytes.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(method, 10);
    cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameBytes.length, 28); cen.writeUInt32LE(offset, 42);
    locals.push(loc, nameBytes, body); cens.push(cen, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const cd = Buffer.concat(cens);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test("UTF-8 플래그 없는 한글 파일명(UTF-8·EUC-KR)을 복원하고 내용을 꺼낸다", () => {
  const euckr = Buffer.from([0xc8, 0xad, 0xc0, 0xe5, 0xbd, 0xc7, 0x2e, 0x63, 0x73, 0x76]); // "화장실.csv"
  const zip = makeZip([
    { nameBytes: Buffer.from("문화_테마파크업.csv"), data: Buffer.from("a,b\n1,2\n"), store: true },
    { nameBytes: euckr, data: Buffer.from("화장실명,소재지도로명주소\n공원화장실,서울\n") },
  ]);
  const entries = listZip(zip);
  assert.deepEqual(entries.map((e) => e.name), ["문화_테마파크업.csv", "화장실.csv"]);
  assert.equal(readZipEntry(zip, entries[0]).toString(), "a,b\n1,2\n");
  assert.match(readZipEntry(zip, entries[1]).toString(), /공원화장실/);
});
