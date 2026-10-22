// 한국도로공사 공공데이터 API → 고속도로 휴게소·편의시설·유종별 현행 가격.
const EX_BASE = "https://data.ex.co.kr/openapi/";
const USER_AGENT = "moyeora-camping-pipeline (github.com/pyw31337/camp)";
export const EX_SOURCE = {
  location: `${EX_BASE}locationinfo/locationinfoRest`,
  convenience: `${EX_BASE}business/conveniServiceArea`,
  fuel: `${EX_BASE}business/curStateStation`,
  best_food: `${EX_BASE}restinfo/restBestfoodList`,
};
const OIL_BRAND = { AD: "알뜰주유소", SK: "SK에너지", GS: "GS칼텍스", S: "S-OIL", HD: "HD현대오일뱅크", E1: "E1" };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const won = (value) => { const number = Number(String(value ?? "").replace(/[^\d]/g, "")); return number > 0 ? number : null; };
const baseName = (name) => String(name ?? "").replace(/(휴게소|주유소|충전소)$/, "").replace(/\s+/g, "");

async function getPage(path, key, size, page, fetchImpl) {
  const url = `${EX_BASE}${path}?key=${encodeURIComponent(key)}&type=json&numOfRows=${size}&pageNo=${page}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await pause(1000 * attempt);
    const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
    const text = await response.text();
    try {
      const body = JSON.parse(text);
      if (body.code !== "SUCCESS") throw new Error(`${path} ${body.code ?? ""} ${body.message ?? ""}`.trim());
      return body;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  return null;
}

/** API가 큰 페이지에서 HTML 오류를 반환하면 9개씩 다시 요청하고, 끝까지 실패한 페이지만 기록한다. */
export async function fetchExAll(path, key, { fetchImpl = fetch, wait = pause } = {}) {
  const rows = [];
  let total = null;
  for (let page = 1; page <= 100; page++) {
    const body = await getPage(path, key, 99, page, fetchImpl);
    if (body) {
      total ??= body.count ?? null;
      rows.push(...(body.list ?? []));
      if (!body.pageSize || page >= body.pageSize) break;
    } else {
      if (page === 1 && total == null) {
        const probe = await getPage(path, key, 9, 1, fetchImpl);
        if (!probe) throw new Error(`${path} 응답이 JSON이 아님`);
        total = probe.count ?? null;
      }
      for (let subPage = 1; subPage <= 11; subPage++) {
        const sub = await getPage(path, key, 9, (page - 1) * 11 + subPage, fetchImpl);
        if (sub) rows.push(...(sub.list ?? []));
        await wait(300);
      }
      if (total != null && page * 99 >= total) break;
    }
    await wait(300);
  }
  rows.skipped = total != null ? Math.max(0, total - rows.length) : 0;
  return rows;
}

export function buildExServiceAreas({ location, convenience, fuel, bestFood = [], checkedAt }) {
  const conveniences = new Map(convenience.map((item) => [item.serviceAreaCode, item]));
  const fuels = new Map(fuel.map((item) => [baseName(item.serviceAreaName), item]));
  const foods = new Map();
  for (const item of bestFood) {
    const key = item.code ?? baseName(item.area);
    if (!key) continue;
    const list = foods.get(key) ?? [];
    if (!list.some((x) => x.menu === item.menu && x.price === item.price)) list.push({ menu: item.menu, price: item.price });
    foods.set(key, list);
  }
  const available = (value, fee) => ({ available: value, fee: value === false ? null : fee });
  const result = [];
  for (const item of location) {
    const lat = Number(item.yValue), lng = Number(item.xValue);
    if (!(lat > 33 && lat < 39 && lng > 124 && lng < 132)) continue;
    const detail = conveniences.get(item.serviceAreaCode);
    const facilities = String(detail?.convenience ?? "").split("|").filter(Boolean);
    const station = fuels.get(baseName(item.unitName));
    const best = foods.get(item.serviceAreaCode) ?? foods.get(baseName(item.unitName)) ?? [];
    const known = Boolean(detail);
    const has = (label) => facilities.includes(label);
    const prices = station ? { gasoline: won(station.gasolinePrice), diesel: won(station.diselPrice), lpg: station.lpgYn === "Y" ? won(station.lpgPrice) : null } : null;
    result.push({
      id: `ex-${item.serviceAreaCode}`, kind: "SERVICE_AREA", name: item.unitName, lat, lng, road: item.routeName ?? null,
      direction: item.unitName.match(/\(([^)]+)\)/)?.[1] ?? detail?.direction ?? null, tel: detail?.telNo ?? station?.telNo ?? null,
      address: detail?.svarAddr ?? station?.svarAddr ?? null, facilities: {
        toilet: available(true, "FREE"), parking: available(true, "FREE"), food: available(true, "PAID"), convenience: available(true, "PAID"),
        nursing: available(known ? has("수유실") : null, "FREE"), shower: available(known ? has("샤워실") : null, null),
        laundry: available(known ? has("세탁실") : null, "PAID"), sleep: available(known ? has("수면실") : null, null),
        pharmacy: available(known ? has("약국") : null, "PAID"), fuel: available(station ? true : null, "PAID"),
      },
      extras: facilities.filter((facility) => !["수유실", "샤워실", "세탁실", "수면실", "약국"].includes(facility)),
      best_foods: best.slice(0, 5).map((x) => ({ ...x, source_url: EX_SOURCE.best_food, checked_at: checkedAt, tier: "A" })),
      fuel: station ? { station: station.serviceAreaName, brand: OIL_BRAND[station.oilCompany] ?? station.oilCompany ?? null, prices_krw_per_l: prices, checked_at: checkedAt, source_url: EX_SOURCE.fuel, tier: "A" } : null,
      source: { id: "ex-openapi", tier: "A", title: "한국도로공사 고속도로 공공데이터 포털", url: EX_SOURCE.location, checked_at: checkedAt },
    });
  }
  return result;
}

/**
 * 한국도로공사 대표 메뉴 응답을 휴게소별로 붙일 수 있는 작은 목록으로 정규화한다.
 * API 버전에 따라 필드명이 조금씩 달라서, 이름·코드·메뉴·가격 후보를 보수적으로 읽는다.
 * 원문에 없는 값은 만들지 않고, 매칭되지 않은 메뉴도 버리지 않는다(다음 병합에서 재사용).
 */
export function normalizeBestFoods(rows = []) {
  const value = (row, names) => {
    for (const name of names) {
      const key = Object.keys(row ?? {}).find((k) => k.toLowerCase() === name.toLowerCase());
      if (key && row[key] != null && String(row[key]).trim()) return String(row[key]).trim();
    }
    return null;
  };
  const out = [];
  for (const row of rows) {
    const code = value(row, ["serviceAreaCode", "svarCd", "휴게소코드"]);
    const area = value(row, ["serviceAreaName", "svarNm", "휴게소명", "unitName"]);
    const menu = value(row, ["foodName", "menuName", "대표메뉴", "메뉴명"]);
    const price = won(value(row, ["price", "foodPrice", "대표메뉴가격", "가격"]));
    if (!code && !area || !menu) continue;
    out.push({ code: code ?? null, area: area ?? null, menu, price, source_url: EX_SOURCE.best_food });
  }
  return out;
}
