// 캠핑장 원자 사실(fact) 만들기. 사실 1행 = (캠핑장, 속성, 값, 등급, 원천, 확인 시각, 근거 문장).
// - 속성 코드는 registry/attribute-dictionary.json에 정의된 것만 쓴다(검사: validateFacts).
// - 같은 속성에 원천이 여럿이면 모두 남긴다(충돌 포함). 고르는 일은 조회 쪽(fact-query.mjs)이 등급 순으로 한다.
// - 프로필·요약(campground-profile.mjs)은 화면용 읽기 모델이고, 이 저장소는 여러 에이전트가 조합·검증하는 원장이다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DICTIONARY = JSON.parse(readFileSync(fileURLToPath(new URL("../registry/attribute-dictionary.json", import.meta.url)), "utf8"));
export const ATTR = new Map(DICTIONARY.attributes.map((a) => [a.code, a]));
export const GRADE_RANK = { VERIFIED: 4, OPERATOR: 3, CONFIRMED: 2, MENTION: 1 };

// 원천 코드 → 사람이 읽는 이름
export const SOURCES = {
  pilot_verified: "모여라캠핑 파일럿 원문 대조",
  operator_homepage: "운영자 홈페이지",
  operator_discovered: "운영자 홈페이지(카카오 검색으로 발굴)",
  gocamping: "한국관광공사 고캠핑 등록값",
  gocamping_intro: "고캠핑 운영자 소개글",
  kakao_local: "카카오 로컬(장소 검색 API)",
  kakao_web: "Daum 웹 검색(홈페이지 후보)",
  review_search: "Daum 블로그·카페 검색 요약",
};

const ENV = { 산: "MOUNTAIN", 숲: "FOREST", 강: "RIVER", 호수: "LAKE", 계곡: "VALLEY", 해변: "BEACH", 섬: "ISLAND", 도심: "CITY" };
const THEME = {
  여름물놀이: "SUMMER_WATER", 낚시: "FISHING", 봄꽃여행: "SPRING_FLOWER", 가을단풍명소: "AUTUMN_LEAVES", 겨울눈꽃명소: "WINTER_SNOW",
  걷기길: "WALKING", 일몰명소: "SUNSET", 일출명소: "SUNRISE", 스키: "SKI", 액티비티: "ACTIVITY", 수상레저: "WATER_LEISURE", 항공레저: "AIR_LEISURE",
};
const SEASON = { 봄: "SPRING", 여름: "SUMMER", 가을: "AUTUMN", 겨울: "WINTER" };
const KIND = { AUTO_PITCH: "AUTO", GENERAL_PITCH: "GENERAL", GLAMPING: "GLAMPING", CARAVAN: "CARAVAN", CAMPNIC: "CAMPNIC" };
const SURFACE = { GRAVEL: "GRAVEL", DECK: "DECK", GRASS: "GRASS", SAND: "SAND", SOIL: "SOIL" };
const FEATURE = { SWIMMING_POOL: "POOL", FOREST_TRAIL: "TRAIL", PLAYGROUND: "PLAYGROUND", TRAMPOLINE: "TRAMPOLINE", STORE: "STORE", WIFI: "WIFI" };
const OP_AMENITY = { WIFI: "WIFI", STORE: "STORE", POOL: "POOL", TRAMPOLINE: "TRAMPOLINE", PLAYGROUND: "PLAYGROUND", DISHWASH: "DISHWASH" };

