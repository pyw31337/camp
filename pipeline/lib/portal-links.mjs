// 공용 예약 사이트 업장별 주소(소유자 2026-10-23: “숲나들e 같은 공용 예약 사이트도 메인으로만 보내지 말고, 해당 업장 페이지나
// 해당 업장이 골라진 상태로 바로 예약할 수 있게”). registry/portal-directory.json(숲나들e 휴양림·국립공원 야영장 목록)에서
// 이름으로 업장을 찾아, 메인·안내 화면으로 가던 예약 주소를 그 업장 페이지로 바꾼다.
// - 숲나들e: 휴양림 페이지(indvz/main.do?hmpgId=… 또는 /0103) — 그 휴양림의 예약 버튼이 휴양림이 골라진 예약 화면으로 연결된다.
// - 국립공원: 야영장 안내 페이지(serviceGuide.do?…&deptId=…) — 그 야영장 배치도·사진과 예약하기 버튼. 예약 화면 자체는 업장 주소가 없다.
// 이미 그 사이트를 가리키던 링크만 바꾼다(이름만 비슷한 사설 캠핑장은 건드리지 않음).

const flat = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();
// 이름 핵심: 국립·공립, 휴양림·야영장 같은 꼬리를 뗀다
const core = (s) => flat(s).replace(/\[[^\]]*\]/g, "").replace(/(국립|공립|사립|국림)/g, "")
  .replace(/(자연휴양림|휴양림|산림휴양마을|숲속야영장|자동차야영장|오토캠핑장|야영장|캠핑장|국립공원|해상|제\d)/g, "").replace(/\d+$/, "");

export const FOREST_HOST = /(^|\.)(foresttrip\.go\.kr|huyang\.go\.kr)$/i;
export const KNPS_HOST = /(^|\.)knps\.or\.kr$/i;
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ""; } };

/** 이미 업장 페이지인지(바꿀 필요 없음) */
export function isPortalDeep(u) {
  const h = hostOf(u);
  if (FOREST_HOST.test(h)) return /[?&]hmpgId=ID\d+|foresttrip\.go\.kr\/\d{4}\b/i.test(u);
  if (KNPS_HOST.test(h)) return /[?&]deptId=B\d{6}/i.test(u);
  return true;
}

/** 이름이 가장 구체적으로 맞는 한 곳(없거나 애매하면 null) */
function bestMatch(campName, entries, nameOf) {
  const n = core(campName);
  if (n.length < 2) return null;
  const scored = [];
  for (const e of entries) {
    const s = core(nameOf(e));
    if (s.length < 2) continue;
    if (s === n) scored.push([100, e]);
    else if (n.includes(s)) scored.push([s.length, e]);
    else if (s.includes(n)) scored.push([n.length - 0.5, e]);
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b[0] - a[0]);
  // 1위가 같은 점수로 여럿이면(다른 곳) 애매 → 바꾸지 않는다. 같은 야영장의 1·2·3구역은 첫 구역으로.
  const top = scored.filter((x) => x[0] === scored[0][0]).map((x) => x[1]);
  const names = new Set(top.map((e) => core(nameOf(e))));
  return names.size === 1 ? top[0] : null;
}

/** 업장의 공용 예약 사이트 업장 주소 { forest?, knps? } */
export function portalPagesFor(camp, dir) {
  const urls = [camp.booking?.url, camp.homepage, ...(camp.booking?.channels ?? []).map((x) => x.registered_url ?? x.url)].filter(Boolean);
  const out = {};
  if (urls.some((u) => FOREST_HOST.test(hostOf(u)))) {
    const f = bestMatch(camp.name, dir.foresttrip ?? [], (e) => e.name);
    if (f) out.forest = { url: f.page, name: f.name, id: f.id };
  }
  if (urls.some((u) => KNPS_HOST.test(hostOf(u)))) {
    const k = bestMatch(camp.name, dir.knps ?? [], (e) => e.name);
    if (k) out.knps = { url: k.page, name: `${k.park} ${k.name}`, id: k.deptId };
  }
  return out;
}

/**
 * 업장 하나의 예약 채널을 공용 예약 사이트의 업장 페이지로 바꾼다(멱등). 원래 주소는 registered_url로 남긴다.
 * 반환: 바꾼 채널 수
 */
export function applyPortalPages(camp, dir) {
  const pages = portalPagesFor(camp, dir);
  if (!pages.forest && !pages.knps) return 0;
  let n = 0;
  for (const ch of camp.booking?.channels ?? []) {
    const src = ch.registered_url ?? ch.url;
    const h = hostOf(src);
    const page = FOREST_HOST.test(h) ? pages.forest : KNPS_HOST.test(h) ? pages.knps : null;
    if (!page || isPortalDeep(src) || ch.url === page.url) continue;
    ch.registered_url = src;
    ch.url = page.url;
    ch.evidence = [...new Set([...(ch.evidence ?? []), `공용 예약 사이트 업장 페이지(${page.name})`])];
    n++;
  }
  return n;
}
