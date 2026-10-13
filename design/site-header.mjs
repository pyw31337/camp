// 공통 사이트 헤더·모바일 하단 탭(홈은 같은 구조를 React로, 탐색·보조 페이지는 이 문자열을 그대로 쓴다).
// base: 현재 페이지에서 사이트 루트(/camp/)까지의 상대 경로. current: 현재 메뉴 id.
const I = {
  tent: '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  locate: '<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;
// 메뉴(홈 React 헤더와 같은 순서·문구)
export const MENU = [
  { id: "explore", label: "캠핑장 찾기", tab: "찾기", href: "explore/", icon: "search" },
  { id: "collections", label: "컬렉션", tab: "컬렉션", href: "explore/collections/", icon: "sparkles" },
  { id: "guide", label: "예약 가이드", tab: "가이드", href: "explore/guide/", icon: "book" },
  { id: "open", label: "예약 오픈", tab: "예약오픈", href: "#calendar", icon: "bell" },
  { id: "passport", label: "관심·패스포트", tab: "관심", href: "explore/passport/", icon: "heart" },
];
const href = (base, h) => (h.startsWith("#") ? `${base}${h}` : `${base}${h}`);
export function siteHeader(base, current, { fsId = "", nearId = "" } = {}) {
  return `<header class="gnb"><div class="gnb-in">
  <a class="sh-brand" href="${base}" aria-label="모여라 캠핑 홈"><span>${svg("tent")}</span><b>모여라 캠핑</b></a>
  <nav class="sh-nav" aria-label="주요 메뉴">${MENU.map((m) => `<a href="${href(base, m.href)}"${m.id === current ? ' aria-current="page"' : ""}>${svg(m.icon)}${m.label}</a>`).join("")}</nav>
  <div class="sh-actions"><button type="button" class="sh-fs"${fsId ? ` id="${fsId}"` : ""} aria-label="글자 크기 바꾸기">가<small${fsId ? ' id="fsLabel"' : ""}>보통</small></button>${nearId ? `<button type="button" class="sh-icon" id="${nearId}" aria-label="내 주변 캠핑장">${svg("locate")}</button>` : `<a class="sh-icon" href="${base}explore/#near=1" aria-label="내 주변 캠핑장">${svg("locate")}</a>`}</div>
</div></header>`;
}
export function siteTabbar(base, current) {
  const tabs = [{ id: "home", tab: "홈", href: "", icon: "house" }, MENU[0], MENU[1], MENU[3], MENU[4]];
  return `<nav class="gnb-tabbar" aria-label="모바일 주요 탐색">${tabs.map((m) => `<a href="${href(base, m.href)}"${m.id === current ? ' aria-current="page"' : ""}>${svg(m.icon)}${m.tab}</a>`).join("")}</nav>`;
}
// 글자 크기 버튼(탐색 화면은 자체 처리, 보조 페이지는 이 스크립트)
export const SITE_HEADER_SCRIPT = `<script>(function(){var L={s:"작게",m:"보통",l:"크게",xl:"아주 크게"},O=["s","m","l","xl"];function a(v){if(O.indexOf(v)<0)v="m";document.documentElement.dataset.fs=v;document.querySelectorAll(".sh-fs small").forEach(function(e){e.textContent=L[v]});try{localStorage.setItem("moyeora-fs",v)}catch(e){}}try{a(localStorage.getItem("moyeora-fs")||"m")}catch(e){a("m")}document.addEventListener("click",function(e){var b=e.target.closest(".sh-fs");if(!b||b.id)return;var c=document.documentElement.dataset.fs||"m";a(O[(O.indexOf(c)+1)%O.length])})})();</script>`;
export const SITE_HEADER_CSS = `/* ===== 공통 사이트 헤더(홈·탐색·상세 동일) — 두 화면이 같은 규칙을 쓴다 ===== */
.gnb { position: sticky; top: 0; z-index: 70; background: rgba(255,255,255,.92); backdrop-filter: saturate(1.4) blur(10px); -webkit-backdrop-filter: saturate(1.4) blur(10px); border-bottom: 1px solid #e3e8e2; }
.gnb-in { box-sizing: border-box; width: 100%; max-width: 1240px; height: 64px; margin: 0 auto; padding: 0 16px; display: flex; align-items: center; gap: 24px; }
.sh-brand { display: inline-flex; align-items: center; gap: 9px; flex: none; color: #173f2e; text-decoration: none; font-size: 1.125rem; font-weight: 900; letter-spacing: -.05em; white-space: nowrap; }
.sh-brand > span { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: #1f9d5c; color: #fff; }
.sh-brand svg { width: 20px; height: 20px; }
.sh-nav { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
.sh-nav a { display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 12px; border-radius: 999px; color: #46594f; text-decoration: none; font-size: .9375rem; font-weight: 700; white-space: nowrap; }
.sh-nav a:hover, .sh-nav a[aria-current="page"] { background: #e8f4ec; color: #17834b; }
.sh-nav svg, .sh-actions svg { width: 18px; height: 18px; flex: none; }
.sh-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; flex: none; }
.sh-fs { display: inline-flex; align-items: center; gap: 4px; height: 38px; padding: 0 12px; border-radius: 999px; border: 1px solid #e3e8e2; background: #fff; color: #17211c; font: inherit; font-size: .9375rem; font-weight: 900; cursor: pointer; white-space: nowrap; }
.sh-fs small { font-size: .75rem; font-weight: 600; color: #7c8a82; }
.sh-icon { position: relative; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; border: 1px solid #e3e8e2; background: #fff; color: #17211c; text-decoration: none; cursor: pointer; }
.sh-icon b { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 99px; display: grid; place-items: center; background: #1f9d5c; color: #fff; font-size: .6875rem; font-weight: 800; }
/* 모바일 하단 탭(홈·탐색 동일) */
.gnb-tabbar { display: none; }
@media (max-width: 760px) {
  .gnb-in { height: 56px; gap: 8px; }
  .sh-nav { display: none; }
  .sh-fs small { display: none; }
  .gnb-tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 70; display: grid; grid-template-columns: repeat(5, 1fr); padding: 6px 4px calc(6px + env(safe-area-inset-bottom)); background: rgba(255,255,255,.96); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-top: 1px solid #e3e8e2; }
  .gnb-tabbar a { display: grid; justify-items: center; gap: 2px; padding: 4px 0; color: #66766d; text-decoration: none; font-size: .75rem; font-weight: 700; white-space: nowrap; }
  .gnb-tabbar a[aria-current="page"] { color: #17834b; }
  .gnb-tabbar svg { width: 22px; height: 22px; }
  body { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
}
@media (prefers-color-scheme: dark) {
  .gnb, .gnb-tabbar { background: rgba(21,29,25,.92); border-color: #29342e; }
  .sh-brand { color: #e6eee9; } .sh-nav a { color: #a3afa8; } .sh-nav a:hover, .sh-nav a[aria-current="page"] { background: #14301f; color: #5cce91; }
  .sh-fs, .sh-icon { background: #151d19; border-color: #29342e; color: #e6eee9; }
  .gnb-tabbar a { color: #a3afa8; } .gnb-tabbar a[aria-current="page"] { color: #5cce91; }
}
/* 글꼴도 모든 페이지 동일 */
body, .gnb, .gnb-tabbar, .gnb button { font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif; }
/* 글자 크기 설정(모든 페이지 공통, 이 기기 저장) */
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
html[data-fs="s"] { font-size: 93.75%; } html[data-fs="l"] { font-size: 112.5%; } html[data-fs="xl"] { font-size: 125%; }
/* 가로 넘침 방지: 화면 폭을 넘는 요소가 있어도 페이지가 옆으로 밀리거나 축소되지 않게(iOS 포함) */
html, body { max-width: 100%; overflow-x: clip; }
img, video, iframe { max-width: 100%; }
/* iOS는 16px 미만 입력칸을 누르면 화면을 자동 확대한다 → 입력칸은 항상 16px 이상 */
input, select, textarea { font-size: max(16px, 1rem) !important; }
@media (max-width: 1080px) and (min-width: 761px) { .sh-nav a { padding: 0 9px; font-size: .875rem; } .sh-nav a svg { display: none; } .sh-fs small { display: none; } }
`;
