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
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  locate: '<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;
// 메뉴(모든 페이지 같은 순서·문구). 홈 React 헤더도 이 문자열을 그대로 넣는다.
export const MENU = [
  { id: "explore", label: "캠핑장 찾기", tab: "찾기", href: "explore/", icon: "search" },
  { id: "themes", label: "테마", tab: "테마", href: "explore/themes/", icon: "sparkles" },
  { id: "open", label: "예약오픈", tab: "예약오픈", href: "explore/openings/", icon: "bell" },
  { id: "passport", label: "관심", tab: "관심", href: "explore/passport/", icon: "heart" },
];
// 헤더 오른쪽: 이름 뱃지(누르면 사용자 전환) + 설정(사용자 추가·글자 크기). 내용은 SITE_HEADER_SCRIPT가 채운다.
export function siteHeader(base, current, { wide = false } = {}) {
  return `<header class="gnb${wide ? " gnb-wide" : ""}"><div class="gnb-in">
  <a class="sh-brand" href="${base}" aria-label="모여라 캠핑 홈"><span>${svg("tent")}</span><b>모여라 캠핑</b></a>
  <nav class="sh-nav" aria-label="주요 메뉴">${MENU.map((m) => `<a href="${base}${m.href}"${m.id === current ? ' aria-current="page"' : ""}>${svg(m.icon)}${m.label}</a>`).join("")}</nav>
  <div class="sh-actions"><div class="sh-user"><button type="button" class="sh-badge" id="shBadge" aria-haspopup="true" aria-expanded="false" aria-label="사용자 전환"><i class="sh-av">나</i><b>나</b></button><div class="sh-menu" id="shMenu" hidden></div></div><button type="button" class="sh-icon" id="shSet" aria-label="설정">${svg("settings")}</button></div>
</div></header>
<dialog class="sh-dlg" id="shDlg" aria-labelledby="shDlgTitle"><form method="dialog" class="sh-dlg-in">
  <div class="sh-dlg-head"><h2 id="shDlgTitle">설정</h2><button class="sh-icon" value="close" aria-label="닫기">${svg("x")}</button></div>
  <section><h3>사용자</h3><p>로그인 없이 이 기기에만 저장됩니다. 사용자마다 관심·최근 본 캠핑장이 따로 저장돼요.</p><ul class="sh-ulist" id="shUlist"></ul>
  <div class="sh-add"><input id="shName" maxlength="10" placeholder="이름 (예: 영우, 유리)" autocomplete="off" enterkeyhint="done" aria-label="추가할 사용자 이름"><button type="button" id="shAdd">${svg("plus")}추가</button></div></section>
  <section><h3>글자 크기</h3><div class="sh-seg" id="shFs" role="radiogroup" aria-label="글자 크기"></div></section>
</form></dialog>`;
}
export function siteTabbar(base, current) {
  const tabs = [{ id: "home", tab: "홈", href: "", icon: "house" }, ...MENU];
  return `<nav class="gnb-tabbar" aria-label="모바일 주요 탐색">${tabs.map((m) => `<a href="${base}${m.href}"${m.id === current ? ' aria-current="page"' : ""}>${svg(m.icon)}${m.tab}</a>`).join("")}</nav>`;
}
// 사용자(로그인 없음)·글자 크기. 모든 페이지가 같은 스크립트를 쓴다.
// 저장: moyeora-users=[{id,name,c}], moyeora-user=사용 중 id, moyeora-fs=글자 크기.
// 사용자별 저장 키: window.moyeoraUser.key("moyeora-explore") → 첫 사용자(me)는 기존 키 그대로(이전 관심 목록 유지), 그 외는 "키@id".
// 사용자를 바꾸면 window에 "moyeora:user" 이벤트를 보낸다(탐색·관심 화면이 다시 그린다).
export const SITE_HEADER_JS = `(function(){if(window.moyeoraUser)return;
var C=["#1f9d5c","#2f7fd8","#e0703a","#8e5bd6","#c99a06","#e05a8a","#139c9c","#6d7b85"],L={s:"작게",m:"보통",l:"크게",xl:"아주 크게"},O=["s","m","l","xl"];
function g(k,d){try{var v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}}function p(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function users(){var u;try{u=JSON.parse(g("moyeora-users","null"))}catch(e){}if(!Array.isArray(u)||!u.length){u=[{id:"me",name:"나",c:C[0]}];p("moyeora-users",JSON.stringify(u))}return u}
function active(){var u=users(),id=g("moyeora-user","me");for(var i=0;i<u.length;i++)if(u[i].id===id)return u[i];return u[0]}
function fs(v){if(O.indexOf(v)<0)v="m";document.documentElement.dataset.fs=v;p("moyeora-fs",v);var b=document.getElementById("shFs");if(b)b.querySelectorAll("button").forEach(function(x){x.setAttribute("aria-checked",String(x.dataset.fs===v))})}
fs(g("moyeora-fs","m"));
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function av(u){return '<i class="sh-av" style="background:'+u.c+'">'+esc(Array.from(u.name)[0]||"?")+"</i>"}
function draw(){var u=users(),a=active(),b=document.getElementById("shBadge"),m=document.getElementById("shMenu"),l=document.getElementById("shUlist");
if(b){b.innerHTML=av(a)+"<b>"+esc(a.name)+"</b>";b.style.setProperty("--uc",a.c)}
if(m)m.innerHTML='<p>사용자 전환</p>'+u.map(function(x){return '<button type="button" data-sh-user="'+x.id+'" aria-current="'+(x.id===a.id)+'">'+av(x)+"<b>"+esc(x.name)+"</b>"+(x.id===a.id?"<small>사용 중</small>":"")+"</button>"}).join("")+'<button type="button" data-sh-open>'+'<i class="sh-av sh-plus">+</i><b>사용자 추가</b></button>';
if(l)l.innerHTML=u.map(function(x){return '<li>'+av(x)+"<b>"+esc(x.name)+"</b>"+(x.id===a.id?'<small>사용 중</small>':'<button type="button" data-sh-user="'+x.id+'">전환</button>')+(u.length>1&&x.id!=="me"?'<button type="button" class="sh-del" data-sh-del="'+x.id+'" aria-label="'+esc(x.name)+' 삭제">삭제</button>':"")+"</li>"}).join("");
var f=document.getElementById("shFs");if(f&&!f.children.length){f.innerHTML=O.map(function(k){return '<button type="button" role="radio" data-fs="'+k+'">'+L[k]+"</button>"}).join("");fs(document.documentElement.dataset.fs)}}
function use(id){p("moyeora-user",id);draw();window.dispatchEvent(new CustomEvent("moyeora:user",{detail:active()}))}
function menu(open){var m=document.getElementById("shMenu"),b=document.getElementById("shBadge");if(!m||!b)return;m.hidden=!open;b.setAttribute("aria-expanded",String(open))}
function add(){var i=document.getElementById("shName"),n=(i&&i.value||"").trim().slice(0,10);if(!n)return i&&i.focus();var u=users();if(u.length>=8){alert("사용자는 8명까지 추가할 수 있어요.");return}var id="u"+Date.now().toString(36);u.push({id:id,name:n,c:C[u.length%C.length]});p("moyeora-users",JSON.stringify(u));i.value="";use(id)}
window.moyeoraUser={active:active,list:users,key:function(base){var a=active();return a.id==="me"?base:base+"@"+a.id}};
document.addEventListener("click",function(e){var t=e.target.closest("#shBadge,#shSet,[data-sh-user],[data-sh-open],[data-sh-del],#shAdd,[data-fs]");
if(!t){if(!e.target.closest("#shMenu"))menu(false);return}
var d=document.getElementById("shDlg");
if(t.id==="shBadge"){menu(document.getElementById("shMenu").hidden);return}
if(t.id==="shSet"||t.hasAttribute("data-sh-open")){menu(false);draw();if(d&&d.showModal)d.showModal();else if(d)d.setAttribute("open","");return}
if(t.dataset.shUser){menu(false);use(t.dataset.shUser);return}
if(t.dataset.shDel){var u=users().filter(function(x){return x.id!==t.dataset.shDel});if(!confirm("이 사용자를 지울까요? 이 사용자의 관심 목록도 함께 지워집니다."))return;p("moyeora-users",JSON.stringify(u));try{localStorage.removeItem("moyeora-explore@"+t.dataset.shDel)}catch(x){}if(g("moyeora-user","me")===t.dataset.shDel)use(u[0].id);else draw();return}
if(t.id==="shAdd"){add();return}
if(t.dataset.fs&&t.closest("#shFs")){fs(t.dataset.fs);return}});
document.addEventListener("keydown",function(e){if(e.key==="Escape")menu(false);if(e.key==="Enter"&&e.target.id==="shName"){e.preventDefault();add()}});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",draw);else draw();})();`;
export const SITE_HEADER_SCRIPT = `<script>${SITE_HEADER_JS}</script>`;
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
.sh-user { position: relative; }
.sh-badge { display: inline-flex; align-items: center; gap: 7px; height: 38px; max-width: 9.5rem; padding: 0 12px 0 4px; border-radius: 999px; border: 1px solid #e3e8e2; background: #fff; color: #17211c; font: inherit; font-size: .9375rem; font-weight: 800; cursor: pointer; white-space: nowrap; }
.sh-badge b { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.sh-av { flex: none; width: 30px; height: 30px; border-radius: 50%; display: inline-grid; place-items: center; background: #1f9d5c; color: #fff; font-style: normal; font-size: .8125rem; font-weight: 900; line-height: 1; }
.sh-av.sh-plus { background: #eef1ec; color: #46594f; font-size: 1.1rem; }
.sh-menu { position: absolute; right: 0; top: calc(100% + 8px); z-index: 80; min-width: 13.5rem; max-width: calc(100vw - 24px); padding: 8px; border-radius: 16px; background: #fff; border: 1px solid #e3e8e2; box-shadow: 0 12px 32px rgba(23,33,28,.16); display: grid; gap: 2px; }
.sh-menu[hidden] { display: none; }
.sh-menu p { margin: 2px 8px 6px; color: #7c8a82; font-size: .75rem; font-weight: 800; }
.sh-menu button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 6px 8px; border: 0; border-radius: 12px; background: none; color: #17211c; font: inherit; font-size: .9375rem; font-weight: 700; text-align: left; cursor: pointer; white-space: nowrap; }
.sh-menu button:hover, .sh-menu button[aria-current="true"] { background: #f1f7f3; }
.sh-menu small, .sh-ulist small { margin-left: auto; color: #17834b; font-size: .75rem; font-weight: 800; }
.sh-dlg { width: min(30rem, calc(100vw - 24px)); max-height: calc(100dvh - 48px); padding: 0; border: 0; border-radius: 22px; background: #fff; color: #17211c; box-shadow: 0 24px 64px rgba(0,0,0,.25); }
.sh-dlg::backdrop { background: rgba(10,20,15,.45); }
.sh-dlg-in { display: grid; gap: 18px; padding: 18px 20px 22px; }
.sh-dlg svg { width: 18px; height: 18px; flex: none; }
.sh-dlg-head { display: flex; align-items: center; justify-content: space-between; }
.sh-dlg h2 { margin: 0; font-size: 1.25rem; font-weight: 900; letter-spacing: -.03em; }
.sh-dlg h3 { margin: 0 0 4px; font-size: 1rem; font-weight: 800; }
.sh-dlg section > p { margin: 0 0 10px; color: #66766d; font-size: .8125rem; line-height: 1.5; word-break: keep-all; }
.sh-ulist { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 6px; }
.sh-ulist li { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 6px 10px; border-radius: 14px; background: #f5f7f4; font-weight: 700; }
.sh-ulist b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sh-ulist button { margin-left: auto; height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid #d5ddd6; background: #fff; color: #17211c; font: inherit; font-size: .8125rem; font-weight: 800; cursor: pointer; white-space: nowrap; }
.sh-ulist small + button, .sh-ulist button + button { margin-left: 6px; }
.sh-ulist .sh-del { color: #b4442c; }
.sh-add { display: flex; gap: 8px; }
.sh-add input { flex: 1; min-width: 0; height: 44px; padding: 0 14px; border-radius: 12px; border: 1px solid #d5ddd6; background: #fff; color: inherit; font: inherit; }
.sh-add button { display: inline-flex; align-items: center; gap: 4px; height: 44px; padding: 0 16px; border: 0; border-radius: 12px; background: #1f9d5c; color: #fff; font: inherit; font-weight: 800; cursor: pointer; white-space: nowrap; }
.sh-add svg { width: 16px; height: 16px; }
.sh-seg { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; padding: 4px; border-radius: 14px; background: #eef1ec; }
.sh-seg button { min-height: 40px; padding: 0 4px; border: 0; border-radius: 10px; background: none; color: #46594f; font: inherit; font-size: .875rem; font-weight: 800; cursor: pointer; white-space: nowrap; }
.sh-seg button[aria-checked="true"] { background: #fff; color: #17834b; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
.sh-icon { position: relative; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; border: 1px solid #e3e8e2; background: #fff; color: #17211c; text-decoration: none; cursor: pointer; }
.sh-icon b { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 99px; display: grid; place-items: center; background: #1f9d5c; color: #fff; font-size: .6875rem; font-weight: 800; }
.gnb-wide .gnb-in { max-width: none; padding: 0 clamp(16px, 2.5vw, 40px); }
/* 모바일 하단 탭(홈·탐색 동일) */
.gnb-tabbar { display: none; }
@media (max-width: 760px) {
  .gnb-in { height: 56px; gap: 8px; }
  .sh-nav { display: none; }
  .sh-badge b { display: none; }
  .sh-badge { padding: 0 4px; }
  .gnb-tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 70; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 6px 4px calc(6px + env(safe-area-inset-bottom)); background: rgba(255,255,255,.96); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-top: 1px solid #e3e8e2; }
  .gnb-tabbar a { display: grid; justify-items: center; gap: 2px; padding: 4px 0; color: #66766d; text-decoration: none; font-size: .75rem; font-weight: 700; white-space: nowrap; }
  .gnb-tabbar a[aria-current="page"] { color: #17834b; }
  .gnb-tabbar svg { width: 22px; height: 22px; }
  body { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
}
@media (prefers-color-scheme: dark) {
  .gnb, .gnb-tabbar { background: rgba(21,29,25,.92); border-color: #29342e; }
  .sh-brand { color: #e6eee9; } .sh-nav a { color: #a3afa8; } .sh-nav a:hover, .sh-nav a[aria-current="page"] { background: #14301f; color: #5cce91; }
  .sh-badge, .sh-icon, .sh-ulist button, .sh-add input { background: #151d19; border-color: #29342e; color: #e6eee9; }
  .sh-menu, .sh-dlg { background: #1b241f; border-color: #29342e; color: #e6eee9; }
  .sh-menu button { color: #e6eee9; } .sh-menu button:hover, .sh-menu button[aria-current="true"] { background: #14301f; }
  .sh-ulist li { background: #222c27; } .sh-seg { background: #222c27; } .sh-seg button { color: #a3afa8; } .sh-seg button[aria-checked="true"] { background: #151d19; color: #5cce91; }
  .sh-av.sh-plus { background: #29342e; color: #e6eee9; }
  .gnb-tabbar a { color: #a3afa8; } .gnb-tabbar a[aria-current="page"] { color: #5cce91; }
}
/* 글꼴도 모든 페이지 동일 */
body, .gnb, .gnb-tabbar, .gnb button, .sh-dlg { font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif; }
/* 글자 크기 설정(모든 페이지 공통, 이 기기 저장) */
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
html[data-fs="s"] { font-size: 93.75%; } html[data-fs="l"] { font-size: 112.5%; } html[data-fs="xl"] { font-size: 125%; }
/* 가로 넘침 방지: 화면 폭을 넘는 요소가 있어도 페이지가 옆으로 밀리거나 축소되지 않게(iOS 포함) */
html, body { max-width: 100%; overflow-x: clip; }
img, video, iframe { max-width: 100%; }
/* iOS는 16px 미만 입력칸을 누르면 화면을 자동 확대한다 → 입력칸은 항상 16px 이상 */
input, select, textarea { font-size: max(16px, 1rem) !important; }
@media (max-width: 1080px) and (min-width: 761px) { .sh-nav a { padding: 0 9px; font-size: .875rem; } .sh-nav a svg { display: none; } }
`;
