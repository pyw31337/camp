// ‘이번 주말 컨디션’ 카드(상세 화면). design/renewal/app.js가 동적으로 불러온다.
// 데이터: ./weekend.json(pipeline/scripts/sync-conditions.mjs, 하루 2회) · 일출·일몰·달은 ./astro.js로 브라우저에서 계산.
// 값이 없는 줄은 만들지 않는다. 예보는 참고용이며 출처·확인 시각을 함께 보인다.
import { moonPhase, sunTimes } from "./astro.js";

let cache = null;
const load = () => (cache ??= fetch(new URL("./weekend.json", import.meta.url), { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const AIR = { 1: "좋음", 2: "보통", 3: "나쁨", 4: "매우나쁨" };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const md = (ymd) => { const [, m, d] = ymd.split("-").map(Number); return `${m}/${d}(${DOW[new Date(`${ymd}T12:00:00+09:00`).getUTCDay()]})`; };
function nextWeekend(now = Date.now()) {
  const k = new Date(now + 9 * 3600e3), dow = k.getUTCDay(), add = dow === 6 ? 0 : dow === 0 ? -1 : 6 - dow;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  return { sat: iso(k.getTime() + add * 86400e3), sun: iso(k.getTime() + (add + 1) * 86400e3) };
}
const kstStamp = (iso) => { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} KST`; };

function weatherText(w) {
  if (!w) return null;
  const t = [w.pty ?? w.sky, w.tmin != null || w.tmax != null ? `${w.tmin ?? "–"}°/${w.tmax ?? "–"}°` : null, w.pop ? `강수 ${w.pop}%` : null, w.wsd >= 4 ? `바람 ${w.wsd}m/s` : null].filter(Boolean);
  return t.length ? t.join(" · ") : null;
}

/** @param {HTMLElement} el 비어 있는 section  @param {{id:string, lat:number, lng:number}} camp */
export async function mount(el, camp) {
  if (!el || !Number.isFinite(camp?.lat)) return;
  const data = await load();
  const wk = data?.weekend ?? nextWeekend();
  const row = data?.camps?.[camp.id] ?? {};
  const rows = [];
  [wk.sat, wk.sun].forEach((d, i) => { const t = weatherText(row.w?.[i]); if (t) rows.push([`${md(d)} 날씨`, esc(t) + (row.w[i].src === "mid" ? ' <span class="muted">중기</span>' : "")]); });
  const sun = sunTimes(wk.sat, camp.lat, camp.lng);
  if (sun.sunrise) rows.push(["일출·일몰", `${sun.sunrise} · ${sun.sunset} <span class="muted">${md(wk.sat)}</span>`]);
  const moon = moonPhase(wk.sat);
  rows.push(["토요일 밤 달", `${esc(moon.label)} (밝기 ${Math.round(moon.illum * 100)}%)${moon.dark_sky ? " · 별 보기 좋은 밤" : ""}`]);
  if (row.air?.grade) rows.push(["미세먼지(지금)", `${AIR[row.air.grade]} <span class="muted">${row.air.station ? `${esc(row.air.station)} 측정소` : `${esc(row.air.sido)} 측정소 ${row.air.stations}곳 중앙값`} · PM10 ${row.air.pm10 ?? "–"} · PM2.5 ${row.air.pm25 ?? "–"}</span>`]);
  if (row.fire?.grade) rows.push(["산불위험", `${esc(row.fire.grade)} <span class="muted">지수 ${row.fire.idx}</span>`]);
  const tide = row.tide?.days?.[0];
  if (tide?.length) rows.push([`${md(wk.sat)} 물때`, `${tide.map((x) => `${x.type} ${x.t}`).join(" · ")} <span class="muted">${row.tide.km}km 거리 지점</span>`]);
  if (row.warn) rows.push(["기상특보", '이 지역에 특보가 발효 중이에요. <a href="https://www.weather.go.kr/" target="_blank" rel="noopener">기상청 확인</a>']);
  const note = data?.generated_at ? `${kstStamp(data.generated_at)} 확인 · 기상청·에어코리아·산림청·국립해양조사원` : "일출·일몰·달은 천문 계산(±2분)";
  el.innerHTML = `<div class="sec-head"><div class="sec-title"><h2>이번 주말 컨디션</h2></div><span class="sec-note">${md(wk.sat)}~${md(wk.sun)}</span></div>
    <dl class="uses info">${rows.map(([l, v]) => `<div class="use"><dt>${l}</dt><dd>${v}</dd></div>`).join("")}</dl>
    <p class="muted" style="font-size:12px;margin-top:6px">${esc(note)} · 예보는 바뀔 수 있어요</p>`;
  el.hidden = false;
}
