// 상세 화면 ‘여행 참고 정보’ — ./extras.json(파이프라인 sync-trip-extras.mjs)을 읽어 캠핑장별로 그린다.
// 자료가 하나도 없으면 칸을 숨긴 채 둔다. 원천·등급은 extras.json의 sources를 따른다.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = (iso) => { const [, m, d] = String(iso).split("-"); return `${Number(m)}/${Number(d)}`; };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dow = (iso) => DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const km = (v) => (v < 1 ? `${Math.round(v * 1000)}m` : `${v}km`);
let cache = null;
const load = () => (cache ??= fetch(new URL("./extras.json", import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null));

/** 한 캠핑장의 행 목록 [{k, v(html), src}] */
export function rowsFor(data, id) {
  const o = data?.camps?.[id];
  if (!o) return [];
  const rows = [];
  if (o.fe?.length) {
    const items = o.fe.map(([fid, d]) => [fid, d, data.fest?.[fid]]).filter(([, , f]) => f);
    if (items.length) rows.push({ k: "주변 축제·행사", v: `<ul class="cx-list">${items.map(([fid, d, f]) => `<li><a href="https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=${esc(fid)}" target="_blank" rel="noopener">${esc(f.t)}</a> <small>${esc(md(f.s))}(${dow(f.s)})${f.e && f.e !== f.s ? `~${esc(md(f.e))}(${dow(f.e)})` : ""} · ${esc(km(d))}</small></li>`).join("")}</ul>`, src: "fe" });
  }
  if (o.pet) {
    const d = data.pet_detail?.[o.pet];
    rows.push({ k: "반려동물 동반", v: `한국관광공사 반려동물 동반여행지로 등록된 곳이에요${d ? `<ul class="cx-list">${Object.entries(d).map(([k, v]) => `<li><small>${esc(k)}</small> ${esc(v)}</li>`).join("")}</ul>` : ""}`, src: "pet" });
  }
  if (o.bf) rows.push({ k: "무장애 여행", v: "한국관광공사 무장애(휠체어·유아차 등) 여행정보에 등록된 곳이에요. 세부 편의시설은 전화로 확인하세요.", src: "bf" });
  if (o.tr?.length) rows.push({ k: "근처 걷기길", v: `<ul class="cx-list">${o.tr.map(([n, k, h, kind]) => `<li>${esc(n)} <small>${[kind, k ? `${k}km` : null, h ? `약 ${h}시간` : null].filter(Boolean).map(esc).join(" · ")}</small></li>`).join("")}</ul>`, src: "tr" });
  return rows;
}

const STYLE = `[data-extras] .use small{color:var(--muted,#667);font-size:12px;font-weight:400}[data-extras] .use dd{line-height:1.5}
.cx-list{margin:2px 0 0;padding-left:1.1em}.cx-foot{margin-top:10px;font-size:12px;color:var(--muted,#667);line-height:1.5}`;

/**
 * 주변 전기차 충전소(상세 ‘주변’ 칸에 붙인다): {list:[{name, km, fast, lat, lng}], c5, source:{name,url}, osm} | null
 * extras.json camps[id].ev = [5km 안 개수, [[이름, km, 급속 1/0/null, 위도, 경도], …]]
 */
export function evOf(data, id) {
  const ev = data?.camps?.[id]?.ev;
  if (!Array.isArray(ev?.[1]) || !ev[1].length) return null;
  const source = data.sources?.ev ?? null;
  return { c5: ev[0], list: ev[1].map(([name, km, fast, lat, lng]) => ({ name, km, fast, lat, lng })), source, osm: !/환경부/.test(source?.name ?? "") };
}
export async function evFor(id) { return evOf(await load(), String(id ?? "")); }
export { load };

export async function mount(el, camp) {
  const data = await load();
  // 상세에 ‘주변 축제·행사’ 포스터 칸(/context/events.js)이 있으면 축제 줄은 거기에 맡긴다(중복 방지).
  const rows = rowsFor(data, String(camp?.id ?? "")).filter((r) => r.src !== "fe" || !document.querySelector("[data-events]"));
  if (!rows.length) return;
  if (!document.getElementById("cx-style")) { const s = document.createElement("style"); s.id = "cx-style"; s.textContent = STYLE; document.head.append(s); }
  el.innerHTML = `<div class="sec-head"><div class="sec-title"><h2>여행 참고 정보</h2></div></div>
<dl class="uses">${rows.map((r) => `<div class="use"><dt>${esc(r.k)}</dt><dd>${r.v}</dd></div>`).join("")}</dl>`;
  el.hidden = false;
}
