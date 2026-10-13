// 예약 오픈 목록(캠핑장별): “어느 캠핑장이 언제 어디서 예약이 열리는지”를 한 줄씩.
// 근거는 캠핑장별 예약 안내(booking-intel의 next_openings)와 서울시 공공예약 접수 기간뿐이다.
// 국립 여부를 모르는 휴양림에 국립 공통 일정을 붙인 것(IF_NATIONAL)·변형 템플릿(VARIANT)은 넣지 않는다.

const kst = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? null : new Date(+d + 9 * 3600e3); };
const md = (day) => { const k = kst(`${day}T12:00:00+09:00`); return k ? `${k.getUTCMonth() + 1}.${String(k.getUTCDate()).padStart(2, "0")}` : ""; };
const ym = (s) => { const [y, m] = String(s).split("-"); return `${y}년 ${Number(m)}월`; };

/** 오픈 이벤트의 이용 대상 기간 → 사람이 읽는 문구 */
export function stayLabel(stay) {
  if (!stay) return null;
  if (typeof stay === "string") return stay;
  if (stay.from && stay.to) return `${md(stay.from)}~${md(stay.to)} 숙박분`;
  if (stay.date) return `${md(stay.date)} 숙박분`;
  if (stay.month) return `${ym(stay.month)} 이용분`;
  if (stay.from_month && stay.to_month) return stay.from_month === stay.to_month ? `${ym(stay.from_month)} 이용분` : `${ym(stay.from_month)}~${Number(stay.to_month.split("-")[1])}월 이용분`;
  return null;
}
const kindOf = (label = "") => (/추첨/.test(label) ? "추첨 접수" : /잔여|미결제|취소/.test(label) ? "잔여분 오픈" : "예약 오픈");

/**
 * @param {{records: object[], guides: Map<string, {platform?: {name?: string, url?: string}|null, next: object[]}>, now?: Date, days?: number, perCamp?: number}} input
 * @returns {{at:string, tk:boolean, id:string, name:string, where:string, ph:string|null, kind:string, label:string, stay:string|null, platform:string|null, url:string|null, src:string|null, tier:string|null, unv:boolean}[]}
 */
export function buildOpenings({ records, guides, now = new Date(), days = 45, perCamp = 3 }) {
  const from = now.getTime(), until = from + days * 86400e3;
  const out = [];
  for (const r of records) {
    const where = [r.sido, r.sigungu].filter(Boolean).join(" ");
    const base = { id: r.id, name: r.name, where, ph: r.ph ?? null };
    const rows = [];
    const g = guides.get(r.id);
    const perRule = new Map();
    for (const n of g?.next ?? []) {
      if (n.applies === "IF_NATIONAL" || n.applies === "VARIANT") continue;
      const t = Date.parse(n.at);
      if (!(t >= from - 3600e3 && t <= until)) continue;
      // 매일 열리는 규칙(이용일 N일 전)은 하루치만 보여 준다.
      const key = n.rule_id ?? n.label;
      const used = perRule.get(key) ?? 0;
      if (used >= (n.stay?.date ? 1 : 2)) continue;
      perRule.set(key, used + 1);
      rows.push({ ...base, at: n.at, tk: n.time_known !== false, kind: kindOf(n.label), label: n.label, stay: stayLabel(n.stay), platform: g.platform?.name ?? null, url: r.booking?.url ?? g.platform?.url ?? null, src: n.source?.url ?? null, tier: n.source?.tier ?? null, unv: Boolean(n.needs_verification) });
    }
    // 서울시 공공서비스예약: 원문 접수 기간(접수 시작 예정 / 지금 접수중이면 마감 시각)
    for (const s of r.seoul ?? []) {
      const f = Date.parse(s.from ?? ""), e = Date.parse(s.to ?? "");
      const row = { ...base, tk: true, label: s.name, stay: null, platform: "서울시 공공서비스예약", url: s.url ?? null, src: s.url ?? null, tier: "A", unv: false };
      if (f > from && f <= until) rows.push({ ...row, at: s.from, kind: "접수 시작" });
      else if (f <= from && e > from && /접수중/.test(s.status ?? "")) rows.push({ ...row, at: s.to, kind: "접수 마감" });
    }
    rows.sort((a, b) => a.at.localeCompare(b.at));
    out.push(...rows.slice(0, perCamp));
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.name.localeCompare(b.name, "ko"));
}
