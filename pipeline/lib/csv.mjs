// 공공데이터 CSV 읽기: UTF-8(BOM)·EUC-KR 자동 판별, 따옴표·줄바꿈 포함 필드 처리.

/** 바이트 → 문자열. UTF-8로 깨지는 글자가 많으면 EUC-KR(CP949)로 다시 읽는다. */
export function decodeKoreanText(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const broken = (utf8.match(/�/g) ?? []).length;
  if (broken === 0) return utf8.replace(/^﻿/, "");
  try {
    return new TextDecoder("euc-kr").decode(bytes).replace(/^﻿/, "");
  } catch {
    return utf8.replace(/^﻿/, "");
  }
}

/** RFC 4180 CSV → 2차원 배열 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** 첫 줄을 머리글로 하는 객체 배열 */
export function csvToObjects(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
