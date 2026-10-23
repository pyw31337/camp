// 예약 링크 정밀 검수(소유자 2026-10-23: “404만 볼 게 아니라, 예약하기로 이동한 페이지가 실제 그 업장 예약이 맞는지 —
// 무관한 곳이 더러 있다”). 열린 페이지에 이 업장의 이름·전화·도로명 주소가 있는지, 다른 업장 이름이 대신 있는지,
// 도메인 판매·오류 화면·첫 화면으로 튕긴 낡은 주소인지 판정한다. 열기는 scripts/verify-booking-links.mjs(robots.txt 준수).
import { nameTokens, nameCoreOf } from "./detail-text-review.mjs";
import { noCheck } from "./link-check.mjs";

/** 화면 버튼에서 뺄 판정(c.dl에 붙는다). 나머지는 남긴다. */
export const HIDE_VERDICTS = new Set(["PARKED", "ERROR_PAGE", "OTHER_PLACE", "STALE_DEEP", "CLOSED", "HIJACKED", "LEFT_SITE", "PLATFORM_ROOT"]);
/** 새 주소로 바꿔 보여 줄 판정(옛 예약 엔진 주소 → 안내된 새 주소) */
export const MOVED = "MOVED";

// 여러 업장을 파는 예약 플랫폼의 첫 화면(캠핏·네이버 예약·땡큐캠핑 등) — 업장 주소가 아니라 플랫폼 홈으로 간다.
// 자동 확인을 막은 플랫폼이어도 주소만으로 판정한다(열지 않음).
const PLATFORM_HOST = /^(www\.|m\.)?(camfit\.co\.kr|campfit\.co\.kr|booking\.naver\.com|map\.naver\.com|naver\.com|place\.naver\.com|thankqcamping\.com|camperstory\.com|r\.camperstory\.com|booking\.ddnayo\.com|ddnayo\.com|yapen\.co\.kr|tickets\.interpark\.com|campingtalk\.me|camp\.xticket\.kr|camplink\.co\.kr|yanolja\.com|goodchoice\.kr|map\.kakao\.com|gocamping\.or\.kr|cafe\.naver\.com|instagram\.com)$/i;
export function isPlatformRoot(u) {
  try { const x = new URL(u); return PLATFORM_HOST.test(x.hostname) && /^\/?(index\.\w+|main(\.\w+)?)?$/i.test(x.pathname) && !x.search; } catch { return false; }
}

const flat = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, "");
const digits = (s) => String(s ?? "").replace(/\D/g, "");

/** 이 업장을 알아볼 단서: 이름 낱말(카탈로그·네이버·카카오 이름), 전화 숫자, 도로명+번지 */
export function signalsOf(c, extraNames = [], extraPhones = []) {
  const toks = new Set();
  for (const n of [c.name, ...extraNames].filter(Boolean)) for (const t of nameTokens(n, c.sigungu)) if (flat(t).length >= 2) toks.add(flat(t));
  const phones = [c.tel, ...extraPhones].map(digits).filter((d) => d.length >= 9);
  const road = String(c.addr ?? c.address ?? "").match(/([가-힣0-9]+(?:로|길))\s*(\d+(?:-\d+)?)/);
  return { toks: [...toks], phones: [...new Set(phones)], road: road ? flat(road[1] + road[2]) : null };
}

/** 다른 업장을 알아볼 이름 핵심(4자 이상, 두 곳 이상이 같이 쓰는 이름은 뺀다) */
export function nameIndex(camps) {
  const seen = new Map();
  for (const c of camps) {
    const core = flat(nameCoreOf(c.name, c.sigungu));
    if (core.length < 4 || /^[a-z0-9]+$/.test(core)) continue;
    seen.set(core, seen.has(core) ? null : String(c.id));
  }
  return new Map([...seen].filter(([, id]) => id));
}

