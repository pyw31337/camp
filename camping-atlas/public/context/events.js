// 상세 화면 ‘주변 축제·행사’ 포스터 카드 — ./events.json(파이프라인 sync-culture-events.mjs)을 읽어 그린다.
// 원천: CultureFlow(공연·전시·축제 모음) + 한국관광공사 TourAPI 축제. 포스터는 원래 주소를 그대로 쓰고(저장하지 않음)
// 카드마다 캠핑장에서의 거리를 붙이고 카드 전체가 원문 링크다. 자료가 없거나 실패하면 칸을 숨긴 채 둔다.
// 2026-10-20 소유자: 거리·기간을 셀렉트 2개로 고르고, 기본은 5km·7일에서 진행 중인 행사가 없으면 10km·10일 → 20km·20일 → 30km·45일로 넓힌다.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const md = (iso) => { const [, m, d] = String(iso).split("-"); const w = DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()]; return `${Number(m)}/${Number(d)}(${w})`; };
const km = (v) => (v < 1 ? `${Math.round(v * 100) * 10}m` : `${Number(v).toFixed(1).replace(/\.0$/, "")}km`);
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const dday = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
let cache = null;
const load = () => (cache ??= fetch(new URL("./events.json", import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null));

/** 다가오는 토·일(오늘이 토·일이면 이번 주) */
export function weekendOf(today) {
  const w = new Date(`${today}T00:00:00Z`).getUTCDay();
  const sat = w === 0 ? addDays(today, -1) : addDays(today, (6 - w + 7) % 7);
  return { sat, sun: addDays(sat, 1) };
}
/** 한 캠핑장의 카드 자료 [{id, km, e, state, weekend}] — 끝난 행사는 뺀다 */
export function eventsFor(data, id, today = kstToday()) {
  const rows = data?.camps?.[id] ?? [];
  const wk = weekendOf(today);
  return rows.map(([eid, d]) => ({ id: eid, km: d, e: data.ev?.[eid] })).filter((x) => x.e && x.e.e >= today)
    .map((x) => ({ ...x, state: x.e.s <= today ? "ongoing" : "upcoming", weekend: x.e.s <= wk.sun && x.e.e >= wk.sat }));
}
/** 거리·기간 단계(자동 확장 순서) */
export const RANGES = [[5, 7], [10, 10], [20, 20], [30, 45]];
export const KM_OPTS = [5, 10, 20, 30];
export const DAY_OPTS = [7, 10, 20, 30, 45];
/** km 안·오늘부터 days일 안에 시작(또는 진행 중)인 행사만 */
export const inRange = (list, kmMax, days, today = kstToday()) => list.filter((x) => x.km <= kmMax && x.e.s <= addDays(today, days));
/** 진행 중인 행사가 나오는 가장 좁은 단계(없으면 행사가 하나라도 있는 가장 좁은 단계, 그것도 없으면 가장 넓은 단계) */
export function autoRange(list, today = kstToday()) {
  const hit = RANGES.find(([k, d]) => inRange(list, k, d, today).some((x) => x.state === "ongoing"))
    ?? RANGES.find(([k, d]) => inRange(list, k, d, today).length);
  return hit ?? RANGES.at(-1);
}
const MAP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16" aria-hidden="true"><path d="M0 0h16v16H0z" fill="none"/><path fill="currentColor" d="M6 2.09c.133.008.266.042.388.103L9.598 3.8a1 1 0 0 0 .402.104V13.91a1 1 0 0 1-.388-.102L6.402 12.2A1 1 0 0 0 6 12.096zm7.629.459A1 1 0 0 1 15 3.477v7.98a1 1 0 0 1-.653.938L11 13.63V3.6zM5 12.4l-2.629 1.05A1 1 0 0 1 1 12.523v-7.98a1 1 0 0 1 .653-.939L5 2.37z"/></svg>`;
const STYLE = `.ev-sec .ev-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
.ev-sec .ev-tabs button{height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line,#e5e5e5);background:var(--paper,#fff);color:var(--ink-2,#333);font:inherit;font-size:.8rem;font-weight:750;cursor:pointer}
.ev-sec .ev-tabs button[aria-pressed="true"]{background:var(--ink,#111);border-color:var(--ink,#111);color:var(--paper,#fff)}
.ev-sec .ev-tabs i{font-style:normal;opacity:.65;margin-left:3px}
.ev-rail{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.ev-card{position:relative;display:flex;flex-direction:column;min-width:0;overflow:hidden;border:1px solid var(--line,#e5e5e5);border-radius:16px;background:var(--paper,#fff);transition:transform .2s,box-shadow .2s}
.ev-card:hover{transform:translateY(-2px);box-shadow:var(--shadow,0 6px 20px rgba(0,0,0,.08))}
.ev-card[hidden]{display:none}
.ev-poster{position:relative;display:block;aspect-ratio:3/4;overflow:hidden;background:var(--soft,#f2f2f2)}
.ev-poster img{width:100%;height:100%;object-fit:cover;display:block}
.ev-poster.noimg{display:grid;place-items:center;background:linear-gradient(160deg,var(--soft,#f2f2f2),var(--paper,#fff))}
.ev-poster.noimg span{padding:14px;text-align:center;font-weight:850;font-size:1rem;line-height:1.35;color:var(--ink-2,#333);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.ev-badges{position:absolute;left:8px;top:8px;right:8px;display:flex;gap:4px;flex-wrap:wrap;pointer-events:none}
.ev-badges b{padding:3px 8px;border-radius:999px;font-size:.7rem;font-weight:850;line-height:1.3;background:rgba(17,17,17,.72);color:#fff;backdrop-filter:blur(4px)}
.ev-badges b.on{background:#12a150}.ev-badges b.wk{background:var(--accent,#e8590c)}
.ev-dist{position:absolute;right:8px;bottom:8px;padding:3px 8px;border-radius:999px;font-size:.7rem;font-weight:800;background:rgba(255,255,255,.92);color:#222}
.ev-body{display:grid;gap:4px;padding:11px 12px 13px;min-width:0;flex:1}
.ev-kind{color:var(--accent,#e8590c);font-size:.72rem;font-weight:850}
.ev-body h3{margin:0;font-size:.93rem;line-height:1.35;font-weight:850;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ev-meta{color:var(--ink-3,#666);font-size:.76rem;line-height:1.45}
.ev-desc{margin:2px 0 0;color:var(--ink-2,#333);font-size:.78rem;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ev-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:8px}
.ev-acts a{display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:999px;background:var(--soft,#f2f2f2);color:var(--ink-2,#333);font-size:.74rem;font-weight:800;text-decoration:none}
.ev-acts a.main{background:var(--ink,#111);color:var(--paper,#fff)}
.ev-more{margin:12px auto 0;display:block;height:36px;padding:0 16px;border-radius:999px;border:1px solid var(--line,#e5e5e5);background:var(--paper,#fff);font:inherit;font-size:.8rem;font-weight:800;cursor:pointer}
.ev-hit{position:absolute;inset:0;z-index:1;border-radius:inherit}
.ev-hit:focus-visible{outline:2px solid var(--accent,#e8590c);outline-offset:2px}
.ev-kindrow{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ev-map{position:relative;z-index:2;display:inline-grid;place-items:center;width:28px;height:28px;border-radius:999px;background:var(--soft,#f2f2f2);color:var(--ink-2,#333);font-size:15px;text-decoration:none}
.ev-map:hover{background:var(--ink,#111);color:var(--paper,#fff)}
.ev-filters{display:inline-flex;gap:6px;align-items:center}
.ev-filters select{height:32px;padding:0 28px 0 12px;border:1px solid var(--line,#e5e5e5);border-radius:999px;background:var(--paper,#fff) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23666' stroke-width='1.6'/%3E%3C/svg%3E") no-repeat right 11px center;appearance:none;color:var(--ink,#111);font:inherit;font-size:.8rem;font-weight:800;cursor:pointer}
.ev-empty{margin:4px 0 0;padding:18px;border-radius:14px;background:var(--soft,#f2f2f2);color:var(--ink-3,#666);font-size:.84rem;text-align:center}
@media (max-width:720px){.ev-rail{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:12px;margin:0;padding:2px 2px 10px;scrollbar-width:none;overscroll-behavior-x:contain}
.ev-rail::-webkit-scrollbar{display:none}.ev-card{flex:0 0 min(64vw,240px);scroll-snap-align:start}.ev-card:hover{transform:none}.ev-more{display:none}}`;

function poster(x) {
  const e = x.e;
  const fallback = `<span>${esc(e.t)}</span>`;
  // 포스터가 깨지면 원출처 이미지(img2)로 한 번, 그래도 안 되면 제목 카드로 바꾼다.
  const onerr = `if(this.dataset.alt){this.src=this.dataset.alt;this.removeAttribute('data-alt')}else{const p=this.parentNode;p.classList.add('noimg');p.insertAdjacentHTML('afterbegin',this.dataset.fb);this.remove()}`;
  const img = e.img
    ? `<img src="${esc(e.img)}" alt="${esc(e.t)} 포스터" loading="lazy" decoding="async" referrerpolicy="no-referrer"${e.img2 && e.img2 !== e.img ? ` data-alt="${esc(e.img2)}"` : ""} data-fb="${esc(fallback)}" onerror="${esc(onerr)}">`
    : fallback;
  return img;
}
function card(x, today, i) {
  const e = x.e;
  const href = e.cf || e.u || "";
  const badges = [x.state === "ongoing" ? `<b class="on">진행 중</b>` : `<b>예정 · D-${dday(today, e.s)}</b>`, x.weekend ? `<b class="wk">이번 주말</b>` : ""].join("");
  const period = e.e && e.e !== e.s ? `${md(e.s)} ~ ${md(e.e)}` : md(e.s);
  const place = e.v || (e.a ? e.a.split(/\s+/).slice(0, 3).join(" ") : "");
  // 카드 전체가 원문 링크(CultureFlow 우선, 없으면 원출처). ‘자세히 보기’ 버튼은 두지 않는다. 지도는 종류 줄 오른쪽 끝 아이콘.
  const map = e.a || e.v ? `<a class="ev-map" href="https://map.kakao.com/link/search/${encodeURIComponent(e.v || e.a)}" target="_blank" rel="noopener" aria-label="${esc(e.t)} 지도" title="지도">${MAP_SVG}</a>` : "";
  return `<article class="ev-card" data-state="${x.state}" data-kind="${esc(e.k)}">
  ${href ? `<a class="ev-hit" href="${esc(href)}" target="_blank" rel="noopener" aria-label="${esc(e.t)} 원문 보기"></a>` : ""}
  <div class="ev-poster${e.img ? "" : " noimg"}">${poster(x)}<div class="ev-badges">${badges}</div><span class="ev-dist">${esc(km(x.km))}</span></div>
  <div class="ev-body"><div class="ev-kindrow"><span class="ev-kind">${esc(e.k)}</span>${map}</div><h3>${esc(e.t)}</h3>
  <span class="ev-meta">${esc(period)}${place ? `<br>${esc(place)}` : ""} · 캠핑장에서 ${esc(km(x.km))}${e.p ? ` · ${esc(e.p)}` : ""}</span>
  ${e.d ? `<p class="ev-desc">${esc(e.d)}</p>` : ""}</div></article>`;
}
/** opt: { km, days } — 없으면 자료 전체(30km·45일) */
export function render(data, id, today = kstToday(), opt = null) {
  const all = eventsFor(data, id, today);
  if (!all.length) return "";
  const list = opt ? inRange(all, opt.km, opt.days, today) : all;
  if (!list.length) return `<p class="ev-empty">${opt.km}km 안·${opt.days}일 이내에는 행사가 없어요. 거리나 기간을 넓혀 보세요.</p>`;
  const on = list.filter((x) => x.state === "ongoing").length;
  const tabs = [["all", "전체", list.length], ["ongoing", "진행 중", on], ["upcoming", "예정", list.length - on]].filter(([, , n]) => n);
  return `${tabs.length > 2 ? `<div class="ev-tabs" role="group" aria-label="행사 상태">${tabs.map(([k, l, n], i) => `<button type="button" data-ev-tab="${k}" aria-pressed="${i === 0}">${l}<i>${n}</i></button>`).join("")}</div>` : ""}
<div class="ev-rail">${list.map((x, i) => card(x, today, i)).join("")}</div>`;
}
// 카드 수는 context/cgrid.js 규칙(태블릿부터 여러 단 · 줄이 꽉 차는 개수 · 더보기)을 따른다.
async function bind(el) {
  const grid = el.querySelector(".ev-rail");
  if (!grid) return;
  const cg = await import("./cgrid.js");
  let filter = "all";
  const hit = (c) => filter === "all" || c.dataset.state === filter;
  cg.setup(grid, { filter: hit });
  el.querySelectorAll("[data-ev-tab]").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.evTab;
    el.querySelectorAll("[data-ev-tab]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    cg.setFilter(grid, hit);
  }));
}
/** el: <section data-events> (안에 [data-events-body]가 있으면 거기에 그린다). 제목 줄의 .sec-note 자리에 거리·기간 셀렉트를 둔다. */
export async function mount(el, camp) {
  const data = await load();
  const id = String(camp?.id ?? "");
  const today = kstToday();
  const all = eventsFor(data, id, today);
  if (!all.length) return;
  if (!document.getElementById("ev-style")) { const s = document.createElement("style"); s.id = "ev-style"; s.textContent = STYLE; document.head.append(s); }
  let [kmMax, days] = autoRange(all, today);
  const body = el.querySelector("[data-events-body]") ?? el;
  const note = el.querySelector(".sec-head .sec-note");
  const opts = (vals, cur, unit) => vals.map((v) => `<option value="${v}"${v === cur ? " selected" : ""}>${v}${unit}</option>`).join("");
  const filters = document.createElement("span");
  filters.className = "ev-filters";
  const paint = () => {
    filters.innerHTML = `<select data-ev-km aria-label="거리">${opts(KM_OPTS, kmMax, "km 안")}</select><select data-ev-days aria-label="기간">${opts(DAY_OPTS, days, "일 이내")}</select>`;
  };
  paint();
  if (note) note.replaceWith(filters); else el.querySelector(".sec-head")?.append(filters);
  const draw = async () => { body.innerHTML = render(data, id, today, { km: kmMax, days }); await bind(body); };
  filters.addEventListener("change", (e) => {
    if (e.target.matches("[data-ev-km]")) kmMax = Number(e.target.value);
    if (e.target.matches("[data-ev-days]")) days = Number(e.target.value);
    draw();
  });
  await draw();
  el.hidden = false;
}
