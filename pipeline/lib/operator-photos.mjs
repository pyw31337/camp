// 운영자 홈페이지에서 ‘사이트·객실(상품)’ 사진 후보를 찾는 도구(2026-11-11 t55 상품 사진 수집).
// 원칙은 operator-site.mjs와 같다: 운영자 소유 도메인만, robots.txt 준수, 호스트별 1초 간격, 사이트당 쪽 수 상한.
// 사진은 주소와 그 사진을 설명하는 짧은 글(alt·바로 앞 제목·링크 이름)만 남긴다. 판정·저장은 collect-site-photos가 한다.
import { htmlToText } from "./operator-site.mjs";

// 상품(사이트·객실) 안내로 보이는 링크
export const SITE_LINK_TEXT = /사이트|객실|글램핑|카라반|오토\s*캠핑|캠핑\s*존|데크|파쇄석|잔디|방갈로|캐빈|펜션|독채|카바나|트레일러|캠핑카|차박|구역|[A-Z]\s*존|시설\s*안내|시설\s*소개|캠핑장\s*소개|캠핑장\s*안내|갤러리|포토|사진|room|site|glamp|caravan|cabin|gallery|facility|camp/i;
export const SITE_LINK_HREF = /site|room|glamp|caravan|cabin|camp|zone|facility|gallery|photo|sub0?[1-4]|page/i;
const SKIP_HREF = /\.(jpg|jpeg|png|gif|webp|pdf|zip|hwp|mp4)(\?|$)|^(mailto|tel|javascript):|#$/i;
const REVIEW = /후기|리뷰|review|guest|방문자|포토\s*후기|게시판|board|bbs|login|join|member|cart|order/i;
// 상품 사진이 아닌 그림 파일 이름
export const JUNK_IMG = /logo|icon|ico_|btn|button|arrow|bullet|blank|spacer|bg_|_bg|background|banner|sns|kakao|naver|insta|facebook|youtube|top_|quick|footer|header|gnb|lnb|menu|map|loading|common|sprite|favicon|dot|line|tit_|title|txt_|text|qr|weather|plugin|\.svg|\.gif/i;

export function siteLinks(html, baseUrl, max = 10) {
  let base; try { base = new URL(baseUrl); } catch { return []; }
  const out = new Map();
  for (const m of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']?([^"' >]+)["']?[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1];
    if (!href || SKIP_HREF.test(href)) continue;
    const text = htmlToText(m[2]).replace(/\s+/g, " ").slice(0, 40);
    if (REVIEW.test(text) || REVIEW.test(href)) continue;
    const score = (SITE_LINK_TEXT.test(text) ? 5 : 0) + (SITE_LINK_HREF.test(href) ? 1 : 0);
    if (!score) continue;
    let u; try { u = new URL(href, base); } catch { continue; }
    if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "") || !/^https?:$/.test(u.protocol)) continue;
    u.hash = "";
    const k = u.toString();
    if (k === base.toString()) continue;
    const prev = out.get(k);
    if (!prev || prev.score < score) out.set(k, { url: k, text, score });
  }
  for (const m of String(html).matchAll(/<i?frame[^>]+src\s*=\s*["']?([^"' >]+)/gi)) {
    try { const u = new URL(m[1], base); if (u.hostname === base.hostname && !out.has(u.toString())) out.set(u.toString(), { url: u.toString(), text: "", score: 4 }); } catch {}
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, max);
}

const lastText = (html, n = 80) => htmlToText(html).replace(/\s+/g, " ").trim().slice(-n);
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i"))?.[1] ?? "";
function bestSrcset(s) {
  const parts = String(s).split(",").map((x) => x.trim().split(/\s+/)).filter((x) => x[0]);
  parts.sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0));
  return parts[0]?.[0] ?? "";
}