// 고캠핑 부대시설 자유 문자열 → 편의시설 코드. 앞에서부터 모두 검사(한 문자열이 여러 코드일 수 있다).
// 부정·예정 표현(없음·불가·준비중·공사·예정)은 버린다.
export const AMENITY_RX = [
  ["WIFI", /무선인터넷|와이파이|wi-?fi/i], ["STORE", /매점|편의점|마트|마켓/], ["POOL", /수영장|물놀이|풀장|워터|유수풀|온수풀|성인풀|유아풀|키즈수영장|바닥분수/],
  ["PLAYGROUND", /놀이터|놀이시설|놀이기구|모래놀이/], ["TRAMPOLINE", /트[렘램]폴린|트램펄린|트램플린|에어바운스|방방/],
  ["SPORTS", /운동장|운동시설|족구|풋살|농구|배드민턴|축구|테니스|배구|탁구|파크골프|골프|운동기구/], ["TRAIL", /산책로|둘레길|탐방로|숲길|등산로|산림욕|정원길|배움숲길/],
  ["CAFE", /카페|커피|베이커리/], ["RESTAURANT", /식당|음식점|한식|중식|정육점|치킨|피자|레스토랑/], ["DUMP_STATION", /덤프\s*스테이션|직배수|오수처리/],
  ["SLED", /썰매/], ["SAUNA", /사우나|찜질|노천탕|족욕|해수찜|자쿠지|월풀/], ["PET_RUN", /(반려견|애견|강아지|펫)\s*(놀이터|운동장|수영장|산책로|드라이|스파|목욕|그루밍)/],
  ["EV_CHARGER", /전기차\s*충전/], ["DISHWASH", /개수대|세척장|싱크대|취사장/], ["BBQ", /바[베비]큐|그릴/],
  ["FISHING", /낚시|송어/], ["KIDS_ROOM", /키즈(카페|방|룸|북카페)|실내\s*놀이|놀이방|플레이룸|어린이\s*(놀이방|도서|책방|영화관)/],
  ["FARM", /텃밭|농장|영농|채소밭|블루베리|원예/], ["ANIMAL", /동물(원|농장|체험)|미니\s*동물원|토끼|앵무새|승마/],
  ["LIBRARY", /도서|북카[페패]|책방|독서/], ["KARAOKE", /노래|오락/], ["SHARED_FRIDGE", /냉장고|전자레인지|전자레이지/],
  ["LAUNDRY", /세탁|탈수기/], ["PRIVATE_BBQ", /개별\s*(바[베비]큐|BBQ)/i], ["WATER_LEISURE", /카약|수상레저|서핑|스킨스쿠버/], ["STARGAZING", /천문대|천체|별빛/],
];
const AMENITY_NEG = /없음|없습니다|불가|준비\s*중|공사|예정|미비|제한/;
export function amenityCodes(text) {
  const s = String(text ?? "");
  if (AMENITY_NEG.test(s)) return [];
  return AMENITY_RX.filter(([, re]) => re.test(s)).map(([code]) => code);
}

/** "15:00부터"·"오후 3시" → "15:00" (모르면 null) */
export function hhmm(text) {
  const s = String(text ?? "");
  let m = s.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (m) return `${String(+m[1]).padStart(2, "0")}:${m[2]}`;
  m = s.match(/(오전|오후)?\s*(\d{1,2})\s*시(\s*(\d{1,2})\s*분|\s*반)?/);
  if (!m) return null;
  let h = +m[2];
  if (m[1] === "오후" && h < 12) h += 12;
  const min = m[3]?.includes("반") ? 30 : +(m[4] ?? 0);
  return h <= 24 ? `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` : null;
}

const REVIEW_CODE = Object.fromEntries(DICTIONARY.attributes.filter((a) => a.review_label).map((a) => [a.review_label, a.code]));
const won = (n) => (n >= 10000 ? `${+(n / 10000).toFixed(1)}만원` : `${n.toLocaleString("ko-KR")}원`);

/**
 * 캠핑장 1곳의 원자 사실 목록.
 * @param c  campgrounds.json 항목(고캠핑 등록값 + of 운영자 배지 사실 + field_conditions)
 * @param d  camps/{id}.json(spec·prices·reviews·cafe), 없으면 null
 * @param o  { site(운영자 사이트 수집 결과, 공유 호스트면 null), details(extractSiteDetails 결과), digest(digestReviews 결과), kakao(kakao-places 항목) }
 */
