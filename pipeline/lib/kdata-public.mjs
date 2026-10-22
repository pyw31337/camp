/**
 * k-data.aljal.kr 공공시설 상세 페이지의 읽기 전용 정규화기.
 *
 * 이 사이트는 공공 원천을 모아 보여 주는 공개 색인이다. 화면에 확정값으로
 * 쓰기 전에 원문 링크와 확인 시각을 함께 보존하고, 기존 값은 병합기에서
 * 절대 줄이지 않는다. HTML을 저장하지 않고 필요한 공개 필드만 추출한다.
 */

const clean = (value) => String(value ?? "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/\s+/g, " ")
  .trim();

const attr = (html, name) => {
  const re = new RegExp(`${name}=["']([^"']*)["']`, "i");
  return clean(html.match(re)?.[1] ?? "") || null;
};

const first = (html, re) => clean(html.match(re)?.[1] ?? "") || null;

export const KDATA_CATEGORIES = {
  foresttrip: { label: "자연휴양림", path: "/foresttrip", kind: "forest" },
  reststop: { label: "고속도로 휴게소", path: "/reststop", kind: "rest" },
  indoorplay: { label: "실내놀이터", path: "/indoorplay", kind: "indoorplay" },
  pool: { label: "수영장", path: "/pool", kind: "pool" },
  leisure: { label: "공공 레포츠", path: "/leisure", kind: "leisure" },
  museum: { label: "박물관·미술관", path: "/museum", kind: "museum" },
};

/** sitemap XML에서 상세 URL만 추출한다. */
export function parseSitemap(xml, category) {
  const base = KDATA_CATEGORIES[category]?.path;
  if (!base) return [];
  return [...String(xml ?? "").matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((m) => m[1].replace(/&amp;/g, "&").trim())
    .filter((url) => {
      try { return new URL(url).pathname.startsWith(`${base}/`) && url !== `https://k-data.aljal.kr${base}`; } catch { return false; }
    });
}

/** 상세 페이지의 <dt>/<dd> 표를 보존 가능한 짧은 필드 맵으로 변환한다. */
export function parseDetailFacts(html) {
  const facts = {};
  const source = String(html ?? "");
  for (const match of source.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const label = clean(match[1]);
    const value = clean(match[2]);
    if (label && value && !facts[label]) facts[label] = value;
  }
  return facts;
}

/** k-data 상세 페이지 → 주변시설 색인용 레코드. */
export function parseKDataDetail(html, { url, category, checkedAt = new Date().toISOString() } = {}) {
  const metaName = first(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
  const name = clean(first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || metaName || "")
    .replace(/\s*[|·].*$/, "")
    .replace(/\s+(국립|공립|사립)\s+예약.*$/, "")
    .replace(/\s+예약(?:\s|$).*$/, "")
    .trim();
  if (!name || !url) return null;
  const lat = Number(attr(html, "data-lat"));
  const lng = Number(attr(html, "data-lng"));
  const facts = parseDetailFacts(html);
  const address = facts["주소"] || first(html, /<meta[^>]+property=["']og:description["'][^>]+content=["'][^"']*?에\s+있는\s+[^.]*?\(([^)]+)\)/i);
  const image = first(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
  const external = [...String(html).matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>/gi)]
    .map((m) => m[1].replace(/&amp;/g, "&"))
    .filter((href) => !/k-data\.aljal\.kr|google|kakao\.com\/maps|naver\.com\/map/i.test(href));
  return {
    id: `${category}:${encodeURIComponent(name)}`,
    category,
    kind: KDATA_CATEGORIES[category]?.kind ?? category,
    name,
    address: address ? clean(address) : null,
    lat: Number.isFinite(lat) && lat >= 33 && lat <= 39 ? lat : null,
    lng: Number.isFinite(lng) && lng >= 124 && lng <= 132 ? lng : null,
    image: image ? clean(image) : null,
    facts,
    source: { url, checked_at: checkedAt, tier: "MENTION", label: "알잘 공공데이터 공개 색인(원문 연결용)" },
    external_urls: [...new Set(external)].slice(0, 12),
  };
}

export function mergePublicRecords(existing = [], incoming = []) {
  const map = new Map(existing.filter(Boolean).map((x) => [x.id, x]));
  for (const item of incoming.filter(Boolean)) {
    const old = map.get(item.id);
    if (!old) { map.set(item.id, item); continue; }
    const merged = { ...old, ...item };
    for (const key of ["address", "image", "lat", "lng"]) if (!item[key] && old[key]) merged[key] = old[key];
    merged.facts = { ...(old.facts ?? {}), ...(item.facts ?? {}) };
    merged.external_urls = [...new Set([...(old.external_urls ?? []), ...(item.external_urls ?? [])])].slice(0, 12);
    merged.source = item.source ?? old.source;
    map.set(item.id, merged);
  }
  return [...map.values()];
}

export function normalizePublicPoi(item) {
  if (!item || !Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))) return null;
  return {
    id: item.id,
    kind: item.kind ?? item.category,
    name: item.name,
    lat: Number(item.lat),
    lng: Number(item.lng),
    addr: item.address ?? null,
    image: item.image ?? null,
    facts: item.facts ?? {},
    url: item.source?.url ?? null,
    source: item.source?.label ?? "알잘 공공데이터 공개 색인",
  };
}
