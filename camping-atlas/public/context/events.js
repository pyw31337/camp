// 상세 화면 ‘주변 축제·행사’ 포스터 카드 — ./events.json(파이프라인 sync-culture-events.mjs)을 읽어 그린다.
// 원천: CultureFlow(공연·전시·축제 모음) + 한국관광공사 TourAPI 축제. 포스터는 원래 주소를 그대로 쓰고(저장하지 않음)
// 카드마다 캠핑장에서의 거리와 원문 링크를 붙이고, 출처는 칸 아래 한 줄에 모은다. 자료가 없거나 실패하면 칸을 숨긴 채 둔다.
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
.ev-foot{margin-top:12px;font-size:12px;color:var(--ink-3,#667);line-height:1.5}
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
  const acts = [
    e.cf ? `<a class="main" href="${esc(e.cf)}" target="_blank" rel="noopener">CultureFlow에서 보기</a>` : "",
    e.u ? `<a class="${e.cf ? "" : "main"}" href="${esc(e.u)}" target="_blank" rel="noopener">${e.cf ? "원문" : "자세히 보기"}</a>` : "",
    e.a ? `<a href="https://map.kakao.com/link/search/${encodeURIComponent(e.v || e.a)}" target="_blank" rel="noopener">지도</a>` : "",
  ].join("");
  return `<article class="ev-card" data-state="${x.state}" data-kind="${esc(e.k)}"${i >= 6 ? " data-extra hidden" : ""}>
  <a class="ev-poster${e.img ? "" : " noimg"}" ${href ? `href="${esc(href)}" target="_blank" rel="noopener"` : ""} aria-label="${esc(e.t)} 자세히">${poster(x)}<div class="ev-badges">${badges}</div><span class="ev-dist">${esc(km(x.km))}</span></a>
  <div class="ev-body"><span class="ev-kind">${esc(e.k)}</span><h3>${esc(e.t)}</h3>
  <span class="ev-meta">${esc(period)}${place ? `<br>${esc(place)}` : ""} · 캠핑장에서 ${esc(km(x.km))}${e.p ? ` · ${esc(e.p)}` : ""}</span>
  ${e.d ? `<p class="ev-desc">${esc(e.d)}</p>` : ""}
  <div class="ev-acts">${acts}</div></div></article>`;
}
export function render(data, id, today = kstToday()) {
  const list = eventsFor(data, id, today);
  if (!list.length) return "";
  const on = list.filter((x) => x.state === "ongoing").length;
  const tabs = [["all", "전체", list.length], ["ongoing", "진행 중", on], ["upcoming", "예정", list.length - on]].filter(([, , n]) => n);
  const cfAt = String(data.sources?.cf?.data_at ?? "").slice(0, 10);
  return `${tabs.length > 2 ? `<div class="ev-tabs" role="group" aria-label="행사 상태">${tabs.map(([k, l, n], i) => `<button type="button" data-ev-tab="${k}" aria-pressed="${i === 0}">${l}<i>${n}</i></button>`).join("")}</div>` : ""}
<div class="ev-rail">${list.map((x, i) => card(x, today, i)).join("")}</div>
${list.length > 6 ? `<button type="button" class="ev-more" data-ev-more>${list.length - 6}개 더 보기</button>` : ""}
<p class="ev-foot">캠핑장에서 직선 30km 안, 오늘부터 45일 안에 열리는 축제·공연·전시예요. 일정·요금은 바뀔 수 있으니 원문에서 꼭 확인하세요. 출처: <a href="${esc(data.sources?.cf?.url ?? "https://pyw31337.github.io/culture/")}" target="_blank" rel="noopener">CultureFlow</a>${cfAt ? `(${esc(cfAt)} 수집)` : ""} · <a href="${esc(data.sources?.tour?.url ?? "https://api.visitkorea.or.kr")}" target="_blank" rel="noopener">한국관광공사 TourAPI</a>. 포스터 저작권은 각 주최·원출처에 있어요. 갱신 ${esc(String(data.generated_at ?? "").slice(0, 10))}</p>`;
}
function bind(el) {
  const cards = [...el.querySelectorAll(".ev-card")];
  let filter = "all", expanded = false;
  const apply = () => {
    let shown = 0;
    for (const c of cards) {
      const hit = filter === "all" || c.dataset.state === filter;
      const narrow = matchMedia("(max-width:720px)").matches;
      c.hidden = !hit || (!expanded && !narrow && shown >= 6);
      if (hit) shown++;
    }
    const more = el.querySelector("[data-ev-more]");
    if (more) more.hidden = expanded || shown <= 6;
  };
  el.querySelectorAll("[data-ev-tab]").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.evTab;
    el.querySelectorAll("[data-ev-tab]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    apply();
  }));
  el.querySelector("[data-ev-more]")?.addEventListener("click", () => { expanded = true; apply(); });
  apply();
}
/** el: <section data-events> (안에 [data-events-body]가 있으면 거기에 그린다) */
export async function mount(el, camp) {
  const data = await load();
  const html = render(data, String(camp?.id ?? ""));
  if (!html) return;
  if (!document.getElementById("ev-style")) { const s = document.createElement("style"); s.id = "ev-style"; s.textContent = STYLE; document.head.append(s); }
  const body = el.querySelector("[data-events-body]") ?? el;
  body.innerHTML = html;
  bind(body);
  el.hidden = false;
}
