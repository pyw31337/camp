// 한국도로공사 고속도로 공공데이터 포털(data.ex.co.kr) OpenAPI → 고속도로 휴게소(공식, A등급).
// - locationinfo/locationinfoRest: 휴게소 좌표(xValue=경도, yValue=위도)
// - business/conveniServiceArea: 편의시설(수유실|샤워실|세탁실|수면실|약국…), 정비소·화물차 휴게소 여부
// - business/curStateStation: 휴게소 주유소 유종별 현재 판매가(실시간)
// 세 API는 같은 serviceAreaCode(A…)로 묶이고, 주유소는 이름(“○○주유소” ↔ “○○휴게소”)으로 묶는다.

const EX_BASE = "https://data.ex.co.kr/openapi/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
export const EX_SOURCE = {
  location: `${EX_BASE}locationinfo/locationinfoRest`,
  convenience: `${EX_BASE}business/conveniServiceArea`,
  fuel: `${EX_BASE}business/curStateStation`,
};
export const OIL_BRAND = { AD: "알뜰주유소", SK: "SK에너지", GS: "GS칼텍스", S: "S-OIL", HD: "HD현대오일뱅크", E1: "E1" };

/** 한 쪽을 JSON으로. 오류 페이지(HTML)면 잠깐 쉬고 2번 더 시도, 그래도 아니면 null. */
async function getPage(path, key, size, page, fetchImpl) {
  const url = `${EX_BASE}${path}?key=${encodeURIComponent(key)}&type=json&numOfRows=${size}&pageNo=${page}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1000 * attempt);
    const res = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      if (j.code !== "SUCCESS") throw new Error(`${path} ${j.code ?? ""} ${j.message ?? ""}`.trim());
      return j;
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e; // 인증 오류 등은 바로 알린다
    }
  }
  return null;
}

/**
 * 쪽 단위(99건)로 전부 받는다. 서버가 기본 UA를 400으로 막아 브라우저 UA를 보낸다.
 * 특정 행 때문에 서버가 오류 페이지를 주는 쪽이 있어(예: conveniServiceArea 2쪽), 그 쪽은 9건씩 다시 받고
 * 그래도 실패하는 작은 쪽만 건너뛴다. 건너뛴 행 수는 `skipped`로 돌려준다.
 */
export async function fetchExAll(path, key, { fetchImpl = fetch, pause = 300 } = {}) {
  const rows = [];
  let skipped = 0, total = null;
  for (let page = 1; page <= 100; page++) {
    const j = await getPage(path, key, 99, page, fetchImpl);
    if (j) {
      total ??= j.count ?? null;
      rows.push(...(j.list ?? []));
      if (!j.pageSize || page >= j.pageSize) break;
    } else {
      if (page === 1 && total == null) {
        // 첫 쪽부터 실패하면 작은 쪽으로 전체 건수를 먼저 확인
        const probe = await getPage(path, key, 9, 1, fetchImpl);
        if (!probe) throw new Error(`${path} 응답이 JSON이 아님`);
        total = probe.count ?? null;
      }
      for (let k = 1; k <= 11; k++) {
        const sub = await getPage(path, key, 9, (page - 1) * 11 + k, fetchImpl);
        if (sub) rows.push(...(sub.list ?? []));
        else skipped += 9;
        await sleep(pause);
      }
      if (total != null && page * 99 >= total) break;
    }
    await sleep(pause);
  }
  rows.skipped = total != null ? Math.max(0, total - rows.length) : skipped;
  return rows;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const won = (v) => { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return n > 0 ? n : null; };
const baseName = (s) => String(s ?? "").replace(/(휴게소|주유소|충전소)$/, "").replace(/\s+/g, "");
const has = (list, word) => list.includes(word);

/**
 * @param {{location: object[], convenience: object[], fuel: object[], checkedAt: string}} src
 * @returns {object[]} rest-stops.mjs와 같은 모양의 SERVICE_AREA 항목
 */
export function buildExServiceAreas({ location, convenience, fuel, checkedAt }) {
  const conv = new Map(convenience.map((c) => [c.serviceAreaCode, c]));
  const gas = new Map(fuel.map((g) => [baseName(g.serviceAreaName), g]));
  const out = [];
  for (const l of location) {
    const lat = Number(l.yValue), lng = Number(l.xValue);
    if (!(lat > 33 && lat < 39 && lng > 124 && lng < 132)) continue;
    const c = conv.get(l.serviceAreaCode);
    const items = String(c?.convenience ?? "").split("|").filter(Boolean);
    const g = gas.get(baseName(l.unitName));
    const f = (available, fee) => ({ available, fee: available === false ? null : fee });
    const known = Boolean(c); // 편의시설 목록이 없으면 ‘없음’이 아니라 ‘모름’
    const prices = g ? { gasoline: won(g.gasolinePrice), diesel: won(g.diselPrice), lpg: g.lpgYn === "Y" ? won(g.lpgPrice) : null } : null;
    out.push({
      id: `ex-${l.serviceAreaCode}`,
      kind: "SERVICE_AREA",
      name: l.unitName,
      lat, lng,
      road: l.routeName ?? null,
      direction: l.unitName.match(/\(([^)]+)\)/)?.[1] ?? c?.direction ?? null,
      tel: c?.telNo ?? g?.telNo ?? null,
      address: c?.svarAddr ?? g?.svarAddr ?? null,
      brands: c?.brand ?? null,
      truck_rest: c ? c.truckSaYn === "O" : null,
      maintenance: c ? c.maintenanceYn === "O" : null,
      facilities: {
        toilet: f(true, "FREE"),
        parking: f(true, "FREE"),
        food: f(true, "PAID"),
        convenience: f(true, "PAID"),
        nursing: f(known ? has(items, "수유실") : null, "FREE"),
        shower: f(known ? has(items, "샤워실") : null, null),
        laundry: f(known ? has(items, "세탁실") : null, "PAID"),
        sleep: f(known ? has(items, "수면실") : null, null),
        pharmacy: f(known ? has(items, "약국") : null, "PAID"),
        fuel: f(g ? true : null, "PAID"),
      },
      extras: items.filter((x) => !["수유실", "샤워실", "세탁실", "수면실", "약국"].includes(x)),
      fuel: g ? {
        station: g.serviceAreaName,
        brand: OIL_BRAND[g.oilCompany] ?? g.oilCompany ?? null,
        prices_krw_per_l: prices,
        checked_at: checkedAt,
        source_url: EX_SOURCE.fuel,
        tier: "A",
      } : null,
      source: { id: "ex-openapi", tier: "A", title: "한국도로공사 고속도로 공공데이터 포털", url: EX_SOURCE.location, checked_at: checkedAt },
    });
  }
  return out;
}
