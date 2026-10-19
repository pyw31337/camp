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
const ICON = (sky, pty) => (/눈/.test(pty ?? sky ?? "") ? "❄️" : /비|소나기|빗방울/.test(pty ?? sky ?? "") ? "🌧️" : /흐림/.test(sky ?? "") ? "☁️" : /구름/.test(sky ?? "") ? "⛅" : sky ? "☀️" : "·");
const STYLE = `.fc-strip{display:flex;gap:6px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none}.fc-strip::-webkit-scrollbar{display:none}
.fc-day{flex:0 0 64px;border:1px solid var(--line,#e5e7eb);border-radius:12px;padding:8px 4px;text-align:center;font-size:12px;line-height:1.35;background:var(--card,#fff)}
.fc-day.we{background:var(--accent-soft,#eef7f0);border-color:var(--accent,#2f855a)}.fc-day b{display:block;font-size:12px}.fc-day .ic{font-size:20px;display:block;margin:2px 0}
.fc-day .t{font-weight:600}.fc-day .p{color:var(--muted,#6b7280)}.fc-day .lbl{display:block;font-size:10px;color:var(--accent,#2f855a);font-weight:700;min-height:13px}
.fc-note{font-size:12px;color:var(--muted,#6b7280);margin:4px 0 0}`;
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
  const strip = days.map((x) => {
    const lbl = weekendLabel(x.d, today);
    const temp = x.tmin != null || x.tmax != null ? `${x.tmin ?? "–"}°/${x.tmax ?? "–"}°` : "";
    return `<div class="fc-day${lbl ? " we" : ""}"><span class="lbl">${lbl}</span><b>${md(x.d)} ${DOW[dow(x.d)]}</b><span class="ic" role="img" title="${esc(x.pty ?? x.sky ?? "")}" aria-label="${esc(x.pty ?? x.sky ?? "")}">${ICON(x.sky, x.pty)}</span><span class="t">${esc(temp)}</span><span class="p">${x.pop != null ? `☔${x.pop}%` : ""}</span></div>`;
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
  if (row?.[4]) extra.push(["기상특보", '이 지역에 특보가 발효 중이에요. <a href="https://www.weather.go.kr/" target="_blank" rel="noopener">기상청 확인</a>']);
  const stamp = data?.generated_at ? `${kstStamp(data.generated_at)} KST 확인 · 기상청${air ? "·에어코리아" : ""}` : "";
  el.innerHTML = `<div class="sec-head"><div class="sec-title"><h2>주간 날씨</h2></div><span class="sec-note">이번 주말·다음 주 미리 보기</span></div>
    ${strip ? `<div class="fc-strip" role="list">${strip}</div>` : ""}
    <p class="fc-note">${esc(note)}</p>
    <dl class="uses info">${extra.map(([l, v]) => `<div class="use"><dt>${l}</dt><dd>${v}</dd></div>`).join("")}</dl>
    <p class="fc-note">${esc(stamp)}${stamp ? " · " : ""}예보는 바뀔 수 있어요. 일출·일몰·달은 천문 계산(±2분)</p>`;
  el.hidden = false;
}