export function factsOf(c, d, { site = null, details = null, digest = null, kakao = null } = {}) {
  const out = [];
  const cid = String(c.id);
  const push = (attr, value, grade, src, extra = {}) => {
    if (value === null || value === undefined || value === "" || Number.isNaN(value)) return;
    out.push({ cid, attr, value, grade, src, url: null, at: null, ...extra });
  };
  // ── 고캠핑 등록값(CONFIRMED)
  const fc = c.field_conditions ?? {};
  // 파일럿 캠핑장은 고캠핑 링크가 없어 파일럿 원문 출처를 쓴다.
  const gc = { url: c.gc_url ?? fc.source?.url ?? null, at: c.modified_at ?? fc.source?.checked_at ?? null };
  const fcAt = { url: fc.source?.url ?? gc.url, at: fc.source?.checked_at ?? gc.at };
  let total = 0;
  for (const [k, n] of c.kinds ?? []) if (KIND[k] && n > 0) { push(`STAY_${KIND[k]}_SITES`, n, "CONFIRMED", "gocamping", gc); total += n; }
  if (total) push("SITE_TOTAL", total, "CONFIRMED", "gocamping", gc);
  for (const e of c.env ?? []) if (ENV[e]) push(`ENV_${ENV[e]}`, true, "CONFIRMED", "gocamping", gc);
  for (const t of c.themes ?? []) if (THEME[t]) push(`THEME_${THEME[t]}`, true, "CONFIRMED", "gocamping", gc);
  const seasons = new Set(c.seasons ?? []);
  if (seasons.size) for (const [k, v] of Object.entries(SEASON)) push(`OPEN_${v}`, seasons.has(k), "CONFIRMED", "gocamping", gc);
  const days = (c.days ?? [])[0];
  if (days === "평일+주말") push("OPEN_DAYS", "ALL", "CONFIRMED", "gocamping", gc);
  else if (days === "주말") push("OPEN_DAYS", "WEEKEND", "CONFIRMED", "gocamping", gc);
  if (c.status) push("OPERATING_STATUS", c.status === "휴장" ? "PAUSED" : "OPEN", "CONFIRMED", "gocamping", gc);
  if (c.op) push("OPERATOR_TYPE", c.op, "CONFIRMED", "gocamping", gc);
  if (c.pets) push("PET_POLICY", c.pets === "불가능" ? "NOT_ALLOWED" : c.pets.includes("소형") ? "SMALL_ONLY" : "ALLOWED", "CONFIRMED", "gocamping", { ...gc, text: c.pets });
  if (c.fire) push("FIRE_PIT", c.fire === "개별" ? "INDIVIDUAL" : c.fire === "불가" ? "NONE" : "SHARED", "CONFIRMED", "gocamping", { ...gc, text: c.fire });
  if (typeof c.trailer === "boolean") push("TRAILER_ALLOWED", c.trailer, "CONFIRMED", "gocamping", gc);
  if (typeof c.caravan === "boolean") push("CARAVAN_ALLOWED", c.caravan, "CONFIRMED", "gocamping", gc);
  if (c.tel) push("PHONE", c.tel, "CONFIRMED", "gocamping", gc);
  if (c.homepage) push("HOMEPAGE", c.homepage, "CONFIRMED", "gocamping", gc);
  const am = new Map();
  for (const a of c.amenities ?? []) {
    if (a === "전기") continue;
    if (a === "온수") continue;
    if (a === "장작판매") continue;
    for (const code of amenityCodes(a)) if (!am.has(code)) am.set(code, a);
  }
  for (const [code, raw] of am) push(`AMENITY_${code}`, true, "CONFIRMED", "gocamping", { ...gc, text: raw });
  for (const ch of c.booking?.channels ?? []) {
    const code = ch.platform_id ?? ch.kind;
    if (code) push("BOOKING_CHANNEL", code, "CONFIRMED", "gocamping", { url: c.booking?.source?.url ?? gc.url, at: c.booking?.source?.checked_at ?? gc.at, text: ch.platform_name ?? null });
  }
  if ((c.booking?.methods ?? []).length) push("BOOKING_REALTIME", c.booking.methods.includes("온라인실시간예약"), "CONFIRMED", "gocamping", gc);

  // ── 전수조사·파일럿 현장 조건(field_conditions). VERIFIED면 파일럿, 아니면 고캠핑 등록값·공식 소개에서 온 확인값만.
  const verified = fc.status === "VERIFIED";
  const fg = verified ? ["VERIFIED", "pilot_verified"] : ["CONFIRMED", "gocamping"];
  const ok = (x) => x && x.state && x.state !== "UNKNOWN";
  if ((c.amenities ?? []).includes("전기") || fc.power?.available === true) push("POWER_AVAILABLE", true, ...fg, fcAt);
  if (verified && Number(fc.power?.limit_w) > 0) push("POWER_MAX_W", Number(fc.power.limit_w), ...fg, { ...fcAt, text: `최대 ${fc.power.limit_w}W` });
  if (ok(fc.charcoal) && typeof fc.charcoal.allowed === "boolean") push("CHARCOAL_ALLOWED", fc.charcoal.allowed, ...fg, fcAt);
  if (ok(fc.firewood) && typeof fc.firewood.allowed === "boolean") push("FIREWOOD_ALLOWED", fc.firewood.allowed, ...fg, fcAt);
  if (fc.firewood?.sold === true || (c.amenities ?? []).includes("장작판매")) push("FIREWOOD_SOLD", true, "CONFIRMED", "gocamping", gc);
  if (verified && fc.parking?.mode) push("PARKING_MODE", fc.parking.mode === "SITE_ADJACENT" ? "SITE_SIDE" : fc.parking.mode === "DROP_OFF_EXTERNAL" ? "EXTERNAL" : fc.parking.mode, ...fg, fcAt);
  const sn = fc.sanitary ?? {};
  if (Number(sn.toilets_count) > 0) push("TOILET_COUNT", Number(sn.toilets_count), ...fg, fcAt);
  if (Number(sn.showers_count) > 0) push("SHOWER_COUNT", Number(sn.showers_count), ...fg, fcAt);
  if (sn.hot_water || (c.amenities ?? []).includes("온수")) push("HOT_WATER", true, ...fg, { ...fcAt, text: typeof sn.hot_water === "string" ? sn.hot_water : null });
  if (sn.private_bathroom === true) push("PRIVATE_BATHROOM", true, ...fg, fcAt);
  for (const t of new Set((fc.ground?.types ?? []).map((g) => g.type))) if (SURFACE[t]) push("SITE_SURFACE", SURFACE[t], ...fg, fcAt);
  for (const g of fc.site_size?.groups ?? []) if (g.width_m && g.depth_m) push("SITE_SIZE", `${g.width_m}×${g.depth_m}m`, ...fg, { ...fcAt, text: g.name ?? null, count: g.count ?? null });
  for (const f of fc.features ?? []) if (FEATURE[f]) push(`AMENITY_${FEATURE[f]}`, true, ...fg, fcAt);
  for (const r of fc.rental_offers ?? []) push("RENTAL_ITEM", r.item, ...fg, { ...fcAt, num: r.price_krw ?? null });

  // ── 운영자 공개 문장(OPERATOR). 공유 호스트(지자체 통합 예약 등)는 호출 쪽에서 site=null로 넘긴다.
  if (site) {
    const src = site.discovered ? "operator_discovered" : "operator_homepage";
    const at = site.checked_at ?? null;
    const urlOf = (q) => site.snippets?.find((s) => s.text === q)?.url ?? site.url ?? null;
    const of = c.of ?? {};
    const op = (attr, value, v, extra = {}) => push(attr, value, "OPERATOR", src, { url: v?.u ?? site.url ?? null, at: v?.t ?? at, quote: v?.q ?? null, ...extra });
    if (of.w?.v) op("POWER_MAX_W", of.w.v, of.w, { text: `최대 ${of.w.v}W` });
    if (of.pk?.v) op("PARKING_MODE", of.pk.v === "SITE_SIDE" ? "SITE_SIDE" : "EXTERNAL", of.pk);
    if (of.fire?.v) op("FIRE_RULE", of.fire.v, of.fire);
    if (typeof of.cc?.v === "boolean") op("CAR_CAMPING", of.cc.v, of.cc);
    if (details) {
      const dq = (attr, value, x, extra = {}) => push(attr, value, "OPERATOR", src, { url: urlOf(x.quote), at, quote: x.quote, ...extra });
      for (const it of details.SITE_PRICE?.items ?? []) dq("PRICE_NIGHT", it.amount, it, { text: won(it.amount), label: it.label ?? null });
      if (details.FIRE_SET_FEE) dq("FIRE_SET_FEE", details.FIRE_SET_FEE.amount, details.FIRE_SET_FEE, { text: won(details.FIRE_SET_FEE.amount) });
      if (details.BBQ_SET_FEE) dq("BBQ_SET_FEE", details.BBQ_SET_FEE.amount, details.BBQ_SET_FEE, { text: won(details.BBQ_SET_FEE.amount) });
      if (details.ELECTRIC_FEE) dq("POWER_FEE", details.ELECTRIC_FEE.amount, details.ELECTRIC_FEE, { text: won(details.ELECTRIC_FEE.amount) });
      if (details.PET_FEE) dq("PET_FEE", details.PET_FEE.amount, details.PET_FEE, { text: won(details.PET_FEE.amount) });
      for (const a of details.AMENITIES ?? []) {
        if (a.code === "HOT_WATER") dq("HOT_WATER", true, a);
        else if (a.code === "PRIVATE_TOILET") dq("PRIVATE_BATHROOM", true, a);
        else if (OP_AMENITY[a.code]) dq(`AMENITY_${OP_AMENITY[a.code]}`, true, a, a.period ? { period: a.period } : {});
      }
      if (details.SEASON?.value === "SEASONAL_CLOSURE") dq("SEASONAL_CLOSURE", "기간 휴장", details.SEASON);
      if (details.SEASON?.value === "YEAR_ROUND") dq("YEAR_ROUND", true, details.SEASON);
      if (details.REFUND) dq("REFUND_POLICY", "규정 있음", details.REFUND);
    }
  }

  // ── 스펙 시트(운영자 홈페이지·공지·고캠핑 소개 문장 + 후기 언급)
  for (const [code, f] of Object.entries(d?.spec?.fields ?? {})) {
    if (!ATTR.has(code)) continue;
    for (const v of f.values ?? []) {
      const kind = v.source?.kind;
      const [grade, src] = kind === "gocamping_intro" ? ["CONFIRMED", "gocamping_intro"] : ["OPERATOR", site?.discovered ? "operator_discovered" : "operator_homepage"];
      const value = ATTR.get(code).type === "time" ? hhmm(v.value) ?? v.value : code === "PET_POLICY" ? petCode(v.value) : v.value;
      push(code, value, grade, src, { url: v.source?.url ?? null, at: v.source?.date ?? null, quote: v.quote ?? null, text: v.value, period: v.period ?? undefined });
    }
    for (const m of f.mentions ?? []) {
      const value = ATTR.get(code).type === "time" ? hhmm(m.value) ?? m.value : code === "PET_POLICY" ? petCode(m.value) : m.value;
      push(code, value, "MENTION", "review_search", { url: m.samples?.[0]?.url ?? null, at: m.samples?.[0]?.date ?? null, quote: m.samples?.[0]?.quote ?? null, text: m.value, n: m.count ?? 1 });
    }
  }
  // ── 후기 요금 언급(1건 1행)
  for (const p of d?.prices ?? []) if (p.won >= 10000 && p.won <= 1000000) push("PRICE_MENTION", p.won, "MENTION", "review_search", { url: p.url ?? null, at: p.date ?? null, quote: p.quote ?? null, text: won(p.won), label: p.day ?? p.season ?? p.label ?? null });
  // ── 후기 장단점(주제별 건수)
  if (digest?.n) {
    push("REVIEW_COUNT", digest.n, "MENTION", "review_search", { n: digest.n });
    for (const [label, n] of [...(digest.all?.pros ?? digest.pros ?? []), ...(digest.all?.cons ?? digest.cons ?? [])]) {
      const code = REVIEW_CODE[label];
      const s = digest.samples?.[label]?.[0];
      if (code) push(code, n, "MENTION", "review_search", { n, url: s?.url ?? null, at: s?.date ?? null, text: label });
    }
  }
  // ── 카카오 공식 API(장소 맞춤·홈페이지 후보)
  if (kakao?.place) {
    const at = kakao.checked_at ?? null;
    push("KAKAO_PLACE", kakao.place.url, "CONFIRMED", "kakao_local", { url: kakao.place.url, at, text: kakao.place.category ?? null });
    if (kakao.place.phone && !c.tel) push("PHONE", kakao.place.phone, "CONFIRMED", "kakao_local", { url: kakao.place.url, at });
  }
  if (kakao?.homepage?.url) push("HOMEPAGE", kakao.homepage.url, "MENTION", "kakao_web", { url: kakao.homepage.evidence?.[0]?.url ?? kakao.homepage.url, at: kakao.checked_at ?? null, quote: kakao.homepage.evidence?.[0]?.title ?? null });
  return out;
}

