// 행정안전부 LOCALDATA 파일 다운로드(file.localdata.go.kr). 2026-10-13 CI로 확인한 구조:
// - 업종 페이지: /file/<slug>/info (예: public_restroom_info). 주 버튼 data-download-urls="/file/download/<slug>/info"
// - 사이드바 /file/download-all?orgCode=…_ALL 은 인허가 업종 195종 묶음(ZIP). 특정 업종만 필요하면 업종 전용 경로를 쓴다.
// - ZIP 파일명은 UTF-8 플래그 없이 들어 있어 lib/zip.mjs로 직접 디코딩한다.
// - 이 저장소의 작업 컨테이너에서는 302로 막히고 GitHub Actions 러너에서는 열린다.

import { csvToObjects, decodeKoreanText } from "./csv.mjs";
import { listZip, readZipEntry } from "./zip.mjs";

export const LOCALDATA_BASE = "https://file.localdata.go.kr";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** 응답 바이트 → CSV 바이트. ZIP이면 pick(name)에 맞는 CSV(없으면 CSV가 하나뿐일 때 그것)를 꺼낸다. */
export function toCsvBytes(buf, pick = () => false, log = () => {}) {
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const entries = listZip(buf).filter((e) => /\.csv$/i.test(e.name));
    log(`ZIP 안 CSV ${entries.length}개: ${entries.slice(0, 20).map((e) => `${e.name}(${e.size}B)`).join(", ")}`);
    const hit = entries.find((e) => pick(e.name)) ?? (entries.length === 1 ? entries[0] : null);
    if (!hit) throw new Error(`ZIP 안에 대상 CSV가 없음(${entries.length}개 파일)`);
    return readZipEntry(buf, hit);
  }
  return buf;
}

/** 업종 페이지 HTML에서 다른 업종 페이지 slug 목록을 뽑는다(사이드바 /file/<slug>/info). */
export function listSlugs(html) {
  return [...new Set([...html.matchAll(/\/file\/([a-z0-9_]+)\/info/g)].map((m) => m[1]))];
}

/**
 * 업종 전용 파일을 받아 행 배열로 돌려준다. 쿠키·CSRF를 페이지에서 얻고 GET → POST 순으로 시도한다.
 * @param {string} slug 예: "public_restroom_info"
 * @param {{pick?:(name:string)=>boolean, log?:(s:string)=>void, fetchImpl?:typeof fetch}} opts
 * @returns {Promise<{rows:object[], pageUrl:string, downloadPath:string, slugs:string[]}>}
 */
export async function downloadLocaldata(slug, { pick, log = () => {}, fetchImpl = fetch } = {}) {
  const pageUrl = `${LOCALDATA_BASE}/file/${slug}/info`;
  const page = await fetchImpl(pageUrl, { headers: { "User-Agent": UA, Referer: "https://www.data.go.kr/" }, signal: AbortSignal.timeout(60000) });
  if (!page.ok) throw new Error(`HTTP ${page.status} ${pageUrl}`);
  const cookie = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const buf = Buffer.from(await page.arrayBuffer());
  if (!/html/i.test(page.headers.get("content-type") ?? "")) {
    return { rows: csvToObjects(decodeKoreanText(toCsvBytes(buf, pick, log))), pageUrl, downloadPath: pageUrl, slugs: [] };
  }
  const html = buf.toString("utf8");
  const slugs = listSlugs(html);
  const paths = [...new Set([...html.matchAll(/data-download-urls=["']([^"']+)["']/gi)].flatMap((m) => m[1].split(/[,\s]+/)).filter(Boolean))];
  if (!paths.length) paths.push(`/file/download/${slug}/info`);
  const meta = (n) => html.match(new RegExp(`<meta[^>]+name=["']${n}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1];
  const csrf = meta("_csrf"), csrfHeader = meta("_csrf_header") ?? "X-CSRF-TOKEN";
  const headers = { "User-Agent": UA, Referer: pageUrl, Cookie: cookie, ...(csrf ? { [csrfHeader]: csrf } : {}) };
  const tried = [];
  for (const path of paths) {
    const url = new URL(path, pageUrl).toString();
    for (const method of ["GET", "POST"]) {
      try {
        const post = method === "POST";
        const res = await fetchImpl(url, {
          method,
          headers: post ? { ...headers, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" } : headers,
          ...(post ? { body: csrf ? `_csrf=${encodeURIComponent(csrf)}` : "" } : {}),
          signal: AbortSignal.timeout(180000),
        });
        const b = Buffer.from(await res.arrayBuffer());
        const type = res.headers.get("content-type") ?? "";
        tried.push(`${method} ${path} → ${res.status} ${type} ${b.length}B`);
        if (!res.ok || /html|json/i.test(type)) continue;
        const rows = csvToObjects(decodeKoreanText(toCsvBytes(b, pick, log)));
        if (rows.length) return { rows, pageUrl, downloadPath: path, slugs };
      } catch (e) { tried.push(`${method} ${path} → ${e.message}`); }
    }
  }
  const err = new Error(`LOCALDATA ${slug} 다운로드 실패: ${tried.join(" / ")}`);
  err.slugs = slugs;
  throw err;
}