/** 쪽 HTML → 사진 후보 [{url, cap, near, alt}]. cap = 쪽 제목·링크 이름, near = 사진 바로 앞 글. */
export function pageImages(html, pageUrl, { linkText = "" } = {}) {
  const s = String(html ?? "");
  const title = (s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const out = [], seen = new Set();
  const push = (raw, idx, alt = "", w = 0, h = 0) => {
    if (!raw || /^data:/i.test(raw)) return;
    let u; try { u = new URL(raw.replace(/&amp;/g, "&"), pageUrl).toString(); } catch { return; }
    if (!/^https?:/i.test(u) || !/\.(jpe?g|png|webp)(\?|$)/i.test(u) && !/\/(image|img|upload|file|data)\//i.test(u)) return;
    const file = u.split(/[?#]/)[0].split("/").pop();
    if (JUNK_IMG.test(file) || seen.has(u)) return;
    if ((w && w < 300) || (h && h < 200)) return;
    seen.add(u);
    const near = lastText(s.slice(Math.max(0, idx - 1500), idx), 80);
    out.push({ url: u, alt: alt.slice(0, 80), near, cap: [linkText, title].filter(Boolean).join(" | ").slice(0, 100) });
  };
  for (const m of s.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0];
    const src = attr(t, "data-src") || attr(t, "data-original") || attr(t, "data-lazy-src") || bestSrcset(attr(t, "srcset") || attr(t, "data-srcset")) || attr(t, "src");
    push(src, m.index, attr(t, "alt") || attr(t, "title"), Number(attr(t, "width")) || 0, Number(attr(t, "height")) || 0);
  }
  for (const m of s.matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) push(m[1], m.index);
  return out;
}

// ---------- t58: 주소 변형·JS 호스트·렌더 결과 합치기 ----------
/** https를 먼저 시도한다. 이 환경의 HTTP 프록시(Pingora)는 일반 http를 빈 500으로 거절하는 경우가 많다. */
export function urlVariants(u) {
  let x;
  try { x = new URL(/^[a-z]+:\/\//i.test(u) ? u : `http://${u}`); } catch { return []; }
  const bare = x.hostname.replace(/^www\./, "");
  const hosts = [x.hostname];
  if (x.hostname.startsWith("www.")) hosts.push(bare); else if (bare) hosts.push(`www.${bare}`);
  const path = `${x.pathname}${x.search}` || "/";
  const out = new Set();
  for (const proto of ["https:", "http:"]) for (const h of hosts) {
    out.add(`${proto}//${h}${path}`);
    if (path !== "/") out.add(`${proto}//${h}/`);
  }
  return [...out];
}

/** imweb·wix·cafe24 등, 첫 HTML만으로는 사진이 거의 없는 사이트 */
export const JS_BUILDER_HOST = /(?:^|\.)(imweb\.me|imweb\.kr|wixsite\.com|wix\.com|cafe24\.com|sixshop\.com|makeshop\.co\.kr|shopby\.co\.kr|alltheway\.kr|sites\.google\.com|squarespace\.com|weebly\.com|tilda\.cc|creatorlink\.net)$/i;
export function isJsBuilderUrl(u) {
  try { return JS_BUILDER_HOST.test(new URL(/^[a-z]+:\/\//i.test(u) ? u : `http://${u}`).hostname); } catch { return false; }
}
export function htmlLooksJsHeavy(html) {
  const s = String(html ?? "");
  if (!/imweb|wix-warmup|wixstatic|cafe24|sixshop|data-lazy-src|ng-app|__NEXT_DATA__|data-srcset/i.test(s)) return false;
  const imgs = (s.match(/<img\b/gi) || []).length;
  return imgs < 3;
}

/** 새 수집 결과를 기존 레지스트리에 합친다. 이미 있던 사진·쪽은 지우지 않고 추가만 한다. 이번이 실패면 이전 OK 결과를 지킨다. */
export function mergePhotoCrawl(old, neu) {
  if (!old) return { ...neu, added: neu.images?.length ?? 0 };
  if (neu.status !== "OK" && (old.images?.length ?? 0) > 0) {
    return { ...old, last_attempt: { at: neu.checked_at ?? null, status: neu.status, error: neu.error ?? null } };
  }
  const seen = new Set((old.images ?? []).map((i) => i.url));
  const images = [...(old.images ?? [])];
  let added = 0;
  for (const im of neu.images ?? []) {
    if (!im?.url || seen.has(im.url)) continue;
    seen.add(im.url);
    images.push(im);
    added++;
  }
  const pages = [...new Set([...(old.pages ?? []), ...(neu.pages ?? [])])];
  return { ...old, ...neu, pages, images, added, status: images.length ? "OK" : neu.status };
}

/** Playwright 등이 모은 {src, alt, w, h, near} → pageImages와 같은 후보 모양 */
export function imagesFromRendered(list, pageUrl, { linkText = "", title = "" } = {}) {
  const out = [], seen = new Set();
  const cap = [linkText, title].filter(Boolean).join(" | ").slice(0, 100);
  for (const im of list ?? []) {
    const raw = im.src || im.url;
    if (!raw || /^data:/i.test(raw)) continue;
    let u; try { u = new URL(String(raw).replace(/&amp;/g, "&"), pageUrl).toString(); } catch { continue; }
    if (!/^https?:/i.test(u) || (!/\.(jpe?g|png|webp)(\?|$)/i.test(u) && !/\/(image|img|upload|file|data|storage|photo)\//i.test(u))) continue;
    const file = u.split(/[?#]/)[0].split("/").pop();
    if (JUNK_IMG.test(file) || seen.has(u)) continue;
    const w = Number(im.w || im.width) || 0, h = Number(im.h || im.height) || 0;
    if ((w && w < 300) || (h && h < 200)) continue;
    seen.add(u);
    out.push({ url: u, alt: String(im.alt ?? "").slice(0, 80), near: String(im.near ?? "").slice(0, 80), cap });
  }
  return out;
}

