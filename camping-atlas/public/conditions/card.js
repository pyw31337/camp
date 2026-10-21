// ‘주간 날씨’ 카드(상세 화면). design/renewal/app.js가 동적으로 불러온다.
// 데이터: ./forecast.json(pipeline/scripts/sync-forecast.mjs, 하루 2회) — 단기예보(오늘~3일 뒤) + 중기예보(4~10일 뒤, 활용신청 후).
// 이번 주말·다음 주말을 표시하고, 보조로 이번 주말 일출·일몰·달(./astro.js, 브라우저 계산)과 지금 미세먼지를 보인다.
// 값이 없는 날은 칸을 만들지 않고, 일부 날짜만 있으면 그 범위를 문구로 알려 준다.
import { moonPhase, sunTimes } from "./astro.js";

let cache = null;
const load = () => (cache ??= fetch(new URL("./forecast.json", import.meta.url), { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const AIR = { 1: "좋음", 2: "보통", 3: "나쁨", 4: "매우나쁨" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dow = (ymd) => new Date(`${ymd}T12:00:00+09:00`).getUTCDay();
const md = (ymd) => { const [, m, d] = ymd.split("-").map(Number); return `${m}/${d}`; };
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00+09:00`) + n * 86400e3 + 9 * 3600e3).toISOString().slice(0, 10);
const kstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const kstStamp = (iso) => { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
export function weatherIconSvg(sky, pty, size = 26) {
  const isSnow = /눈/.test(pty ?? sky ?? "");
  const isRain = /비|소나기|빗방울/.test(pty ?? sky ?? "");
  const isThunder = /번개|뇌우/.test(pty ?? sky ?? "");
  const isFog = /안개/.test(pty ?? sky ?? "");
  const isCloudy = /흐림/.test(sky ?? "");
  const isPartlyCloudy = /구름/.test(sky ?? "");

  if (isThunder) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-lightning" aria-hidden="true"><path class="w-cloud-body" d="M7 14a4.6 4.4 0 0 1 0-9h.1a5 4.5 0 0 1 11 2h.9a4 3.5 0 0 1 0 7h-12z"/><polygon class="w-bolt" points="13 13 10 17 13 17 11 22 16 16 13 16 14 13" fill="currentColor" stroke="none"/></svg>`;
  }
  if (isSnow) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-snow" aria-hidden="true"><path class="w-cloud-body" d="M7 14a4.6 4.4 0 0 1 0-9h.1a5 4.5 0 0 1 11 2h.9a4 3.5 0 0 1 0 7h-12z"/><g class="w-snow-flakes"><circle class="w-flake f1" cx="8" cy="18" r="1.3" fill="currentColor"/><circle class="w-flake f2" cx="12" cy="19" r="1.3" fill="currentColor"/><circle class="w-flake f3" cx="16" cy="18" r="1.3" fill="currentColor"/></g></svg>`;
  }
  if (isRain) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-rain" aria-hidden="true"><path class="w-cloud-body" d="M7 14a4.6 4.4 0 0 1 0-9h.1a5 4.5 0 0 1 11 2h.9a4 3.5 0 0 1 0 7h-12z"/><g class="w-rain-drops"><line class="w-drop d1" x1="8" y1="16.5" x2="7" y2="19.5"/><line class="w-drop d2" x1="12" y1="16.5" x2="11" y2="19.5"/><line class="w-drop d3" x1="16" y1="16.5" x2="15" y2="19.5"/></g></svg>`;
  }
  if (isFog) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-mist" aria-hidden="true"><line class="w-mist-line m1" x1="4" y1="7" x2="20" y2="7"/><line class="w-mist-line m2" x1="6" y1="11" x2="18" y2="11"/><line class="w-mist-line m3" x1="3" y1="15" x2="21" y2="15"/><line class="w-mist-line m4" x1="7" y1="19" x2="17" y2="19"/></svg>`;
  }
  if (isCloudy) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-cloud" aria-hidden="true"><path class="w-cloud-body" d="M7 18a4.6 4.4 0 0 1 0-9h.1a5 4.5 0 0 1 11 2h.9a4 3.5 0 0 1 0 7h-12z"/></svg>`;
  }
  if (isPartlyCloudy) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-sun-cloud" aria-hidden="true"><g class="w-sun-peeking"><circle cx="16.5" cy="7.5" r="3"/><line x1="16.5" y1="2.5" x2="16.5" y2="3.8"/><line x1="20.5" y1="5.5" x2="21.7" y2="5"/><line x1="20.5" y1="9.5" x2="21.7" y2="10"/><line x1="13.5" y1="3.5" x2="12.5" y2="2.7"/></g><path class="w-cloud-body" d="M6.5 19a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 16.5 12a4 4 0 0 1 2 7.45H6.5z"/></svg>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-sun" aria-hidden="true"><circle class="w-sun-core" cx="12" cy="12" r="4.2"/><g class="w-sun-rays"><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="6.7" y2="6.7"/><line x1="17.3" y1="17.3" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="6.7" y2="17.3"/><line x1="17.3" y1="6.7" x2="19.07" y2="4.93"/></g></svg>`;
}

const STYLE = `.fc-strip{display:flex;gap:6px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none}.fc-strip::-webkit-scrollbar{display:none}
.fc-day{flex:1 0 72px;display:flex;flex-direction:column;align-items:center;gap:4px;border:1px solid var(--line,#e5e7eb);border-radius:16px;padding:10px 6px;text-align:center;font-size:12px;line-height:1.3;background:var(--paper,#fff);color:inherit;cursor:pointer;transition:transform .15s ease, border-color .15s ease, background-color .15s ease}
.fc-day:hover{border-color:var(--accent,#2f855a);transform:translateY(-2px)}
.fc-day.is-today,.fc-day.we{background:var(--accent-soft,#eef7f0);border-color:var(--accent,#2f855a)}
.fc-day .ic{display:flex;align-items:center;justify-content:center;height:30px;margin:1px 0}
.fc-day .t{font-weight:750;font-size:15px}
.fc-day .lbl{display:block;font-size:12px;font-weight:800;color:var(--ink-2,#374151)}
.fc-note{font-size:12px;color:var(--muted,#6b7280);margin:4px 0 0}
.w-icon{display:inline-block;vertical-align:middle;flex:none;overflow:visible}
.w-icon.w-sun{color:#f59e0b}
.w-icon.w-sun-cloud{color:#64748b}
.w-icon.w-sun-cloud .w-sun-peeking{color:#f59e0b;stroke:#f59e0b}
.w-icon.w-cloud{color:#64748b}
.w-icon.w-rain{color:#3b82f6}
.w-icon.w-snow{color:#60a5fa}
.w-icon.w-lightning{color:#8b5cf6}
.w-icon.w-lightning .w-bolt{color:#f59e0b;fill:#f59e0b}
.w-icon.w-mist{color:#94a3b8}
.w-icon.w-sun .w-sun-rays{transform-origin:12px 12px;animation:w-spin 14s linear infinite}
.w-icon.w-sun .w-sun-core{transform-origin:12px 12px;animation:w-pulse 3s ease-in-out infinite}
.w-icon.w-sun-cloud .w-sun-peeking{transform-origin:16.5px 7.5px;animation:w-sun-peek 4s ease-in-out infinite}
.w-icon.w-sun-cloud .w-cloud-body{animation:w-float 3.5s ease-in-out infinite}
.w-icon.w-cloud .w-cloud-body{animation:w-float 4s ease-in-out infinite}
.w-icon.w-rain .w-cloud-body{animation:w-float 3.5s ease-in-out infinite}
.w-icon.w-rain .w-drop{animation:w-rain-fall 1.3s cubic-bezier(0.4,0,0.6,1) infinite}
.w-icon.w-rain .w-drop.d2{animation-delay:0.4s}
.w-icon.w-rain .w-drop.d3{animation-delay:0.8s}
.w-icon.w-snow .w-cloud-body{animation:w-float 4s ease-in-out infinite}
.w-icon.w-snow .w-flake{animation:w-snow-fall 2s ease-in-out infinite}
.w-icon.w-snow .w-flake.f2{animation-delay:0.65s}
.w-icon.w-snow .w-flake.f3{animation-delay:1.3s}
.w-icon.w-lightning .w-bolt{animation:w-bolt-flash 2.8s ease-in-out infinite;transform-origin:13px 17px}
.w-icon.w-mist .w-mist-line{animation:w-mist-drift 3s ease-in-out infinite alternate}
.w-icon.w-mist .w-mist-line.m2{animation-delay:0.5s}
.w-icon.w-mist .w-mist-line.m3{animation-delay:1s}
.w-icon.w-mist .w-mist-line.m4{animation-delay:1.5s}
@keyframes w-spin{100%{transform:rotate(360deg)}}
@keyframes w-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
@keyframes w-sun-peek{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(0.8px,-0.8px) scale(1.08)}}
@keyframes w-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes w-rain-fall{0%{opacity:0;transform:translateY(-2.5px)}40%{opacity:1}100%{opacity:0;transform:translateY(3px)}}
@keyframes w-snow-fall{0%{opacity:0;transform:translateY(-2px) translateX(0)}50%{opacity:1;transform:translateY(2px) translateX(1px)}100%{opacity:0;transform:translateY(4.5px) translateX(-1px)}}
@keyframes w-bolt-flash{0%,72%,100%{opacity:0.95;transform:scale(1);filter:none}76%{opacity:0.15;transform:scale(0.92)}82%{opacity:1;transform:scale(1.15);filter:drop-shadow(0 0 5px #f59e0b)}88%{opacity:0.3}92%{opacity:1}}
@keyframes w-mist-drift{from{transform:translateX(-2px)}to{transform:translateX(2px)}}
.fc-wind{font-weight:800}.fc-wind-high,.fc-wind-severe{color:#c0392b}
@media (prefers-reduced-motion:reduce){.w-icon *{animation:none!important}}`;
function injectStyle() { if (typeof document === "undefined" || document.getElementById("fc-style")) return; const s = document.createElement("style"); s.id = "fc-style"; s.textContent = STYLE; document.head.appendChild(s); }

/** forecast.json + 캠핑장 id → 날짜순 [{d, sky, pty, tmin, tmax, pop, wsd, src}] */
export function daysFor(data, id, today = kstNow()) {
  const row = data?.camps?.[id];
  if (!row) return [];
  const [grid, land, ta] = row;
  const out = new Map();
  for (const [d, v] of Object.entries(data.short?.grids?.[grid] ?? {})) if (d >= today) out.set(d, { d, sky: v[0], pty: v[1], tmin: v[2], tmax: v[3], pop: v[4], wsd: v[5], src: "short" });
  const L = data.mid?.land?.[land] ?? {}, T = data.mid?.ta?.[ta] ?? {};
  for (const d of new Set([...Object.keys(L), ...Object.keys(T)])) {
    if (d < today || out.has(d)) continue;
    const l = L[d] ?? [], t = T[d] ?? [];
    out.set(d, { d, sky: l[1] ?? l[0] ?? null, sky_am: l[0] ?? null, pty: null, tmin: t[0] ?? null, tmax: t[1] ?? null, pop: l[2] ?? null, src: "mid" });
  }
  return [...out.values()].sort((a, b) => a.d.localeCompare(b.d)).slice(0, 11);
}
// 벤치마크(t39 #38): 풍속 안전팁. 기상청 단기예보 최대 풍속(wsd, m/s) 기준 — 기상청 바람 구분(4~9 약간 강함, 9~14 강함, 14 이상 매우 강함).
/** @returns {null | {d:string, w:number, level:"mid"|"high"|"severe", text:string}} */
export function windTip(days) {
  let top = null;
  for (const x of days ?? []) { const w = Number(x?.wsd); if (Number.isFinite(w) && (!top || w > top.w)) top = { d: x.d, w }; }
  if (!top || top.w < 4) return null;
  if (top.w >= 14) return { ...top, level: "severe", text: "매우 강한 바람 — 텐트·타프 설치를 미루고 캠핑장에 운영 여부를 확인하세요." };
  if (top.w >= 9) return { ...top, level: "high", text: "강한 바람 — 타프는 내리고, 팩은 단단한 것으로 더 박고 스트링을 모두 거세요. 화로는 쓰지 마세요." };
  return { ...top, level: "mid", text: "바람이 다소 강해요 — 팩·스트링을 보강하고 화로 불티를 조심하세요." };
}
function weekendLabel(d, today) {
  const w = dow(d);
  if (w !== 6 && w !== 0) return "";
  const t = dow(today), toSat = t === 6 ? 0 : t === 0 ? -1 : 6 - t;
  const sat = addDays(today, toSat);
  return d <= addDays(sat, 1) ? "이번 주말" : d <= addDays(sat, 8) ? "다음 주말" : "";
}

/** @param {HTMLElement} el 비어 있는 section  @param {{id:string, lat:number, lng:number}} camp */
export async function mount(el, camp) {
  if (!el || !Number.isFinite(camp?.lat)) return;
  injectStyle();
  const data = await load();
  const today = data?.today && data.today > kstNow() ? data.today : kstNow();
  const days = daysFor(data, camp.id, today);
  const relOf = (ymd) => {
    const diff = Math.round((Date.parse(`${ymd}T12:00:00+09:00`) - Date.parse(`${today}T12:00:00+09:00`)) / 864e5);
    if (diff === -1) return "어제";
    if (diff === 0) return "오늘";
    if (diff === 1) return "내일";
    if (diff === 2) return "모레";
    return `${md(ymd)} ${DOW[dow(ymd)]}`;
  };
  const strip = days.map((x) => {
    const lbl = weekendLabel(x.d, today);
    const temp = x.tmax != null ? `${x.tmax}°` : (x.tmin != null ? `${x.tmin}°` : "–");
    // 상세 팝업(app.js openWeatherModal)이 같은 기상청 값·아이콘으로 날짜 칸과 하루 요약을 그리도록 값을 함께 싣는다.
    return `<button type="button" class="fc-day${lbl ? " we" : ""}${x.d === today ? " is-today" : ""}" data-fc-date="${esc(x.d)}" data-fc-rel="${esc(relOf(x.d))}" data-fc-sky="${esc(x.sky ?? "")}" data-fc-pty="${esc(x.pty ?? "")}" data-fc-desc="${esc(x.pty && x.pty !== "없음" ? x.pty : x.sky ?? "")}" data-fc-tmin="${esc(x.tmin ?? "")}" data-fc-tmax="${esc(x.tmax ?? "")}" data-fc-pop="${esc(x.pop ?? "")}" data-fc-src="${esc(x.src)}" title="${esc(x.d)} 날씨 상세">
      <span class="lbl">${relOf(x.d)}</span>
      <span class="ic" role="img" title="${esc(x.pty ?? x.sky ?? "")}">${weatherIconSvg(x.sky, x.pty, 26)}</span>
      <span class="t">${esc(temp)}</span>
    </button>`;
  }).join("");
  const nShort = days.filter((x) => x.src === "short").length, nMid = days.length - nShort;
  let note;
  if (!days.length) note = "예보를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.";
  else if (!nMid) note = `오늘부터 ${nShort}일 예보예요(기상청 단기예보). 그 뒤 날짜는 중기예보가 연결되면 함께 보여요.`;
  else note = `오늘부터 ${days.length}일 예보예요. 앞 ${nShort}일은 동네 단위 단기예보, 뒤 ${nMid}일은 권역 단위 중기예보(오후 기준)예요.`;
  // 보조 정보: 이번 주말(토) 일출·일몰·달, 지금 미세먼지, 특보
  const t = dow(today), sat = addDays(today, t === 6 ? 0 : t === 0 ? -1 : 6 - t);
  const sun = sunTimes(sat, camp.lat, camp.lng), moon = moonPhase(sat);
  const extra = [];
  if (sun.sunrise) extra.push([`이번 주말 해`, `일출 ${sun.sunrise} · 일몰 ${sun.sunset} <span class="muted">${md(sat)} 토</span>`]);
  extra.push(["토요일 밤 달", `${esc(moon.label)} (밝기 ${Math.round(moon.illum * 100)}%)${moon.dark_sky ? " · 별 보기 좋은 밤" : ""}`]);
  const row = data?.camps?.[camp.id], air = row?.[3] ? data.air?.[row[3]] : null;
  if (air?.grade) extra.push(["미세먼지(지금)", `${AIR[air.grade]} <span class="muted">${row[3].startsWith("s:") ? `${esc(row[3].slice(2))} 측정소` : `${esc(row[3].slice(2))} 측정소 ${air.stations}곳 중앙값`} · PM10 ${air.pm10 ?? "–"} · PM2.5 ${air.pm25 ?? "–"}</span>`]);
  const td = row?.[5] ? data.tide?.[row[5]] : null;
  if (td) {
    const dd = td.days?.[sat] ? sat : td.days?.[today] ? today : Object.keys(td.days ?? {}).sort()[0];
    const list = td.days?.[dd] ?? [];
    if (list.length) extra.push([`물때 ${md(dd)} ${dd === sat ? "토" : dd === today ? "오늘" : ""}`.trim(), `${list.map(([t, ty, h]) => `${esc(ty)} ${esc(t)}${h != null ? `(${esc(h)}cm)` : ""}`).join(" · ")} <span class="muted">${esc(td.name)} 예보지점${row[6] != null ? ` · ${esc(row[6])}km` : ""}</span>`]);
  }
  const ls = data.landslide?.[String(camp?.id ?? "")];
  if (ls) extra.push(["산사태 예측", `${esc(ls[0])} · 산림청 ${esc(new Date(ls[1]).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }))} 분석. <a href="https://sansatai.forest.go.kr/" target="_blank" rel="noopener">산사태정보시스템</a>`]);
  const wt = windTip(days);
  if (wt) extra.push([`바람 안전`, `<span class="fc-wind fc-wind-${wt.level}">최대 ${esc(wt.w)} m/s</span> ${esc(wt.text)} <span class="muted">${esc(relOf(wt.d))} · 기상청 단기예보</span>`]);
  if (row?.[4]) extra.push(["기상특보", '이 지역에 특보가 발효 중이에요. <a href="https://www.weather.go.kr/" target="_blank" rel="noopener">기상청 확인</a>']);
  const stamp = data?.generated_at ? `${kstStamp(data.generated_at)} KST 확인 · 기상청${air ? "·에어코리아" : ""}` : "";
  el.innerHTML = `<div class="sec-head"><div class="sec-title"><svg class="ic line"><use href="#i-weather"/></svg><h2>주간 날씨</h2></div></div>
    ${strip ? `<div class="fc-strip" role="list">${strip}</div>` : ""}
    <p class="fc-note">${esc(note)}</p>
    <dl class="uses info">${extra.map(([l, v]) => `<div class="use"><dt>${l}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  el.hidden = false;
}