function petCode(v) {
  const s = String(v ?? "");
  if (/불가|금지|안\s*됩/.test(s)) return "NOT_ALLOWED";
  if (/소형/.test(s)) return "SMALL_ONLY";
  return /가능|동반/.test(s) ? "ALLOWED" : null;
}

/** 사전에 없는 속성·잘못된 등급·원천·타입을 찾는다(빈 배열이면 통과). */
export function validateFacts(facts) {
  const errs = [];
  for (const f of facts) {
    const a = ATTR.get(f.attr);
    if (!a) { errs.push(`${f.cid} 사전에 없는 속성 ${f.attr}`); continue; }
    if (!GRADE_RANK[f.grade]) errs.push(`${f.cid} ${f.attr} 등급 ${f.grade}`);
    if (!SOURCES[f.src]) errs.push(`${f.cid} ${f.attr} 원천 ${f.src}`);
    if (f.grade !== "MENTION" && !f.url) errs.push(`${f.cid} ${f.attr} 원천 URL 없음`);
    const t = a.type, v = f.value;
    const bad = (t === "bool" && typeof v !== "boolean") || (["int", "count", "krw"].includes(t) && !Number.isFinite(v))
      || (t === "enum" && !(v in (a.enum ?? {}))) || (t === "time" && typeof v !== "string");
    if (bad) errs.push(`${f.cid} ${f.attr} 값 ${JSON.stringify(v)}(${t})`);
  }
  return errs;
}