const PARKED_HOST = /(^|\.)(hugedomains\.com|sedo\.com|dan\.com|afternic\.com|parkingcrew\.net|bodis\.com|gabia\.com\/domain|whois\.co\.kr)$/i;
const PARKED_TEXT = /(this\s+domain\s+(is|may\s+be)\s+for\s+sale|is\s+for\s+sale|buy\s+this\s+domain|도메인을?\s*(구매|판매|매매)|domain\s+has\s+expired|호스팅\s*(기간|서비스)\s*(만료|종료))/i;
// 서비스 종료 안내(네이버 modoo!는 2025-06-26 종료 — 모든 *.modoo.at 홈페이지가 종료 안내만 보인다)
const CLOSED_TEXT = /(modoo!?\s*(가|는)?\s*\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*(부로\s*)?(서비스를\s*)?종료|서비스(가|를)\s*종료(되었|하였)습니다|더\s*이상\s*(운영|서비스)(되지|하지)\s*않)/;
// 주소가 팔린 뒤 도박·성인 광고로 바뀐 곳
const HIJACK = /(카지노|바카라|토토\s*사이트|슬롯\s*(게임|사이트)|온라인\s*도박|성인\s*용품|비아그라|먹튀)/;
// 옛 예약 엔진 주소 안내(캠퍼스토리 r2·r4·r6 → r.camperstory.com)
const MOVED_TEXT = /예약\s*페이지\s*주소가\s*변경되었습니다[\s\S]{0,80}?(https?:\/\/[^\s"'<>]+)/;
const ERROR_TITLE = /(오류\s*안내|에러\s*페이지|error\s*page|^\s*(403|404|500)\b|forbidden|not\s+found|페이지를\s*찾을\s*수|존재하지\s*않는|잘못된\s*(접근|경로|요청))/i;
const GEO_BLOCK = /(access\s+block(ing|ed)\s+country|해외\s*(ip|아이피)?\s*(접속|접근)\s*(차단|제한)|접근\s*제한|국가\s*차단)/i;
// 공공 예약 통합 창구 첫 화면(업장을 고르는 화면) — 업장 이름이 없어도 그 운영 기관의 공식 예약 창구다
const PORTAL = /^(reservation\.knps\.or\.kr|www\.foresttrip\.go\.kr|foresttrip\.go\.kr|www\.huyang\.go\.kr|yeyak\.seoul\.go\.kr|res\.knps\.or\.kr)$/i;

const isRootish = (u) => { try { const x = new URL(u); return /^\/?(index\.\w+|main(\.\w+)?|default\.\w+)?$/i.test(x.pathname) && !x.search; } catch { return false; } };

/**
 * 페이지 한 장 판정.
 * page: { title, text(본문 글), final(최종 주소), url(원래 주소), rendered }
 * 반환 { v, why }:
 *  MATCH(이 업장) · PORTAL(공공 통합 예약 창구) · PARKED(도메인 판매·만료) · ERROR_PAGE(오류·없는 화면)
 *  OTHER_PLACE(다른 업장 이름만 있음) · STALE_DEEP(예약 상세 주소가 사이트 첫 화면으로 튕기고 이 업장 단서 없음)
 *  CLOSED(서비스 종료 안내) · HIJACKED(도박·광고 사이트로 바뀜) · MOVED(주소 변경 안내 → to) · BLOCKED(봇 확인·403)
 *  PLATFORM_ROOT(예약 플랫폼 첫 화면 — 이 업장 페이지가 아님, 주소만으로 판정)
 *  LEFT_SITE(다른 사이트로 넘어가고 이 업장 단서 없음)
 *  GEO_BLOCK(해외 접속 차단 — 국내 사람에게는 열린다) · THIN(글이 거의 없어 판단 불가) · NO_SIGNAL(이 업장 단서 없음 — 검토 대기)
 */
export function judgePage({ camp, sig, page, index, sameSiteIds }) {
  const title = String(page.title ?? "").replace(/\s+/g, " ").trim();
  const text = String(page.text ?? "");
  const hay = flat(`${title} ${text}`);
  const finalHost = (() => { try { return new URL(page.final ?? page.url).hostname; } catch { return ""; } })();
  if (PARKED_HOST.test(finalHost) || PARKED_TEXT.test(`${title} ${text.slice(0, 4000)}`)) return { v: "PARKED", why: `도메인 판매·만료 화면(${finalHost})` };
  if (CLOSED_TEXT.test(text.slice(0, 3000))) return { v: "CLOSED", why: `서비스 종료 안내(${finalHost})` };
  if (HIJACK.test(title) || (text.match(new RegExp(HIJACK.source, "g")) ?? []).length >= 3) return { v: "HIJACKED", why: `도박·광고 사이트로 바뀜(${title.slice(0, 40)})` };
  const mv = text.slice(0, 2000).match(MOVED_TEXT);
  if (mv) return { v: MOVED, why: "예약 페이지 주소 변경 안내", to: mv[1].replace(/[.,)]+$/, "") };

  const mine = sig.toks.find((t) => hay.includes(t));
  if (mine) return { v: "MATCH", why: `이름 “${mine}”` };
  const pd = digits(text);
  const phone = sig.phones.find((p) => pd.includes(p));
  if (phone) return { v: "MATCH", why: "전화번호 일치" };
  if (sig.road && hay.includes(sig.road)) return { v: "MATCH", why: "도로명 주소 일치" };

  if (GEO_BLOCK.test(`${title} ${text.slice(0, 600)}`)) return { v: "GEO_BLOCK", why: "해외 접속 차단 화면(국내에서는 열림)" };
  // 호스팅 봇 확인(?ckattempt=)·403은 사람에게는 열리는 경우가 많다 → 판단 보류
  if (/[?&]ckattempt=/i.test(page.final ?? "") || /\b403\b|forbidden/i.test(title) || /\/403\.html?$/i.test(page.final ?? "")) return { v: "BLOCKED", why: `봇 확인·접근 차단 화면(${title || "403"})` };
  if (/\/(error|err)\/|\/404\.html?$/i.test(page.final ?? "") || (ERROR_TITLE.test(title) && hay.length < 3000)) return { v: "ERROR_PAGE", why: `오류 화면(${title || page.final})` };

  if (PORTAL.test(finalHost) && isRootish(page.final ?? page.url)) return { v: "PORTAL", why: `공공 통합 예약 창구(${finalHost})` };
  if (hay.length < 120) return { v: "THIN", why: page.rendered ? "그려도 글이 거의 없음" : "글이 거의 없음" };

  // 제목에 다른 업장 이름이 있고 이 업장 단서는 없다 → 다른 업장 페이지(본문은 메뉴·추천 목록이 섞여 쓰지 않는다).
  // 그 업장도 같은 사이트를 쓰면(같은 운영자·같은 예약 엔진 첫 화면) 다른 업장으로 보지 않는다.
  const head = flat(title);
  const ours = new Set(sig.toks);
  for (const [core, id] of index) {
    if (id === String(camp.id) || !head.includes(core)) continue;
    if ([...ours].some((t) => core.includes(t) || t.includes(core))) continue;
    if (sameSiteIds?.has(id)) continue;
    return { v: "OTHER_PLACE", why: `다른 업장 이름 “${core}”(#${id})` };
  }
  const orig = page.url ?? "";
  if (!isRootish(orig) && isRootish(page.final ?? orig) && new URL(orig).hostname === finalHost) return { v: "STALE_DEEP", why: `예약 주소가 사이트 첫 화면으로 이동(${finalHost})` };
  // 다른 사이트로 넘어갔고 이 업장 단서가 없다(호스팅 회사 검색 화면 등) → 업장 페이지가 아님.
  // 운영자 자신의 네이버 카페·블로그·인스타그램으로 넘어가는 홈페이지는 정상(2026-10-23 쿼크밸리 → 카페).
  const site = (h) => h.replace(/^(www|m)\./, "").split(".").slice(-2).join(".");
  try { if (site(new URL(orig).hostname) !== site(finalHost) && !/camperstory|thankqcamping/.test(finalHost) && !noCheck(page.final ?? "")) return { v: "LEFT_SITE", why: `다른 사이트로 이동(${finalHost})${title ? ` · ${title.slice(0, 30)}` : ""}` }; } catch {}
  return { v: "NO_SIGNAL", why: `이 업장 이름·전화·주소가 페이지에 없음${title ? `(제목: ${title.slice(0, 40)})` : ""}` };
}
