// 모여라캠핑 리뉴얼 시안 (design/renewal → /camp/renewal/). 기획: docs/RENEWAL_PLAN.md
// 데이터는 탐색 화면과 같은 공개 파일을 읽는다(../explore/data). 사진 색인은 scripts/build-renewal-data.mjs.
// 원칙: 값만 짧게, 출처는 (i), 모르는 칸은 상세 규격에서만 회색 ‘확인필요’ 글자. 채운 배지는 원문 대조·공식 등록·운영자 공개 값만.

// /camp/ 루트와 /camp/explore/ 및 로컬 시안 /camp/renewal/ 경로를 모두 지원한다.
const IS_SUBDIR = location.pathname.includes("/explore/") || location.pathname.includes("/renewal/");
const ASSETS_BASE = IS_SUBDIR ? "../" : "./";
const DATA = location.pathname.includes("/explore/") ? "./data/" : location.pathname.includes("/renewal/") ? "../explore/data/" : "./explore/data/";
const MEDIA = IS_SUBDIR ? "../media/" : "./media/";
const MOD_ROOT = /\/(explore|renewal)\/[^/]*$/.test(new URL(import.meta.url).pathname) ? "../" : "./";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
const fmt = (n) => Number(n).toLocaleString("ko-KR");
// 카드·목록의 1박 요금 표기를 한 형식으로: 4만~5만원, 2만~2.5만원대(후기 언급처럼 어림값이면 ‘대’).
const manWon = (n) => (n % 10000 === 0 ? `${n / 10000}만` : n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, "")}만` : `${Math.round(n / 1000)}천`);
function feeLabel(fee) {
  if (!fee) return null;
  const lo = Number(fee.min), hi = Number(fee.max ?? fee.min);
  if (!(lo > 0)) return fee.text || null;
  const approx = /대\s*$/.test(fee.text ?? "") ? "대" : "";
  return `${manWon(lo)}${hi > lo ? `~${manWon(hi)}` : ""}원${approx}`;
}
// 숙박 형태별 1박 요금(build-price-tiers.mjs → c.fee.tiers = [[형태, 최저, 최고, 짐작]]).
// 소유자 2026-10-19: 1박 10만원대를 넘으면 카라반·글램핑, 20만원대를 넘으면 펜션인 경우가 많다 → 텐트 사이트 요금과 따로 보인다.
// 짐작(금액으로만 나눈 형태)은 ‘추정’을 붙인다.
const TIER_LABEL = { site: "사이트", glamp: "글램핑", caravan: "카라반", gc: "글램핑·카라반", lodge: "펜션·숙박동" };
const tierOf = (c, t) => c.fee?.tiers?.find((x) => x[0] === t) ?? null;
const rangeWon = (lo, hi) => `${manWon(lo)}${hi > lo ? `~${manWon(hi)}` : ""}원`;
/** 카드·목록의 대표 1박 요금: 사이트 요금이 있으면 그것, 없으면 첫 형태 { label, text } */
function feeMain(c) {
  if (!c.fee) return null;
  const t = c.fee.tiers;
  if (!t?.length) return { label: "1박", text: feeLabel(c.fee) };
  const main = tierOf(c, "site") ?? t[0];
  return { label: `1박 ${TIER_LABEL[main[0]]}`, text: `${rangeWon(main[1], main[2])}${/대\s*$/.test(c.fee.text ?? "") ? "대" : ""}`, est: main[3] && main[0] !== "site" };
}
/** 대표 요금 말고 다른 형태 요금 줄(글램핑 12만~19만원 · 펜션·숙박동 25만원 추정) */
function feeTiersLine(c) {
  const t = c.fee?.tiers;
  if (!t?.length) return "";
  const main = tierOf(c, "site") ?? t[0];
  return t.filter((x) => x !== main).map(([k, lo, hi, e]) => [k, lo, hi, e && k !== "site"]).map(([k, lo, hi, est]) => `<span class="ft ft-${k}${est ? " est" : ""}"${est ? ' title="요금 금액으로 짐작한 형태(10만원대 글램핑·카라반, 20만원대 이상 펜션·숙박동)"' : ""}>${TIER_LABEL[k]} <b>${rangeWon(lo, hi)}</b>${est ? "<i>추정</i>" : ""}</span>`).join("");
}
// 상세 화면 금액 표기: 18.9만~42만원 → 189,000~420,000원, 2만5천원 → 25,000원, 130000원 → 130,000원, 2만~4만원대 → 20,000~40,000원대.
function wonText(v) {
  const n = (m, c, t) => fmt(Math.round(parseFloat(m) * 10000 + (c ? parseFloat(c) * 1000 : 0)));
  return String(v ?? "")
    .replace(/(\d+(?:\.\d+)?)\s*만(?:\s*(\d)\s*천)?\s*(?=~|-|원)/g, (_, m, c) => n(m, c))
    .replace(/(?<![\d,.])(\d{4,7})\s*원/g, (_, x) => `${fmt(Number(x))}원`)
    .replace(/(\d+)\s*천\s*원/g, (_, x) => `${fmt(Number(x) * 1000)}원`);
}
const band = (n) => {
  if (n == null) return "-";
  const m = Math.floor(n / 10000);
  return m < 1 ? `${Math.round(n / 1000)}천원` : `${m}만원`;
};
const ic = (id, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
function formatKoreanDate(s) {
  if (!s) return "";
  const str = String(s).trim();
  const m = str.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) {
    const parsed = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const mo = String(parsed.getMonth() + 1).padStart(2, "0");
      const da = String(parsed.getDate()).padStart(2, "0");
      const day = WEEKDAYS[parsed.getDay()];
      return `${y}.${mo}.${da} (${day})`;
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const day = WEEKDAYS[d.getDay()];
    return `${y}.${mo}.${da} (${day})`;
  }
  return str;
}
function formatRelativeDate(s, now = new Date()) {
  if (!s) return "";
  let d;
  const str = String(s).trim();
  const m = str.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) {
    d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  } else {
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return "";

  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return "방금전";
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "오늘";
  if (diffDays < 7) return `${diffDays}일전`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffDays < 28) {
    if (diffWeeks === 1) return "일주일전";
    return `${diffWeeks}주전`;
  }

  const diffMonths = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) - (now.getDate() < d.getDate() ? 1 : 0);
  if (diffMonths < 12) {
    if (diffMonths <= 1) return "한달전";
    return `${diffMonths}개월전`;
  }

  const diffYears = Math.floor(diffMonths / 12);
  if (diffYears <= 1) return "1년전";
  return `${diffYears}년전`;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = {
  stype: "", camps: [], byId: new Map(), photos: {}, cards: {}, openings: new Map(),
  q: "", area: "all", quick: new Set(), theme: null, feeBand: store.get("mc-feeband", ""), sort: "rec", shown: 24, mode: "keyword",
  stay: store.get("mc-stay", ""),
  saved: store.get("mc-saved", store.get("mc-compare", [])), pick: store.get("mc-pick", []), compare: store.get("mc-compare", []),
  detailCache: new Map(), homeScroll: 0,
};

// ── 시안 전환 ────────────────────────────────────────────────
const VARIANTS = { a: "A 포스터", b: "B 필드북", c: "C 인덱스" };
function setVariant(v) {
  if (!VARIANTS[v]) v = "a";
  document.documentElement.dataset.v = v;
  $$("[data-variant]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.variant === v)));
  store.set("mc-variant", v);
  // ?v=a 파라미터가 주소창에 불필요하게 남지 않도록 제거한다.
  const u = new URL(location.href);
  if (u.searchParams.has("v")) {
    u.searchParams.delete("v");
    const cleanSearch = u.searchParams.toString();
    const cleanUrl = u.pathname + (cleanSearch ? `?${cleanSearch}` : "") + u.hash;
    history.replaceState(null, "", cleanUrl);
  }
}
// A 포스터를 공개 서비스의 기본 표현으로 고정한다. B/C는 더 이상 고객 화면에 노출하지 않는다.
setVariant("a");

function updateHeaderGlass() {}

// ── 이름·지역 ────────────────────────────────────────────────
const SIDO = [[/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"], [/^광주/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"], [/^경기/, "경기"], [/^강원/, "강원"], [/^충청북|^충북/, "충북"], [/^충청남|^충남/, "충남"], [/^전라북|^전북/, "전북"], [/^전라남|^전남/, "전남"], [/^경상북|^경북/, "경북"], [/^경상남|^경남/, "경남"], [/^제주/, "제주"]];
const sidoShort = (s) => (SIDO.find(([r]) => r.test(s ?? "")) ?? [, s ?? ""])[1];
const OP = { LOCAL_GOVERNMENT: "지자체", NATIONAL_PARK: "국립공원", NATURAL_RECREATION_FOREST: "휴양림", PUBLIC_LEISURE: "공공", PRIVATE: "민간" };
function nameOf(c) {
  let n = String(c.name ?? "").trim(), tag = null;
  const m = n.match(/^\[([^\]]+)\]\s*/);
  if (m) { tag = m[1]; n = n.slice(m[0].length); }
  return { tag, name: n };
}
// 큰 제목: 앞은 굵게, 마지막 낱말은 가늘게(굵기 대비)
function titleHtml(c) {
  const { name } = nameOf(c);
  const w = name.split(/\s+/);
  if (w.length < 2) return `<b>${esc(name)}</b>`;
  return `<b>${esc(w.slice(0, -1).join(" "))}</b> <span>${esc(w.at(-1))}</span>`;
}
const region = (c) => `${sidoShort(c.sido)} ${c.sigungu ?? ""}`.trim();
const typeLine = (c) => (c.pf?.s ?? "").split(" · ")[0] || (c.types ?? [])[0] || "";
function stayLabel() {
  if (!S.stay) return "날짜 선택";
  const [, month, day] = S.stay.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

// ── 사실 해석(카드·상세·비교·지도 공통) ─────────────────────
// 등급: v=원문 대조(VERIFIED) · c=공식 등록·운영자 공개 · m=소개·후기 언급. 배지는 v·c만.
// r = 법령·고시 기본값(업장이 공지하지 않음). 그 업장의 규정이 아니라 참고값이다(2026-10-19).
const GR = (s) => (s === "VERIFIED" ? "v" : s === "CONFIRMED" || s === "OPERATOR" ? "c" : s === "SURVEYED" || s === "MENTION" ? "m" : s === "REFERENCE" ? "r" : null);
const GRADE_TXT = { v: "원문 대조", c: "공식 등록", m: "소개·후기 언급", r: "법정 기준 참고(업장 미공지)" };
const kw = (w) => `${fmt(w)}W`; // 소유자: ‘600W’처럼 W로 통일
const GROUND = { CRUSHED_STONE: "파쇄석", MIXED: "혼합", GRAVEL: "자갈", DECK: "데크", GRASS: "잔디", SAND: "모래", SOIL: "흙", CONCRETE: "콘크리트" };
const srcOf = (fc, extra) => ({ label: fc?.source?.label || "한국관광공사 고캠핑 등록 현황", url: fc?.source?.url || "https://www.gocamping.or.kr/", at: fc?.source?.checked_at, ...extra });

function facts(c) {
  if (c._f) return c._f;
  const fc = c.field_conditions ?? {}, of = c.of ?? {}, out = {};
  // 주차
  if (of.pk) out.park = { v: of.pk.v === "SITE_SIDE" ? "텐트 옆" : "외부 주차장", short: of.pk.v === "SITE_SIDE" ? "텐트 옆" : "외부 주차", g: "c", ok: of.pk.v === "SITE_SIDE", src: { label: "운영자 홈페이지", url: of.pk.u, at: of.pk.t, quote: of.pk.q } };
  else if (fc.parking && fc.parking.mode && fc.parking.mode !== "UNKNOWN") {
    const p = fc.parking, g = GR(p.state), z = p.tent_side_zones;
    if (p.mode === "SITE_ADJACENT") out.park = { v: z && z.adjacent < z.total ? `${z.total}구역 중 ${z.adjacent}곳 텐트 옆` : "텐트 옆", short: z && z.adjacent < z.total ? "일부 텐트 옆" : "텐트 옆", g, ok: z && z.adjacent < z.total ? "part" : true };
    else if (p.mode === "CART_REQUIRED") out.park = { v: "짐수레 이동", short: "짐수레", g, ok: false };
    else if (p.mode === "SHARED_NEARBY") out.park = { v: "공용 주차장", short: "공용 주차", g, ok: false };
    if (out.park) out.park.src = srcOf(fc);
  }
  // 전기
  // 운영자 홈페이지에 공개된 W가 소개글 추출값보다 우선한다.
  const opW = of.w ? Number(of.w.v) : null;
  const w = opW || fc.power?.limit_w || null;
  if (w) out.power = { v: `최대 ${kw(w)}${!opW && fc.power?.state === "VERIFIED" && fc.power?.breaker_capacity ? ` · ${fc.power.breaker_capacity}` : ""}`, short: kw(w), w, g: opW ? "c" : GR(fc.power.state), ok: true, src: opW ? { label: "운영자 홈페이지", url: of.w.u, at: of.w.t, quote: of.w.q } : srcOf(fc) };
  else if (fc.power?.available === true) out.power = { v: "있음", short: "전기", g: GR(fc.power.state), ok: true, src: srcOf(fc) };
  else if (fc.power?.available === false) out.power = { v: "없음", short: "전기 없음", g: GR(fc.power.state), ok: false, src: srcOf(fc) };
  // 장작·숯
  if (of.fire) out.fire = { v: { FIREWOOD_OK: "장작 가능", CHARCOAL_ONLY: "숯만", NO_FIRE: "화기 불가" }[of.fire.v], short: { FIREWOOD_OK: "장작", CHARCOAL_ONLY: "숯만", NO_FIRE: "화기 불가" }[of.fire.v], kind: of.fire.v, g: "c", ok: of.fire.v === "FIREWOOD_OK", src: { label: "운영자 홈페이지", url: of.fire.u, at: of.fire.t, quote: of.fire.q } };
  else {
    const fw = fc.firewood ?? {}, cc = fc.charcoal ?? {}, g = GR(fw.state) || GR(cc.state);
    if (fw.allowed === true) out.fire = { v: fw.sold ? "장작 가능 · 판매" : "장작 가능", short: "장작", kind: "FIREWOOD_OK", g, ok: true };
    else if (cc.allowed === true && fw.allowed === false) out.fire = { v: "숯만", short: "숯만", kind: "CHARCOAL_ONLY", g, ok: false };
    else if (fw.allowed === false && cc.allowed === false) out.fire = { v: "화기 불가", short: "화기 불가", kind: "NO_FIRE", g, ok: false };
    else if (fc.fire_pit?.arrangement === "개별") out.fire = { v: "화로대 개별", short: "화로대", kind: "PIT", g: GR(fc.fire_pit.state), ok: null };
    if (out.fire) out.fire.src = srcOf(fc, fc.shelter_setup?.note ? { quote: fc.shelter_setup.note } : {});
  }
  // 사이트 규격
  const groups = fc.site_size?.groups?.length ? fc.site_size.groups.map((x) => [x.width_m, x.depth_m, x.count, x.name]) : (c.sizes ?? []);
  if (groups.length) out.size = { v: [...new Set(groups.map(([a, b]) => `${a}×${b}m`))].slice(0, 3).join(" · "), groups, g: fc.site_size?.groups?.length ? GR(fc.site_size.state) : "c", src: srcOf(fc) };
  // 바닥
  const fl = fc.ground?.types?.length ? fc.ground.types.map((t) => t.type) : (c.floors ?? []).map(([t]) => t);
  if (fl.length) out.ground = { v: [...new Set(fl.map((t) => GROUND[t] ?? t))].join(" · "), g: fc.ground?.types?.length ? GR(fc.ground.state) : "c", src: srcOf(fc) };
  // 텐트·타프
  const sh = fc.shelter_setup;
  if (sh && (sh.max_tents || sh.max_tarps)) out.shelter = { v: [sh.max_tents && `텐트 ${sh.max_tents}`, sh.max_tarps && `타프 ${sh.max_tarps}`, sh.canopy_allowed && "캐노피 가능"].filter(Boolean).join(" · "), g: GR(sh.state), src: srcOf(fc) };
  // 위생
  const sa = fc.sanitary ?? {}, t = sa.toilets_count ?? c.toilets, s = sa.showers_count ?? c.showers;
  if (t || s) out.sanitary = { v: [t && `화장실 ${t}`, s && `샤워 ${s}`].filter(Boolean).join(" · "), g: GR(sa.state) || "c", src: srcOf(fc) };
  if (sa.hot_water) out.hot = { v: sa.hot_water === "제공" ? "있음" : sa.hot_water, g: GR(sa.state) || "c", src: srcOf(fc) };
  if (sa.private_bathroom) out.bath = { v: "개별 욕실", g: "c" };
  // 반려동물(고캠핑 등록)
  if (c.pets) out.pet = { v: /가능/.test(c.pets) && !/불가/.test(c.pets) ? "동반 가능" : c.pets === "불가능" ? "동반 불가" : c.pets, ok: /가능/.test(c.pets) && !/불가/.test(c.pets), g: "c", src: { label: "한국관광공사 고캠핑 등록값", url: c.gc_url } };
  return (c._f = out);
}
const filled = (f) => f && (f.g === "v" || f.g === "c");

// 포스터 배지(소유자 2026-10-19): ‘전기 있음·온수 있음’처럼 거의 모든 곳에 해당하는 값은 붙이지 않는다.
// 전기는 W 제한을 아는 곳만 ‘600W’. 장작=주황 · 텐트 옆 주차=블루 · 반려견=잉크.
// 불가사항(전기·장작·숯·온수·반려동물 불가 등)은 같은 아이콘에 공통 빨간 배지로 하나씩(build-house-rules.mjs → c.nr).
const pos = (f) => f && f.g;
const NO_TAGS = {
  NO_POWER: ["전기 불가", "bolt"], HIGH_POWER: ["고출력 전열기구 금지", "bolt"], NO_FIRE: ["화기 불가", "flame"], NO_FIREWOOD: ["장작 불가", "flame"],
  NO_CHARCOAL: ["숯 불가", "flame"], BYO_FUEL: ["개인 장작·숯 반입 금지", "flame"], BYO_PIT: ["개인 화로대 금지", "flame"], NO_HOT_WATER: ["온수 불가", "drop"],
  NO_PET: ["반려동물 불가", "paw"], BIG_DOG: ["대형견 불가", "paw"], NO_CARAVAN: ["개인 카라반·트레일러 불가", "caravan"], NO_EXTRA_TENT: ["추가 텐트 불가", "tent"],
  NO_FIREWORKS: ["폭죽 금지", "spark"], NO_LOUD: ["음향기기 금지", "broadcast"], NO_MINOR: ["미성년자 단독 불가", "alert"], NO_VISITOR: ["방문객 불가", "door"], NO_WINTER: ["동계 휴장", "calendar"],
};
const NO_ORDER = ["NO_PET", "BIG_DOG", "NO_FIRE", "NO_FIREWOOD", "NO_CHARCOAL", "BYO_FUEL", "BYO_PIT", "NO_POWER", "HIGH_POWER", "NO_HOT_WATER", "NO_CARAVAN", "NO_EXTRA_TENT", "NO_WINTER", "NO_FIREWORKS", "NO_LOUD", "NO_MINOR", "NO_VISITOR"];
// 카드에 먼저 보일 불가사항(이용 여부를 바로 가르는 것)
const NO_CARD = ["NO_POWER", "NO_FIRE", "NO_FIREWOOD", "NO_CHARCOAL", "NO_HOT_WATER", "NO_PET", "BIG_DOG", "NO_CARAVAN", "NO_WINTER"];
/** 공식(업장 공개·고캠핑 등록) 불가 태그 키 목록. 데이터가 아직 없는 발행본에서도 사실 값으로 보탠다. */
function noKeys(c) {
  if (c._no) return c._no;
  const f = facts(c), k = new Set(c.nr ?? []);
  if (pos(f.fire) && f.fire.kind === "NO_FIRE") k.add("NO_FIRE");
  if (pos(f.fire) && f.fire.kind === "CHARCOAL_ONLY") k.add("NO_FIREWOOD");
  if (pos(f.power) && f.power.ok === false) k.add("NO_POWER");
  if (pos(f.pet) && /불가/.test(f.pet.v ?? "")) k.add("NO_PET");
  if (k.has("NO_FIRE")) { k.delete("NO_FIREWOOD"); k.delete("NO_CHARCOAL"); }
  if (k.has("NO_PET")) k.delete("BIG_DOG");
  return (c._no = NO_ORDER.filter((x) => k.has(x)));
}
// 방문객·지인 초대 허용 업장(운영자 공지·규칙·요금 전수 조사 기반)
const INVITE_OK_SET = new Set([
  "100019", "100137", "100298", "100476", "100684", "100730", "100820", "100912", "100948", "101076",
  "101307", "101553", "101585", "101669", "101740", "101759", "102331", "1025", "1075", "2216",
  "2272", "2304", "2587", "2733", "3375", "512", "7008", "7124", "7132", "7174",
  "7208", "7210", "7228", "7253", "734", "7435", "7670", "7838", "7883", "7896",
  "7901", "7928", "7934", "7967", "8196", "930",
]);
const noBadge = (k) => (NO_TAGS[k] ? `<span class="bdg bdg-no">${ic(NO_TAGS[k][1])}${esc(NO_TAGS[k][0])}</span>` : "");
function badges(c, max = 4, maxNo = 2) {
  const f = facts(c), out = [];
  if (INVITE_OK_SET.has(String(c.id))) out.push(`<span class="bdg bdg-teal">${ic("users")}초대가능</span>`);
  if (pos(f.power) && f.power.ok && f.power.w) out.push(`<span class="bdg bdg-volt">${ic("bolt")}${esc(f.power.short)}</span>`);
  if (pos(f.fire) && f.fire.kind === "FIREWOOD_OK") out.push(`<span class="bdg bdg-flame">${ic("flame")}장작</span>`);
  if (pos(f.park) && f.park.ok === true) out.push(`<span class="bdg bdg-cobalt">${ic("car")}텐트 옆</span>`);
  if (pos(f.pet) && f.pet.ok) out.push(`<span class="bdg bdg-ink">${ic("paw")}반려견</span>`);
  const no = noKeys(c).filter((k) => NO_CARD.includes(k)).slice(0, maxNo).map(noBadge);
  return [...out.slice(0, Math.max(max - no.length, 1)), ...no].slice(0, max).join("");
}
const dot = () => "";

// ── 오픈 신호 ────────────────────────────────────────────────
function openingOf(c) {
  const o = S.openings.get(String(c.id));
  if (!o || o.kind === "접수 마감") return null;
  const dd = Math.ceil((Date.parse(o.at) - Date.now()) / 864e5);
  if (dd < 0 || dd > 30) return null;
  return { ...o, dd, txt: dd <= 0 ? "오늘 오픈" : `오픈 D-${dd}` };
}

// ── 사이트·상품 타입(build-site-types.mjs → c.st = [[code, count, g, sub]]) ─────
const STYPES = [
  ["DECK", "데크", "layers"], ["DUPLEX_DECK", "복층 데크", "layers"], ["TARP_ZONE", "타프존", "tent"], ["GLAMPING", "글램핑", "spark"],
  ["CARAVAN", "카라반", "caravan"], ["HOUSE", "숙박동", "home"], ["AUTO", "오토캠핑", "car"], ["RV", "캠핑카·트레일러", "caravan"],
  ["CAR_CAMP", "차박", "car"], ["PET_SITE", "반려견 전용", "paw"], ["SOLO", "솔로·백패킹", "tent"], ["EQUIPPED", "장비 포함", "tent"],
  ["PRIVATE_BATH", "개별 화장실", "drop"], ["PITCH", "일반 사이트", "tent"],
];
const ST = Object.fromEntries(STYPES.map(([k, l, i]) => [k, { label: l, icon: i }]));
const hasType = (c, k) => (c.st ?? []).some((t) => t[0] === k);
// 카드 한 줄: 일반 사이트 말고 다른 타입이 있으면 그것을 먼저(최대 4개).
function typeLine2(c) {
  const st = (c.st ?? []).filter((t) => t[0] !== "PRIVATE_BATH");
  const other = st.filter((t) => t[0] !== "PITCH");
  const list = (other.length ? other : st).slice(0, 4);
  return list.map(([k, n, , sub]) => `${k === "HOUSE" && sub ? sub : ST[k].label}${n ? ` ${fmt(n)}` : ""}`).join(" · ");
}

// ── 필터 ─────────────────────────────────────────────────────
// 요금대 필터는 텐트 사이트 요금으로(글램핑·펜션 요금이 섞인 범위로 거르지 않게). 사이트 요금을 모르면 전체 범위.
const campFeeMin = (c) => tierOf(c, "site")?.[1] ?? c.fee?.min ?? c.pf?.p?.min;
const campFeeMax = (c) => tierOf(c, "site")?.[2] ?? c.fee?.max ?? c.pf?.p?.max ?? campFeeMin(c);
const AREAS = [["all", "전국"], ["서울·경기", "서울·경기"], ["강원", "강원"], ["충청", "충청"], ["전라", "전라"], ["경상", "경상"], ["제주", "제주"]];
const AREA_OF = { 서울: "서울·경기", 인천: "서울·경기", 경기: "서울·경기", 강원: "강원", 충북: "충청", 충남: "충청", 대전: "충청", 세종: "충청", 전북: "전라", 전남: "전라", 광주: "전라", 경북: "경상", 경남: "경상", 대구: "경상", 부산: "경상", 울산: "경상", 제주: "제주" };
const QUICK = {
  power: { label: "전기", icon: "bolt", cls: "volt", test: (c) => pos(facts(c).power) && facts(c).power.ok },
  fire: { label: "장작", icon: "flame", cls: "flame", test: (c) => pos(facts(c).fire) && facts(c).fire.kind === "FIREWOOD_OK" },
  park: { label: "텐트 옆 주차", icon: "car", cls: "cobalt", test: (c) => pos(facts(c).park) && facts(c).park.ok === true },
  pet: { label: "반려견", icon: "paw", cls: "ink", test: (c) => pos(facts(c).pet) && facts(c).pet.ok },
};
// 테마 아이콘(소유자 2026-10-20 지정 SVG). 모두 currentColor, 글자 왼쪽 1.1em.
const TH_SVG = {
  POPULAR: ["0 0 24 24", '<path fill="currentColor" d="M12.6 2c.6 3.6 5.9 6 5.9 12a6.5 6.5 0 0 1-13 0c0-3 1.6-5 3.2-6.3-.1 2 .8 3.4 2.1 3.6-.4-3.3.2-6.6 1.8-9.3z"/>'],
  VALLEY: ["0 0 24 24", '<path fill="currentColor" d="M6.18 10.95l2.54 3.175l.084 .093a1 1 0 0 0 1.403 -.01l1.637 -1.638l1.324 1.985a1 1 0 0 0 1.457 .226l3.632 -2.906l3.647 7.697a1 1 0 0 1 -.904 1.428h-18a1 1 0 0 1 -.904 -1.428zm5.82 -7.878a3.3 3.3 0 0 1 2.983 1.888l2.394 5.057l-3.15 2.52l-1.395 -2.092l-.075 -.099a1 1 0 0 0 -1.464 -.053l-1.711 1.709l-1.301 -1.627l-1.151 -1.435l1.888 -3.98a3.3 3.3 0 0 1 2.982 -1.888"/>'],
  FOREST: ["0 0 24 24", '<path fill="currentColor" d="M15 19v1a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-1zm-10 -1c-.89 0 -1.337 -1.077 -.707 -1.707l2.855 -2.857l-1.464 -.487a1 1 0 0 1 -.472 -1.565l.08 -.091l3.019 -3.02l-.758 -.379a1 1 0 0 1 -.343 -1.507l.083 -.094l4 -4a1 1 0 0 1 1.414 0l4 4a1 1 0 0 1 -.26 1.601l-.759 .379l3.02 3.02a1 1 0 0 1 -.279 1.61l-.113 .046l-1.465 .487l2.856 2.857c.603 .602 .22 1.614 -.593 1.701l-.114 .006z"/>'],
  BEACH: ["0 0 24 24", '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.75 9.5c2.75-2 6-1.5 8 1.5L12 12.75L13.25 11c2-3 5.25-3.5 8-1.5c-2.5.25-4.5 1.5-6 3.5l-2 2.5c-.75.75-1.75.75-2.5 0l-2-2.5c-1.5-2-3.5-3.25-6-3.5m0 10.25C4 19.75 4 19 5.25 19s1.25.75 2.5.75S9 19 10.25 19s1.25.75 2.5.75S14 19 15.25 19s1.25.75 2.5.75S19 19 20.25 19"/>'],
  "T:HOUSE": ["0 0 24 24", '<path fill="currentColor" d="M12.707 2.293l9 9c.63 .63 .184 1.707 -.707 1.707h-1v6a3 3 0 0 1 -3 3h-10a3 3 0 0 1 -3 -3v-6h-1c-.89 0 -1.337 -1.077 -.707 -1.707l9 -9a1 1 0 0 1 1.414 0m.793 8.707h-3a1.5 1.5 0 0 0 -1.5 1.5v3a1.5 1.5 0 0 0 1.5 1.5h3a1.5 1.5 0 0 0 1.5 -1.5v-3a1.5 1.5 0 0 0 -1.5 -1.5"/>'],
  LAKE: ["0 0 24 24", '<path fill="currentColor" d="M2 22c0-.55.45-1 1-1c.87 0 1.73-.24 2.53-.7c.29-.16.65-.17.94 0c1.59.9 3.48.9 5.06 0a.98.98 0 0 1 .94 0c1.59.9 3.48.9 5.06 0a.98.98 0 0 1 .94 0c.8.46 1.66.7 2.53.7c.55 0 1 .45 1 1s-.45 1-1 1c-1.03 0-2.06-.25-3-.75a6.36 6.36 0 0 1-6.09-.05c-1.79.87-3.92.98-5.58-.14C5.3 22.69 4.15 23 3 23c-.55 0-1-.45-1-1M12 5.5c-1.1 0-2 .9-2 2s.9 2 2 2s2-.9 2-2s-.9-2-2-2m9.47 12.95c-.42.14-.9.28-1.41.42c-.53-.15-1.03-.43-1.45-.77a.98.98 0 0 0-1.23 0c-.66.53-1.48.9-2.38.9s-1.72-.37-2.39-.91a.99.99 0 0 0-1.22 0c-.67.54-1.49.91-2.39.91s-1.72-.37-2.39-.91c-.35-.29-.87-.28-1.23 0c-.43.35-.92.62-1.45.77c-.51-.14-.98-.28-1.4-.42c-.92-.3-.92-1.6 0-1.9c1.21-.39 2.79-.82 4.6-1.13l1.35-4.17c.31-.95 1.32-1.47 2.27-1.16c.09.03.19.07.27.11l2.47 1.3l2.84-1.5l1.65-3.71l-.36-.93c-.1-.25-.09-.52.02-.76l.74-1.68a1 1 0 0 1 1.32-.51l1.37.61a1 1 0 0 1 .5 1.32l-.75 1.68c-.11.24-.31.43-.56.53l-.9.36l-3.72 8.34c2.33.3 4.35.84 5.82 1.31c.93.3.94 1.6.01 1.9m-6.45-5.49l-.59.31c-.58.31-1.28.31-1.86 0l-.81-.43l-.71 2.17c.31 0 .63-.01.95-.01c.71 0 1.4.03 2.07.08z"/>'],
  FAMILY: ["0 0 24 24", '<path fill="currentColor" d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 7.046 -9.232a3 3 0 0 0 2.949 3.556a1 1 0 0 0 0 -2l-.117 -.007a1 1 0 0 1 .117 -1.993c1.726 0 3.453 .447 5 1.34zm-1.8 10.946a1 1 0 0 0 -1.414 .014a2.5 2.5 0 0 1 -3.572 0a1 1 0 0 0 -1.428 1.4a4.5 4.5 0 0 0 6.428 0a1 1 0 0 0 -.014 -1.414zm-6.19 -5.286l-.127 .007a1 1 0 0 0 .117 1.993l.127 -.007a1 1 0 0 0 -.117 -1.993zm6 0l-.127 .007a1 1 0 0 0 .117 1.993l.127 -.007a1 1 0 0 0 -.117 -1.993z"/>'],
  PET: ["0 0 24 24", '<g fill="currentColor"><path d="M12 10c-1.32 0 -1.983 .421 -2.931 1.924l-.244 .398l-.395 .688a50.89 50.89 0 0 0 -.141 .254c-.24 .434 -.571 .753 -1.139 1.142l-.55 .365c-.94 .627 -1.432 1.118 -1.707 1.955c-.124 .338 -.196 .853 -.193 1.28c0 1.687 1.198 2.994 2.8 2.994l.242 -.006c.119 -.006 .234 -.017 .354 -.034l.248 -.043l.132 -.028l.291 -.073l.162 -.045l.57 -.17l.763 -.243l.455 -.136c.53 -.15 .94 -.222 1.283 -.222c.344 0 .753 .073 1.283 .222l.455 .136l.764 .242l.569 .171l.312 .084c.097 .024 .187 .045 .273 .062l.248 .043c.12 .017 .235 .028 .354 .034l.242 .006c1.602 0 2.8 -1.307 2.8 -3c0 -.427 -.073 -.939 -.207 -1.306c-.236 -.724 -.677 -1.223 -1.48 -1.83l-.257 -.19l-.528 -.38c-.642 -.47 -1.003 -.826 -1.253 -1.278l-.27 -.485l-.252 -.432c-1.011 -1.696 -1.618 -2.099 -3.053 -2.099z"/><path d="M19.78 7h-.03c-1.219 .02 -2.35 1.066 -2.908 2.504c-.69 1.775 -.348 3.72 1.075 4.333c.256 .109 .527 .163 .801 .163c1.231 0 2.38 -1.053 2.943 -2.504c.686 -1.774 .34 -3.72 -1.076 -4.332a2.05 2.05 0 0 0 -.804 -.164z"/><path d="M9.025 3c-.112 0 -.185 .002 -.27 .015l-.093 .016c-1.532 .206 -2.397 1.989 -2.108 3.855c.272 1.725 1.462 3.114 2.92 3.114l.187 -.005a1.26 1.26 0 0 0 .084 -.01l.092 -.016c1.533 -.206 2.397 -1.989 2.108 -3.855c-.27 -1.727 -1.46 -3.114 -2.92 -3.114z"/><path d="M14.972 3c-1.459 0 -2.647 1.388 -2.916 3.113c-.29 1.867 .574 3.65 2.174 3.867c.103 .013 .2 .02 .296 .02c1.39 0 2.543 -1.265 2.877 -2.883l.041 -.23c.29 -1.867 -.574 -3.65 -2.174 -3.867a2.154 2.154 0 0 0 -.298 -.02z"/><path d="M4.217 7c-.274 0 -.544 .054 -.797 .161c-1.426 .615 -1.767 2.562 -1.078 4.335c.563 1.451 1.71 2.504 2.941 2.504c.274 0 .544 -.054 .797 -.161c1.426 -.615 1.767 -2.562 1.078 -4.335c-.563 -1.451 -1.71 -2.504 -2.941 -2.504z"/></g>'],
  "T:DECK": ["0 0 24 24", '<g fill="currentColor"><path d="M19 17v3a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-3z"/><path d="M11 17v3a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-3z"/><path d="M20 12a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1z"/><path d="M8.707 3.293l2 2a1 1 0 0 1 .293 .707v5h-6v-5a1 1 0 0 1 .293 -.707l2 -2a1 1 0 0 1 1.414 0"/><path d="M16.707 3.293l2 2a1 1 0 0 1 .293 .707v5h-6v-5a1 1 0 0 1 .293 -.707l2 -2a1 1 0 0 1 1.414 0"/></g>'],
  GLAMPING: ["0 0 24 24", '<path fill="currentColor" d="m20.83 20.5l1.024-2.74a1.25 1.25 0 0 0-.15-1.16l-8.79-12.47l1.195-1.695l-1.225-.865L12 2.83l-.885-1.26l-1.225.865l1.195 1.695L2.29 16.6c-.24.34-.295.77-.15 1.16l1.025 2.74h-1.17V22H22v-1.5zm-8.08 0h-1.5v-10h1.5z"/>'],
  CARAVAN: ["0 0 14 14", '<path fill="currentColor" d="M2 2C1 2 0 3 0 4v4c0 1 1 2 2 2h1.063C3.296 8.86 4.292 8 5.5 8s2.204.86 2.438 2H14s0-1-1-1h-1.5V4c0-.96-1.024-2-2-2zm.844 2A.4.4 0 0 1 3 4h2s1 0 1 1s-1 1-1 1H3S2 6 2 5c0-.75.563-.953.844-1M8 4h.5s1 0 1 1s-1 1-1 1H8S7 6 7 5s1-1 1-1M5.5 9a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3"/>'],
  AUTO: ["0 0 24 24", '<path fill="currentColor" d="m20.77 9.16l-1.37-4.1a2.99 2.99 0 0 0-2.85-2.05H7.44a3 3 0 0 0-2.85 2.05l-1.37 4.1c-.72.3-1.23 1.02-1.23 1.84v5a2 2 0 0 0 1 1.72V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-2h12v2c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-2.28a2 2 0 0 0 1-1.72v-5c0-.83-.51-1.54-1.23-1.84ZM19 13.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5s1.5.67 1.5 1.5m-11 0c0 .83-.67 1.5-1.5 1.5S5 14.33 5 13.5S5.67 12 6.5 12s1.5.67 1.5 1.5M20 11v5zM7.44 5h9.12a1 1 0 0 1 .95.68L18.62 9H5.39L6.5 5.68A1 1 0 0 1 7.45 5Z"/>'],
  VISITOR: ["0 0 24 24", '<path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>'],
  PICNIC: ["0 0 24 24", '<path fill="currentColor" d="M19 7h-3V6a4 4 0 0 0-8 0v1H5a2 2 0 0 0-2 2v2c0 .55.45 1 1 1h1v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7h1c.55 0 1-.45 1-1V9a2 2 0 0 0-2-2zm-9-1a2 2 0 0 1 4 0v1h-4V6zm7 13H7v-7h10v7z"/>'],
  PARK: ["0 0 24 24", '<path fill="currentColor" d="M10 21v-3.4c-2.37-.36-4.27-2.13-4.83-4.46A5.5 5.5 0 0 1 8 3.32a5.5 5.5 0 0 1 8 0 5.5 5.5 0 0 1 2.83 9.82c-.56 2.33-2.46 4.1-4.83 4.46V21h-4z"/>'],
  WATER_PLAY: ["0 0 24 24", '<g fill="currentColor"><circle cx="16.5" cy="5.5" r="2.5"/><path d="m14.29 9.38-2.61 2.62 1.42 1.41 1.9-1.9 2.5 1.49 1.43-.86-2.62-4.38a1.5 1.5 0 0 0-2.02-.38z"/><path d="M2 15c1.5 0 2.5 1 4 1s2.5-1 4-1 2.5 1 4 1 2.5-1 4-1 2.5 1 4 1v2c-1.5 0-2.5-1-4-1s-2.5 1-4 1-2.5-1-4-1-2.5 1-4 1-2.5-1-4-1H2zm0 4c1.5 0 2.5 1 4 1s2.5-1 4-1 2.5 1 4 1 2.5-1 4-1 2.5 1 4 1v2c-1.5 0-2.5-1-4-1s-2.5 1-4 1-2.5-1-4-1-2.5 1-4 1-2.5-1-4-1H2z"/></g>'],
  "T:CAR_CAMP": ["0 0 24 24", '<g fill="currentColor"><path d="M3 19.723V21a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h12v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.277A1.99 1.99 0 0 0 22 18v-3c0-.831-.507-1.542-1.228-1.845l-1.368-4.104A2.995 2.995 0 0 0 16.559 7H7.441a2.995 2.995 0 0 0-2.845 2.051l-1.368 4.104A2 2 0 0 0 2 15v3c0 .738.404 1.376 1 1.723M5.5 18a1.5 1.5 0 1 1 .001-3.001A1.5 1.5 0 0 1 5.5 18m13 0a1.5 1.5 0 1 1 .001-3.001A1.5 1.5 0 0 1 18.5 18M7.441 9h9.117a1 1 0 0 1 .949.684L18.613 13H5.387l1.105-3.316c.137-.409.519-.684.949-.684"/><path d="M22 7.388V5.279l-9.684-3.228a1 1 0 0 0-.658.009L2 5.572V7.7l10.015-3.642z"/></g>'],
};
const thIc = (k) => (TH_SVG[k] ? `<svg class="th-ic" viewBox="${TH_SVG[k][0]}" aria-hidden="true">${TH_SVG[k][1]}</svg>` : "");
const VISITOR_IDS = new Set(["100141","101239","101366","101394","1075","1641","2146","2733","3201","467","7124","7253","7588","7741","7838","7997","3206","102320","1893","102096","101354","102293","102289","102290","101971","102271","160","922","6850","100986","102240","102202","468","2480","102188","101801","101979","100543","100546","3333","1970","2929","101426","101894","101358","6948","716","2538","102009","1473","101036","100924","101356","101868","7901","7466","101578","100376","100905","100969","100307","7272","101738","101706","100015","7314","100794","100868","101184","100468","100991","101501","101538","101487","101540","101557","3578","100576","101417","100246","100502","100606","7594","100057","101289","101303","100447","100515","100642","100658","100692","100749","101286","331","101172"]);
const PICNIC_IDS = new Set(["100148","100199","100264","100456","100462","100628","100629","100699","100748","100804","100931","100998","101031","101111","101134","101140","101297","101335","101414","101518","101522","101606","101664","101756","101764","101801","101819","101826","101855","101939","102128","102242","1043","1318","1528","1696","190","2179","2304","2358","3105","3519","357","467","508","525","597","6951","6972","6980","7039","7124","7132","7235","7271","7768","7903","8048","8054","8206","919","1467","7709","102126","102324","8121","100342","2394","101420","2793","8150","101520","101977","102044","102272","7447","100720","101081","101889","102178","420","6753","101642","101705","102110","102125","102237","101997","102211","7542","101217","8133","100916","102170","550","101399","102121","102129","101789","101795","101295","101396","101655","101858","101805","102011","7913","101508","100223","101368","101387","101425","231","101319","101381","101550","604","3205","3375","101611","101496","101869","101600","526","101450","101356","101236","101891","101242","101206","2848","100260","101672","101818","2820","101774","1931","90","100762","100799","101114","101234","101014","101104","101184","101207","101069","101171","7932","100980","101080","101085","101100","101152","101158","101162","101180","101196","101211","101231","101613","100359","101526","100172","100138","101305","100257","100345","100522","2534","101191","101296","100668","100378","102374","102375"]);
const isVisitorCamp = (c) => VISITOR_IDS.has(String(c.id)) || /지인|방문객|방문자|손님\s*초대/.test(`${c.name} ${c.line ?? ""} ${(c.amenities ?? []).join(" ")} ${JSON.stringify(c.pf ?? "")}`);
const isPicnicCamp = (c) => PICNIC_IDS.has(String(c.id)) || ((/피크닉|캠크닉|바베큐|바비큐|평상|쉼터|당일\s*(캠핑|피크닉|이용)/i.test(`${c.name} ${(c.types ?? []).join(" ")} ${(c.amenities ?? []).join(" ")} ${c.pf?.s ?? ""} ${JSON.stringify(c.fee ?? "")}`)) && !/당일\s*(취소|환불)/.test(`${c.name} ${c.pf?.s ?? ""}`));
// 공원: 당일 공원(c.du=park) 또는 이름이 공원·유원지인 곳. 휴양림(숙박 유료)은 빼고(2026-10-20 소유자 P0).
const isParkCamp = (c) => c.du === "park" || (/공원|유원지/.test(c.name) && !/휴양림/.test(c.name));
const isWaterPlayCamp = (c) => Boolean(c.pf?.t?.includes("WATER_PLAY") || (c.amenities ?? []).some((a) => /물놀이장|물놀이터|수영장|풀장|워터/.test(a)) || c.field_conditions?.features?.includes("SWIMMING_POOL"));
const THEMES = [
  ["POPULAR", "실시간 인기", (c) => Boolean(c.m7 || c.rv?.n > 5)],
  ["VALLEY", "계곡", (c) => c.pf?.t?.includes("VALLEY")],
  ["FOREST", "숲", (c) => c.pf?.t?.includes("FOREST")],
  ["BEACH", "바다", (c) => c.pf?.t?.includes("BEACH") || c.th?.includes("sea")],
  ["LAKE", "호수·강", (c) => c.pf?.t?.includes("LAKE") || c.pf?.t?.includes("RIVER")],
  ["FAMILY", "아이랑", (c) => c.pf?.t?.includes("FAMILY")],
  ["PET", "반려견", (c) => c.pf?.t?.includes("PET_OK")],
  ["GLAMPING", "글램핑", (c) => c.pf?.t?.includes("GLAMPING")],
  ["CARAVAN", "카라반", (c) => c.pf?.t?.includes("CARAVAN")],
  ["AUTO", "오토캠핑", (c) => c.pf?.t?.includes("AUTO")],
  ["VISITOR", "지인초대", isVisitorCamp],
  ["PICNIC", "캠크닉", isPicnicCamp],
  ["PARK", "공원", isParkCamp],
  ["WATER_PLAY", "물놀이터", isWaterPlayCamp],
];
const THEME_FILES = {
  POPULAR: "popular.webp",
  VALLEY: "valley.webp",
  FOREST: "forest.webp",
  BEACH: "sea.webp",
  LAKE: "lake.webp",
  FAMILY: "kids.webp",
  PET: "pet.webp",
  GLAMPING: "glamping.webp",
  CARAVAN: "caravan.webp",
  AUTO: "auto.webp",
  VISITOR: "comfort.webp",
  PICNIC: "sunrise.webp",
  PARK: "public.webp",
  WATER_PLAY: "summer.webp",
  ALL: "valley.webp",
  OPEN: "sunrise.webp",
  AVAIL: "comfort.webp",
  REVIEWS: "forest.webp",
};
const themeImg = (k) => `${ASSETS_BASE}images/themes/${THEME_FILES[k] ?? "valley.webp"}`;
const THEME_SUBS = {
  POPULAR: "최근 7일간 캠퍼들 사이에서 가장 많이 언급되고 화제가 된 인기 캠핑장",
  VALLEY: "시원한 물소리와 맑은 물놀이를 즐길 수 있는 계곡 야영장",
  FOREST: "피톤치드 가득한 울창한 숲속 힐링 캠핑장",
  BEACH: "탁 트인 바다 전망과 파도 소리를 즐기는 해변 캠핑장",
  LAKE: "잔잔한 호수와 강변의 평화로운 자연을 담은 캠핑장",
  FAMILY: "아이들이 마음껏 뛰어놀기 좋은 가족 맞춤형 캠핑장",
  PET: "사랑하는 반려견과 함께 머물 수 있는 반려견 동반 야영장",
  GLAMPING: "장비 없이도 아늑하고 편안하게 즐기는 감성 글램핑",
  CARAVAN: "독립된 캠핑 트레일러에서 특별한 낭만을 즐기는 카라반",
  AUTO: "텐트 바로 옆 차량 주차로 편리한 오토캠핑장",
  VISITOR: "지인·방문객 초대가 가능하여 함께 즐기기 좋은 캠핑장",
  PICNIC: "숙박 부담 없이 가볍게 당일로 즐기는 피크닉·바베큐 캠핑장",
  PARK: "부담 없이 자연을 누리는 무료 및 공공 수변·자연공원 야영장",
  WATER_PLAY: "시원한 물놀이터와 풀장이 갖춰진 캠핑장 (여름 시즌 운영 종료 · 내년 계획을 미리 세워보세요)",
  ALL: "모여라캠핑이 엄선한 전국 다양한 테마별 캠핑장",
  OPEN: "곧 예약이 오픈되는 캠핑장 모아보기",
  AVAIL: "지금 바로 실시간 예약 접수 중인 캠핑장",
  REVIEWS: "방문자들의 생생한 긍정 평가가 많은 캠핑장",
};
const SIDO_KW = new Set(["서울", "경기", "인천", "강원", "충북", "충남", "충청", "대전", "세종", "전북", "전남", "전라", "광주", "경북", "경남", "경상", "대구", "울산", "부산", "제주", "서울특별시", "경기도", "인천광역시", "강원특별자치도", "강원도", "충청북도", "충청남도", "대전광역시", "세종특별자치시", "전라북도", "전북특별자치도", "전라남도", "광주광역시", "경상북도", "경상남도", "대구광역시", "울산광역시", "부산광역시", "제주특별자치도", "제주도"]);
function matches(c, { useArea = true } = {}) {
  if (useArea && S.area !== "all" && AREA_OF[sidoShort(c.sido)] !== S.area) return false;
  for (const k of S.quick) if (!QUICK[k].test(c)) return false;
  const fMin = campFeeMin(c), fMax = campFeeMax(c);
  if (S.feeBand === "u3" && !(fMin && fMin <= 30000)) return false;
  if (S.feeBand === "3to5" && !(fMin && fMin <= 50000 && (fMax == null || fMax >= 30000))) return false;
  if (S.feeBand === "5to7" && !(fMin && fMin <= 70000 && (fMax == null || fMax >= 50000))) return false;
  if (S.feeBand === "7to10" && !(fMin && fMin <= 100000 && (fMax == null || fMax >= 70000))) return false;
  if (S.feeBand === "10to20" && !(fMin && fMin <= 200000 && (fMax == null || fMax >= 100000))) return false;
  if (S.feeBand === "o20" && !(fMin && (fMin >= 200000 || (fMax && fMax >= 200000)))) return false;
  if (S.feeBand === "o7" && !(fMin && (fMin >= 70000 || (fMax && fMax >= 70000)))) return false;
  if (S.theme && S.theme !== "ALL") { const t = THEMES.find((x) => x[0] === S.theme); if (t && !t[2](c)) return false; }
  if (S.theme === "AVAIL" && !S.avail?.has(String(c.id))) return false;
  if (S.theme === "OPEN" && !openingOf(c)) return false;
  if (S.stype && !hasType(c, S.stype)) return false;
  if (S.q) {
    const words = S.q.toLowerCase().split(/\s+/).filter(Boolean);
    const ok = words.every((w) => {
      if (c.name && c.name.toLowerCase().includes(w)) return true;
      if (SIDO_KW.has(w)) {
        return (c.sido && c.sido.toLowerCase().includes(w)) ||
               sidoShort(c.sido)?.toLowerCase() === w ||
               (c.area && c.area.toLowerCase().includes(w)) ||
               (AREA_OF[sidoShort(c.sido)] && AREA_OF[sidoShort(c.sido)].toLowerCase().includes(w));
      }
      const hay = c._hay ??= `${c.name} ${c.addr ?? ""} ${c.sido ?? ""} ${c.sigungu ?? ""} ${(c.env ?? []).join(" ")} ${(c.types ?? []).join(" ")} ${c.pf?.s ?? ""} ${(c.st ?? []).map(([k, , , sub]) => `${ST[k]?.label ?? ""} ${sub ?? ""}`).join(" ")} ${(c.amenities ?? []).join(" ")} ${(c.rental ?? []).join(" ")} ${c.line ?? ""}`.toLowerCase();
      return hay.includes(w);
    });
    if (!ok) return false;
  }
  return true;
}
// 정보량 점수: 목록·추천의 기본 순서(소유자 2026-10-20 — 전기 W처럼 상세 정보가 있는 곳을 위·앞으로).
// 전기 W 12 · 확인된 현장 조건(주차·불멍·규격·바닥·텐트·위생·온수·반려동물) 각 3 · 프로필 확인 항목(18개 중) 각 2 ·
// 공식 사진 장당 2(최대 5장)·후기 사진 2 · 1박 요금 4 · 사이트 타입 2 · 이용 규칙 2 · 온라인 예약 3 · 후기 4건당 1(최대 5).
const RICH_FACTS = ["park", "fire", "size", "ground", "shelter", "sanitary", "hot", "pet"];
function rich(c) {
  if (c._rich != null) return c._rich;
  const f = facts(c);
  let s = 0;
  if (f.power?.w && filled(f.power)) s += 12; else if (filled(f.power)) s += 1;
  for (const k of RICH_FACTS) if (filled(f[k])) s += 3;
  s += Math.min(Number(c.pf?.k) || 0, 18) * 2;
  const official = (S.photos[c.id]?.length ?? 0) || (c.ph || c.img ? 1 : 0);
  s += Math.min(official, 5) * 2 + (!official && (c.pt || c.sn) ? 2 : 0);
  if (c.fee?.min || c.pf?.p?.min) s += 4;
  if (c.st?.length) s += 2;
  if (c.nr?.length) s += 2;
  if ((c.booking?.channels ?? []).some((x) => x.kind === "online")) s += 3;
  s += Math.min(Math.floor((Number(c.rv?.n) || 0) / 4), 5);
  return (c._rich = s);
}
// 사진이 한 장도 없는 곳은 신뢰가 낮아 일반·추천 목록에서 뒤로 보낸다(소유자 2026-10-20). 단, 이름으로 직접 찾은 곳은 그대로.
function namedByQuery(c) {
  const q = String(S.q ?? "").replace(/\s+/g, "").toLowerCase();
  if (q.length < 2) return false;
  const n = nameOf(c).name.replace(/\s+/g, "").toLowerCase();
  // 지역 이름만 친 검색(“세종”, “가평”)은 업장을 직접 찾은 것이 아니다
  const region = `${c.sido ?? ""}${c.sigungu ?? ""}`.replace(/\s+/g, "");
  return n.includes(q) && !region.includes(q);
}
const photoLast = (c) => (hasPhoto(c) || namedByQuery(c) ? 0 : 1);
// 원문을 복제하지 않고 후기에서 집계한 언급 주제와 건수만 사용한다.
function reviewMeta(c) {
  const rv = c.rv ?? {};
  const sum = (rows) => (rows ?? []).reduce((n, [, count]) => n + (Number(count) || 0), 0);
  const positive = sum(rv.p), caution = sum(rv.c), total = Number(rv.n) || 0;
  return { rv, positive, caution, total, score: total * 7 + positive * 3 - caution * 2 };
}
function reviewPicks() {
  return S.camps.filter((c) => {
    const r = reviewMeta(c);
    return hasPhoto(c) && r.total >= 4 && r.positive > r.caution;
  }).sort((a, b) => reviewMeta(b).score - reviewMeta(a).score || rich(b) - rich(a)).slice(0, 10);
}
function reviewTopics(rows, cls, icon) {
  return (rows ?? []).slice(0, 2).map(([topic, count]) => `<span class="review-topic ${cls}">${ic(icon)}${esc(topic)} <i>${count}</i></span>`).join("");
}
function reviewPickCard(c, i = 0) {
  const r = reviewMeta(c);
  return `<article class="card review-pick" data-id="${esc(c.id)}">
    <a class="card-hit" href="#/c/${encodeURIComponent(c.id)}" draggable="false" aria-label="${esc(nameOf(c).name)} 자세히"></a>
    <div class="card-media review-pick-media">${carousel(c, { eager: i < 3 })}<span class="review-total">${ic("file-text")}후기 ${fmt(r.total)}</span></div>
    <div class="card-body review-pick-body"><p class="review-place">${esc(region(c))}</p><h3>${esc(nameOf(c).name)}</h3><div class="review-topics">${reviewTopics(r.rv.p, "good", "thumb-up")}${reviewTopics(r.rv.c, "watch", "alert")}</div></div>
  </article>`;
}
function results() {
  const list = S.camps.filter((c) => matches(c));
  if (S.sort === "name") list.sort((a, b) => nameOf(a).name.localeCompare(nameOf(b).name, "ko"));
  else list.sort((a, b) => rich(b) - rich(a));
  // 사진이 한 장도 없는 곳은 뒤로(이름으로 직접 찾은 곳은 제외)
  return list.sort((a, b) => photoLast(a) - photoLast(b));
}

// ── 사진 ─────────────────────────────────────────────────────
const photoUrl = (u) => {
  const value = String(u ?? "");
  if (!value) return "";
  if (value.startsWith("media/")) return `${MEDIA}${value.slice(6)}`;
  if (value.startsWith("./media/")) return `${MEDIA}${value.slice(8)}`;
  if (value.startsWith("../media/")) return `${MEDIA}${value.slice(9)}`;
  return value;
};
// 목록은 480px 파생본을 우선 쓰되, 고밀도 화면에서는 같은 공식 원본의 1280px 파생본을 선택한다.
// 외부 원문 URL은 변형하지 않아 원천의 표시 조건과 주소를 유지한다.
const photoHiUrl = (u) => photoUrl(u).replace(/-t\.webp(?=\?|$)/, "-l.webp");
function imageTag(u, alt, { eager = false, sizes = "(max-width: 759px) 80vw, 320px" } = {}) {
  const src = photoUrl(u), high = photoHiUrl(u);
  const srcset = high !== src ? ` srcset="${esc(src)} 480w, ${esc(high)} 1280w" sizes="${sizes}"` : "";
  // 외부 원본(블로그 사진 등)은 리퍼러를 보내지 않아야 열린다
  const ref = /^https?:/i.test(src) ? ' referrerpolicy="no-referrer"' : "";
  return `<img src="${esc(src)}"${srcset} alt="${alt}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" draggable="false"${ref}>`;
}
// 비교·찜처럼 사진이 보조 역할인 곳은 빈 src를 만들지 않고, 사진 미보유를 중립적인 아이콘으로 표시한다.
function campThumb(c, { alt = "", sizes } = {}) {
  const u = photosOf(c)[0];
  if (u) return imageTag(u, alt, { sizes }) + (isPt(c, u) ? ptCredit(c) : "");
  return `<span class="photo-empty" role="img" aria-label="${esc(`${nameOf(c).name} 사진 없음`)}">${ic("tent")}</span>`;
}
// 카드 사진: GitHub Pages 배포 단계에서 합쳐지는 고캠핑 공식 webp를 우선 사용한다.
// 원본 URL은 사진 브랜치에 아직 파생본이 없을 때만 보조로 쓴다.
// 원본이 지워져 404가 난 사진 주소(이 방문 동안 기억). 상세 사진 묶음·라이트박스에서 뺀다.
const DEAD = new Set();
// 고캠핑 원본·썸네일은 같은 파일명을 가진다. 파일명 및 파라미터 제외 키로 중복을 거른다.
const photoKey = (u) => {
  const path = String(u ?? "").split(/[?#]/)[0];
  const raw = path.slice(path.lastIndexOf("/") + 1) || path;
  let base;
  try { base = decodeURIComponent(raw); } catch { base = raw; }
  base = base.toLowerCase();
  return base.replace(/^thumb_\d+_/, "");
};
const PT_FB = new Map();
const isPt = (c, u) => Boolean(c.pt && (u === c.pt.i || u === c.pt.t));
const ptCredit = (c) => `<span class="pt-credit" title="${esc(c.pt?.s ? `${c.pt.s} 후기 사진` : "후기 사진")}">후기 사진</span>`;
function photosOf(c) {
  return photosAll(c).filter((u) => !DEAD.has(photoUrl(u)));
}
function photosAll(c) {
  const p = S.photos[c.id] ?? [];
  const own = S.cards[c.id];
  const remote = p.filter((x) => !String(x).startsWith("media/"));
  const local = p.filter((x) => String(x).startsWith("media/"));
  let list = [];
  if (local.length) list = [...local, ...(own ?? []).map((x) => `media/${x}`), ...remote];
  else if (own?.length) list = [...(c.ph ? [`media/${c.ph}`] : []), ...own.map((x) => `media/${x}`), ...remote];
  else if (remote.length) list = remote;
  else if (c.ph) list = [`media/${c.ph}`];
  else if (c.img) list = [c.img];
  // 공식 사진이 없는 곳: 캠핑장 이름으로 찾은 블로그 사진 중 배치도·안내판·야간 사진을 거른 한 장(pick-card-fallback.mjs → c.pt).
  // 원본이 막히면 검색 썸네일로 바꾼다(PT_FB). 카드에는 ‘후기 사진’ 출처를 붙인다.
  else if (c.pt?.i || c.pt?.t) { list = [c.pt.i || c.pt.t]; if (c.pt.i && c.pt.t) PT_FB.set(c.pt.i, c.pt.t); }
  // 걸러 고른 사진(c.pt)이 없을 때만 첫 검색 썸네일(c.sn, build-explore-data)
  else if (c.sn && !list.length) list = [c.sn];

  const seen = new Set();
  const deduped = [];
  for (const u of list) {
    if (!u) continue;
    const k = photoKey(u);
    if (seen.has(k) || seen.has(u)) continue;
    seen.add(k);
    seen.add(u);
    deduped.push(u);
    if (deduped.length >= 5) break;
  }
  return deduped;
}
// 카드 사진 레일: 단일 사진은 .car-single로 렌더링(레일 드래그 이벤트 통과), 다중 사진은 .car-multi(스와이프 전환 및 화살표 버튼).
function carousel(c, { eager = false, cls = "", single = false } = {}) {
  const ph = photosOf(c);
  const alt = esc(nameOf(c).name);
  if (!ph.length) return `<div class="car car-empty ${cls}">${ic("tent")}</div>`;
  if (single || ph.length === 1) {
    return `<div class="car car-single ${cls}"><img class="car-img" src="${esc(photoUrl(ph[0]))}" alt="${alt}" loading="${eager ? "eager" : "lazy"}" decoding="async" draggable="false"${/^https?:/i.test(photoUrl(ph[0])) ? ' referrerpolicy="no-referrer"' : ""}>${isPt(c, ph[0]) ? ptCredit(c) : ""}</div>`;
  }
  const slides = ph.map((u, i) => i === 0
    ? imageTag(u, alt, { eager })
    : `<img data-src="${esc(photoUrl(u))}" data-hi-src="${esc(photoHiUrl(u))}" alt="" decoding="async" draggable="false">`).join("");
  const dots = ph.length > 1 ? `<span class="car-dots" aria-hidden="true">${ph.map((_, i) => `<i${i ? "" : ' class="on"'}></i>`).join("")}</span>` : "";
  const nav = ph.length > 1 ? `<button class="car-nav prev" type="button" aria-label="이전 사진">${ic("left")}</button><button class="car-nav next" type="button" aria-label="다음 사진">${ic("right")}</button>` : "";
  return `<div class="car car-multi ${cls}" data-n="${ph.length}"><div class="car-track">${slides}</div>${dots}${nav}</div>`;
}
function hydrate(car) {
  if (car.dataset.h) return;
  car.dataset.h = 1;
  $$("img[data-src]", car).forEach((im) => {
    const src = im.dataset.src, high = im.dataset.hiSrc;
    im.src = src;
    if (high && high !== src) { im.srcset = `${src} 480w, ${high} 1280w`; im.sizes = "(max-width: 759px) 80vw, 320px"; }
    im.removeAttribute("data-src"); im.removeAttribute("data-hi-src");
  });
}
function initCarousels(root = document) {
  for (const car of $$(".car-multi[data-n]", root)) {
    if (car.dataset.init) continue;
    car.dataset.init = "1";
    const tr = $(".car-track", car);
    if (!tr) continue;
    let dots = $$(".car-dots i", car);
    // 깨진 사진은 그 장을 빼고, 남는 사진이 없으면 카드를 지운다(빈 썸네일 금지).
    $$("img", tr).forEach((im) => im.addEventListener("error", () => {
      im.remove();
      const left = $$("img", tr).length;
      const d = $(".car-dots", car);
      if (d) { d.lastElementChild?.remove(); dots = $$(".car-dots i", car); if (left < 2) d.remove(); }
      if (!left) {
        const c = car.closest(".card, .mi, .review-pick, .tr-card");
        if (c) c.remove();
        else car.outerHTML = `<div class="car car-empty">${ic("tent")}</div>`;
      }
    }, { once: true }));
    ["pointerenter", "touchstart", "focusin"].forEach((ev) => car.addEventListener(ev, () => hydrate(car), { passive: true, once: true }));
    tr.addEventListener("scroll", () => {
      hydrate(car);
      const w = tr.clientWidth || 1;
      const i = Math.round(tr.scrollLeft / w);
      dots.forEach((d, k) => d.classList.toggle("on", k === i));
    }, { passive: true });
    $$(".car-nav", car).forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); hydrate(car);
      const w = tr.clientWidth || 200;
      tr.scrollBy({ left: (b.classList.contains("next") ? 1 : -1) * w, behavior: "smooth" });
    }));
    // 마우스 및 터치 끌기. 끌었으면 카드 열기를 막는다.
    let x0 = null, s0 = 0, moved = false;
    tr.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      e.stopPropagation();
      x0 = e.clientX; s0 = tr.scrollLeft; moved = false; tr.classList.add("drag"); hydrate(car);
    });
    window.addEventListener("pointermove", (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 4) moved = true;
      tr.scrollLeft = s0 - dx;
    });
    window.addEventListener("pointerup", () => {
      if (x0 === null) return;
      x0 = null; tr.classList.remove("drag");
      const w = tr.clientWidth || 1;
      tr.scrollTo({ left: Math.round(tr.scrollLeft / w) * w, behavior: "smooth" });
    });
    tr.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    // 사진 레일은 카드 링크 위에 있다(가로 스와이프를 받으려고). 사진을 누르면 카드 링크로 간다.
    tr.addEventListener("click", () => {
      if (moved) return;
      const hit = car.closest(".card, .mi, .review-pick, .tr-card, .lrow")?.querySelector(".card-hit");
      if (hit) location.hash = hit.getAttribute("href");
    });
  }
}
function initDraggableRails(root = document) {
  const rails = $$(".rail", root);
  for (const rail of rails) {
    if (rail.dataset.dragInit) continue;
    rail.dataset.dragInit = "1";
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasMoved = false;
    let bounceX = 0;

    const updateRailState = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      if (max <= 6) {
        rail.classList.remove("has-left-fade", "has-right-fade");
        return;
      }
      const atStart = rail.scrollLeft <= 6;
      const atEnd = rail.scrollLeft >= max - 6;
      rail.classList.toggle("has-left-fade", !atStart);
      rail.classList.toggle("has-right-fade", !atEnd);
    };
    rail.addEventListener("scroll", updateRailState, { passive: true });
    requestAnimationFrame(updateRailState);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(updateRailState);
      ro.observe(rail);
    }

    // 브라우저 기본 링크·이미지 네이티브 드래그(URL 텍스트 고스트가 마우스에 붙는 현상) 완전 차단
    rail.addEventListener("dragstart", (e) => {
      e.preventDefault();
    }, true);

    rail.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      // 다중 사진 썸네일 트랙(.car-multi)과 캐러셀 버튼, 입력창, 찜 버튼은 자체 이벤트를 처리하고,
      // 칩 버튼(.chip), 단일 썸네일(.car-single), 카드 텍스트 영역(.card-body, .tr-body), 여백 등은 가로 레일을 드래그한다.
      if (e.target.closest(".car-multi, .car-nav, select, input, a.btn, [data-save]")) return;
      isDown = true;
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = rail.scrollLeft;
      hasMoved = false;
      bounceX = 0;
      rail.style.transition = "";
    });

    const onPointerMove = (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!hasMoved) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
          isDown = false;
          return;
        }
        if (Math.abs(dx) > 5) {
          hasMoved = true;
          rail.classList.add("is-dragging");
        }
      }
      if (hasMoved) {
        e.preventDefault();
        const targetScroll = scrollLeft - dx;
        const maxScroll = rail.scrollWidth - rail.clientWidth;
        if (targetScroll < 0) {
          rail.scrollLeft = 0;
          bounceX = -targetScroll * 0.35;
          rail.style.transform = `translateX(${bounceX}px)`;
        } else if (targetScroll > maxScroll && maxScroll > 0) {
          rail.scrollLeft = maxScroll;
          bounceX = (maxScroll - targetScroll) * 0.35;
          rail.style.transform = `translateX(${bounceX}px)`;
        } else {
          rail.scrollLeft = targetScroll;
          if (bounceX !== 0) {
            bounceX = 0;
            rail.style.transform = "";
          }
        }
        updateRailState();
      }
    };

    const onPointerUp = () => {
      if (!isDown) return;
      isDown = false;
      if (bounceX !== 0) {
        rail.style.transition = "transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        rail.style.transform = "translateX(0px)";
        setTimeout(() => {
          rail.style.transition = "";
          rail.style.transform = "";
          bounceX = 0;
          updateRailState();
        }, 450);
      }
      if (hasMoved) {
        setTimeout(() => {
          rail.classList.remove("is-dragging");
          hasMoved = false;
        }, 60);
      } else {
        rail.classList.remove("is-dragging");
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    rail.addEventListener("click", (e) => {
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }
}

// ── 카드 ─────────────────────────────────────────────────────
// ── 카드 ─────────────────────────────────────────────────────
function formatRowVal(label, v) {
  if (!v) return "–";
  let s = esc(v);
  if (label === "전기" || /\b\d+(?:\.\d+)?A\b/.test(s)) {
    s = s.replace(/(?:(\s*·\s*)(\b\d+(?:\.\d+)?A\b)|(\b\d+(?:\.\d+)?A\b)(\s*·\s*)|(\b\d+(?:\.\d+)?A\b))/g, (m) => `<span class="rv-amp">${m}</span>`);
  }
  return s;
}

function cardRow(label, icon, x) {
  const isNo = Boolean(x && /불가|금지/.test(x.v));
  const valHtml = x ? formatRowVal(label, x.v) : "–";
  return `<li><span class="rl">${ic(icon)}${label}</span><span class="rv${x ? "" : " none"}${isNo ? " is-no" : ""}">${valHtml}</span>${x ? dot(x.g) : ""}</li>`;
}

function rowsHtml(c) {
  const f = facts(c);
  // 주변은 마트·편의점·정육점 순서 고정(' · ' 구분), 가격은 ‘2만~8만원’.
  const near = nearLine(c, " · "), fm = feeMain(c);
  const nearX = near ? { v: near } : null;
  const feeX = fm?.text ? { v: `${fm.text}${fm.est ? " 추정" : ""}`, g: GR(c.fee.grade) } : null;
  return `<ul class="rows">${cardRow("주차", "car", f.park)}${cardRow("전기", "bolt", f.power)}${cardRow("장작", "flame", f.fire)}${cardRow("주변", "store", nearX).replace("<li>", '<li class="r-near">')}${cardRow("가격", "won", feeX)}</ul>`;
}
function rowsHtmlHorizontal(c) {
  const f = facts(c), ti = c.ti ?? {};
  const near = nearLine(c, " · "), fm = feeMain(c);
  const nearX = near ? { v: near } : null;
  const feeX = fm?.text ? { v: `${fm.text}${fm.est ? " 추정" : ""}`, g: GR(c.fee?.grade) } : null;
  const timeStr = [ti.i?.[0] ? `입실 ${ti.i[0]}` : "", ti.o?.[0] ? `퇴실 ${ti.o[0]}` : "", ti.m?.[0] ? `매너 ${ti.m[0]}부터` : ""].filter(Boolean).join(" · ");
  const timeX = timeStr ? { v: timeStr, g: ti.i?.[1] } : null;
  const petX = f.pet ? { v: f.pet.v, g: f.pet.g } : null;
  return `<ul class="rows rows-horiz">
    ${cardRow("주차", "car", f.park)}
    ${cardRow("전기", "bolt", f.power)}
    ${cardRow("장작", "flame", f.fire)}
    ${cardRow("반려견", "paw", petX)}
    ${cardRow("시간", "clock", timeX)}
    ${cardRow("주변", "store", nearX).replace("<li>", '<li class="r-near">')}
    ${cardRow("가격", "won", feeX)}
  </ul>`;
}
// 가는 길 장보기: 마트·편의점·정육점 중 5km 안에 있는 곳(LOCALDATA 인허가). 순서는 늘 마트 → 편의점 → 정육점(소유자 2026-10-20).
function nearLine(c, sep = " · ") {
  const nl = c.nl ?? {};
  return [["m", "마트"], ["c", "편의점"], ["b", "정육점"]].filter(([k]) => nl[k] && nl[k] <= 5000).map(([k, l]) => `${l} ${km(nl[k])}`).join(sep);
}
// 찜(하트): 카드 이름 오른쪽 회색 선 하트 → 누르면 채운 하트. 찜한 곳은 ‘찜’ 화면에서 3곳씩 나란히 비교한다.
function isSaved(id) { return S.saved.includes(String(id)); }
function heartBtn(c, { label = false } = {}) {
  const on = isSaved(c.id);
  return `<button class="heart${on ? " on" : ""}${label ? " heart-label" : ""}" type="button" data-save="${esc(c.id)}" aria-pressed="${on}" aria-label="${on ? "찜 해제" : "찜하기"}">${ic(on ? "heart" : "heart-o")}${label ? `<span>찜</span>` : ""}</button>`;
}
function cardReviewPills(rv) {
  if (!rv) return "";
  const pros = (rv.p ?? []).slice(0, 2).map(([t, n]) => `<span class="c-rv-pill pro">${ic("thumb-up")}${esc(t)}<i>${n}</i></span>`);
  const cons = (rv.c ?? []).slice(0, 1).map(([t, n]) => `<span class="c-rv-pill con">${ic("alert")}${esc(t)}<i>${n}</i></span>`);
  if (!pros.length && !cons.length && rv.n > 0) return `<span class="c-rv-pill neutral">${ic("file-text")}후기 ${fmt(rv.n)}건</span>`;
  return [...pros, ...cons].join("");
}
function card(c, i = 0, opts) {
  const isWp = Boolean((opts && !Array.isArray(opts) && opts.isWaterPlay) || S.theme === "WATER_PLAY");
  const { tag } = nameOf(c), o = openingOf(c);
  return `<article class="card${isWp ? " is-closed" : ""}" data-id="${esc(c.id)}">
    <a class="card-hit" href="#/c/${encodeURIComponent(c.id)}" draggable="false" aria-label="${esc(nameOf(c).name)} 자세히"></a>
    <div class="card-media">${carousel(c, { eager: i < 4 })}
      ${isWp ? `<span class="sig closed">${ic("clock")}운영종료</span>` : o ? `<span class="sig">${ic("clock")}${esc(o.txt)}</span>` : S.avail?.has(String(c.id)) ? `<span class="sig live">${ic("check")}접수 중</span>` : ""}
      <span class="bdgs">${badges(c, 3)}</span>
    </div>
    <div class="card-body">
      <div class="name-row"><h3 class="card-name">${esc(nameOf(c).name)}</h3>${heartBtn(c)}</div>
      <p class="card-meta">${ic("pin")}${esc(region(c))}${tag ? ` · ${esc(tag)}` : ""}${!c.st?.length && typeLine(c) ? ` · ${esc(typeLine(c))}` : ""}</p>
      ${c.st?.length ? `<p class="card-types">${ic("tent")}${esc(typeLine2(c))}</p>` : ""}
      ${rowsHtml(c)}
      ${feeMain(c)?.text && feeTiersLine(c) ? `<p class="card-tiers">${feeTiersLine(c)}</p>` : ""}
      ${c.rv && (c.rv.p?.length || c.rv.c?.length || c.rv.n > 0) ? `<div class="card-reviews">${cardReviewPills(c.rv)}</div>` : ""}
    </div>
  </article>`;
}

// ── 공통 UI: 토스트·(i) 말풍선 ───────────────────────────────
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 1800); }
const TIPS = new Map();
let tipN = 0;
function tip(html, label = "자세한 정보") { const k = `t${++tipN}`; TIPS.set(k, html); return `<button class="ib" type="button" data-tip="${k}" aria-label="${esc(label)}">${ic("info")}</button>`; }
function srcTip(x, label) {
  if (!x) return "";
  const s = x.src ?? {};
  const d = s.at ? formatKoreanDate(s.at) : "";
  // 운영자 안내 이미지에서 글자 인식(OCR)으로 읽은 값이면 원본 이미지를 함께 보인다 — 인식이 틀릴 수 있으니 눈으로 확인(소유자 2026-10-19).
  const img = s.image ? `<button type="button" class="tip-img" data-ocr-img="${esc(s.image)}" aria-label="원본 이미지 크게 보기"><img src="${esc(s.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.tip-img').classList.add('is-broken')"><span>${ic("search")}원본 이미지 크게 보기</span></button><small class="tip-note">글자 인식 결과라 틀릴 수 있어요. 이미지를 확인하세요. <a href="${esc(s.image)}" target="_blank" rel="noopener">이미지 새 창</a></small>` : "";
  return tip(`<b>${esc(label)}</b><span>${GRADE_TXT[x.g] ?? ""}${s.label ? ` · ${esc(s.label)}` : ""}${d ? ` · ${esc(d)}` : ""}</span>${img}${s.quote ? `<q>${esc(String(s.quote).slice(0, 240))}</q>` : ""}${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">원문 보기</a>` : ""}`, `${label} 근거`);
}
// (i) 안의 원본 안내 이미지 → 크게 보기
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ocr-img]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  $("#pop").hidden = true;
  openLightboxUrls([b.dataset.ocrImg], 0, "운영자 안내 이미지 원본");
  document.querySelector("dialog.lightbox:last-of-type")?.classList.add("lb-doc"); // 투명 PNG 안내문이 어두운 바탕에 묻히지 않게
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tip]"), pop = $("#pop");
  if (!b) { if (!e.target.closest("#pop")) pop.hidden = true; return; }
  const a = e.target.closest("a, button:not([data-tip])");
  if (a && a !== b && b.contains(a)) return; // 카드 안의 링크·다른 버튼은 그대로 동작
  e.preventDefault(); e.stopPropagation();
  pop.innerHTML = TIPS.get(b.dataset.tip) ?? "";
  pop.hidden = false;
  const r = b.getBoundingClientRect(), pw = Math.min(300, innerWidth - 24);
  pop.style.width = `${pw}px`;
  pop.style.left = `${Math.max(12, Math.min(innerWidth - pw - 12, r.left + r.width / 2 - pw / 2))}px`;
  const below = r.bottom + 8 + pop.offsetHeight < innerHeight;
  pop.style.top = `${below ? r.bottom + 8 : r.top - 8 - pop.offsetHeight}px`;
});
addEventListener("scroll", () => { $("#pop").hidden = true; }, { passive: true });
// 상세 화면의 작은 (i)를 없애고 카드·행 전체를 눌러 원문을 연다(소유자 2026-10-20). 키보드: Tab으로 가서 Enter·Space.
const TIP_HOST = ".tile, .stype, .pt, .ptiers, .plist li, .use, .d-line, .rs-avail, .sec-note, .amen-n, .ev-card, li, p";
function hostTips(root) {
  for (const ib of $$(".ib[data-tip]", root)) {
    const host = ib.closest(TIP_HOST) ?? ib.parentElement;
    if (!host || host.hasAttribute("data-tip")) { ib.remove(); continue; }
    host.dataset.tip = ib.dataset.tip;
    host.classList.add("tip-host");
    if (!/^(BUTTON|A)$/.test(host.tagName)) { host.setAttribute("role", "button"); host.tabIndex = 0; }
    host.setAttribute("aria-label", `${(host.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60)} · 출처·원문 보기`);
    host.title = "눌러서 출처·원문 보기";
    ib.remove();
  }
}
document.addEventListener("keydown", (e) => {
  const h = e.target.closest?.(".tip-host[role=button]");
  if (!h || e.target !== h || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault(); h.click();
});

// 레일 및 카드 내부의 링크·이미지를 마우스로 끌 때 브라우저의 기본 링크 드래그(URL 텍스트 고스트)가 시작되는 것을 완전 차단
document.addEventListener("dragstart", (e) => {
  if (e.target.closest(".rail, .car-track, .card-hit, .open-card, .theme-card, .tr-card, .card")) {
    e.preventDefault();
  }
}, true);

// 찜 토글
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-save]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const id = String(b.dataset.save);
  if (isSaved(id)) { S.saved = S.saved.filter((x) => x !== id); S.pick = S.pick.filter((x) => x !== id); }
  else { S.saved.unshift(id); toast(`찜 ${S.saved.length}곳`); }
  store.set("mc-saved", S.saved); store.set("mc-pick", S.pick);
  syncCompare();
  $$(`[data-save="${CSS.escape(id)}"]`).forEach((x) => { const on = isSaved(id); x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); x.setAttribute("aria-label", on ? "찜 해제" : "찜하기"); x.querySelector("use").setAttribute("href", `#i-${on ? "heart" : "heart-o"}`); });
  if (location.hash.startsWith("#/compare")) route();
});
function syncCompare() { $$("[data-compare-count]").forEach((x) => { x.textContent = S.saved.length; x.hidden = !S.saved.length; }); }

function presetOn(i) { const v = PRESETS[i][1]; return Object.entries(v).every(([k, x]) => (Array.isArray(x) ? x.every((y) => S.cond[k].includes(y)) : S.cond[k] === x)); }
function syncCondUi() {
  $$("[data-cond-label]").forEach((x) => (x.textContent = condSummary()));
  $$("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", String(presetOn(Number(b.dataset.preset)))));
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-cond]")) { if (!location.hash.startsWith("#/list")) S.onCondApply = syncCondUi; condSheet(); return; }
  const pr = e.target.closest("[data-preset]");
  if (pr) {
    const v = PRESETS[Number(pr.dataset.preset)][1], on = presetOn(Number(pr.dataset.preset));
    for (const [k, x] of Object.entries(v)) {
      if (Array.isArray(x)) S.cond[k] = on ? S.cond[k].filter((y) => !x.includes(y)) : [...new Set([...S.cond[k], ...x])];
      else S.cond[k] = on ? (typeof x === "boolean" ? false : 0) : x;
    }
    syncCondUi(); return;
  }
  if (e.target.closest("[data-open=date]")) {
    const input = $("[data-date-input]");
    if (input) { input.value = S.stay; $("#date-dialog").showModal(); }
    return;
  }
});
$("#date-dialog")?.addEventListener("close", () => {
  if ($("#date-dialog").returnValue !== "ok") return;
  const selected = $("[data-date-input]")?.value;
  if (!selected) return;
  S.stay = selected;
  store.set("mc-stay", S.stay);
  $$('[data-stay-label]').forEach((x) => (x.textContent = stayLabel()));
  if (location.hash.startsWith("#/list")) { location.hash = listHash(); return; }
  toast(`${stayLabel()} · 찾기를 누르면 그날 운영하는 곳을 보여 줘요`);
});

// ── 화면: 찾기(메인) ─────────────────────────────────────────
function countOf(test) { return S.camps.reduce((n, c) => n + (test(c) ? 1 : 0), 0); }
// ── 실시간 인기(소유자 2026-10-19): 최근 7일 블로그·카페·뉴스·동영상 글의 캠핑장 언급 순위. /context/trending.json(Trending mentions)
// 다음(Daum) 공식 아이콘(위키미디어 공용 Daum_icon_(2025–2026).svg)을 로컬 파일로 쓴다(소유자 2026-10-20).
const DAUM_LOGO = new URL("images/daum.svg", import.meta.url).href;
const daumImg = (px) => `<img class="daum-logo" src="${DAUM_LOGO}" width="${px}" height="${px}" alt="" aria-hidden="true">`;
const TR_GLYPH = {
  naver: ["네이버", '<path d="M15.6 12.8 8.1 2H2v20h6.4V11.2L15.9 22H22V2h-6.4z" transform="translate(3 3) scale(.75)"/>'],
  daum: ["Daum", '<path d="m 36,20.36 c 3.1152,0 5.6352,2.712 5.5152,5.8536 -0.1128,2.988 -2.6616,5.4264 -5.652,5.4264 h -3.9456 c -0.264,0 -0.48,-0.216 -0.48,-0.48 V 20.84 c 0,-0.264 0.216,-0.48 0.48,-0.48 h 4.08 M 36,14 h -9.6 c -0.7944,0 -1.44,0.6456 -1.44,1.44 v 21.12 c 0,0.7944 0.6456,1.44 1.44,1.44 H 36 C 42.6264,38 48,32.6264 48,26 48,19.3736 42.6264,14 36,14 Z" transform="translate(12 12) scale(.75) translate(-36.5 -26)"/>'],
  youtube: ["YouTube", '<path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z"/>'],
  tiktok: ["TikTok", '<path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6"/>'],
  instagram: ["Instagram", '<path d="M16 3a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zm-4 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8"/>'],
  facebook: ["Facebook", '<path d="M14 8h3V4h-3a5 5 0 0 0-5 5v2H7v4h2v7h4v-7h3l1-4h-4V9a1 1 0 0 1 1-1"/>'],
};
const trIcon = (k, n) => { const [label, path] = TR_GLYPH[k] ?? [k, ""]; return `<span class="tr-src" title="${esc(label)} ${n}건" aria-label="${esc(label)} ${n}건"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">${path}</svg><i>${fmt(n)}</i></span>`; };
function trendingShell() {
  return `<section class="trending" data-trending aria-labelledby="tr-t" aria-busy="true">
    <div class="sec-head">
      <h2 id="tr-t">실시간 <em>인기</em></h2>
      <div class="sec-side">
        <a class="link more-link" href="#/theme/POPULAR">더보기 ${ic("right")}</a>
      </div>
    </div>
    <div class="rail trending-rail" data-tr-rail>${Array.from({ length: 4 }, () => `<div class="tr-card tr-skel" aria-hidden="true"><span class="tr-ph"></span><b></b><i></i></div>`).join("")}</div>
  </section>`;
}
function trendingCard(x) {
  const c = S.byId.get(String(x.id));
  if (!c) return "";
  const arrow = x.trend === "up" ? `<span class="tr-tr up" aria-label="어제 ${x.prev}위에서 올라옴">▲${x.prev - x.rank}</span>` : x.trend === "down" ? `<span class="tr-tr down" aria-label="어제 ${x.prev}위에서 내려감">▼${x.rank - x.prev}</span>` : x.trend === "new" ? `<span class="tr-tr new" aria-label="새로 들어옴">NEW</span>` : "";
  const count = x.today ? `오늘 언급 <b>${fmt(x.today)}</b>건` : `7일 언급 <b>${fmt(x.week)}</b>건`;
  const srcs = Object.entries(x.by ?? {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => trIcon(k, n)).join("");
  const reasons = (c.rv?.p ?? []).slice(0, 3).map(([t]) => t);
  if (!reasons.length && c.tags?.length) reasons.push(...c.tags.slice(0, 3));
  if (!reasons.length) {
    if (c.fp) reasons.push("불멍·화로대 가능");
    if (c.pwr) reasons.push("전기 사용 가능");
    if (c.wp) reasons.push("물놀이·계곡 인접");
  }
  const reasonsHtml = reasons.length ? `<div class="tr-reasons">${reasons.slice(0, 3).map((r) => `<span class="tr-reason">${ic("thumb-up")}${esc(r)}</span>`).join("")}</div>` : "";
  return `<article class="tr-card" data-cid="${c.id}">
    <a class="card-hit" href="#/c/${encodeURIComponent(c.id)}" draggable="false" aria-label="${x.rank}위 ${esc(nameOf(c).name)} 자세히"></a>
    <span class="tr-ph">${carousel(c, { eager: x.rank <= 3, single: true })}<span class="tr-rank">${x.rank}</span>${arrow}</span>
    <div class="tr-body">
      <b>${esc(nameOf(c).name)}</b><i>${esc(region(c))}</i>
      ${reasonsHtml}
      <span class="tr-meta"><span class="tr-count">${count}</span><span class="tr-srcs">${srcs}</span></span>
    </div>
  </article>`;
}
async function mountTrending() {
  const sec = $("[data-trending]");
  if (!sec) return;
  const data = await fetch(new URL(`${MOD_ROOT}context/trending.json?v=${new Date().toISOString().slice(0, 13)}`, import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!sec.isConnected) return;
  const cards = (data?.top ?? []).slice(0, 20).map(trendingCard).filter(Boolean);
  const rail = $("[data-tr-rail]", sec);
  sec.removeAttribute("aria-busy");
  if (!cards.length) {
    rail.outerHTML = `<div class="tr-empty">${ic("broadcast")}<b>아직 집계된 글이 없어요</b><span>매일 밤 최근 7일 글을 모아 순위를 새로 매겨요.</span></div>`;
    return;
  }
  rail.innerHTML = cards.join("");
  initCarousels(sec);
  initDraggableRails(sec);
}
function homeView() {
  const openings = S.camps.map((c) => [c, openingOf(c)]).filter(([c, o]) => o && hasPhoto(c)).sort((a, b) => a[1].dd - b[1].dd);
  const themeItems = THEMES.map(([key, label, test]) => {
    const imgSrc = themeImg(key);
    const isWp = key === "WATER_PLAY";
    return `<a class="theme-card${isWp ? " is-closed" : ""}" href="#/theme/${encodeURIComponent(key)}" draggable="false"><img src="${imgSrc}" alt="${esc(label)}" loading="lazy" draggable="false">${isWp ? `<span class="theme-closed-badge">운영종료</span>` : ""}<span><b>${thIc(key)}${esc(label)}</b><i>${fmt(countOf(test))}곳</i></span></a>`;
  }).join("");
  const openingSection = openings.length ? `<section class="opens" aria-labelledby="op-t">
    <div class="sec-head"><h2 id="op-t">곧 <em>오픈</em></h2><div class="sec-side"><a class="link more-link" href="#/theme/OPEN">더보기 ${ic("right")}</a></div></div>
    <div class="rail opens-rail">${openings.map(([c, o]) => `<a class="open-card" href="#/c/${encodeURIComponent(c.id)}" draggable="false">${imageTag(photosOf(c)[0] ?? "", "", { sizes: "250px" })}<span class="open-dd">${esc(o.txt)}</span><b>${esc(nameOf(c).name)}</b><i>${esc(region(c))} · ${esc(o.platform ?? "")}</i></a>`).join("")}</div>
  </section>` : "";
  const picks = reviewPicks();
  const reviewSection = picks.length ? `<section class="review-picks" aria-labelledby="review-picks-t">
    <div class="sec-head"><div><h2 id="review-picks-t">긍정 <em>후기</em></h2></div><div class="sec-side"><a class="link more-link" href="#/theme/REVIEWS">더보기 ${ic("right")}</a></div></div>
    <div class="rail review-picks-rail">${picks.map(reviewPickCard).join("")}</div>
  </section>` : "";
  const themeSection = themeItems ? `<section class="themes-catalog" aria-labelledby="theme-t">
    <div class="sec-head"><h2 id="theme-t">테마로 <em>고르기</em></h2><div class="sec-side"><a class="link more-link" href="#/theme/ALL">더보기 ${ic("right")}</a></div></div>
    <div class="rail theme-catalog-rail">${themeItems}</div>
  </section>` : "";
  return `
  <section class="hero" aria-labelledby="hero-t">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="hero-in">
      <h1 id="hero-t"><span class="h1-a">취향대로 찾아 떠나는</span> <span class="h1-b">전국 ${fmt(S.camps.length)}개 <em>자연 속으로.</em></span></h1>
      <p class="hero-summary">숲·계곡·바다, 나만의 쉼터를 조건으로 골라 보세요</p>
      <div class="finder"><div class="rail chips finder-regions" aria-label="지역">${AREAS.map(([k, l]) => `<button type="button" class="chip" data-area="${k}" aria-pressed="${S.area === k}">${l}</button>`).join("")}</div><form class="finder-form" role="search" data-search>
        <label class="finder-field finder-destination"><small>어디로</small><input type="search" name="q" value="${esc(S.q)}" placeholder="전국 또는 캠핑장명" aria-label="지역 또는 캠핑장명" autocomplete="off" enterkeyhint="search"></label>
        <button class="finder-field finder-static finder-cond" type="button" data-open-cond><small>조건</small><b data-cond-label>${esc(condSummary())}</b></button>
        <button class="finder-go" type="submit">${ic("search")}<span>찾기</span></button>
      </form><div class="rail chips finder-presets" aria-label="자주 찾는 조건">${PRESETS.map(([l], i) => `<button type="button" class="chip" data-preset="${i}" aria-pressed="${presetOn(i)}">${esc(l)}</button>`).join("")}</div></div>
    </div>
  </section>

  ${openingSection}
  ${trendingShell()}
  ${reviewSection}
  ${themeSection}
  <section class="results" id="results" aria-labelledby="res-t">
    <div class="res-head">
      <h2 id="res-t" data-res-title><b>조건 검색</b></h2>
      <div class="res-tools">
        <div class="rail active-chips" data-active></div>
      </div>
    </div>
    <div class="filter-zone" aria-label="캠핑장 조건 필터">
      <div class="type-filter" aria-label="사이트 타입"><div class="rail type-chips">
        <span class="fee-band-lbl">사이트</span><button type="button" class="chip" data-stype="" aria-pressed="${!S.stype}">전체</button>
        ${STYPES.filter(([k]) => k !== "PITCH" && k !== "PRIVATE_BATH").map(([k, l, i]) => { const n = countOf((c) => hasType(c, k)); return n ? `<button type="button" class="chip type-chip" data-stype="${k}" aria-pressed="${S.stype === k}">${ic(i)}${l} <i>${fmt(n)}</i></button>` : ""; }).join("")}
      </div></div>
      <div class="fee-filter" aria-label="1박 요금대"><div class="rail fee-bands">
        <span class="fee-band-lbl">1박 요금</span><button type="button" class="chip fee-chip" data-fee-band="" aria-pressed="${!S.feeBand}">전체</button>
        <button type="button" class="chip fee-chip" data-fee-band="u3" aria-pressed="${S.feeBand === 'u3'}">~3만원 <i>${fmt(countOf((c) => Boolean(campFeeMin(c) && campFeeMin(c) <= 30000)))}</i></button>
        <button type="button" class="chip fee-chip" data-fee-band="3to5" aria-pressed="${S.feeBand === '3to5'}">3~5만원 <i>${fmt(countOf((c) => { const mn = campFeeMin(c), mx = campFeeMax(c); return Boolean(mn && mn <= 50000 && (mx == null || mx >= 30000)); }))}</i></button>
        <button type="button" class="chip fee-chip" data-fee-band="5to7" aria-pressed="${S.feeBand === '5to7'}">5~7만원 <i>${fmt(countOf((c) => { const mn = campFeeMin(c), mx = campFeeMax(c); return Boolean(mn && mn <= 70000 && (mx == null || mx >= 50000)); }))}</i></button>
        <button type="button" class="chip fee-chip" data-fee-band="7to10" aria-pressed="${S.feeBand === '7to10'}">7만원~10만원 <i>${fmt(countOf((c) => { const mn = campFeeMin(c), mx = campFeeMax(c); return Boolean(mn && mn <= 100000 && (mx == null || mx >= 70000)); }))}</i></button>
        <button type="button" class="chip fee-chip" data-fee-band="10to20" aria-pressed="${S.feeBand === '10to20'}">10만원~20만원 <i>${fmt(countOf((c) => { const mn = campFeeMin(c), mx = campFeeMax(c); return Boolean(mn && mn <= 200000 && (mx == null || mx >= 100000)); }))}</i></button>
        <button type="button" class="chip fee-chip" data-fee-band="o20" aria-pressed="${S.feeBand === 'o20'}">20만원+ <i>${fmt(countOf((c) => { const mn = campFeeMin(c), mx = campFeeMax(c); return Boolean(mn && (mn >= 200000 || (mx && mx >= 200000))); }))}</i></button>
      </div></div>
    </div>
    <div class="trows" data-rows></div>
    <div class="grid" data-grid></div>
    <div class="nophoto" data-nophoto></div>
    <div class="more-wrap"><button class="btn ghost" type="button" data-more>더 보기</button></div>
    <p class="credit">Copyright © 2026 모여라 캠핑. All Rights Reserved.</p>
  </section>

`;
}
// 사진이 없는 곳은 카드로 보이지 않는다(소유자: 사진 없는 썸네일 금지). 이름 검색일 때만 아래 글 목록으로 남긴다.
const hasPhoto = (c) => photosOf(c).length > 0;
function themeRow([k, label, test], list, first, used) {
  const all = list.filter(test);
  // 같은 캠핑장이 여러 줄 맨 앞에 반복되지 않게, 앞줄에 나온 곳은 뺀다.
  const items = all.filter((c) => hasPhoto(c) && !used.has(c.id)).slice(0, 16);
  if (items.length < 3) return "";
  items.forEach((c) => used.add(c.id));
  return `<section class="trow" aria-label="${esc(label)}">
    <div class="trow-head"><h3>${thIc(k)}${esc(label)} <i>${fmt(all.length)}</i></h3><button type="button" class="link more-link" data-theme-all="${k}">더보기 ${ic("right")}</button></div>
    <div class="rail trow-rail">${items.map((c, i) => card(c, first && i < 4 ? i : 9, { isWaterPlay: k === "WATER_PLAY" })).join("")}</div>
  </section>`;
}
const themeName = (k) => (k === "ALL" ? "전체 테마" : k === "AVAIL" ? "공식 접수 중" : k === "OPEN" ? "곧 오픈" : k === "REVIEWS" ? "긍정 후기 추천" : THEMES.find((t) => t[0] === k)?.[1] ?? k);
function renderResults({ reset = true } = {}) {
  const grid = $("[data-grid]");
  if (!grid) return;
  const list = results();
  if (reset) S.shown = 24;
  const act = [];
  if (S.q) act.push(`<button class="chip on" data-clear="q">“${esc(S.q)}” ${ic("close")}</button>`);
  if (S.area !== "all") act.push(`<button class="chip on" data-clear="area">${esc(S.area)} ${ic("close")}</button>`);
  if (S.theme) act.push(`<button class="chip on" data-clear="theme">${esc(themeName(S.theme))} ${ic("close")}</button>`);
  if (S.feeBand) {
    const fbLabel = {
      u3: "~3만원",
      "3to5": "3~5만원",
      "5to7": "5~7만원",
      "7to10": "7만원~10만원",
      "10to20": "10만원~20만원",
      o20: "20만원+",
      o7: "7만원+",
    }[S.feeBand] ?? S.feeBand;
    act.push(`<button class="chip on" data-clear="feeBand">${esc(fbLabel)} ${ic("close")}</button>`);
  }
  for (const k of S.quick) act.push(`<button class="chip on" data-clear="quick:${k}">${esc(QUICK[k].label)} ${ic("close")}</button>`);
  $("[data-active]").innerHTML = act.join("");
  if (S.stype) act.push(`<button class="chip on" data-clear="stype">${esc(ST[S.stype].label)} ${ic("close")}</button>`);
  $("[data-active]").innerHTML = act.join("");
  const rows = $("[data-rows]"), noph = $("[data-nophoto]");
  // 둘러보기(검색어·테마·사이트 타입 없음): 테마·사이트 타입마다 한 줄씩 가로로 넘기는 줄(소유자 요청). 고르면 격자.
  if (!S.q && !S.theme && !S.stype) {
    $("[data-res-title]").innerHTML = `<b>조건 검색</b>`;
    const themeList = THEMES.filter(([k]) => k !== "POPULAR");
    const defs = [
      ...themeList.slice(0, 3),
      ["T:HOUSE", "캐빈·방갈로", (c) => hasType(c, "HOUSE")],
      ...themeList.slice(3, 7),
      ["T:DECK", "데크", (c) => hasType(c, "DECK")],
      ...themeList.slice(7, 10),
      ["T:CAR_CAMP", "차박", (c) => hasType(c, "CAR_CAMP")],
      ...themeList.slice(10),
    ];
    const used = new Set();
    rows.innerHTML = list.length ? defs.map((dd, i) => themeRow(dd, list, i === 0, used)).join("") : `<div class="empty">${ic("search")}<b>맞는 곳이 없어요</b><button class="btn ghost" data-clear="all">조건 지우기</button></div>`;
    grid.innerHTML = ""; noph.innerHTML = "";
    $("[data-more]").hidden = true;
    initCarousels(rows);
    initDraggableRails(rows);
    return;
  }
  rows.innerHTML = "";
  const shown = list.filter(hasPhoto), bare = list.filter((c) => !hasPhoto(c));
  $("[data-res-title]").innerHTML = S.theme ? `${esc(themeName(S.theme))} <b>${fmt(list.length)}</b>곳` : `<b>${fmt(shown.length)}</b>곳을 찾았어요`;
  grid.innerHTML = shown.length ? shown.slice(0, S.shown).map(card).join("") : bare.length ? "" : `<div class="empty">${ic("search")}<b>맞는 곳이 없어요</b><button class="btn ghost" data-clear="all">조건 지우기</button></div>`;
  $("[data-more]").hidden = shown.length <= S.shown;
  noph.innerHTML = S.q && bare.length ? `<h4>사진 없는 곳 ${fmt(bare.length)}</h4><ul>${bare.slice(0, 30).map((c) => `<li><a href="#/c/${encodeURIComponent(c.id)}"><b>${esc(nameOf(c).name)}</b><i>${esc(region(c))}</i></a>${heartBtn(c)}</li>`).join("")}</ul>` : "";
  initCarousels(grid);
  initDraggableRails(grid);
}
function moreResults() {
  const list = results().filter(hasPhoto), grid = $("[data-grid]");
  const from = S.shown; S.shown += 24;
  grid.insertAdjacentHTML("beforeend", list.slice(from, S.shown).map((c, i) => card(c, from + i)).join(""));
  $("[data-more]").hidden = list.length <= S.shown;
  initCarousels(grid);
  initDraggableRails(grid);
}
// ── 조건 검색(히어로·목록 공통, 소유자 2026-10-19) ─────────────────
// 키워드 대신 조건을 조합한다: 지역 여러 곳 · 시군 주변 반경 · 상품(글램핑·카라반 등, 하나라도) · 반려견 · 전기 W · 사이트 크기 · 장작 · 텐트 옆 주차 · 1박 요금.
// 값을 모르는 곳은 그 조건으로 걸러지지 않는다(“없음”으로 보지 않음) — 조건을 켜면 근거가 있는 곳만 남는다.
const SIDOS = ["서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "대구", "부산", "울산", "제주"];
const maxSide = (c) => (c._ms ??= Math.max(0, ...(c.field_conditions?.site_size?.groups ?? []).map((g) => Math.max(Number(g.width_m) || 0, Number(g.depth_m) || 0)), ...(c.tq?.mx ?? [])));
const wattsOf = (c) => (c._w ??= facts(c).power?.w ?? 0);
const hasPower = (c) => (c._pw ??= Boolean(facts(c).power?.ok));
const petOk = (c) => (/가능/.test(c.pets ?? "") && !/불가/.test(c.pets ?? "")) || Boolean(c.pf?.t?.includes("PET_OK"));
const dayUse = (c) => Boolean(c.du) || (c.types ?? []).some((t) => t === "캠크닉" || t === "캠프닉") || /캠프닉|캠크닉|데이\s*캠핑|당일\s*(캠핑|이용)/.test(`${c.name} ${(c.amenities ?? []).join(" ")} ${c.pf?.s ?? ""}`);
// 상품 조건은 등록·운영자 근거가 있는 타입만(후기 언급 m은 “있다”의 근거로 약하다).
const hasFirmType = (c, k) => (c.st ?? []).some((t) => t[0] === k && t[2] !== "m");
const KINDS = [
  ["GLAMPING", "글램핑", (c) => (c.types ?? []).includes("글램핑") || hasFirmType(c, "GLAMPING")],
  ["CARAVAN", "카라반", (c) => (c.types ?? []).includes("카라반") || hasFirmType(c, "CARAVAN")],
  ["AUTO", "오토캠핑", (c) => (c.types ?? []).includes("자동차야영장") || hasFirmType(c, "AUTO")],
  ["GENERAL", "일반 사이트", (c) => (c.types ?? []).includes("일반야영장") || hasFirmType(c, "PITCH")],
  ["HOUSE", "숙박동·방갈로", (c) => hasFirmType(c, "HOUSE")],
  ["RV", "캠핑카·트레일러", (c) => hasFirmType(c, "RV") || c.trailer === true],
  ["CAR_CAMP", "차박", (c) => hasFirmType(c, "CAR_CAMP")],
  ["DAY", "당일 캠크닉", dayUse],
];
const KIND = Object.fromEntries(KINDS.map(([k, l, t]) => [k, { label: l, test: t }]));
const W_OPTS = [[0, "상관없음"], [1, "전기 있음"], [600, "600W 이상"], [1100, "1,100W 이상"]];
const SIZE_OPTS = [[0, "상관없음"], [6, "6m 이상"], [8, "8m 이상"], [10, "10m 이상"]];
const R_OPTS = [10, 20, 30];
const emptyCond = () => ({ sido: [], kind: [], pet: false, w: 0, size: 0, fire: false, park: false, near: "", r: 20 });
S.cond = emptyCond();
const km2 = (a, b) => { const R = 6371, dLa = ((b.lat - a.lat) * Math.PI) / 180, dLo = ((b.lng - a.lng) * Math.PI) / 180; const x = Math.sin(dLa / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
// “파주 일대”: 그 시·군 캠핑장 좌표의 가운데에서 반경 r km
function nearCenter(name) {
  const q = String(name ?? "").trim().replace(/(시|군|구)$/, "");
  if (q.length < 2) return null;
  const pts = S.camps.filter((c) => c.lat && String(c.sigungu ?? "").replace(/(시|군|구)$/, "").startsWith(q));
  if (!pts.length) return null;
  return { lat: pts.reduce((a, c) => a + c.lat, 0) / pts.length, lng: pts.reduce((a, c) => a + c.lng, 0) / pts.length, label: pts[0].sigungu };
}
// 조건 판정은 세 갈래다(소유자 2026-10-19: “데이터가 없어서 걸러지는 건 안 좋다”).
//   y = 근거로 맞음 · ref = 법령 기준으로 맞다고 볼 수 있음(전기 있음 + W 미공지 → 관광진흥법 사이트당 600W) · ? = 정보 없음 · n = 근거로 안 맞음
// 정보 없음(?)은 결과에서 빼지 않고 아래쪽에 ‘확인 필요’로 남긴다. 지역·반경만 위치 사실이라 바로 거른다.
function condEval(c, k = S.cond, skip = null) {
  const st = {};
  if (skip !== "sido" && k.sido.length && !k.sido.includes(sidoShort(c.sido))) return null;
  if (skip !== "near" && k.near) { const ctr = k._ctr; if (!ctr || !c.lat || km2(ctr, c) > k.r) return null; }
  if (skip !== "kind" && k.kind.length) {
    const hasInfo = (c.types ?? []).length > 0 || (c.st ?? []).length > 0;
    st.kind = k.kind.some((x) => KIND[x]?.test(c)) ? "y" : k.kind.includes("DAY") || !hasInfo ? "?" : "n";
  }
  if (skip !== "pet" && k.pet) st.pet = petOk(c) ? "y" : /불가/.test(c.pets ?? "") ? "n" : "?";
  if (skip !== "w" && k.w) {
    const p = facts(c).power, w = wattsOf(c);
    if (k.w === 1) st.w = p?.ok ? "y" : p && p.ok === false ? "n" : "?";
    else if (w) st.w = w >= k.w ? "y" : "n";
    else if (p?.ok) st.w = k.w <= 600 ? "ref" : "?";
    else st.w = p && p.ok === false ? "n" : "?";
  }
  if (skip !== "size" && k.size) { const m = maxSide(c); st.size = m ? (m >= k.size ? "y" : "n") : "?"; }
  if (skip !== "fire" && k.fire) { const f = facts(c).fire?.kind; st.fire = f === "FIREWOOD_OK" ? "y" : f ? "n" : "?"; }
  if (skip !== "park" && k.park) { const o = facts(c).park?.ok; st.park = o === true ? "y" : o === false || o === "part" ? (o === "part" ? "?" : "n") : "?"; }
  const vals = Object.values(st);
  if (vals.includes("n")) return null;
  return { st, unknown: vals.filter((v) => v === "?").length, ref: vals.filter((v) => v === "ref").length };
}
// strict(확인된 곳만)이면 정보 없음(?)도 뺀다. 법령 기준(ref)은 남긴다.
function condTest(c, k = S.cond, skip = null, strict = S.condStrict) {
  const r = condEval(c, k, skip);
  return Boolean(r) && (!strict || r.unknown === 0);
}
const COND_LABEL = { kind: "상품", pet: "반려견", w: "전기", size: "사이트 크기", fire: "장작", park: "텐트 옆 주차" };
const condActive = (k = S.cond) => k.sido.length + k.kind.length + (k.pet ? 1 : 0) + (k.w ? 1 : 0) + (k.size ? 1 : 0) + (k.fire ? 1 : 0) + (k.park ? 1 : 0) + (k.near ? 1 : 0);
function condChips(k = S.cond) {
  const out = [];
  if (k.near) out.push(["near", `${k._ctr?.label ?? k.near} ${k.r}km 안`]);
  for (const x of k.sido) out.push([`sido:${x}`, x]);
  for (const x of k.kind) out.push([`kind:${x}`, KIND[x]?.label ?? x]);
  if (k.pet) out.push(["pet", "반려견 동반"]);
  if (k.w) out.push(["w", W_OPTS.find(([v]) => v === k.w)?.[1] ?? ""]);
  if (k.size) out.push(["size", `사이트 ${k.size}m 이상`]);
  if (k.fire) out.push(["fire", "장작 가능"]);
  if (k.park) out.push(["park", "텐트 옆 주차"]);
  return out;
}
function condSummary() { const ch = condChips(); return ch.length ? (ch.length > 2 ? `${ch[0][1]} · ${ch[1][1]} 외 ${ch.length - 2}` : ch.map((x) => x[1]).join(" · ")) : "조건 추가"; }
function condToParams(p, k = S.cond) {
  if (k.sido.length) p.set("sido", k.sido.join(","));
  if (k.kind.length) p.set("kind", k.kind.join(","));
  if (k.pet) p.set("pet", "1");
  if (k.w) p.set("w", String(k.w));
  if (k.size) p.set("size", String(k.size));
  if (k.fire) p.set("fire", "1");
  if (k.park) p.set("park", "1");
  if (k.near) { p.set("near", k.near); p.set("r", String(k.r)); }
  if (S.feeBand) p.set("fee", S.feeBand);
  if (S.condStrict) p.set("strict", "1");
}
function condFromParams(q) {
  const k = emptyCond(), list = (n) => (q.get(n) ?? "").split(",").filter(Boolean);
  k.sido = list("sido").filter((x) => SIDOS.includes(x));
  k.kind = list("kind").filter((x) => KIND[x]);
  k.pet = q.get("pet") === "1"; k.fire = q.get("fire") === "1"; k.park = q.get("park") === "1";
  k.w = W_OPTS.some(([v]) => v === Number(q.get("w"))) ? Number(q.get("w")) : 0;
  k.size = SIZE_OPTS.some(([v]) => v === Number(q.get("size"))) ? Number(q.get("size")) : 0;
  k.near = (q.get("near") ?? "").slice(0, 20); k.r = R_OPTS.includes(Number(q.get("r"))) ? Number(q.get("r")) : 20;
  k._ctr = k.near ? nearCenter(k.near) : null;
  return k;
}
// 조건 시트: 고르는 동안 각 선택지 옆에 “지금 다른 조건과 겹치는 곳 수”를 보인다.
function condSheet() {
  let dlg = $("#cond-dialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.className = "sheet cond-sheet"; dlg.id = "cond-dialog"; dlg.setAttribute("aria-labelledby", "cond-title");
    document.body.append(dlg);
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) { dlg.close(); return; }
      const b = e.target.closest("[data-c]");
      if (!b) return;
      const [key, val] = b.dataset.c.split(":"), k = S.condDraft;
      if (key === "sido" || key === "kind") k[key] = k[key].includes(val) ? k[key].filter((x) => x !== val) : [...k[key], val];
      else if (key === "pet" || key === "fire" || key === "park") k[key] = !k[key];
      else if (key === "w" || key === "size" || key === "r") k[key] = Number(val);
      else if (key === "fee") S.feeDraft = S.feeDraft === val ? "" : val;
      else if (key === "strict") S.strictDraft = !S.strictDraft;
      else if (key === "reset") { S.condDraft = emptyCond(); S.feeDraft = ""; S.strictDraft = false; }
      else if (key === "apply") { S.cond = S.condDraft; S.feeBand = S.feeDraft; S.condStrict = S.strictDraft; store.set("mc-feeband", S.feeBand); dlg.close(); S.onCondApply?.(); return; }
      else if (key === "close") { dlg.close(); return; }
      paintCondSheet();
    });
    dlg.addEventListener("input", (e) => { if (e.target.matches("[data-near]")) { S.condDraft.near = e.target.value.trim(); S.condDraft._ctr = nearCenter(S.condDraft.near); clearTimeout(S._nt); S._nt = setTimeout(() => { S._nearFocus = true; paintCondSheet(); S._nearFocus = false; }, 350); } });
  }
  S.condDraft = { ...S.cond, sido: [...S.cond.sido], kind: [...S.cond.kind] };
  S.feeDraft = S.feeBand ?? "";
  S.strictDraft = Boolean(S.condStrict);
  paintCondSheet();
  dlg.showModal();
}
function paintCondSheet() {
  const dlg = $("#cond-dialog"), k = S.condDraft;
  const base = S.camps;
  const feeOk = (c, fb) => {
    const mn = campFeeMin(c), mx = campFeeMax(c);
    if (!fb) return true;
    if (fb === "u3") return Boolean(mn && mn <= 30000);
    if (fb === "3to5") return Boolean(mn && mn <= 50000 && (mx == null || mx >= 30000));
    if (fb === "5to7") return Boolean(mn && mn <= 70000 && (mx == null || mx >= 50000));
    if (fb === "7to10") return Boolean(mn && mn <= 100000 && (mx == null || mx >= 70000));
    if (fb === "10to20") return Boolean(mn && mn <= 200000 && (mx == null || mx >= 100000));
    if (fb === "o20") return Boolean(mn && (mn >= 200000 || (mx && mx >= 200000)));
    return Boolean(mn && (mn >= 70000 || (mx && mx >= 70000)));
  };
  const strict = S.strictDraft;
  const pool = (skip) => base.filter((c) => condTest(c, k, skip, strict) && (skip === "fee" || feeOk(c, S.feeDraft)));
  const count = (skip, test) => pool(skip).reduce((n, c) => n + (test(c) ? 1 : 0), 0);
  // 선택지 숫자: 근거로 맞는 곳(법령 기준 포함) + 정보 없어 함께 보일 곳(+n, ‘확인된 곳만’이면 0)
  const tally = (key, val) => {
    const k2 = { ...k, [key]: val }; let y = 0, u = 0;
    for (const c of pool(key)) { const r = condEval(c, k2); if (!r) continue; const v = r.st[key]; if (v === "?") u++; else y++; }
    return [y, strict ? 0 : u];
  };
  const chip = (key, val, label, on, n) => {
    const [y, u] = Array.isArray(n) ? n : [n, 0];
    return `<button type="button" class="chip" data-c="${key}:${val}" aria-pressed="${on}"${n != null && y + u === 0 && !on ? " disabled" : ""}>${esc(label)}${n != null ? ` <i>${fmt(y)}${u ? `<em>+${fmt(u)}</em>` : ""}</i>` : ""}</button>`;
  };
  const all = pool(null), total = all.length, sure = all.filter((c) => condEval(c, k)?.unknown === 0).length;
  const pSido = pool("sido");
  dlg.innerHTML = `<div class="sheet-in cond-in">
    <div class="sheet-head"><h2 id="cond-title">조건으로 찾기</h2><button type="button" class="icon-btn sheet-close" data-c="close" aria-label="닫기">${ic("close")}</button></div>
    <div class="cond-body">
      <section><h3>지역 <small>여러 곳 선택</small></h3><div class="cond-chips">${SIDOS.map((x) => chip("sido", x, x, k.sido.includes(x), pSido.filter((c) => sidoShort(c.sido) === x).length)).join("")}</div></section>
      <section><h3>주변으로 <small>시·군 이름과 반경</small></h3><div class="cond-near"><input type="search" data-near value="${esc(k.near)}" placeholder="예: 파주, 가평, 양평" aria-label="시·군 이름" autocomplete="off">${R_OPTS.map((r) => chip("r", r, `${r}km`, k.r === r)).join("")}</div>${k.near ? `<p class="cond-hint">${k._ctr ? `${esc(k._ctr.label)} 가운데에서 ${k.r}km 안` : "그 이름의 시·군을 찾지 못했어요"}</p>` : ""}</section>
      <section><h3>상품·이용 <small>하나라도 있으면</small></h3><div class="cond-chips">${KINDS.map(([x, l]) => chip("kind", x, l, k.kind.includes(x), tally("kind", [x]))).join("")}</div></section>
      <section><h3>반려견</h3><div class="cond-chips">${chip("pet", 1, "동반 가능", k.pet, tally("pet", true))}</div></section>
      <section><h3>전기 <small>W 미공지인 전기 사이트는 관광진흥법 기준 600W로 봐요</small></h3><div class="cond-chips">${W_OPTS.map(([v, l]) => chip("w", v, l, k.w === v, v ? tally("w", v) : null)).join("")}</div></section>
      <section><h3>사이트 크기 <small>긴 변 기준 · 규격 미등록은 +로 함께</small></h3><div class="cond-chips">${SIZE_OPTS.map(([v, l]) => chip("size", v, l, k.size === v, v ? tally("size", v) : null)).join("")}</div></section>
      <section><h3>불멍·주차</h3><div class="cond-chips">${chip("fire", 1, "장작 가능", k.fire, tally("fire", true))}${chip("park", 1, "텐트 옆 주차", k.park, tally("park", true))}</div></section>
      <section><h3>1박 요금</h3><div class="cond-chips">${[["u3", "~3만원"], ["3to5", "3~5만원"], ["5to7", "5~7만원"], ["7to10", "7만원~10만원"], ["10to20", "10만원~20만원"], ["o20", "20만원+"]].map(([v, l]) => chip("fee", v, l, S.feeDraft === v, count("fee", (c) => feeOk(c, v)))).join("")}</div></section>
    </div>
    <p class="cond-legend">숫자는 <b>근거로 맞는 곳</b>, <em>+n</em>은 정보가 없어 ‘확인 필요’로 함께 보일 곳이에요. <button type="button" class="link" data-c="strict">${strict ? "정보 없는 곳도 함께 보기" : "확인된 곳만 보기"}</button></p>
    <div class="cond-foot"><button type="button" class="btn ghost" data-c="reset">초기화</button><button type="button" class="btn primary wide" data-c="apply">${fmt(total)}곳 보기${total !== sure ? ` <small>(확인 ${fmt(sure)})</small>` : ""}</button></div>
  </div>`;
  // 반경 입력 중에 다시 그리면 커서를 잃지 않게 되돌린다.
  if (S._nearFocus) { const inp = $("[data-near]", dlg); inp?.focus(); inp?.setSelectionRange(inp.value.length, inp.value.length); }
}
// 히어로 아래 바로 쓰는 예시 조건(소유자 예시를 그대로 버튼으로)
const PRESETS = [
  ["반려견 동반", { pet: true }], ["1,100W 이상 전기", { w: 1100 }], ["사이트 8m 이상", { size: 8 }],
  ["글램핑·카라반", { kind: ["GLAMPING", "CARAVAN"] }], ["당일 캠크닉", { kind: ["DAY"] }], ["장작 불멍", { fire: true }],
];

// ── 화면: 목록(히어로 검색 결과) ─────────────────────────────
// 주소: #/list?area=강원&q=가평&d=2026-10-25. 히어로의 ‘찾기’가 이 화면으로 옮겨 온다(소유자 2026-10-19).
// 한 줄 가로 행: 왼쪽 썸네일, 오른쪽 요금·입퇴실·매너타임·전기·주차·장작·반려견·사이트·주변·후기·날짜 상태.
const LIST_PAGE = 30;
const ymdKst = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const mdKst = (s) => new Date(s).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).replace(/\.\s?/g, "/").replace(/\/$/, "");
const hmKst = (s) => { const t = new Date(s); return Number.isFinite(t.getTime()) ? `${mdKst(s)} ${t.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" })}` : ""; };
const THANKQ_VIEW = (cseq, d) => `https://m.thankqcamping.com/resv/view.hbb?cseq=${encodeURIComponent(cseq)}${d ? `&res_dt=${d.replaceAll("-", "")}` : ""}`;
// 날짜 d(YYYY-MM-DD)의 예약 화면 관측 { open, total, at, url } — 관측 파일이 있고 그 날짜를 본 곳만.
function vacOf(c, d) {
  const e = S.vac?.camps?.[String(c.id)], x = d && e?.d?.[d];
  return x ? { open: x[0], total: x[1], at: x[2], url: THANKQ_VIEW(e.cseq, d) } : null;
}
function listParams() {
  const q = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const area = q.get("area");
  return { area: area && AREAS.some(([k]) => k === area) ? area : "all", q: q.get("q") ?? "", d: /^\d{4}-\d{2}-\d{2}$/.test(q.get("d") ?? "") ? q.get("d") : "", cond: condFromParams(q), fee: q.get("fee") ?? "" };
}
function listHash({ area = S.area, q = S.q, d = S.stay } = {}) {
  const p = new URLSearchParams();
  if (area && area !== "all") p.set("area", area);
  if (q) p.set("q", q);
  if (d) p.set("d", d);
  condToParams(p);
  const s = p.toString();
  return `#/list${s ? `?${s}` : ""}`;
}
// 날짜 판단. 날짜별 빈자리는 예약처만 안다(공개 원천 없음) — 아는 것만 말한다:
// 공식 접수(이용 기간에 그 날 포함) > 예약 오픈 예정 > 운영 달 밖(휴장) > 운영 기간 안 > 운영 기간 미확인.
function dateStatus(c, d) {
  if (!d) return null;
  const t = Date.parse(`${d}T12:00:00+09:00`);
  const rs = (S.avail?.get(String(c.id)) ?? []).filter((r) => Date.parse(r.use?.from) <= t && t < Date.parse(r.use?.to) + 864e5);
  // 예약 화면 관측(땡큐캠핑, 원천 승인 후 발행): 확인 시각과 함께 빈자리 수. 만석도 관측값으로 보인다(빼지 않음).
  const v = vacOf(c, d);
  if (v) return v.open > 0 ? { k: "vac", rank: 0, icon: "check", txt: `빈자리 ${v.open}/${v.total}`, sub: `${hmKst(v.at)} 확인 · ${S.vac.source?.name ?? "예약 화면"}`, url: v.url } : { k: "full", rank: 4, icon: "close", txt: "만석(관측)", sub: `${hmKst(v.at)} 확인 · 취소분은 예약처에서`, url: v.url };
  if (rs.length) return { k: "open", rank: 0, icon: "check", txt: "공식 접수 중", sub: `이용 ${mdKst(rs[0].use.from)}~${mdKst(rs[0].use.to)} · 신청 ~${mdKst(rs[0].receipt?.to)}`, url: rs[0].source_url };
  const month = Number(d.slice(5, 7));
  if (c.om != null && !(c.om & (1 << (month - 1)))) return { k: "closed", rank: 9, icon: "close", txt: `${month}월 휴장`, sub: "운영 기간 밖(고캠핑·운영자 안내)" };
  const o = openingOf(c);
  if (o) return { k: "soon", rank: 1, icon: "clock", txt: o.txt, sub: "예약 오픈 예정" };
  if (c.om != null) return { k: "season", rank: 2, icon: "calendar", txt: `${month}월 운영`, sub: "빈자리는 예약처에서 확인" };
  return { k: "unknown", rank: 3, icon: "calendar", txt: "운영 기간 미확인", sub: "예약처에서 확인" };
}
function listResults(p) {
  const list = S.camps.filter((c) => matches(c) && condTest(c)).map((c) => ({ c, st: dateStatus(c, p.d), ce: condEval(c) }));
  const shown = S.showClosed ? list : list.filter((x) => x.st?.k !== "closed");
  const fee = (c) => campFeeMin(c) ?? Infinity;
  if (S.listSort === "fee") shown.sort((a, b) => fee(a.c) - fee(b.c) || rich(b.c) - rich(a.c));
  else if (S.listSort === "name") shown.sort((a, b) => nameOf(a.c).name.localeCompare(nameOf(b.c).name, "ko"));
  // 조건이 근거로 맞는 곳 → 법령 기준으로 맞는 곳 → 정보 없어 확인 필요한 곳 순, 그 안에서 정보량(+오픈 임박·운영 중 가점)
  else {
    const stBonus = (st) => (st?.k === "soon" ? 10 : st?.k === "season" ? 4 : 0);
    shown.sort((a, b) => (a.ce?.unknown ?? 0) - (b.ce?.unknown ?? 0) || (a.ce?.ref ?? 0) - (b.ce?.ref ?? 0) || (rich(b.c) + stBonus(b.st)) - (rich(a.c) + stBonus(a.st)));
  }
  // 사진이 한 장도 없는 곳은 어떤 정렬이든 뒤로(같은 무리 안의 순서는 그대로, 이름으로 직접 찾은 곳은 제외)
  shown.sort((a, b) => photoLast(a.c) - photoLast(b.c));
  return { shown, closed: list.length - list.filter((x) => x.st?.k !== "closed").length };
}
// 등록 규격 중 가장 큰 사이트(가로×세로). 조건 검색의 ‘사이트 크기’와 같은 값.
function siteSizeText(c) {
  const gs = (c.field_conditions?.site_size?.groups ?? []).filter((g) => g.width_m && g.depth_m);
  if (!gs.length) return c.tq?.mx ? `사이트 최대 ${c.tq.mx[0]}×${c.tq.mx[1]}m${c.tq.n ? ` · 예약 화면 ${c.tq.n}개 사이트` : ""}` : "";
  const big = gs.reduce((a, g) => (Math.max(g.width_m, g.depth_m) > Math.max(a.width_m, a.depth_m) ? g : a));
  return `사이트 최대 ${big.width_m}×${big.depth_m}m`;
}
// 켜진 조건이 이 캠핑장에서 어떻게 맞는지: ✓ 근거 · 법정 기준 · 확인 필요
function condLine(c, ce) {
  if (!ce || !Object.keys(ce.st).length) return "";
  const txt = { kind: () => S.cond.kind.map((x) => KIND[x]?.label).join("·"), pet: () => "반려견", w: () => (S.cond.w === 1 ? "전기" : `전기 ${fmt(S.cond.w)}W+`), size: () => `사이트 ${S.cond.size}m+`, fire: () => "장작", park: () => "텐트 옆 주차" };
  return `<p class="lrow-cond">${Object.entries(ce.st).map(([k, v]) => `<span class="cs cs-${v === "?" ? "unk" : v}">${v === "y" ? ic("check") : ""}${esc(txt[k]())}${v === "ref" ? " · 법정 기준 600W" : v === "?" ? " · 확인 필요" : ""}</span>`).join("")}</p>`;
}
function listRow({ c, st, ce }, i = 0) {
  const { tag } = nameOf(c), o = openingOf(c), main = bookingChannels(c)[0];
  const href = `#/c/${encodeURIComponent(c.id)}`;
  return `<article class="card card-horizontal lrow" data-id="${esc(c.id)}">
    <a class="card-hit" href="${href}" draggable="false" aria-label="${esc(nameOf(c).name)} 자세히"></a>
    <div class="card-media">${carousel(c, { eager: i < 3 })}
      ${st ? `<span class="sig st-${st.k}">${ic(st.icon)}${esc(st.txt)}</span>` : o ? `<span class="sig">${ic("clock")}${esc(o.txt)}</span>` : S.avail?.has(String(c.id)) ? `<span class="sig live">${ic("check")}접수 중</span>` : ""}
      <span class="bdgs">${badges(c, 3)}</span>
    </div>
    <div class="card-body">
      <div class="name-row">
        <h3 class="card-name">${esc(nameOf(c).name)}</h3>
        ${heartBtn(c)}
      </div>
      <p class="card-meta">${ic("pin")}${esc(region(c))}${tag ? ` · ${esc(tag)}` : ""}${!c.st?.length && typeLine(c) ? ` · ${esc(typeLine(c))}` : ""}</p>
      ${condLine(c, ce)}
      ${c.st?.length || siteSizeText(c) ? `<p class="card-types">${ic("tent")}<span>${esc([c.st?.length ? typeLine2(c) : typeLine(c), siteSizeText(c)].filter(Boolean).join(" · "))}</span></p>` : ""}
      ${rowsHtmlHorizontal(c)}
      ${feeMain(c)?.text && feeTiersLine(c) ? `<p class="card-tiers">${feeTiersLine(c)}</p>` : ""}
      ${c.rv && (c.rv.p?.length || c.rv.c?.length || c.rv.n > 0) ? `<div class="card-reviews">${cardReviewPills(c.rv)}</div>` : ""}
      ${st?.url || main || c.tel ? `
        <div class="card-cta">
          ${st?.url ? `<a class="btn primary" href="${esc(st.url)}" target="_blank" rel="noopener">${st.k === "vac" ? "빈자리 예약하기" : st.k === "full" ? "예약 화면 보기" : "공식 접수 보기"}</a>` : main ? `<a class="btn primary" href="${esc(main.url)}" target="_blank" rel="noopener" title="${esc(bookingLabel(main))}">${ic("external")}<span>날짜 확인 · ${esc(bookingLabel(main))}</span></a>` : c.tel ? `<a class="btn primary" href="tel:${esc(c.tel)}">${ic("phone")}전화 문의</a>` : ""}
        </div>
      ` : ""}
    </div>
  </article>`;
}
function listView() {
  const p = listParams();
  S.area = p.cond.sido.length ? "all" : p.area; S.q = p.q; if (p.d) S.stay = p.d;
  S.cond = p.cond; if (["u3", "3to5", "5to7", "7to10", "10to20", "o20", "o7", ""].includes(p.fee)) S.feeBand = p.fee;
  S.condStrict = new URLSearchParams(location.hash.split("?")[1] ?? "").get("strict") === "1";
  // 목록 화면에 보이지 않는 조건(홈의 테마·사이트 타입·빠른 조건)은 적용하지 않는다 — 보이는 조건만 결과를 바꾼다.
  S.theme = null; S.stype = null; S.quick.clear();
  const areaLabel = S.cond.near ? `${S.cond._ctr?.label ?? S.cond.near} 주변` : S.cond.sido.length ? S.cond.sido.join("·") : AREAS.find(([k]) => k === S.area)?.[1] ?? "전국";
  const feeChip = (k, l) => `<button type="button" class="chip fee-chip" data-fee-band="${k}" aria-pressed="${(S.feeBand ?? "") === k}">${l}</button>`;
  return `<section class="list-page" aria-labelledby="list-t">
    <div class="list-head">
      <a class="link list-back" href="#/">${ic("left")}처음으로</a>
      <h1 id="list-t"><span data-list-area>${esc(areaLabel)}</span> 캠핑장 <b data-list-count></b></h1>
      <form class="finder-form list-finder-form" role="search" data-list-search>
        <label class="finder-field finder-destination"><small>어디로</small><input type="search" name="q" value="${esc(S.q)}" placeholder="전국 또는 캠핑장명" aria-label="지역 또는 캠핑장명" autocomplete="off" enterkeyhint="search"></label>
        <button class="finder-field finder-static finder-cond" type="button" data-open-cond><small>조건</small><b data-cond-label>${esc(condSummary())}</b></button>
        <button class="finder-go" type="submit">${ic("search")}<span>찾기</span></button>
      </form>
      <div class="rail chips" aria-label="지역">${AREAS.map(([k, l]) => `<button type="button" class="chip" data-list-area-k="${k}" aria-pressed="${S.area === k && !S.cond.sido.length}">${l}</button>`).join("")}</div>
      <div class="rail chips cond-active" aria-label="조건"><button type="button" class="chip cond-open" data-open-cond>${ic("list")}조건${condActive() ? ` <i>${condActive()}</i>` : ""}</button>${condChips().map(([key, l]) => `<button type="button" class="chip on" data-cond-x="${esc(key)}">${esc(l)} ${ic("close")}</button>`).join("")}${condActive() ? `<button type="button" class="chip" data-strict aria-pressed="${Boolean(S.condStrict)}">확인된 곳만</button>` : ""}</div>
      <div class="rail chips fee-bands" aria-label="1박 요금대"><span class="fee-band-lbl">1박 요금</span>${feeChip("", "전체")}${feeChip("u3", "~3만원")}${feeChip("3to5", "3~5만원")}${feeChip("5to7", "5~7만원")}${feeChip("7to10", "7만원~10만원")}${feeChip("10to20", "10만원~20만원")}${feeChip("o20", "20만원+")}</div>
      <div class="list-tools">
        <p class="list-date-note" data-list-note></p>
        <label class="sort">${ic("list")}<select data-list-sort aria-label="정렬">
          <option value="rec"${(S.listSort ?? "rec") === "rec" ? " selected" : ""}>추천순</option>
          <option value="fee"${S.listSort === "fee" ? " selected" : ""}>요금 낮은 순</option>
          <option value="name"${S.listSort === "name" ? " selected" : ""}>이름순</option>
        </select></label>
      </div>
    </div>
    <div class="lrows" data-lrows></div>
    <div class="more-wrap"><button class="btn ghost" type="button" data-list-more>더 보기</button></div>
    <p class="credit">Copyright © 2026 모여라 캠핑. All Rights Reserved.</p>
  </section>`;
}
function renderList({ reset = true } = {}) {
  const box = $("[data-lrows]");
  if (!box) return;
  const { shown, closed } = listResults(listParams());
  if (reset) { S.listN = LIST_PAGE; box.innerHTML = ""; }
  const from = box.children.length, to = Math.min(S.listN, shown.length);
  box.insertAdjacentHTML("beforeend", shown.slice(from, to).map((x, i) => listRow(x, from + i)).join("") || (reset ? `<p class="empty">조건에 맞는 캠핑장이 없어요. 지역이나 요금대를 바꿔 보세요.</p>` : ""));
  $("[data-list-count]").textContent = `${fmt(shown.length)}곳`;
  $("[data-list-more]").hidden = to >= shown.length;
  const note = $("[data-list-note]");
  if (note) note.innerHTML = S.stay && (closed || S.showClosed) ? `<button type="button" class="link" data-list-closed>${S.showClosed ? "운영 기간 밖 빼기" : `운영 기간 밖 ${fmt(closed)}곳 함께 보기`}</button>` : "";
  initCarousels(box);
}
function bindList() {
  renderList();
  const v = $("#view");
  const go = () => { const h = listHash(); if (location.hash !== h) location.hash = h; else renderList(); };
  S.onCondApply = go;
  const onSubmit = (e) => { const f = e.target.closest("[data-list-search]"); if (!f) return; e.preventDefault(); S.q = f.q.value.trim(); go(); };
  const onClick = (e) => {
    const a = e.target.closest("[data-list-area-k]");
    if (a) { S.area = a.dataset.listAreaK; S.cond.sido = []; go(); return; }
    const x = e.target.closest("[data-cond-x]");
    if (x) { const [key, val] = x.dataset.condX.split(":"); if (val) S.cond[key] = S.cond[key].filter((v) => v !== val); else if (key === "near") S.cond.near = ""; else S.cond[key] = typeof S.cond[key] === "boolean" ? false : 0; go(); return; }
    const fb = e.target.closest("[data-fee-band]");
    if (fb) { S.feeBand = fb.dataset.feeBand || ""; go(); return; }
    if (e.target.closest("[data-list-closed]")) { S.showClosed = !S.showClosed; renderList(); return; }
    if (e.target.closest("[data-strict]")) { S.condStrict = !S.condStrict; go(); return; }
    if (e.target.closest("[data-list-more]")) { S.listN += LIST_PAGE; renderList({ reset: false }); }
  };
  const onChange = (e) => { if (e.target.matches("[data-list-sort]")) { S.listSort = e.target.value; renderList(); } };
  v.addEventListener("submit", onSubmit); v.addEventListener("click", onClick); v.addEventListener("change", onChange);
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting && !$("[data-list-more]").hidden) { S.listN += LIST_PAGE; renderList({ reset: false }); } }, { rootMargin: "800px" });
  io.observe($(".list-page .more-wrap"));
  initDraggableRails($(".list-page"));
  cleanup.push(() => { io.disconnect(); v.removeEventListener("submit", onSubmit); v.removeEventListener("click", onClick); v.removeEventListener("change", onChange); });
}

function themeView(themeKey) {
  const tName = themeName(themeKey);
  const tImg = themeImg(themeKey);
  const tSub = THEME_SUBS[themeKey] ?? "자연과 함께하는 특별한 테마 캠핑장";
  const testFn = themeKey === "ALL" ? () => true : themeKey === "OPEN" ? (c) => Boolean(openingOf(c)) : themeKey === "AVAIL" ? (c) => S.avail?.has(String(c.id)) : themeKey === "REVIEWS" ? (c) => Boolean((c.rv?.p?.length ?? 0) >= 2 || (c.rv?.t ?? 0) >= 4) : THEMES.find((t) => t[0] === themeKey)?.[2] ?? (() => true);
  const totalInTheme = S.camps.filter(testFn).length;
  const isWp = themeKey === "WATER_PLAY";

  return `<section class="theme-page" aria-labelledby="tp-title">
    <div class="theme-hero" style="background-image: url('${tImg}')">
      <div class="theme-hero-overlay"></div>
      <div class="theme-hero-content">
        <a class="link theme-back" href="#/">${ic("left")} 처음으로</a>
        <h1 id="tp-title">${esc(tName)} <em>캠핑장</em></h1>
        <p class="theme-hero-sub">${esc(tSub)} · 전국 <b>${fmt(totalInTheme)}곳</b></p>
      </div>
    </div>
    <div class="theme-body">
      ${isWp ? `<div class="theme-closed-alert">${ic("info")}<div><strong>여름 시즌 물놀이터 운영 종료 안내</strong><p>전국 물놀이터·야영장 수영장 정보입니다. 현재는 하절기 운영이 종료된 상태입니다. 모여라 캠핑에서 미리 시설 정보를 확인하시고 다음 시즌 피서 계획에 참고해 보세요!</p></div></div>` : ""}
      <div class="theme-tools-bar">
        <div class="rail chips theme-areas" aria-label="지역">
          ${AREAS.map(([k, l]) => `<button type="button" class="chip" data-theme-area="${k}" aria-pressed="${S.area === k}">${l}</button>`).join("")}
        </div>
        <div class="theme-subtools">
          <span class="theme-count" data-theme-count></span>
          <label class="sort">${ic("list")}<select data-theme-sort aria-label="정렬">
            <option value="rec"${(S.sort ?? "rec") === "rec" ? " selected" : ""}>추천순</option>
            <option value="name"${S.sort === "name" ? " selected" : ""}>이름순</option>
            <option value="fee"${S.sort === "fee" ? " selected" : ""}>요금 낮은 순</option>
          </select></label>
        </div>
      </div>
      <div class="grid" data-theme-grid></div>
      <div class="more-wrap"><button class="btn ghost" type="button" data-theme-more>더 보기</button></div>
      <p class="credit">Copyright © 2026 모여라 캠핑. All Rights Reserved.</p>
    </div>
  </section>`;
}

function bindTheme(themeKey) {
  const testFn = themeKey === "ALL" ? () => true : themeKey === "OPEN" ? (c) => Boolean(openingOf(c)) : themeKey === "AVAIL" ? (c) => S.avail?.has(String(c.id)) : THEMES.find((t) => t[0] === themeKey)?.[2] ?? (() => true);

  let pageN = 24;
  const getThemeList = () => {
    let list = S.camps.filter(testFn);
    if (S.area !== "all") {
      list = list.filter((c) => AREA_OF[sidoShort(c.sido)] === S.area);
    }
    const withPhoto = list.filter(hasPhoto);
    const noPhoto = list.filter((c) => !hasPhoto(c));
    if (S.sort === "name") {
      withPhoto.sort((a, b) => nameOf(a).name.localeCompare(nameOf(b).name, "ko"));
    } else if (S.sort === "fee") {
      withPhoto.sort((a, b) => (campFeeMin(a) ?? 999999) - (campFeeMin(b) ?? 999999));
    } else {
      withPhoto.sort((a, b) => rich(b) - rich(a));
    }
    noPhoto.sort((a, b) => rich(b) - rich(a));
    return [...withPhoto, ...noPhoto];
  };

  const renderThemeGrid = () => {
    const grid = $("[data-theme-grid]");
    if (!grid) return;
    const list = getThemeList();
    const shown = list.slice(0, pageN);
    $("[data-theme-count]").innerHTML = `총 <b>${fmt(list.length)}</b>곳`;
    grid.innerHTML = shown.length
      ? shown.map((c, i) => card(c, i, { isWaterPlay: themeKey === "WATER_PLAY" })).join("")
      : `<div class="empty">${ic("search")}<b>이 지역에는 맞는 캠핑장이 없어요</b><button class="btn ghost" type="button" data-theme-clear-area>전국 보기</button></div>`;
    $("[data-theme-more]").hidden = pageN >= list.length;
    initCarousels(grid);
    initDraggableRails(grid);
  };

  renderThemeGrid();
  initDraggableRails($(".theme-body"));

  const v = $("#view");
  const onClick = (e) => {
    const a = e.target.closest("[data-theme-area]");
    if (a) {
      S.area = a.dataset.themeArea;
      $$("[data-theme-area]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.themeArea === S.area)));
      pageN = 24;
      renderThemeGrid();
      return;
    }
    if (e.target.closest("[data-theme-clear-area]")) {
      S.area = "all";
      $$("[data-theme-area]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.themeArea === "all")));
      pageN = 24;
      renderThemeGrid();
      return;
    }
    if (e.target.closest("[data-theme-more]")) {
      pageN += 24;
      renderThemeGrid();
      return;
    }
  };
  const onChange = (e) => {
    if (e.target.matches("[data-theme-sort]")) {
      S.sort = e.target.value;
      pageN = 24;
      renderThemeGrid();
    }
  };

  v.addEventListener("click", onClick);
  v.addEventListener("change", onChange);
  cleanup.push(() => {
    v.removeEventListener("click", onClick);
    v.removeEventListener("change", onChange);
  });
}

function bindHome() {
  renderResults();
  const v = $("#view");
  v.addEventListener("click", homeClicks);
  // 히어로 ‘찾기’: 지역·검색어·날짜를 담아 목록 화면(#/list)으로 옮겨 간다(소유자 2026-10-19).
  v.addEventListener("submit", (e) => { const f = e.target.closest("[data-search]"); if (!f) return; e.preventDefault(); S.q = f.q.value.trim(); location.hash = listHash(); });
  v.addEventListener("change", (e) => { if (e.target.matches("[data-sort]")) { S.sort = e.target.value; renderResults(); } });
  const sentinel = $(".more-wrap");
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting && !$("[data-more]").hidden) moreResults(); }, { rootMargin: "800px" });
  io.observe(sentinel);
  initCarousels(v);
  initDraggableRails(v);
  mountTrending();
  cleanup.push(() => { io.disconnect(); v.removeEventListener("click", homeClicks); });
}
function homeClicks(e) {
  const a = e.target.closest("[data-area]");
  if (a) { S.area = a.dataset.area; $$("[data-area]").forEach((x) => x.setAttribute("aria-pressed", String(x === a))); renderResults(); return; }
  const t = e.target.closest("[data-theme]");
  if (t) { S.theme = S.theme === t.dataset.theme ? null : t.dataset.theme; $$("[data-theme]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.theme === S.theme))); renderResults(); return; }
  const all = e.target.closest("[data-theme-all]");
  if (all) {
    const k = all.dataset.themeAll;
    if (k.startsWith("T:")) {
      S.stype = k.slice(2);
      renderResults();
      $("#results").scrollIntoView({ block: "start" });
      return;
    }
    location.hash = `#/theme/${encodeURIComponent(k)}`;
    return;
  }
  const st = e.target.closest("[data-stype]");
  if (st) { S.stype = S.stype === st.dataset.stype ? "" : st.dataset.stype; $$("[data-stype]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.stype === S.stype))); renderResults(); return; }
  const fb = e.target.closest("[data-fee-band]");
  if (fb) {
    S.feeBand = S.feeBand === fb.dataset.feeBand ? "" : fb.dataset.feeBand;
    store.set("mc-feeband", S.feeBand);
    $$("[data-fee-band]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.feeBand === S.feeBand)));
    renderResults();
    return;
  }
  const q = e.target.closest("[data-quick]");
  if (q) { const k = q.dataset.quick; if (S.quick.has(k)) S.quick.delete(k); else S.quick.add(k); q.setAttribute("aria-pressed", String(S.quick.has(k))); renderResults(); return; }
  const cl = e.target.closest("[data-clear]");
  if (cl) {
    const k = cl.dataset.clear;
    if (k === "q") S.q = ""; else if (k === "area") S.area = "all"; else if (k === "theme") S.theme = null; else if (k === "stype") S.stype = "";
    else if (k === "feeBand") { S.feeBand = ""; store.set("mc-feeband", ""); $$("[data-fee-band]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.feeBand === ""))); }
    else if (k.startsWith("quick:")) S.quick.delete(k.slice(6));
    else { S.q = ""; S.area = "all"; S.theme = null; S.stype = ""; S.quick.clear(); S.feeBand = ""; store.set("mc-feeband", ""); $$("[data-fee-band]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.feeBand === ""))); }
    const keep = scrollY; render(); scrollTo(0, keep);
    return;
  }
  if (e.target.closest("[data-more]")) moreResults();
}

// ── 화면: 상세 ───────────────────────────────────────────────
let extrasCache = null;
async function loadExtras() {
  return (extrasCache ??= fetch(new URL(`${MOD_ROOT}context/extras.json`, import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
}
async function detailOf(id) {
  if (S.detailCache.has(id)) return S.detailCache.get(id);
  let d = await fetch(`${DATA}camps/${encodeURIComponent(id)}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (d) d = await reviewTexts(d, S.camps.find((c) => String(c.id) === String(id)));
  if (d?.gcd) mergeGcd(id, d);
  const ext = await loadExtras();
  if (ext?.camps?.[id]) {
    d = d ?? {};
    d.extras = ext.camps[id];
    d.extrasSources = ext.sources;
  }
  S.detailCache.set(id, d);
  return d;
}
// 고캠핑 상세 화면 수집본(d.gcd, crawl-gocamping-detail.mjs): 배치도는 공식 배치도로, 시설 사진은 기존 사진 뒤에, 소개 전문은 더 길 때만 바꾼다.
function mergeGcd(id, d) {
  const g = d.gcd;
  if (g.layout?.length) {
    const imgs = d.layout?.images ?? [];
    const add = g.layout.filter((u) => !imgs.some((x) => (x.img || x.thumb) === u)).map((u) => ({ img: u, thumb: u, url: g.url, src: "고캠핑", official: true, date: g.updated }));
    d.layout = { ...(d.layout ?? {}), images: [...add, ...imgs] };
  }
  if (g.intro && g.intro.length > String(d.intro ?? "").length) { d.intro = g.intro; d.intro_url = g.url; d.intro_at = g.checked_at; }
}
const gcdFact = (g, label, quote) => ({ g: "c", src: { label, url: g.url, at: g.checked_at, quote } });
const gcdFac = (d, re) => d?.gcd?.facilities?.find((f) => re.test(f.k));
// 같은 사진인지: 파일 이름(썸네일 접두어 제외)으로 비교
const photoName = (u) => String(photoUrl(u) ?? u).split(/[?#]/)[0].split("/").pop().replace(/^thumb_\d+_/, "").replace(/\.(jpe?g|png|webp)$/i, "");
// 상세 글 점검(pipeline/lib/detail-text-review.mjs와 같은 파일): 이 캠핑장 이야기가 아니거나 칸에 맞지 않는 글을 뺀다.
// 다음 데이터 갱신부터는 파이프라인에서 이미 걸러져 오고, 같은 규칙을 다시 적용해도 결과가 같다.
let textReview;
async function reviewTexts(d, c) {
  if (!c) return d;
  try {
    textReview ??= import(new URL(`${MOD_ROOT}context/text-review.js`, import.meta.url).href);
    const m = await textReview;
    if (!S.reviewCtx) {
      const common = await fetch(new URL(`${MOD_ROOT}context/text-common.json`, import.meta.url)).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      const cores = new Map();
      for (const x of S.camps) { const k = `${x.sido} ${x.sigungu}`; (cores.get(k) ?? cores.set(k, []).get(k)).push(m.nameCoreOf(x.name, x.sigungu)); }
      const regions = new Set(S.camps.map((x) => String(x.sigungu ?? "").split(/\s+/)[0].replace(/(시|군|구)$/, "")).filter((x) => x.length >= 2));
      S.reviewCtx = { cores, regions, common: new Set(common) };
    }
    return m.reviewDetailTexts(d, c, { others: S.reviewCtx.cores.get(`${c.sido} ${c.sigungu}`) ?? [], regions: S.reviewCtx.regions, common: S.reviewCtx.common }).d;
  } catch { return d; }
}
const PF = (d, k) => d?.profile?.fields?.[k];
function profFact(x) { return x ? { v: x.value, g: GR(x.grade), src: { label: x.source?.label, url: x.source?.url, at: x.source?.date, quote: x.source?.quote, image: x.source?.image } } : null; }
function specFact(d, k) {
  const f = d?.spec?.fields?.[k];
  if (!f) return null;
  const top = f.values?.[0] ?? f.mentions?.[0];
  if (!top) return null;
  const s = top.samples?.[0] ?? top.source ?? {};
  return { v: top.value, g: f.values?.length ? GR(f.grade) || "c" : "m", src: { label: s.label, url: s.url, at: s.date, quote: s.quote, image: s.image ?? top.source?.image } };
}
function usage(c, d) {
  const f = facts(c);
  return [
    ["입실", profFact(PF(d, "CHECKIN")) ?? specFact(d, "CHECKIN_TIME"), "clock-in"],
    ["퇴실", profFact(PF(d, "CHECKOUT")) ?? specFact(d, "CHECKOUT_TIME"), "clock-out"],
    ["매너타임", profFact(PF(d, "MANNER")) ?? specFact(d, "MANNER_TIME"), "bed"],
    ["환불", profFact(PF(d, "REFUND")) ?? specFact(d, "REFUND_POLICY"), "calc"],
    ["운영", profFact(PF(d, "SEASON")) ?? ((c.seasons ?? []).length ? { v: (c.seasons ?? []).length === 4 ? "사계절 운영" : `${(c.seasons ?? []).join("·")} 운영`, g: "c", src: { label: "고캠핑 등록 운영 기간", url: c.gc_url } } : null), "calendar"],
    ["대여", (d?.field_conditions ?? c.field_conditions)?.rental_offers?.length ? { v: (d?.field_conditions ?? c.field_conditions).rental_offers.map((r) => r.item).slice(0, 5).join(" · "), g: "c", src: srcOf(c.field_conditions) } : (specFact(d, "RENTAL") ?? null), "cart"],
  ];
}
// 값이 없는 항목은 칸마다 ‘확인필요’를 늘어놓지 않고 한 줄로 모은다(소유자 2026-10-19 · 빈 상태 정리).
function unknownLine(labels) {
  return labels.length ? `<p class="unk-line">${ic("alert")}아직 확인 안 된 항목 <b>${labels.map(esc).join(" · ")}</b> · 예약처나 전화로 확인하세요</p>` : "";
}
function specSection(c, d) {
  const html = specTiles(c, d);
  const tiles = html.match(/<div class="tile[\s\S]*?(?=<div class="tile|$)/g) ?? [];
  const known = tiles.filter((t) => !/^<div class="tile unk/.test(t));
  const unknown = tiles.filter((t) => /^<div class="tile unk/.test(t)).map((t) => (t.match(/<span class="tile-l">([^<]*)<\/span>/) ?? [])[1]).filter(Boolean);
  if (!known.length && !unknown.length) return "";
  return `<section class="d-sec" id="sec-spec"><div class="sec-head">${iconTitle("info", "요약 사항")}${known.length ? `<span class="sec-note">${known.length}/${tiles.length} 확인</span>` : ""}</div>${known.length ? `<div class="tiles">${known.join("")}</div>` : ""}${unknownLine(unknown)}</section>`;
}
function specTiles(c, d) {
  const f = facts(c);
  // 고캠핑·운영자 값이 없으면 후기·게시글 언급(MENTION)으로 채운다 — 주차 방식·전기 용량·반려동물
  const mention = {
    park: specFact(d, "PARKING"),
    power: specFact(d, "POWER_W"),
    powerA: specFact(d, "POWER_MAX_A"),
    pet: specFact(d, "PET_POLICY"),
  };
  // A 값이 있으면 전기 타일에 우선 표시 (예: "15A"). W와 둘 다 있으면 함께.
  if (mention.powerA?.v) {
    const aVal = mention.powerA.v;
    const aText = typeof aVal === "number" ? `${aVal}A` : String(aVal);
    if (mention.power?.v && !String(mention.power.v).includes("A")) {
      mention.power = { ...mention.power, v: `${aText} · ${mention.power.v}` };
    } else if (!mention.power) {
      mention.power = { ...mention.powerA, v: aText };
    }
  }
  // 위생은 화장실·샤워실로 나누고 개수대를 더한다(소유자 2026-10-20). 개수는 고캠핑 등록값.
  const fc = c.field_conditions ?? {}, sa = fc.sanitary ?? {};
  const cnt = (n, unit = "개") => (Number(n) > 0 ? { v: `${fmt(n)}${unit}`, g: GR(sa.state) || "c", src: srcOf(fc) } : null);
  mention.toilet = cnt(sa.toilets_count ?? c.toilets);
  mention.shower = cnt(sa.showers_count ?? c.showers);
  mention.sink = cnt(c.sinks);
  const T = [["size", "size", "설치 공간", ""], ["park", "car", "텐트 옆 주차", "cobalt"], ["power", "bolt", "전기", "volt"], ["fire", "flame", "장작·숯", "flame"], ["ground", "layers", "바닥", ""], ["shelter", "tent", "텐트·타프", ""], ["toilet", "poo", "화장실", ""], ["shower", "bath", "샤워실", ""], ["sink", "fountain", "개수대", ""], ["hot", "drop", "온수", ""], ["pet", "paw", "반려동물", ""]];
  return T.map(([k, i, l, cls]) => {
    let x = f[k] ?? mention[k] ?? null;
    if (k === "power" && f.power?.v === "있음" && mention.power?.v) x = mention.power;
    const isNo = Boolean(x && (x.ok === false || (k === "fire" && x.kind === "NO_FIRE") || /불가|금지|불가능/.test(detailValue(x))));
    const on = x && cls && !isNo;
    return `<div class="tile${x ? "" : " unk"}${isNo ? " tile-no" : on ? ` t-${cls}` : ""}"><span class="tile-ic">${ic(i)}</span><span class="tile-l">${l}</span><b class="tile-v">${x ? `${esc(detailValue(x))}${asOfMention(x)}` : "확인필요"}</b>${x ? `<span class="tile-g">${dot(x.g)}${srcTip(x, l)}</span>` : ""}</div>`;
  }).join("") + extraTiles(c, d, f);
}
// 자료가 있을 때만 보이는 요약 카드(없으면 칸을 만들지 않는다 · 지어내지 않는다).
function extraTiles(c, d, f) {
  const am = (c.amenities ?? []).map(String);
  const gc = (items) => ({ g: "c", src: { label: "한국관광공사 고캠핑 등록 편의시설", url: c.gc_url, quote: items.join(" · ") } });
  const pick = (re, skip) => am.filter((a) => re.test(a) && !(skip && skip.test(a)));
  const names = (pairs) => { const out = []; for (const [re, label] of pairs) if (am.some((a) => re.test(a)) && !out.includes(label)) out.push(label); return out; };
  const out = [];
  const add = (icon, label, x) => {
    if (!x?.v) return;
    const isNo = Boolean(x.ok === false || /불가|금지|불가능/.test(String(x.v)));
    out.push(`<div class="tile${isNo ? " tile-no" : ""}"><span class="tile-ic">${ic(icon)}</span><span class="tile-l">${label}</span><b class="tile-v">${esc(serviceText(x.v, 48))}${asOfMention(x)}</b><span class="tile-g">${dot(x.g)}${srcTip(x, label)}</span></div>`);
  };
  // 당일 나들이: 취사·그늘막(원문 근거가 있을 때만 값, 없으면 '미확인' — 취사 가능을 추정하지 않는다)
  if (c.du) {
    const ck = d?.day?.cooking, sh = d?.day?.shade;
    const COOK = { PROHIBITED: "취사 금지", PROHIBITED_OUTSIDE_DESIGNATED: "지정 장소 외 취사 금지", ALLOWED_GRILL: "지정 바비큐장 이용", ALLOWED_BURNER: "휴대용 버너만", ALLOWED_OPEN_FIRE: "직화·숯 가능", UNKNOWN: "미확인" };
    add("flame", "취사", ck?.url ? { v: COOK[ck.v] ?? ck.text, g: "c", src: { label: d?.du_src?.label ?? "관리기관 안내", url: ck.url, at: ck.at, quote: ck.text } } : { v: "미확인 · 관리기관에 확인", g: "m", src: { label: "근거 없음" } });
    if (sh?.url) add("tent", "그늘막", { v: `${sh.v === "ZONE_ONLY" ? "지정 구역만" : sh.v === "PROHIBITED" ? "설치 금지" : "가능"}${sh.size ? ` · ${sh.size}` : ""}`, g: "c", src: { label: d?.du_src?.label ?? "관리기관 안내", url: sh.url, at: sh.at, quote: `${sh.season ?? ""} ${sh.hours ?? ""}`.trim() } });
  }
  add("users", "방문객", specFact(d, "VISITOR_POLICY"));
  add("clock-in", "얼리 체크인", specFact(d, "EARLY_CHECKIN"));
  add("clock-out", "레이트 체크아웃", specFact(d, "LATE_CHECKOUT"));
  add("bed", "최소 숙박", specFact(d, "MIN_STAY"));
  add("car", "추가 차량", specFact(d, "EXTRA_CAR_FEE"));
  const shop = pick(/매점|편의점|마트|무인카페/, /근처|주변|분\s*거리|km|미비|2km/);
  if (shop.length) add("store", "매점", { v: shop.some((a) => /마트\.편의점/.test(a)) && shop.length === 1 ? "마트·편의점 있음" : "매점 있음", ...gc(shop) });
  const wifi = pick(/무선인터넷|와이파이|wifi/i);
  if (wifi.length) add("wifi", "와이파이", { v: wifi.some((a) => /일부|제한|부분/.test(a)) ? "일부 가능" : "있음", ...gc(wifi) });
  const play = names([[/놀이터|놀이방|놀이시설/, "놀이터"], [/트렘폴린|트램폴린|트램펄린|트램플린|방방이/, "트램펄린"], [/에어바운스/, "에어바운스"], [/키즈카페|키즈방/, "키즈카페"], [/모래놀이/, "모래놀이"]]);
  if (play.length) {
    const playIcon = play.some((p) => /트램|트렘|방방/.test(p)) ? "trampoline" : "users";
    add(playIcon, "놀이시설", { v: play.slice(0, 3).join(" · "), ...gc(pick(/놀이|트렘|트램|방방|에어바운스|키즈/)) });
  }
  const water = names([[/물놀이장|물놀이/, "물놀이장"], [/수영장|풀장|온수풀|유수풀/, "수영장"], [/워터슬라이드/, "워터슬라이드"]]);
  if (water.length) add("swim", "물놀이", { v: water.join(" · "), ...gc(pick(/물놀이|수영|풀장|온수풀|유수풀|워터슬라이드/)) });
  const sport = names([[/운동시설|운동기구/, "운동시설"], [/운동장/, "운동장"], [/족구/, "족구장"], [/풋살/, "풋살장"], [/배드민턴/, "배드민턴"]]);
  if (sport.length) add("sports", "운동시설", { v: sport.slice(0, 3).join(" · "), ...gc(pick(/운동|족구|풋살|배드민턴/)) });
  const walk = pick(/산책로|둘레길|탐방로/);
  if (walk.length) add("route", "산책로", { v: "있음", ...gc(walk) });
  const fw = pick(/장작판매|장작.*판매|숯판매/);
  if (fw.length) add("firewood", "장작 판매", { v: "현장 판매", ...gc(fw) });
  const rec = pick(/분리수거|재활용/);
  if (rec.length) add("recycle", "분리수거", { v: "분리수거장 있음", ...gc(rec) });
  if (c.fire === "개별" && !/화로대/.test(f.fire?.v ?? "")) add("pit", "화로대", { v: "개별 화로대 지참", ...gc(["화로대: 개별"]) });
  // 고캠핑 상세 시설정보: 글램핑·카라반 내부시설, 장비 대여(‘캠핑장 문의’만 있으면 뺌)
  for (const [re, icon, label] of [[/글램핑 내부/, "tent", "글램핑 내부"], [/카라반 내부/, "caravan", "카라반 내부"], [/장비대여|장비 대여/, "tent", "장비 대여"]]) {
    const r = gcdFac(d, re), v = (r?.items ?? (r?.v ? [r.v] : [])).filter((x) => !/^캠핑장 문의$/.test(x));
    if (v.length) add(icon, label, { v: v.join(" · "), ...gcdFact(d.gcd, "고캠핑 상세 캠핑장 시설정보", `${r.k}: ${r.v}`) });
  }
  const rv = [c.trailer === true && "개인 트레일러", c.caravan === true && "개인 카라반"].filter(Boolean);
  if (rv.length) add("caravan", "차량 진입", { v: `${rv.join(" · ")} 입장 가능`, ...gc(rv.map((x) => `${x} 입장 가능`)) });
  return out.join("");
}
const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);
// 생활·안전·관광을 한 섹션으로 묶는다. 관광 사진은 한국관광공사 원본 URL이 있는 항목만 직접 보인다.
const NEARBY_LABELS = {
  CONVENIENCE: ["편의점", "store"], MART: ["마트", "cart"], BUTCHER: ["정육", "meat"], FUEL: ["주유", "fuel"],
  PHARMACY: ["약국", "cross"], HOSPITAL: ["병원", "cross"], VET: ["동물병원", "paw"],
  DROWSY_SHELTER: ["졸음쉼터", "route"], REST_AREA: ["휴게소", "route"], TOILET: ["공중화장실", "drop"],
  TOUR: ["관광", "pin"], FOOD: ["맛집", "meat"], EV: ["전기차 충전", "bolt"],
  OTC_MEDICINE: ["상비약", "cross"], GAS_STATION: ["주유", "fuel"], ANIMAL_HOSPITAL: ["동물병원", "paw"], GEAR: ["캠핑용품", "tent"],
};
const FUEL_BRANDS = [[/S-?OIL|에쓰오일|에스오일/i, "S-OIL"], [/GS칼텍스|\bGS\b|^GS/i, "GS칼텍스"], [/SK에너지|\bSK\b|^SK/i, "SK에너지"], [/현대오일뱅크|오일뱅크|HD현대/i, "HD현대오일뱅크"], [/알뜰/, "알뜰주유소"], [/농협|NH/i, "농협(알뜰)"], [/E1|이원/, "E1(LPG)"], [/LPG|충전소/, "LPG"]];
/** 주유소 이름에서 상표(정유사)를 짐작한다. 모르면 null */
function fuelBrand(name) { return FUEL_BRANDS.find(([re]) => re.test(String(name ?? "")))?.[1] ?? null; }
/** 주변 주유소 최대 3곳: 인허가·지도 자료에 겹쳐 올라온 같은 곳(80m 안)은 하나로 */
function fuelPlaces(rows, licensedGas) {
  const all = [...rows, ...(licensedGas ? [licensedGas] : [])]
    .map((x) => ({ type: "FUEL", name: x.name ?? x.n, m: Number(x.m), lat: x.lat, lng: x.lng, url: x.u }))
    .filter((x) => x.name && Number.isFinite(x.m)).sort((a, b) => a.m - b.m);
  const near = (a, b) => a.lat && b.lat && Math.hypot((a.lat - b.lat) * 111000, (a.lng - b.lng) * 88000) < 80;
  const out = [];
  for (const x of all) {
    const dup = out.find((y) => near(x, y) || y.name.replace(/\s+/g, "") === x.name.replace(/\s+/g, ""));
    if (dup) { if (dup.name.length < 5 && x.name.length > dup.name.length) dup.name = x.name; continue; } // OSM의 "SK"처럼 상표만 적힌 이름은 긴 이름으로
    out.push(x);
    if (out.length >= 3) break;
  }
  return out.map((x) => {
    const brand = fuelBrand(x.name);
    // 지도 자료엔 "SK"처럼 상표만 적힌 곳이 있다 → "SK에너지 주유소"
    return { ...x, name: brand && x.name.replace(/\s+/g, "").length <= 5 && !/주유소/.test(x.name) ? `${brand} 주유소` : x.name, sub: brand };
  });
}
const isOfficialTourImage = (u) => /^https:\/\/(?:[\w-]+\.)?(?:visitkorea\.or\.kr|kto\.or\.kr)\//i.test(String(u ?? ""));
/** 주변 칸 한 곳(주유·충전 칸은 상세 화면이 뜬 뒤 충전소를 덧붙일 때도 쓴다) */
// 위경도(WGS84) → 다음 지도 좌표(WCONGNAMUL = GRS80 TM(38N 127E, FE 200000, FN 500000) × 2.5).
// 2026-10-19: 위경도를 그대로 넘겨 모든 주변시설 썸네일이 바다(빈 하늘색)로 나오던 것을 고쳤다. 서울시청으로 위치 확인.
// 주변시설 한 줄: 아이콘 · 이름 · 종류 · 캠핑장에서 직선거리(850m / 1.2km) · 지도. 빈 지도 그림 대신 작게 줄였다(소유자 2026-10-19).
function nearbyCard(x) {
  const [label, icon] = NEARBY_LABELS[x.type] ?? [x.type, "pin"];
  const map = x.lat && x.lng ? `https://map.kakao.com/link/map/${encodeURIComponent(x.name)},${x.lat},${x.lng}` : x.url;
  const photo = x.image && /^https?:\/\//.test(x.image) ? x.image : "";
  // 실제 모습 사진(검색 API 썸네일 · 관광공사 사진): 64px로 보이고, 사진을 누르면 원문 글로 간다(줄 전체는 지도 링크).
  const open = x.imgU ? ` data-open="${esc(x.imgU)}" title="사진 원문 보기${x.imgS ? ` · ${esc(x.imgS)}` : ""}"` : "";
  const lead = photo ? `<img class="nb-thumb${x.imgU ? " nb-photo" : ""}" src="${esc(photo)}" alt="${esc(x.name)} 사진" loading="lazy" decoding="async" referrerpolicy="no-referrer"${open} onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'nb-ic',innerHTML:this.dataset.ic}))" data-ic="${esc(ic(icon))}">` : `<span class="nb-ic">${ic(icon)}</span>`;
  const credit = photo && x.imgU ? `<small class="nb-credit">사진 · ${esc(x.imgS || "블로그")}</small>` : "";
  const dist = x.summary ? "" : km(x.m);
  const body = `${lead}<span class="nb-txt"><b>${esc(x.name)}</b><i>${esc(label)}${x.sub ? ` · ${esc(x.sub)}` : ""}${x.summary ? " · 공공데이터" : ""}</i>${credit}</span>${dist ? `<span class="nb-dist" aria-label="캠핑장에서 ${esc(dist)}">${esc(dist)}</span>` : ""}`;
  // 실제 모습: 좌표가 있으면 ‘로드뷰’(카카오 지도 로드뷰, 화면 안 팝업). 줄 자체는 지도 링크.
  const rv = x.lat && x.lng ? `<span class="nb-rv" role="button" tabindex="0" data-rv="${esc(`${x.lat},${x.lng}`)}" data-rv-name="${esc(x.name)}" aria-label="${esc(x.name)} 로드뷰 보기">${ic("roadview")}</span>` : "";
  const actions = `<span class="nb-actions">${rv}<span class="nb-go" aria-hidden="true">${ic("map")}</span></span>`;
  return map
    ? `<a class="nearby-place nb-row" href="${esc(map)}" target="_blank" rel="noopener" aria-label="${esc(x.name)} 지도 열기 · ${esc(label)}${dist ? ` · ${esc(dist)}` : ""}">${body}${actions}</a>`
    : `<div class="nearby-place nb-row">${body}</div>`;
}
/** 주변 > 주유 · 충전 칸에 가까운 전기차 충전소(최대 3곳)를 덧붙인다. ev: context/card.js evFor() 결과 */
function mountNearbyEv(ev) {
  const group = $("[data-energy]");
  if (!ev || !group) return;
  const places = group.querySelector("[data-energy-places]");
  places.insertAdjacentHTML("beforeend", ev.list.map((x) => nearbyCard({ type: "EV", name: x.name || "이름 없는 충전소", m: x.km * 1000, lat: x.lat, lng: x.lng, sub: x.fast === 1 ? "급속" : x.fast === 0 ? "완속" : "" })).join(""));
  const note = group.querySelector("[data-energy-note]");
  note.innerHTML = `충전소 5km 안 ${ev.c5}곳 · 출처 ${ev.source ? `<a href="${esc(ev.source.url)}" target="_blank" rel="noopener">${esc(ev.source.name)}</a>` : "공개자료"}${ev.osm ? " (지도 공개자료라 실제로는 더 가까이 있을 수 있어요)" : ""}`;
  note.hidden = false;
  group.closest(".nearby-hub")?.removeAttribute("hidden");
  const tab = $("[data-nb-tab='energy']");
  if (tab) {
    tab.hidden = false;
    const n = places.children.length;
    if (n && !tab.querySelector("i")) tab.insertAdjacentHTML("beforeend", `<i>${n}</i>`);
    if (!$("[data-nb-tab][aria-selected='true']:not([hidden])")) tab.click();
  } else group.hidden = false;
}
function nearbyHubHtml(c, d) {
  const nearby = d?.nearby ?? {}, licensed = d?.nearby_licensed ?? {};
  const entry = (type, x = {}) => {
    const name = x?.name ?? x?.n;
    const m = Number(x?.m);
    return name && Number.isFinite(m) ? { type, name, m, lat: x.lat, lng: x.lng, url: x.u, image: x.img, imgU: x.img_u, imgS: x.img_s } : null;
  };
  // 한 종류에 가까운 순 최대 3곳(이름이 같으면 하나로)
  const pick = (type, ...lists) => [...new Map(lists.flat().map((x) => entry(type, x)).filter(Boolean).sort((a, b) => a.m - b.m).map((x) => [x.name.replace(/\s+/g, ""), x])).values()].slice(0, 3);
  const k = (arr, re) => (arr ?? []).filter((x) => re.test(`${x.k ?? ""} ${x.n ?? ""}`));
  const conv = pick("CONVENIENCE", licensed.CONVENIENCE ?? [], nearby.conv ?? []);
  // 상비약 판매처는 보통 같은 편의점이다 → 편의점과 이름이 같으면 약국 칸에 넣지 않는다
  const otc = pick("OTC_MEDICINE", licensed.OTC_MEDICINE ?? []).filter((x) => !conv.some((y) => y.name === x.name));
  const toilet = c.nearby_toilets ?? {};
  const er = d?.extras?.er;
  const erList = er ? [{
    type: "HOSPITAL",
    name: `[응급실] ${er[0]}`,
    m: (Number(er[1]) || 0) * 1000,
    sub: [er[2], er[3]].filter(Boolean).join(" · "),
    url: er[3] ? `tel:${er[3]}` : null,
  }] : [];
  // 소유자 2026-10-20: 생활·안전·관광 묶음 대신 마트·약국·병원·맛집·관광·주유소·충전소처럼 종류별로 나눠 보인다
  const groups = [
    ["conv", "편의점", "store", conv],
    ["mart", "마트", "cart", pick("MART", licensed.MART ?? [], k(nearby.mart, /supermarket|마트|greengrocer/))],
    ["butcher", "정육", "meat", pick("BUTCHER", licensed.BUTCHER ?? [], k(nearby.mart, /정육|바베큐|butcher/))],
    ["pharmacy", "약국", "cross", [...pick("PHARMACY", licensed.PHARMACY ?? [], k(nearby.medical, /약국|pharmacy|의약/)), ...otc].slice(0, 3)],
    ["hospital", "병원", "cross", [...erList, ...pick("HOSPITAL", k(nearby.medical, /병원|의료원|hospital|clinic/))].slice(0, 3)],
    ["vet", "동물병원", "paw", pick("VET", licensed.VET ?? [], nearby.vet ?? [])],
    ["gear", "캠핑용품", "tent", pick("GEAR", nearby.gear ?? [])],
    ["rest", "휴게소", "route", pick("REST_AREA", k(nearby.rest, /REST_AREA|SERVICE_AREA|DROWSY_SHELTER/))],
    ["toilet", "화장실", "drop", Number(toilet.within_500m) || Number(toilet.within_2km) ? [{ type: "TOILET", name: `500m ${Number(toilet.within_500m) || 0}곳 · 2km ${Number(toilet.within_2km) || 0}곳`, m: Number(toilet.within_500m) ? 500 : 2000, summary: true }] : []],
    ["tour", "관광", "pin", (nearby.tour ?? []).slice(0, 4).map((x) => entry("TOUR", x)).filter(Boolean)],
    ["food", "맛집", "meat", (nearby.food ?? []).slice(0, 4).map((x) => entry("FOOD", x)).filter(Boolean)],
    ["fuel", "주유소", "fuel", fuelPlaces(nearby.fuel ?? [], licensed.FUEL ?? licensed.GAS_STATION)],
  ].filter(([, , , rows]) => rows.length);
  // 충전소: /context/extras.json에서 화면이 뜬 뒤 덧붙인다(mountNearbyEv). 그때까지 칩·칸을 숨긴다.
  const energy = `<section class="nearby-group" id="nb-p-energy" role="tabpanel" aria-labelledby="nb-t-energy" data-energy hidden><div class="nearby-places" data-energy-places></div><p class="nearby-note" data-energy-note hidden></p></section>`;
  const tabs = [...groups.map(([key, title, icon, rows]) => ({ key, title, icon, n: rows.length })), { key: "energy", title: "충전소", icon: "bolt", n: 0, hide: true }];
  const tabsHtml = `<div class="nb-tabs" role="tablist" aria-label="주변시설 종류">${tabs.map((t, i) => `<button type="button" role="tab" id="nb-t-${t.key}" data-nb-tab="${t.key}" aria-controls="nb-p-${t.key}" aria-selected="${i === 0 && !t.hide}"${t.hide ? " hidden" : ""}>${ic(t.icon)}${esc(t.title)}${t.n ? `<i>${t.n}</i>` : ""}</button>`).join("")}</div>`;
  return `<section class="d-sec nearby-hub" id="sec-nearby"${groups.length ? "" : " hidden"}><div class="sec-head">${iconTitle("route", "주변시설")}<span class="sec-note">${tip("<b>주변 정보</b><span>편의점·마트·정육·약국·동물병원·주유소는 인허가·공공 데이터, 병원·휴게소·화장실은 공공·지도 데이터, 관광·맛집은 한국관광공사 데이터로 연결합니다. 종류마다 가까운 곳 최대 3곳(관광·맛집 4곳)을 보여요. 운영 시간과 영업 여부는 원문에서 다시 확인하세요.</span>")}</span></div>${tabsHtml}<div class="nearby-groups">${groups.map(([key, , , rows], i) => `<section class="nearby-group" id="nb-p-${key}" role="tabpanel" aria-labelledby="nb-t-${key}"${i ? " hidden" : ""}><div class="nearby-places">${rows.map(nearbyCard).join("")}</div></section>`).join("")}${energy}</div></section>`;
}
function reviewHtml(d, c) {
  const rv = d?.rv ?? c?.rv;
  const total = rv?.n ?? 0;
  if (!rv || (!rv.p?.length && !rv.c?.length && !total)) return "";
  const fact = { g: "m", src: { label: "블로그·카페 방문자 후기 빅데이터 분석", url: c?.gc_url || "https://www.gocamping.or.kr/" } };
  const block = (label, rows, cls, icon) => `<div class="review-block ${cls}"><span>${ic(icon)}${label}</span><div>${rows?.length ? rows.map(([topic, count]) => `<b>${esc(topic)} <i>${count}</i></b>`).join("") : `<span class="review-empty">없음</span>`}</div></div>`;
  return `<section class="d-sec review-summary"><div class="sec-head">${iconTitle("thumb-up", "평가")}<span class="sec-note">후기 ${fmt(total)}건 분석 ${srcTip(fact, "후기 장단점 분석")}</span></div><div class="review-summary-grid">${block("장점", rv.p, "pro", "thumb-up")}${block("단점", rv.c, "con", "thumb-down")}</div></section>`;
}
function bookingRank(channel) {
  const hay = `${channel?.platform_id ?? ""} ${channel?.platform_name ?? ""} ${channel?.url ?? ""}`.toLowerCase();
  if (/campit|캠핏/.test(hay)) return 0;
  // 네이버 카페·블로그는 운영자 페이지일 수 있으므로, 네이버 예약 경로만 2순위로 본다.
  if (/booking\.naver\.com|m\.booking\.naver\.com|naver\.me|naver[_ -]?reservation|네이버\s*예약/.test(hay)) return 1;
  if (/thank.?camp|땡큐/.test(hay)) return 2;
  if (/foresttrip|숲나들|knps|국립공원|huyang/.test(hay)) return 3;
  if (/gocamping|고캠핑/.test(hay)) return 6;
  if (channel?.kind === "online") return 4;
  if (channel?.kind === "homepage") return 4;
  if (channel?.kind === "phone") return 5;
  return 10;
}
const DEAD_BOOKING = /(^|\.)ticketplay\.zone$|(^|\.)(example\.(com|org|net)|localhost)$/i;
function liveBookingUrl(u) {
  try {
    const h = new URL(u).hostname;
    return h && h.includes(".") && !DEAD_BOOKING.test(h); // 점 없는 호스트(“http://https////…”, 한글 키워드 주소)는 깨진 주소
  } catch { return false; }
}
// 네이버 예약 상세 주소(booking.naver.com/…/bizes/번호)는 고캠핑 등록값이 낡아 ‘운영하지 않는 예매 페이지’로 가는 경우가 있고,
// robots.txt가 모든 봇을 막아 자동으로 살아 있는지 확인할 수 없다(소유자 2026-10-20). → 네이버 검색(캠핑장 이름·시군구)으로 연다.
// 검색 결과의 플레이스 카드에 지금 쓰는 ‘예약’ 버튼이 나온다.
const NAVER_BOOKING_DEEP = /^https?:\/\/(m\.)?booking\.naver\.com\/booking\/\d+\/bizes\/\d+/i;
const naverSearchUrl = (c) => `https://search.naver.com/search.naver?query=${encodeURIComponent(`${c.sigungu ?? ""} ${nameOf(c).name} 예약`.trim())}`;
function bookingChannels(c) {
  // 땡큐캠핑 엔진에서 같은 업장(이름·시군구 일치)을 찾았으면, 등록 경로에 없을 때 날짜별 예약 화면을 덧붙인다.
  const tq = c.tq?.s && !(c.booking?.channels ?? []).some((x) => /thankqcamping|camperstory/.test(x?.url ?? "")) ? [{ platform_id: "thankqcamping", platform_name: "땡큐캠핑", url: THANKQ_VIEW(c.tq.s), kind: "online", confidence: 0.7, evidence: ["땡큐캠핑 업장 검색(이름·시군구 일치)"] }] : [];
  return [...(c.booking?.channels ?? []), ...tq]
    .filter((x) => x?.url && liveBookingUrl(x.url) && !c.dl?.includes(x.url)) // c.dl: 열어 보니 없는 링크(check-links.mjs)
    .map((x) => (NAVER_BOOKING_DEEP.test(x.url) ? { ...x, url: naverSearchUrl(c), registered_url: x.url, evidence: [...(x.evidence ?? []), "네이버 검색에서 현재 예약 버튼으로 연결"] } : x))
    .sort((a, b) => bookingRank(a) - bookingRank(b) || Number(b.confidence ?? 0) - Number(a.confidence ?? 0));
}
function bookingLabel(channel) {
  const hay = `${channel?.platform_id ?? ""} ${channel?.platform_name ?? ""} ${channel?.url ?? ""}`.toLowerCase();
  if (/campit|캠핏/.test(hay)) return "캠핏";
  if (/booking\.naver\.com|m\.booking\.naver\.com|naver\.me|naver[_ -]?reservation|네이버\s*예약/.test(hay)) return "네이버 예약";
  if (/thank.?camp|땡큐/.test(hay)) return "땡큐캠핑";
  if (/foresttrip|숲나들/.test(hay)) return "숲나들e";
  if (/knps|국립공원/.test(hay)) return "국립공원";
  if (/gocamping|고캠핑/.test(hay)) return "고캠핑";
  if (channel?.kind === "homepage") return "홈페이지";
  return serviceText(channel?.platform_name, 20) || "온라인 예약";
}
// 캠퍼가 많이 쓰는 순: 캠핏 → 네이버 예약 → 땡큐캠핑 → 숲나들e·국립공원 → 기타 온라인 → 홈페이지 → 고캠핑.
// 1순위를 대표 버튼으로, 2·3순위는 대안 링크로 남겨 한 곳이 죽어도 예약이 끊기지 않게 한다.
function primaryBooking(c) {
  return bookingOptions(c)[0] ?? null;
}
function bookingOptions(c) {
  const seen = new Set();
  const out = [];
  for (const ch of bookingChannels(c)) {
    if (ch.kind !== "online" && ch.kind !== "homepage") continue;
    const label = bookingLabel(ch);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ch);
    if (out.length >= 3) break;
  }
  if (c.gc_url && liveBookingUrl(c.gc_url) && !seen.has("고캠핑") && out.length < 3) {
    out.push({ url: c.gc_url, kind: "online", platform_name: "고캠핑", platform_id: "gocamping" });
  }
  return out;
}
function bookingSource(channel, label = "대표 예약 채널") {
  const evidence = Array.isArray(channel?.evidence) ? channel.evidence.join(" · ") : "";
  return sourceFact({
    g: "c",
    src: { label: "등록된 예약 경로", url: channel?.url, quote: [bookingLabel(channel), evidence].filter(Boolean).join("\n") },
  }, label);
}
function reserveCard(c) {
  const options = bookingOptions(c);
  const main = options[0] ?? null;
  const alts = options.slice(1);
  const o = openingOf(c) ?? (S.openings.get(String(c.id)) ?? null);
  const altHtml = alts.length
    ? `<div class="rs-alts"><span>다른 예약처</span>${alts.map((ch, i) => `<a href="${esc(ch.url)}" target="_blank" rel="noopener">${i + 2}순위 · ${esc(bookingLabel(ch))}</a>`).join("")}</div>`
    : "";
  return `<div class="reserve">
    <div class="rs-top"><span>${esc(main ? bookingLabel(main) : "예약")}${main ? " · 1순위" : ""}</span>${o ? `<span class="rs-dd">${esc(o.txt ?? o.kind)}</span>` : ""}</div>
    ${o ? `<p class="rs-open"><b>${esc(new Date(o.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }))}</b><span>${esc(o.label ?? "")}</span></p>` : ""}
    ${availHtml(c)}${S.avail?.get(String(c.id))?.length ? vacHtml(c) : ""}
    <div class="rs-btns">
      ${main ? `<a class="btn primary wide" href="${esc(main.url)}" target="_blank" rel="noopener">${esc(bookingLabel(main))}에서 예약</a>` : ""}
      ${c.tel ? `<a class="btn ghost" href="tel:${esc(c.tel)}">${ic("phone")}전화</a>` : ""}
    </div>
    ${altHtml}
  </div>`;
}
function galleryHtml(c) {
  const ph = photosOf(c);
  if (!ph.length) return "";
  const alt = esc(nameOf(c).name);
  const have = new Set(ph.map(photoName));
  const more = (S.detailCache.get(c.id)?.gcd?.photos ?? []).filter((u) => !have.has(photoName(u))).length;
  const shown = Math.min(ph.length, 5);
  const grid = `<div class="gal-grid n${shown}">${ph.slice(0, 5).map((u, i) => `<button type="button" class="gal-cell" data-gal="${i}">${imageTag(u, i ? "" : alt, { eager: !i, sizes: "(max-width: 759px) 100vw, 65vw" })}${more && i === shown - 1 ? `<span class="cand-zoom-badge">${ic("search")}사진 +${more}장</span>` : ""}</button>`).join("")}</div>`;
  const rail = `<div class="gal-rail">${carousel(c, { eager: true, cls: "car-gal" })}</div>`;
  return `<div class="gallery">${grid}${rail}</div>`;
}
async function detailView(id) {
  const c = S.byId.get(id);
  if (!c) return `<div class="empty">${ic("search")}<b>캠핑장을 찾지 못했어요</b><a class="btn ghost" href="#/">찾기로</a></div>`;
  const d = await detailOf(id);
  const f = facts(c), { tag } = nameOf(c);
  const spec = ["size", "park", "power", "fire", "ground", "shelter", "sanitary", "hot", "pet"];
  const known = spec.filter((k) => f[k]).length;
  const o = openingOf(c);
  const us = usage(c, d);
  return `<article class="detail" data-id="${esc(c.id)}">
    <div class="d-bar"><a class="icon-btn" href="#/" data-back aria-label="뒤로">${ic("left")}</a><span class="d-crumb">${esc(region(c))}</span>${heartBtn(c, { label: true })}</div>
    <header class="d-head">
      <div class="d-head-main">
      <p class="d-eyebrow">${esc(region(c))}${c.op && OP[c.op] ? ` · ${OP[c.op]}` : tag ? ` · ${esc(tag)}` : ""}${!c.st?.length && typeLine(c) ? ` · ${esc(typeLine(c))}` : ""}</p>
      <h1 class="d-title">${titleHtml(c)}</h1>
      ${c.line ? `<p class="d-line">${esc(serviceText(c.line, 84))}${c.gc_url ? srcTip({ g: "c", src: { label: "고캠핑 소개", url: c.gc_url, quote: c.line } }, "한 줄 소개") : ""}</p>` : ""}
      <div class="d-bdgs">${badges(c, 14, 10)}</div>
      </div>
      <aside class="d-side">${reserveCard(c, d)}</aside>
    </header>
    ${galleryHtml(c)}
    <div class="d-sum"${c.du ? " hidden" : ""}>
      <div><span>확인된 규격</span><b>${known}<i>/${spec.length}</i></b></div>
      <div><span>${ic("file-text")}후기</span><b>${c.rv?.n ? fmt(c.rv.n) : "–"}</b></div>
      <div><span>다음 오픈</span><b class="${o ? "hot" : "muted"}">${o ? esc(o.txt) : "–"}</b></div>
    </div>
    <nav class="d-jump" aria-label="상세 바로가기">${[["sec-price", "요금"], ["sec-usage", "이용 정보"], ["sec-rules", "이용 규칙"], ["sec-operator", "공지사항"], ["sec-nearby", "주변"], ["sec-events", "축제·행사"], ["sec-reviews", "후기·사진"], ["sec-info", "업체 정보"]].map(([id, l]) => `<a href="#${id}" data-jump="${id}" hidden>${l}</a>`).join("")}</nav>
    <div class="d-body">
      <div class="d-main">
        ${siteTypesHtml(c, d)}
        ${specSection(c, d)}
        ${priceHtml(c, d)}
        ${us.some(([, x]) => x) ? `<section class="d-sec" id="sec-usage"><div class="sec-head">${iconTitle("info", "이용 정보")}</div><dl class="uses">${us.filter(([, x]) => x).map(([l, x, icon]) => `<div class="use"><dt>${icon ? ic(icon) : ""}${l}</dt><dd><span class="use-val">${esc(wonText(detailValue(x)))}${asOfMention(x)}</span><span class="use-meta">${dot(x.g)}${srcTip(x, l)}</span></dd></div>`).join("")}</dl>${unknownLine(us.filter(([, x]) => !x).map(([l]) => l))}</section>` : ""}
        ${houseRulesHtml(c, d)}
        <section class="d-sec" data-cond hidden></section>
        <section class="d-sec" data-extras hidden></section>
        ${reviewHtml(d, c)}
        ${operatorHtml(d, c)}
        ${bookingHtml(c, d)}
        ${amenityHtml(c, d)}
        ${introHtml(d)}
        ${programsHtml(d)}
        ${layoutHtml(d, c)}
        ${operatorMediaHtml(d)}
        ${mediaHubHtml(d, c)}
        ${nearbyHubHtml(c, d)}
        <section class="d-sec ev-sec" id="sec-events" data-events hidden><div class="sec-head">${iconTitle("calendar", "주변 축제·행사")}<span class="sec-note">30km 안 · 45일 이내</span></div><div data-events-body></div></section>
        ${reviewLinksHtml(d, c)}
        ${infoHtml(c)}
        ${commentsHtml(c)}
        <section class="d-sec" data-opform-sec hidden></section>
      </div>
    </div>
    <div class="d-dock">${reserveDock(c)}</div>
  </article>`;
}

// ── 상세 보강(2026-10-18 소유자: 정보가 너무 부족) ─────────────────
const GRADE_OF = { CONFIRMED: "c", OPERATOR: "c", VERIFIED: "v", MENTION: "m" };
// 후기·게시글에서 온 값이 올해 글이 아니면 값 오른쪽에 “(2025.09.16 기준)”을 붙인다(소유자 2026-10-19).
function asOf(at) {
  const t = Date.parse(at ?? "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  if (d.getFullYear() >= new Date().getFullYear()) return "";
  return `<em class="asof">(${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} 기준)</em>`;
}
const asOfMention = (x) => (x?.g === "m" ? `<span class="badge-check">확인필요</span>${asOf(x.src?.at)}` : "");
const SRC_LABEL = { gocamping: "한국관광공사 고캠핑 등록값", gocamping_intro: "고캠핑 소개글", kakao_local: "카카오 장소 분류", naver_local: "네이버 장소 분류", operator_homepage: "운영자 홈페이지", blog_mention: "블로그 후기 언급", cafe_mention: "카페 글 언급", kin: "지식iN 언급" };
function iconTitle(icon, label) { return `<div class="sec-title">${ic(icon, "line")}<h2>${esc(label)}</h2></div>`; }
// 화면에서 쓰는 문장은 데이터 원문을 그대로 반복하지 않는다. 공통 규칙으로 공백·목록기호를
// 정리하고 한 줄 길이만 남긴다. 원문과 출처는 항상 srcTip()의 작은 i에 보관한다.
function serviceText(value, limit = 44) {
  const text = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/^[\s*#·•\-–—√✓✔※▶►▷■□●○◆◇★☆>]+/, "")
    .replace(/\s*([,.:;])\s*(?!\d)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const sentence = text.match(/^(.+?(?:[.!?]|다\.|요\.|함\.|됨\.))(?:\s|$)/)?.[1] ?? text;
  if (sentence.length <= limit) return sentence.replace(/[\s,;:]+$/, "");
  const cut = sentence.slice(0, limit);
  const at = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("·"), cut.lastIndexOf(","));
  return `${(at > limit * .58 ? cut.slice(0, at) : cut).replace(/[\s,;:]+$/, "")}…`;
}
function sourceName(value, fallback = "원문") {
  const text = String(value ?? "").trim();
  if (/campfit|캠핏/i.test(text)) return "캠핏";
  if (/thank.?camp|땡큐캠핑/i.test(text)) return "땡큐캠핑";
  if (/naver|네이버/i.test(text)) return "네이버";
  if (/youtube|유튜브/i.test(text)) return "YouTube";
  if (/instagram|인스타/i.test(text)) return "Instagram";
  if (/facebook|페이스북/i.test(text)) return "Facebook";
  if (/tiktok|틱톡/i.test(text)) return "TikTok";
  if (/blog|블로그/i.test(text)) return "블로그";
  if (/cafe|카페/i.test(text)) return "카페";
  return text && text.length <= 18 ? text : fallback;
}
function sourceFact(item, fallback = "원문", quote) {
  return {
    g: "m",
    src: {
      label: sourceName(item?.src ?? item?.source?.label, fallback),
      url: item?.url,
      at: item?.date ?? item?.at,
      quote: quote ?? item?.quote ?? item?.title ?? item?.text ?? item?.snippet,
    },
  };
}
function detailValue(x, fallback = "확인필요") { return x?.v ? serviceText(x.v, 48) || fallback : fallback; }
function siteTypesHtml(c, d) {
  const list = d?.site_types ?? (c.st ?? []).map(([code, count, g, sub]) => ({ code, count, sub, grade: g === "o" ? "OPERATOR" : "CONFIRMED" }));
  if (!list.length) return "";
  const tiles = list.map((t) => {
    const meta = ST[t.code] ?? { label: t.code, icon: "tent" };
    const unit = t.code === "GLAMPING" || t.code === "CARAVAN" || t.code === "HOUSE" ? "동" : "면";
    const x = { v: meta.label, g: GRADE_OF[t.grade] ?? "c", src: { label: SRC_LABEL[t.src] ?? t.src, url: t.url, at: t.at, quote: t.quote } };
    return `<div class="stype"><span class="stype-ic">${ic(meta.icon)}</span><span class="stype-b"><b>${esc(t.code === "HOUSE" && t.sub ? `${meta.label} · ${t.sub}` : meta.label)}</b><i>${t.count ? `${fmt(t.count)}${unit}` : t.grade === "OPERATOR" ? "운영자 안내" : t.grade === "MENTION" ? "후기 언급" : "있음"}${t.grade === "MENTION" ? asOf(t.at) : ""}</i></span><span class="tile-g">${dot(x.g)}${srcTip(x, meta.label)}</span></div>`;
  }).join("");
  return `<section class="d-sec"><div class="sec-head">${iconTitle("tent", "사이트 타입")}<span class="sec-note">${list.length}종</span></div><div class="stypes">${tiles}</div></section>`;
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
function introHtml(d) {
  const t = String(d?.intro ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const fact = sourceFact({ src: "고캠핑 소개", url: d?.intro_url, date: d?.intro_at, quote: d?.intro }, "고캠핑 소개");
  return `<section class="d-sec intro-sec"><div class="sec-head">${iconTitle("spark", "업장 소개")}<span class="sec-note">고캠핑 소개 ${srcTip(fact, "업장 소개")}</span></div><div class="intro intro-full"><p class="intro-copy">${esc(t)}</p></div></section>`;
}
function amenityIcon(x) {
  const s = String(x ?? "");
  if (/트렘|트램|방방/i.test(s)) return ic("trampoline");
  if (/운동|체육|족구|풋살|배드민턴/i.test(s)) return ic("sports");
  if (/장작/i.test(s)) return ic("firewood");
  if (/화로|바비큐/i.test(s)) return ic("pit");
  if (/인터넷|와이파이|wifi/i.test(s)) return ic("broadcast");
  if (/화장실/i.test(s)) return ic("poo");
  if (/샤워/i.test(s)) return ic("bath");
  if (/개수대/i.test(s)) return ic("fountain");
  if (/전기/i.test(s)) return ic("bolt");
  if (/온수/i.test(s)) return ic("drop");
  if (/마트|매점|편의점|카페/i.test(s)) return ic("store");
  if (/물놀이|수영|풀장/i.test(s)) return ic("swim");
  if (/놀이터|놀이|키즈/i.test(s)) return ic("users");
  if (/산책로|둘레길/i.test(s)) return ic("route");
  if (/분리수거|재활용/i.test(s)) return ic("recycle");
  return ic("check");
}
function amenityHtml(c, d) {
  const a = (c.amenities ?? []).map((x) => x.replace(".", "·"));
  const cnt = [["화장실", c.toilets, "poo"], ["샤워실", c.showers, "bath"], ["개수대", c.sinks, "fountain"]].filter(([, n]) => n > 0);
  const rent = c.rental ?? [];
  const pt = c.nearby_toilets?.within_2km;
  if (!a.length && !cnt.length && !rent.length) return "";

  const seen = new Set(cnt.map(([l]) => l.replace(/실|장$/, "")));
  const amenityItems = a.filter((item) => {
    const base = item.replace(/실|장$/, "");
    return !seen.has(base);
  });

  const hasUniqueRental = rent.length > 0 && !usage(c, d).some(([l, x]) => l === "대여" && x);

  const cntCards = cnt.map(([l, n, icon]) => `<div><b>${ic(icon)} ${fmt(n)}</b><span>${l}</span></div>`);
  const ptCard = pt ? `<div><b>${ic("poo")} ${fmt(pt)}</b><span>2km 안 공중화장실 ${tip("<b>공중화장실</b><span>행정안전부 공중화장실 표준데이터 기준, 캠핑장 2km 안 개수입니다.</span>")}</span></div>` : "";
  const amCards = amenityItems.map((x) => `<div><b>${amenityIcon(x)}</b><span>${esc(x)}</span></div>`);

  const allCards = [...cntCards, ptCard, ...amCards].filter(Boolean);
  if (!allCards.length && !hasUniqueRental) return "";

  return `<section class="d-sec"><div class="sec-head">${iconTitle("drop", "편의시설")}<span class="sec-note">${c.gc_url ? "고캠핑 등록" : "업장·관리기관 안내"} ${srcTip({ g: "c", src: { label: c.gc_url ? "고캠핑 등록 편의시설" : "업장·관리기관 안내", url: c.gc_url || c.homepage } }, "편의시설")}</span></div>
    ${allCards.length ? `<div class="amen-n">${allCards.join("")}</div>` : ""}
    ${hasUniqueRental ? `<p class="amen-rent"><b>${ic("cart")}대여</b>${rent.map((x) => `<span>${esc(x)}</span>`).join("")}</p>` : ""}
  </section>`;
}
const DAY = { weekday: "평일", weekend: "주말", holiday: "공휴일" };
// 1박 요금: 숙박 요금(캠프 사이트·글램핑·타프존·카라반 등)을 최우선으로, 추가 요금(인원·차량·방문객 등)을 후순위로 공통되게 표시
function parseWonAmount(s) {
  const str = String(s || "");
  const numRe = /(\d{1,3}(?:,\d{3})+|\d{4,7})\s*원/;
  const m1 = str.match(numRe);
  if (m1) return Number(m1[1].replace(/,/g, ""));
  const manRe = /(\d+(?:\.\d+)?)\s*만\s*원?/;
  const m2 = str.match(manRe);
  if (m2) return Math.round(parseFloat(m2[1]) * 10000);
  return 0;
}

function priceRows(c, d) {
  const stayRows = [], extraRows = [];
  const seenStay = new Set(), seenExtra = new Set();

  const addStay = (won, label, kind, fact, extra = "", text = "") => {
    const key = `${won}|${label}|${text}`;
    if (seenStay.has(key)) return;
    seenStay.add(key);
    stayRows.push({ won, label, kind, fact, extra, text });
  };

  const addExtra = (won, label, kind, fact, extra = "", text = "") => {
    const key = `${label}|${won}|${text}`;
    if (seenExtra.has(key)) return;
    seenExtra.add(key);
    extraRows.push({ won, label, kind, fact, extra, text, isExtra: true });
  };

  // 1. 예약 화면 실제 사이트별 요금 (오토캠핑, 글램핑, 타프존, 카라반 등 최우선)
  const bs = d?.booking_sites;
  if (bs?.sites?.length) {
    const groups = new Map();
    for (const x of bs.sites) {
      const k = [x.kind, x.size?.join("x"), x.floor, x.price, x.parking, x.pet, x.people, x.carCamp].join("|");
      if (!groups.has(k)) groups.set(k, { ...x, names: [] });
      groups.get(k).names.push(x.name);
    }
    const day = bs.date ? `${mdKst(`${bs.date}T12:00:00+09:00`)}(토)` : "";
    for (const g of groups.values()) {
      const ns = g.names, name = serviceText(ns.length > 2 ? `${ns[0]} ~ ${ns.at(-1)}` : ns.join(", "), 30);
      const label = [name, g.kind, `${ns.length}개`, g.size ? `${g.size[0]}×${g.size[1]}m` : "", g.floor, g.people ? String(g.people).replace(/^기준인원\s*/, "기준 ") : "", g.parking ? serviceText(String(g.parking).replace(/주차$/, " 주차"), 14) : "", g.carCamp ? "차박 가능" : "", g.pet ? "반려동물 동반" : ""].filter(Boolean).join(" · ");
      addStay(g.price || 0, label, "업장 등록", { g: "c", src: { label: bs.label ?? "예약 화면(업장 등록)", url: bs.url, at: bs.checked_at, quote: `${name}${g.size ? ` 규격 ${g.size[0]}m × ${g.size[1]}m` : ""}${g.price ? ` ${fmt(g.price)}원` : ""}${day ? ` · ${day} 1박` : ""}` } }, day ? `${day} 1박` : "");
    }
  }
  // 고캠핑 상세 이용안내 요금표: 같은 행에서 같은 금액인 기간은 한 줄로 합치고, 이미 보인 금액은 뺀다.
  if (d?.gcd?.fees?.length) {
    const by = new Map();
    for (const f of d.gcd.fees) { const k = `${f.label}|${f.won}`; if (!by.has(k)) by.set(k, { ...f, periods: [] }); by.get(k).periods.push(f.period); }
    for (const x of by.values()) {
      if (stayRows.some((r) => r.won === x.won)) continue;
      const lab = serviceText(x.label.replace(/^(.+?) · \1$/, "$1"), 30);
      addStay(x.won, `${lab} · ${x.periods.join("·")}`, "업장 등록", gcdFact(d.gcd, "고캠핑 상세 이용안내 요금표", `${x.label} ${x.periods.join("·")} ${fmt(x.won)}원`));
    }
  }
  if (!bs?.sites?.length && (d?.products ?? []).length) {
    for (const [i, x] of d.products.entries()) {
      const label = [serviceText(x.name, 26) || `사이트 ${i + 1}`, serviceText(x.size, 20), x.base ? `기준 ${serviceText(x.base, 16)}인` : ""].filter(Boolean).join(" · ");
      addStay(Number(x.price) || 0, label, "업장 등록", { g: "c", src: { label: d?.products_src?.label || "공식 시설 및 상품 등록", url: d?.products_src?.url || c.gc_url, at: d?.products_src?.checked_at, quote: `${x.name ?? ""} ${x.size ? `규격: ${x.size}` : ""} ${x.price ? `${fmt(x.price)}원` : ""}`.trim() } });
    }
  }

  // 2. 형태별 요금(tiers) 또는 대표 요금(c.fee / PF)
  if (!stayRows.length) {
    if (c.fee?.tiers?.length) {
      for (const [k, lo, hi, est] of c.fee.tiers) {
        const tierName = TIER_LABEL[k] || "캠핑 사이트";
        const range = lo > 0 ? (hi > lo ? `${fmt(lo)}~${fmt(hi)}원` : `${fmt(lo)}원`) : "";
        addStay(0, `${tierName} (1박 기준)`, "대표 요금", { g: "c", src: { label: c.fee.basis || "요금 근거", url: c.fee.url, at: c.fee.checked_at, quote: c.fee.text } }, "", range);
      }
    } else {
      const pf = profFact(PF(d, "PRICE"));
      const fee = c.fee;
      const unit = c.du ? "당일 이용" : "캠핑 사이트 (1박 기준)";
      if (c.du && fee && Number(fee.min) === 0 && (fee.g === "FREE" || /무료/.test(fee.text ?? ""))) addStay(0, "입장", "관리기관 안내", { g: "c", src: { label: d?.du_src?.label || "관리기관 안내", url: d?.du_src?.url || c.homepage, at: d?.du_src?.checked_at } }, "", "무료");
      else if (pf?.v) addStay(0, unit, "대표 요금", pf, "", wonText(detailValue(pf)));
      else if (fee) {
        const lo = Number(fee.min), hi = Number(fee.max ?? fee.min);
        const range = lo > 0 ? `${fmt(lo)}${hi > lo ? `~${fmt(hi)}` : ""}원${/대\s*$/.test(fee.text ?? "") ? "대" : ""}` : wonText(fee.text ?? "");
        addStay(0, unit, "대표 요금", { g: GR(fee.grade) || "m", src: { label: sourceName(fee.basis, "요금 근거"), url: fee.url, at: fee.checked_at, quote: fee.quote ?? fee.text } }, "", range);
      }
    }
  }

  // 3. 운영자 안내 숙박 요금 (타프존, 글램핑, 카라반 등 특정 사이트 형태 요금 문장 보완)
  for (const x of d?.operator_snippets ?? []) {
    const t = typeof x === "string" ? x : x.text;
    if (!t) continue;
    if (/환불|취소|위약|수수료|보증금/.test(t)) continue;
    const isExtra = /추가|방문객|지인|손님|인원추가|추가인원|차량추가|추가차량|차1대|트레일러|캠핑카|카라반.*추가|피크닉|당일|숯|그릴|장작|바베큐|바비큐|얼리|레이트|시간\s*연장/.test(t);
    const isStay = /글램핑|카라반|타프|데크|파쇄석|오토|방갈로|펜션|객실|사이트|야영|1박|숙박/.test(t);
    if (!isExtra && isStay) {
      const won = parseWonAmount(t);
      if (won >= 25000 && won <= 1000000) {
        const cleanLabel = serviceText(t.replace(/(\d{1,3}(?:,\d{3})+|\d{4,7})\s*원|(\d+(?:\.\d+)?)\s*만\s*원?/g, "").replace(/^[\s:：·\-]+|[\s:：·\-]+$/g, ""), 32);
        if (cleanLabel.length >= 2 && !stayRows.some(r => r.label && r.label.includes(cleanLabel))) {
          addStay(won, `${cleanLabel} (1박)`, "운영자 안내", { g: "c", src: { label: sourceName(x.src, "운영자 홈페이지"), url: x.url, at: x.date, quote: x.orig ?? t } });
        }
      }
    }
  }

  // 4. 후기 언급: 공식 요금이 있으면 모호한 1박은 제외하고, 글램핑/타프존 등 고유 형태만 보완
  if (stayRows.length === 0) {
    for (const x of d?.prices ?? []) {
      if (!x.won) continue;
      addStay(x.won, [serviceText(x.label, 22), DAY[x.day], serviceText(x.season, 14)].filter(Boolean).join(" · ") || "1박 요금", "후기 언급", sourceFact(x, "후기 원문", x.quote), asOf(x.date));
      if (stayRows.length >= 2) break;
    }
  } else {
    for (const x of d?.prices ?? []) {
      if (!x.won || !x.label) continue;
      const l = String(x.label);
      const isDistinctType = /글램핑|카라반|타프|방갈로|펜션/.test(l);
      const alreadyHas = stayRows.some(r => r.label && r.label.includes(l));
      if (isDistinctType && !alreadyHas) {
        addStay(x.won, `${l} (1박 기준)`, "후기 언급", sourceFact(x, "후기 원문", x.quote), asOf(x.date));
      }
    }
  }

  // 5. 추가 요금: 인원 추가, 지인 방문(방문객), 추가 차량, 캠핑카/트레일러 등 후순위 공통 정규화
  const extraCats = new Map();

  for (const x of d?.operator_snippets ?? []) {
    const t = typeof x === "string" ? x : x.text;
    if (!t) continue;
    if (/환불|취소|위약|수수료|보증금/.test(t)) continue;

    const isVisitor = /방문객|지인|손님|피크닉/.test(t);
    const isPerson = /인원\s*추가|추가\s*인원|1인\s*추가|추가인원|초과\s*인원/.test(t);
    const isCar = /차량\s*추가|추가\s*차량|차\s*1대|추가차량|주차\s*추가/.test(t);
    const isTrailer = /(캠핑카|카라반|트레일러|모터홈).*(추가|입장)/.test(t);
    const isBbq = /숯|그릴|화로대|바베큐|바비큐/.test(t);

    const fact = { g: "c", src: { label: sourceName(x.src, "운영자 홈페이지"), url: x.url, at: x.date, quote: x.orig ?? t } };

    if (isTrailer) {
      const won = parseWonAmount(t);
      if (won >= 5000 && won <= 200000 && !extraCats.has("TRAILER")) {
        extraCats.set("TRAILER", { won, label: "캠핑카 · 카라반 · 트레일러 동반 추가", kind: "추가 요금", fact });
      }
    }

    if (isPerson || isVisitor) {
      let pWon = 0;
      const mP = t.match(/(?:1인|인당|인원)[^0-9]*(\d+(?:\.\d+)?)\s*만?\s*원/);
      if (mP) pWon = mP[0].includes("만") ? Math.round(parseFloat(mP[1]) * 10000) : Number(mP[1].replace(/,/g, ""));
      else pWon = parseWonAmount(t);

      if (pWon >= 3000 && pWon <= 100000) {
        if (!extraCats.has("PERSON")) {
          extraCats.set("PERSON", {
            won: pWon, minWon: pWon, maxWon: pWon,
            label: isVisitor ? "인원 추가 · 지인 방문 (1인 기준)" : "추가 인원 (1인 기준)",
            kind: "추가 요금", fact
          });
        } else {
          const cur = extraCats.get("PERSON");
          if (pWon < cur.minWon) cur.minWon = pWon;
          if (pWon > cur.maxWon) cur.maxWon = pWon;
          if (isVisitor && !cur.label.includes("방문")) cur.label = "인원 추가 · 지인 방문 (1인 기준)";
        }
      }
    }

    if (isCar) {
      let cWon = 0;
      const mC = t.match(/(?:차\s*1대|차량)[^0-9]*(\d+(?:\.\d+)?)\s*만?\s*원/);
      if (mC) cWon = mC[0].includes("만") ? Math.round(parseFloat(mC[1]) * 10000) : Number(mC[1].replace(/,/g, ""));
      else cWon = parseWonAmount(t);

      if (cWon >= 3000 && cWon <= 100000 && !extraCats.has("CAR")) {
        extraCats.set("CAR", { won: cWon, label: "추가 차량 (1대 기준)", kind: "추가 요금", fact });
      }
    }

    if (isBbq && !extraCats.has("BBQ")) {
      const won = parseWonAmount(t);
      if (won >= 5000 && won <= 100000) {
        extraCats.set("BBQ", { won, label: "숯 · 그릴 이용", kind: "추가 요금", fact });
      }
    }
  }

  // Spec facts fallback if not found in snippets
  const extraPersonFact = profFact(PF(d, "EXTRA_FEE")) ?? specFact(d, "EXTRA_PERSON_FEE");
  if (extraPersonFact?.v && !extraCats.has("PERSON")) {
    const val = detailValue(extraPersonFact);
    const won = parseWonAmount(val);
    extraCats.set("PERSON", {
      won, text: won ? "" : wonText(val),
      label: "인원 추가 · 지인 방문 (1인 기준)", kind: "추가 요금", fact: extraPersonFact
    });
  }
  const extraCarFact = specFact(d, "EXTRA_CAR_FEE");
  if (extraCarFact?.v && !extraCats.has("CAR")) {
    const val = detailValue(extraCarFact);
    const won = parseWonAmount(val);
    extraCats.set("CAR", {
      won, text: won ? "" : wonText(val),
      label: "추가 차량 (1대 기준)", kind: "추가 요금", fact: extraCarFact
    });
  }

  // Format person range if min/max differ
  if (extraCats.has("PERSON")) {
    const p = extraCats.get("PERSON");
    if (p.minWon && p.maxWon && p.minWon !== p.maxWon) {
      p.won = 0;
      p.text = `${fmt(p.minWon)}~${fmt(p.maxWon)}원`;
    }
  }

  const EXTRA_ORDER = ["PERSON", "CAR", "TRAILER", "BBQ"];
  for (const cat of EXTRA_ORDER) {
    if (extraCats.has(cat)) {
      const item = extraCats.get(cat);
      addExtra(item.won, item.label, item.kind, item.fact, "", item.text || "");
    }
  }
  for (const [k, item] of extraCats.entries()) {
    if (!EXTRA_ORDER.includes(k)) {
      addExtra(item.won, item.label, item.kind, item.fact, "", item.text || "");
    }
  }

  const rows = [...stayRows, ...extraRows];
  return { stayRows, extraRows, rows, bs };
}

function priceHtml(c, d) {
  const { stayRows, extraRows, rows, bs } = priceRows(c, d);
  if (!rows.length) return "";

  const renderLi = (r, i) => {
    const isMention = r.kind === "후기 언급";
    const badgeText = isMention ? `${r.kind} · 확인필요` : r.kind;
    const wonDisplay = r.won ? `${fmt(r.won)}원` : esc(String(r.text || "예약처 확인").replace(/(방문객)\s+\1/g, "$1"));
    return `<li class="pl-${isMention ? "m" : "c"}${r.isExtra ? " pl-extra" : ""}"><b>${wonDisplay}</b><span>${esc(r.label)}</span><i class="pl-kind">${esc(badgeText)}</i>${r.extra && isMention ? r.extra : ""}${r.fact ? srcTip(r.fact, `요금 정보 ${i + 1}`) : ""}</li>`;
  };

  const stayItems = stayRows.map((r, i) => renderLi({ ...r, isExtra: false }, i)).join("");
  const extraDivider = extraRows.length && stayRows.length ? `<li class="pl-divider"><span>추가 옵션 요금 (지인 방문 · 추가 차량 등)</span></li>` : "";
  const extraItems = extraRows.map((r, i) => renderLi({ ...r, isExtra: true }, stayRows.length + i)).join("");

  const allItemsHtml = `${stayItems}${extraDivider}${extraItems}`;
  const foot = bs?.url ? `<p class="st-foot">요금은 날짜마다 달라요. <a href="${esc(bs.url)}" target="_blank" rel="noopener">날짜별 예약 화면 열기</a></p>` : "";

  return `<section class="d-sec price-sec" id="sec-price"><div class="sec-head">${iconTitle("won", c.du ? "이용 요금" : "1박 요금")}<span class="sec-note">업장 등록 우선 · 후기는 참고</span></div>${allItemsHtml ? `<ul class="plist">${allItemsHtml}</ul>` : ""}${foot}</section>`;
}
// 이용 규칙 · 공지(2026-10-19 소유자: 금지사항·이용수칙·이용제한은 업장 이용에 매우 중요 — 수집해서 노출, 공지는 눌러 바로 원문으로).
// build-house-rules.mjs → d.house_rules { tags, rules[{cat,text,url,at}], ops, notices[{title,date,url}] }. 업장 공개 문장만(후기 제외).
const RULE_CATS = [["ban", "금지사항", "alert"], ["limit", "이용 제한", "report"], ["rule", "이용 수칙", "check"]];
const ymd = (at) => { const t = Date.parse(at ?? ""); if (!Number.isFinite(t)) return ""; const d = new Date(t); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
function houseRulesHtml(c, d) {
  const h = d?.house_rules ?? {};
  const tags = (h.tags ?? []).filter((t) => NO_TAGS[t.k]);
  const rules = h.rules ?? [], ops = h.ops ?? [], notices = h.notices ?? [];
  if (!tags.length && !rules.length && !ops.length && !notices.length) return "";
  // 줄 전체가 원문 링크(소유자 2026-10-20: 오른쪽 ‘원문’ 버튼 대신 글줄을 누르면 원문으로)
  const list = (rows, cls) => {
    const li = (x) => {
      const t = esc(compactOperatorText(x.text));
      return /^https?:/.test(x.url ?? "") ? `<li><a class="hr-line" href="${esc(x.url)}" target="_blank" rel="noopener" title="원문 보기">${t}</a></li>` : `<li><span>${t}</span></li>`;
    };
    return `<ul class="hr-list ${cls}">${rows.map(li).join("")}</ul>`;
  };
  // 불가 배지 = 근거 팝업 버튼: (아이콘 · 이름 · i) 한 덩어리, 배지를 누르면 근거 문장·원문 보기 팝업(소유자 2026-10-20)
  const tagBtn = (t) => {
    const k = srcTip({ g: "c", src: { label: t.src ?? "업장 공개", url: t.url, at: t.at, quote: t.quote } }, NO_TAGS[t.k][0]).match(/data-tip="([^"]+)"/)?.[1];
    return `<button type="button" class="bdg bdg-no hr-badge"${k ? ` data-tip="${k}"` : ""} aria-label="${esc(NO_TAGS[t.k][0])} 근거·원문 보기">${ic(NO_TAGS[t.k][1])}${esc(NO_TAGS[t.k][0])}</button>`;
  };
  const tagRow = tags.length ? `<div class="hr-tags">${tags.map(tagBtn).join("")}</div>` : "";
  const groups = RULE_CATS.map(([k, l, icon]) => [l, icon, rules.filter((r) => r.cat === k)]).filter(([, , rows]) => rows.length);
  const cols = [
    ...groups.map(([l, icon, rows]) => `<div class="hr-col"><h3>${ic(icon)}${l}<i>${rows.length}</i></h3>${list(rows, "")}</div>`),
    ops.length ? `<div class="hr-col"><h3>${ic("clock")}운영 안내<i>${ops.length}</i></h3>${list(ops, "")}</div>` : "",
  ].filter(Boolean);
  const noticeList = notices.length ? `<div class="hr-notices"><h3>${ic("report")}공지사항</h3><ul>${notices.map((n) => `<li>${/^https?:/.test(n.url ?? "") ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">` : "<span>"}${n.date ? `<time>${esc(formatKoreanDate(n.date))}</time>` : ""}<b>${esc(n.title)}</b>${n.url ? ic("external") : ""}${/^https?:/.test(n.url ?? "") ? "</a>" : "</span>"}</li>`).join("")}</ul></div>` : "";
  const at = [...rules, ...ops].map((x) => x.at).filter(Boolean).sort().at(-1);
  return `<section class="d-sec hr-sec" id="sec-rules"><div class="sec-head">${iconTitle("alert", "이용 규칙 · 공지")}<span class="sec-note">업장이 공개한 원문${at ? ` · ${ymd(at)} 확인` : ""} ${tip("<b>이용 규칙 · 공지</b><span>운영자 홈페이지·예약 페이지와 고캠핑 등록값에서 업장이 직접 공개한 금지사항·이용 제한·이용 수칙만 모았어요. 후기 글은 쓰지 않아요. 규칙은 바뀔 수 있으니 예약 전 원문을 확인하세요. 각 줄과 공지 제목을 누르면 원래 페이지가 열리고, 빨간 배지를 누르면 근거 문장과 원문 링크가 보여요.</span>", "이용 규칙 기준")}</span></div>${tagRow}${cols.length ? `<div class="hr-grid">${cols.join("")}</div>` : ""}${noticeList}</section>`;
}
// 운영자 원문은 말투·질문·반복이 섞여 있으므로, 예약에 필요한 항목으로 묶어 읽기 좋게 정리한다.
// 값 자체는 바꾸지 않고 같은 항목의 짧은 원문만 합치며, 전체 원문은 작은 (i)에서 다시 열 수 있다.
const OPERATOR_CATEGORIES = [
  ["입·퇴실", /입실|퇴실|얼리.?체크/], ["요금 · 환불", /요금|할인|환불|취소|수수료|\d+원/],
  ["주차", /주차|차량|견인|차박/], ["전기", /전기|리드선|차단/], ["불멍 · 화로", /화로|장작|숯|불씨|화재/],
  ["반려동물", /반려동물|반려견|마리/], ["매너타임 · 소음", /매너.?타임|소음|정숙|취침|소등/], ["시설", /온수|화장실|휴게실|산책로|편의시설/],
  ["이용 규칙", /쓰레기|분리수거|외부인|준수|강제퇴장|입장/], ["사이트 이용", /일반.?사이트|오토.?캠핑|캠핑카|카라반|텐트/],
];
function compactOperatorText(value) {
  return String(value ?? "").replace(/^[*\-·\s√✓✔※▶►▷■□●○◆◇★☆>]+/, "").replace(/\s+/g, " ").replace(/\s*([,.:])\s*(?!\d)/g, "$1 ").trim();
}
function operatorSummary(label, texts) {
  const text = texts.join(" · ");
  const scan = text.replace(/,\s+/g, ",");
  const matches = (re) => [...scan.matchAll(re)].map((x) => serviceText(x[0], 26)).filter(Boolean);
  if (label === "입·퇴실") {
    const clock = (part) => {
      const m = part.match(/(오전|오후)?\s*(\d{1,2})(?:\s*[:시]\s*(\d{2})?)?/);
      if (!m) return "";
      let h = Number(m[2]);
      if (m[1] === "오후" && h < 12) h += 12;
      if (m[1] === "오전" && h === 12) h = 0;
      return `${String(h).padStart(2, "0")}:${String(m[3] ?? "00").padStart(2, "0")}`;
    };
    const times = [...text.matchAll(/(?:입실|퇴실|체크인|체크아웃|얼리.?체크)[^.!?·]{0,28}/gi)].map((x) => clock(x[0])).filter(Boolean);
    return [...new Set(times)].slice(0, 2).join(" · ") || "입·퇴실 시간 확인";
  }
  if (label === "매너타임 · 소음" || label === "매너타임") {
    const clock = (part) => {
      const m = part.match(/(오전|오후)?\s*(\d{1,2})(?:\s*[:시]\s*(\d{2})?)?/);
      if (!m) return "";
      let h = Number(m[2]);
      if (m[1] === "오후" && h < 12) h += 12;
      if (m[1] === "오전" && h === 12) h = 0;
      return `${String(h).padStart(2, "0")}:${String(m[3] ?? "00").padStart(2, "0")}`;
    };
    const times = [...text.matchAll(/(?:매너.?타임|소등|취침)[^.!?·]{0,28}/gi)].map((x) => clock(x[0])).filter(Boolean);
    return times[0] ? `매너타임 ${times[0]}` : "매너타임 준수";
  }
  if (label === "취소 · 환불") return /당일.{0,8}(환불\s*불가|불가)/.test(text) ? "당일 취소 환불 불가" : "취소·환불 규정 확인";
  if (label === "요금 · 환불") {
    const parsePriceWon = (str) => {
      const clean = str.replace(/[^\d.만천]/g, "");
      if (clean.includes("만")) {
        const [m, rem] = clean.split("만");
        return (parseFloat(m) || 0) * 10000 + (parseFloat(rem) || 0);
      }
      if (clean.includes("천")) {
        const [t, rem] = clean.split("천");
        return (parseFloat(t) || 0) * 1000 + (parseFloat(rem) || 0);
      }
      return parseInt(clean, 10) || 0;
    };
    const priceCandidates = [...scan.matchAll(/(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?(?:만|천)?)\s*원/g)]
      .map((x) => ({
        raw: x[0].replace(/\s+/g, ""),
        index: x.index,
        num: parsePriceWon(x[0]),
      }))
      .filter((p) => {
        if (!p.num) return false;
        const start = Math.max(0, p.index - 35);
        const end = Math.min(scan.length, p.index + p.raw.length + 35);
        const context = scan.slice(start, end);
        if (/입장료|입장권|상품권|관광지|문화재|쓰레기\s*봉투/.test(context) && p.num < 10000) return false;
        if (p.num < 5000) return false;
        return true;
      });
    const prices = priceCandidates.map((p) => p.raw);
    if (prices.length) return [...new Set(prices)].slice(0, 2).join(" · ");
    if (/환불|취소/.test(text)) return "취소·환불 규정 확인";
    return "이용 요금 확인";
  }
  if (label === "주차") return /텐트.?옆|사이트.?옆/.test(text) ? "사이트 옆 주차 안내" : /외부|공용/.test(text) ? "외부 주차 안내" : "주차 방법 확인";
  if (label === "전기") {
    const wattMatches = [...scan.matchAll(/(?<![a-zA-Z\d,.])(\d{1,2}(?:,\d{3})+|\d{3,4}(?:\.\d+)?)\s*(?:[wW]|와트)(?![a-zA-Z])/gi)];
    const kwMatches = [...scan.matchAll(/(?<![a-zA-Z\d.])(\d+(?:\.\d+)?)\s*(?:kW|킬로와트)(?![a-zA-Z])/gi)];
    const parsed = [];
    for (const m of wattMatches) {
      const val = parseInt(m[1].replace(/,/g, ""), 10);
      if (val >= 200 && val <= 5000) parsed.push(`${val.toLocaleString()}W`);
    }
    for (const m of kwMatches) {
      const val = parseFloat(m[1]);
      if (val >= 0.5 && val <= 5) parsed.push(`${Math.round(val * 1000).toLocaleString()}W`);
    }
    if (parsed[0]) return parsed[0];
    return /없음|불가/.test(text) ? "전기 이용 불가" : "전기 이용 안내";
  }
  if (label === "불멍 · 화로") return /장작/.test(text) ? "장작 이용 안내" : /숯/.test(text) ? "숯 이용 안내" : /불가|금지/.test(text) ? "화기 이용 불가" : "화기 이용 안내";
  if (label === "반려동물") return /불가|금지/.test(text) ? "반려동물 동반 불가" : "반려동물 동반 안내";
  if (label === "시설") return "시설 이용 안내";
  if (label === "사이트 이용") return "사이트 이용 안내";
  return "운영 규정 확인";
}
function operatorHtml(d, c) {
  const used = new Set(), grouped = new Map();
  for (const raw of d?.operator_snippets ?? []) {
    const x = typeof raw === "string" ? { text: raw } : raw;
    const text = compactOperatorText(x.text);
    if (text.length < 14 || used.has(text) || /^(캠핑 이용요금|예약 취소|이용요금 환불기준|.+가능한가요)\??$/.test(text)) continue;
    used.add(text);
    let label = x.cat ?? OPERATOR_CATEGORIES.find(([, re]) => re.test(text))?.[0] ?? "운영 안내";
    // 금액 문장은 ‘1박 요금’ 칸으로 옮겼다. 여기에는 취소·환불 규정만 남긴다.
    if (label === "요금 · 환불") { if (!/환불|취소|위약|수수료/.test(text)) continue; label = "취소 · 환불"; }
    const row = grouped.get(label) ?? { label, texts: [], url: x.url, src: x.src, at: x.date, image: null };
    if (x.image && !row.image) row.image = x.image;
    if (row.texts.length < 3 && !row.texts.some((t) => t.includes(text) || text.includes(t))) row.texts.push(text);
    if (!row.url && x.url) row.url = x.url;
    grouped.set(label, row);
  }
  const order = new Map(["입·퇴실", "예약 · 성수기", "취소 · 환불", "인원 · 추가", "주차", "전기", "불멍 · 화로", "반려동물", "매너타임 · 소음", "시설", "이용 규칙", "사이트 이용", ...OPERATOR_CATEGORIES.map(([l]) => l)].map((label, i) => [label, i]));
  const rows = [...grouped.values()].filter((x) => x.texts.length).sort((a, b) => (order.get(a.label) ?? 99) - (order.get(b.label) ?? 99)).slice(0, 8);
  if (!rows.length) return "";

  // 상단 이용 정보·요약 사항과 중복되는 단순 정보는 걸러낸다.
  const us = c ? usage(c, d) : [];
  const ti = c?.ti ?? {};
  const f = c ? facts(c) : {};
  const inVal = us.find(([l]) => l === "입실")?.[1]?.v ?? ti.i?.[0];
  const outVal = us.find(([l]) => l === "퇴실")?.[1]?.v ?? ti.o?.[0];
  const mannerVal = us.find(([l]) => l === "매너타임")?.[1]?.v ?? ti.m?.[0];
  const powerVal = f.power?.v ?? (c?.of?.w?.v ? `${c.of.w.v}W` : null) ?? (c?.field_conditions?.power?.limit_w ? `${c.field_conditions.power.limit_w}W` : null);

  const filtered = rows.map((x) => {
    const sum = operatorSummary(x.label, x.texts);
    // ‘○○ 안내’ ‘○○ 확인’ 같은 빈 요약 대신 운영자가 쓴 첫 문장을 짧게 정리해 보인다.
    const statement = x.texts.find((t) => !/(\?|까요|나요|가요|인가요)\s*$/.test(t));
    const value = /(안내|확인)$/.test(sum) && statement ? serviceText(statement, 64) || sum : sum;
    return { ...x, sum, value };
  }).filter((x) => {
    // 1. 입·퇴실: 상단 이용정보에 입/퇴실 시각이 이미 있고, 공지 내용이 단순 시각 나열이거나 "확인" 문구면 제외
    if (x.label === "입·퇴실" && (inVal || outVal)) {
      if (/^(?:\d{1,2}:\d{2}(?:\s*·\s*\d{1,2}:\d{2})?|입·퇴실 시간 확인)$/.test(x.value)) return false;
    }
    // 2. 전기: 상단 요약사항에 전기 용량이 이미 있고, 공지 내용이 단순 와트수 표기나 단순 안내면 제외
    if (x.label === "전기" && powerVal) {
      if (/^(?:\d+(?:,\d+)?\s*[wW]|전기 이용 (?:안내|확인))$/.test(x.value)) return false;
    }
    // 3. 매너타임: 상단 이용정보에 매너타임이 이미 있고, 단순 시각이나 일반 안내면 제외
    if ((x.label === "매너타임 · 소음" || x.label === "매너타임") && mannerVal) {
      if (/^(?:\d{1,2}:\d{2}(?:\s*[~·-]\s*\d{1,2}:\d{2})?|매너타임 (?:안내|확인|\d{1,2}:\d{2})|운영 규정 확인)$/.test(x.value)) return false;
      const mDigits = String(mannerVal).replace(/[^\d]/g, "");
      const vDigits = String(x.value).replace(/[^\d]/g, "");
      if (mDigits && (mDigits === vDigits || x.value.includes(String(mannerVal))) && !/경고|퇴실|환불|벌금|민원|소등|음악|금지/.test(x.value)) return false;
    }
    // 4. 주차: 상단 요약사항에 주차 정보가 이미 있고, 단순 주차 안내/확인이면 제외
    if (x.label === "주차" && f.park) {
      if (/^(?:(?:사이트 옆|외부) 주차 안내|주차 방법 확인)$/.test(x.value)) return false;
    }
    return true;
  });

  if (!filtered.length) return "";
  return `<section class="d-sec operator-sec" id="sec-operator"><div class="sec-head">${iconTitle("report", "공지사항")}<span class="sec-note">항목별 정리</span></div><div class="operator-grid">${filtered.map((x) => {
    const source = srcTip({ g: "c", src: { label: x.image ? "운영자 안내 이미지(글자 인식)" : sourceName(x.src, "운영자 홈페이지"), url: x.url, at: x.at, quote: x.texts.join("\n"), image: x.image } }, x.label);
    const opIc = /입실|퇴실/.test(x.label) ? "clock-in" : /요금|환불/.test(x.label) ? "won" : /주차/.test(x.label) ? "car" : /전기/.test(x.label) ? "bolt" : /화로|장작/.test(x.label) ? "flame" : /반려/.test(x.label) ? "paw" : /시설/.test(x.label) ? "drop" : /예약/.test(x.label) ? "calendar" : /인원/.test(x.label) ? "plus" : /매너/.test(x.label) ? "moon" : "report";
    return `<article><span>${ic(opIc)}${esc(x.label)}</span><p>${esc(x.value)}</p>${source}</article>`;
  }).join("")}</div></section>`;
}
// 예약 방법: 화면에는 우선순위로 고른 대표 채널 하나만 보이고, 모든 원본 채널은 데이터에 보존한다.
function bookingHtml(c, d) {
  const main = primaryBooking(c);
  const g = d?.guide;
  const pf = g?.platform ?? {};
  const meta = [["오픈", pf.opening], ["결제", pf.payment], ["취소", pf.cancel], ["대기", pf.waitlist]].filter(([, v]) => v && !/운영자 안내에 따름|홈페이지마다 다름|홈페이지\s*(공지|예약\s*안내)|일정을 따른다/.test(v));
  if (!main && !c.tel && !meta.length && !(pf.tips ?? []).length) return "";
  const guideFact = sourceFact({ src: g?.source?.label ?? g?.source, url: g?.source?.url, date: g?.source?.date, quote: (pf.tips ?? []).join("\n") }, "예약 안내");
  return `<section class="d-sec"><div class="sec-head">${iconTitle("calendar", "예약 방법")}${main || (pf.tips ?? []).length ? `<span class="sec-note">${main ? `대표 채널 ${srcTip(bookingSource(main), "대표 예약 채널")}` : ""}${(pf.tips ?? []).length ? srcTip(guideFact, "예약 안내") : ""}</span>` : ""}</div>
    ${main || c.tel ? `<div class="chans">${main ? `<a class="chan" href="${esc(main.url)}" target="_blank" rel="noopener">${ic("right")}<b>${esc(bookingLabel(main))}</b><i>예약 페이지</i></a>` : ""}${c.tel ? `<a class="chan" href="tel:${esc(telText(c.tel).replace(/[^\d+]/g, ""))}">${ic("phone")}<b>전화 문의</b><i>${esc(telText(c.tel))}</i></a>` : ""}</div>` : ""}
    ${meta.length ? `<dl class="uses">${meta.map(([l, v]) => `<div class="use"><dt>${l}</dt><dd><span class="use-val">${esc(serviceText(v, 32))}</span><span class="use-meta">${srcTip({ g: "c", src: { label: "예약 안내", url: g?.source?.url, at: g?.source?.date, quote: v } }, l)}</span></dd></div>`).join("")}</dl>` : ""}
    ${(pf.tips ?? []).length ? `<ul class="tips">${pf.tips.slice(0, 3).map((t) => `<li>${esc(serviceText(t, 60))}</li>`).join("")}</ul>` : ""}
  </section>`;
}
// 공식 접수 중(서울 공공서비스예약 Open API). 남은 자리는 예약처 확인.
// 예약 화면 관측 빈자리(원천 승인 후 vacancy.json이 있을 때만). 날짜별 빈자리/전체 사이트와 확인 시각.
function vacHtml(c) {
  const e = S.vac?.camps?.[String(c.id)];
  if (!e) return "";
  const ds = S.vac.dates.filter((d) => e.d?.[d]);
  if (!ds.length) return "";
  return `<div class="rs-avail rs-vac"><p><b>${ic("check")}주말 빈자리 관측</b>${tip(`<b>${esc(S.vac.source?.name ?? "예약 화면")}</b><span>${esc(S.vac.disclaimer ?? "")}</span>`)}</p>${ds.map((d) => { const [o, t, at] = e.d[d]; return `<a href="${esc(THANKQ_VIEW(e.cseq, d))}" target="_blank" rel="noopener"><span>${mdKst(`${d}T12:00:00+09:00`)}(토) 1박 · ${o > 0 ? `빈자리 ${o}/${t}` : `만석 ${t}개 사이트`}</span><i>${hmKst(at)} 확인 · 예약처에서 최종 확인</i></a>`; }).join("")}</div>`;
}
function availHtml(c) {
  const rs = S.avail?.get(String(c.id)) ?? [];
  if (!rs.length) return vacHtml(c);
  const dt = (s) => new Date(s).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).replace(/\.\s?/g, "/").replace(/\/$/, "");
  return `<div class="rs-avail"><p><b>${ic("check")}공식 접수 중</b>${tip(`<b>${esc(rs[0].source_name ?? "공식 접수 상태")}</b><span>${esc(rs[0].disclaimer ?? "")}</span>`)}</p>${rs.slice(0, 3).map((r) => `<a href="${esc(r.source_url)}" target="_blank" rel="noopener"><span>${esc(r.product_name.replace(/\(.*?\)\s*/, ""))}</span><i>접수 ~${dt(r.receipt?.to)} · 이용 ${dt(r.use?.from)}~${dt(r.use?.to)}</i></a>`).join("")}</div>`;
}
function programsHtml(d) {
  const pr = String(d?.programs ?? "").split(/[,·\n]/).map((x) => x.trim()).filter(Boolean);
  const ft = String(d?.feature ?? "").trim();
  if (!pr.length && !ft) return "";
  const fact = sourceFact({ src: "고캠핑 등록", url: d?.feature_url, quote: [ft, ...pr].join(" · ") }, "고캠핑 등록");
  return `<section class="d-sec"><div class="sec-head">${iconTitle("spark", "특징·체험")}<span class="sec-note">고캠핑 등록 ${srcTip(fact, "특징·체험")}</span></div>${ft ? `<p class="feat">${esc(serviceText(ft, 70))}</p>` : ""}${pr.length ? `<div class="amen">${pr.slice(0, 8).map((x) => `<span>${esc(serviceText(x, 20))}</span>`).join("")}</div>` : ""}</section>`;
}
// 외부 게시물은 embed/display_rights가 명시된 경우에만 미리보기·라이트박스를 사용한다.
// 그 외에는 플랫폼이 제공하는 원문 카드로만 열어 저작권·저장 조건을 지킨다.
const canPreviewExternalMedia = (x) => Boolean(x && (x.display_rights === "EMBED" || x.display_rights === "DISPLAY" || x.embed_url));
const externalImage = (x) => x.embed_url || x.img || x.thumb;
// 검색 API가 결과와 함께 주는 작은 썸네일(카카오 검색 CDN)은 원문 링크와 함께 보여 준다(원본 저장·확대 없음).
const apiThumb = (x) => (/^https:\/\/search\d?\.kakaocdn\.net\//.test(String(x?.thumb ?? "")) ? x.thumb : null);
function thumbLinks(list, label) {
  return `<div class="thumb-links">${list.map((x, i) => `<a href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="${label} ${i + 1} 원문 열기"><img src="${esc(apiThumb(x))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><i>${esc(sourceName(x.src, hostOf(x.url) || "원문"))}</i></a>`).join("")}</div>`;
}
function operatorMediaHtml(d) {
  const imgs = (d?.operator_media?.images ?? []).filter((x) => x.url).slice(0, 8);
  if (!imgs.length) return "";
  const cards = imgs.map((x, i) => `<a class="media-card" href="${esc(x.page || x.url)}" target="_blank" rel="noopener"><div class="media-card-photo"><img src="${esc(x.url)}" alt="${esc(x.alt || "운영자 사진")}" loading="lazy" decoding="async" onerror="this.closest('.media-card').remove()"></div><div class="media-card-body"><i>${x.layout ? "배치·시설" : "운영자 사진"}</i><b>${esc(x.alt || `사진 ${i + 1}`)}</b></div></a>`).join("");
  return `<section class="d-sec"><div class="sec-head">${iconTitle("layers", "운영자 제공 사진")}<span class="sec-note">운영자 홈페이지 원문</span></div><div class="media-grid">${cards}</div></section>`;
}
// 시설 배치도·캠퍼 사진: 누르면 이 화면 안 라이트박스에서 원본 그림을 크게 연다(소유자 2026-10-19).
// 원본을 못 불러오면 검색 API 썸네일을 대신 보이고, 원문 링크는 라이트박스 아래에 둔다. 그림은 저장하지 않는다.
const mediaFull = (x) => externalImage(x) || apiThumb(x);
const mediaSmall = (x) => apiThumb(x) || externalImage(x);
const layoutImages = (d) => (d?.layout?.images ?? []).filter((x) => (x.img || x.thumb || x.url)).filter((x, i, all) => all.findIndex((y) => (y.img || y.thumb || y.url) === (x.img || x.thumb || x.url)) === i).slice(0, 6);
const snsImages = (d) => (d?.sns_images ?? []).filter((x) => x.url && mediaFull(x));

const isOfficialLayout = (x) => Boolean(x && (x.official || /gocamping\.or\.kr|mgocamping/i.test(x.img || x.url || "") || x.src === "고캠핑" || x.src === "한국관광공사"));

function layoutHtml(d, c) {
  const allImages = (d?.layout?.images ?? [])
    .filter((x) => x && (x.img || x.thumb))
    .filter((x, i, arr) => arr.findIndex((y) => (y.img || y.thumb) === (x.img || x.thumb)) === i);

  // 후보 카드 오른쪽 아래(단일 사진은 오른쪽 위) 원문 링크 아이콘: 누르면 그 사진이 실린 글로 이동(소유자 2026-10-20)
  const srcIcon = (x, pos = "") => (/^https?:/.test(x?.url ?? "") ? `<a class="cand-src${pos ? ` cand-src-${pos}` : ""}" href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="원문 보기" title="원문 보기">${ic("external", "line")}</a>` : "");
  if (!allImages.length) return "";

  const officialList = allImages.filter(isOfficialLayout);
  const hasOfficial = officialList.length > 0;
  const officialImg = officialList[0];

  if (hasOfficial) {
    const candidates = allImages.filter((x) => x !== officialImg).slice(0, 4);
    const mainImgUrl = officialImg.img || officialImg.thumb;
    return `<section class="d-sec layout-sec">
      <div class="sec-head">
        ${iconTitle("layers", "시설 배치도")}
        <span class="sec-note">고캠핑 등록 원본</span>
      </div>
      <div class="layout-single-wrap">
        <button type="button" class="layout-single-btn" data-layout-open="0" aria-label="고캠핑 공식 시설 배치도 원본 크게 보기">
          <img src="${esc(mainImgUrl)}" alt="고캠핑 공식 시설 배치도" decoding="async" referrerpolicy="no-referrer" onerror="if(this.src!=='${esc(officialImg.thumb)}'){this.src='${esc(officialImg.thumb)}'}">
          <span class="cand-zoom-badge">${ic("search")}고화질 크게 보기</span>
        </button>
      </div>
      ${candidates.length ? `
      <div class="layout-extra-zone">
        <p class="layout-note">캠퍼 후기 참고 배치도 (${candidates.length}장)</p>
        <div class="layout-candidate-grid">
          ${candidates.map((x, i) => {
            const imgUrl = x.img || x.thumb;
            return `
            <div class="layout-cand"><button type="button" class="layout-cand-btn" data-layout-open="${i + 1}" aria-label="참고 시설배치도 ${i + 1} 크게 보기">
              <div class="layout-cand-photo">
                <img src="${esc(imgUrl)}" alt="참고 배치도 ${i + 1}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(this.src!=='${esc(x.thumb)}'){this.src='${esc(x.thumb)}'}">
                <span class="cand-zoom-badge">${ic("search")}크게 보기</span>
              </div>
              <div class="layout-cand-info">
                <b>참고 배치도 ${i + 1}</b>
                <span>${esc(sourceName(x.src, hostOf(x.url) || "후기"))}${x.date ? ` · ${esc(formatKoreanDate(x.date))}` : ""}</span>
              </div>
            </button>${srcIcon(x)}</div>`;
          }).join("")}
        </div>
      </div>` : ""}
    </section>`;
  }

  // 고캠핑 공식 배치도가 없는 경우: 후보 사진 표시
  const candidates = allImages.slice(0, 6);
  if (candidates.length === 1) {
    const single = candidates[0];
    const imgUrl = single.img || single.thumb;
    return `<section class="d-sec layout-sec">
      <div class="sec-head">
        ${iconTitle("layers", "시설 배치도")}
        <span class="sec-note">추정 사진 1장 (고캠핑 공식 배치도 없음)</span>
      </div>
      <p class="layout-note">고캠핑에 공식 배치도가 등록되지 않아, 캠퍼 후기 및 포토에서 찾은 시설배치도 추정 사진입니다. 사진을 누르면 라이트박스로 크게 확인하실 수 있습니다.</p>
      <div class="layout-single-wrap">
        <button type="button" class="layout-single-btn" data-layout-open="0" aria-label="추정 시설 배치도 원본 크게 보기">
          <img src="${esc(imgUrl)}" alt="추정 시설 배치도" decoding="async" referrerpolicy="no-referrer" onerror="if(this.src!=='${esc(single.thumb)}'){this.src='${esc(single.thumb)}'}">
          <span class="cand-zoom-badge">${ic("search")}고화질 크게 보기</span>
        </button>
        ${srcIcon(single, "top")}
      </div>
    </section>`;
  }

  if (candidates.length > 1) {
    return `<section class="d-sec layout-sec">
      <div class="sec-head">
        ${iconTitle("layers", "시설 배치도")}
        <span class="sec-note">추정 사진 ${candidates.length}장 (고캠핑 공식 배치도 없음)</span>
      </div>
      <p class="layout-note">고캠핑에 등록된 공식 배치도가 없습니다. 캠퍼 후기 및 포토에서 수집된 시설배치도 후보 사진들을 아래에서 직접 확인해 보세요. 카드를 누르면 라이트박스로 또렷하게 크게 열립니다.</p>
      <div class="layout-candidate-grid">
        ${candidates.map((x, i) => {
          const imgUrl = x.img || x.thumb;
          return `
          <div class="layout-cand"><button type="button" class="layout-cand-btn" data-layout-open="${i}" aria-label="시설배치도 추정 후보 ${i + 1} 원본 크게 보기">
            <div class="layout-cand-photo">
              <img src="${esc(imgUrl)}" alt="배치도 후보 ${i + 1}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(this.src!=='${esc(x.thumb)}'){this.src='${esc(x.thumb)}'}">
              <span class="cand-zoom-badge">${ic("search")}크게 보기</span>
            </div>
            <div class="layout-cand-info">
              <b>배치도 후보 ${i + 1}</b>
              <span>${esc(sourceName(x.src, hostOf(x.url) || "후기"))}${x.date ? ` · ${esc(formatKoreanDate(x.date))}` : ""}${x.sure ? " · 관련도 높음" : ""}</span>
            </div>
          </button>${srcIcon(x)}</div>`;
        }).join("")}
      </div>
    </section>`;
  }

  // 사진 없이 관련 글만 있는 경우는 칸을 보이지 않는다(소유자 2026-10-20: ‘배치도 관련 글’ 박스 제거)
  return "";
}
// 플랫폼별 더 보기(docs/PLATFORM_HUB.md, 2026-10-19): 수집한 영상은 위 영상 칸에서 재생하고,
// 직접 수집하지 않는 플랫폼(인스타·페이스북·틱톡 등)은 캠핑장 이름 검색 결과로 새 탭에서 연다.
// 관련 영상 · 플랫폼(소유자 2026-10-20): ‘더 보기’ 칸을 없애고 영상 칸 제목 아래에 플랫폼 칩(주변시설 칩과 같은 모양)을 둔다.
// 모은 글·영상이 있는 플랫폼(YouTube 영상, 네이버·다음 글)은 칩을 누르면 이 자리에서 목록을, 없는 플랫폼(인스타·페이스북·틱톡 등)은
// 그 플랫폼의 캠핑장 이름 검색 결과를 새 탭으로 연다(자동 수집하지 않는 플랫폼). 아이콘은 모두 검은 바탕·흰 글리프.
const PLAT_SVG = {
  youtube: '<path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z"/>',
  instagram: '<path d="M16 3a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zm0 2H8a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3m-4 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8m0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4m4.6-3.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/>',
  facebook: '<path d="M14 8h3V4h-3a5 5 0 0 0-5 5v2H7v4h2v7h4v-7h3l1-4h-4V9a1 1 0 0 1 1-1"/>',
  tiktok: '<path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6"/>',
  naver: '<path d="M15.6 12.8 8.1 2H2v20h6.4V11.2L15.9 22H22V2h-6.4z" transform="translate(3 3) scale(.75)"/>',
  daum: '<path d="M6 4h5.2a8 8 0 0 1 0 16H6zm3.2 3.1v9.8h2a4.9 4.9 0 0 0 0-9.8z"/>',
  kakao: '<path d="M12 3c-5.5 0-10 3.6-10 8 0 2.8 1.8 5.3 4.6 6.7l-1.2 4.4c-.1.4.3.7.6.5l5.2-3.5c.3 0 .5.1.8.1 5.5 0 10-3.6 10-8s-4.5-8-10-8z"/>',
  kakaomap: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>',
  gocamping: '<path d="M12 2 2 19h7l3-5.2L15 19h7L12 2zm0 6 3 5.2H9L12 8z"/>',
};
const platIc = (k) => `<span class="plat-ic"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${PLAT_SVG[k] || PLAT_SVG.naver}</svg></span>`;
function sourcePlatformKey(x) {
  const u = String(x?.url ?? "").toLowerCase();
  const s = String(x?.src ?? "").toLowerCase();
  const t = String(x?.t ?? "").toLowerCase();
  if (u.includes("naver.com") || u.includes("naver.me") || s.includes("네이버") || t.startsWith("n")) return "naver";
  if (u.includes("map.kakao.com")) return "kakaomap";
  if (u.includes("kakao.com") || u.includes("daum.net") || u.includes("tistory.com") || s.includes("카카오") || s.includes("다음") || t.startsWith("d")) return "kakao";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("facebook.com")) return "facebook";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("gocamping.or.kr") || s.includes("고캠핑")) return "gocamping";
  return "naver";
}
function sourcePlatformLabel(x) {
  const pk = sourcePlatformKey(x);
  if (pk === "naver") return x?.t === "cafe" ? "네이버 카페" : x?.t === "kin" ? "지식iN" : x?.t === "web" ? "네이버 웹" : "네이버 블로그";
  if (pk === "kakao") return x?.t === "cafe" ? "카카오 카페" : "카카오 블로그";
  if (pk === "kakaomap") return "카카오맵";
  if (pk === "youtube") return "유튜브";
  if (pk === "instagram") return "인스타그램";
  if (pk === "gocamping") return "고캠핑";
  return sourceName(x?.src, hostOf(x?.url) || "블로그");
}
const isHost = (u, re) => { try { return re.test(new URL(u).hostname); } catch { return false; } };
function mediaHubHtml(d, c) {
  const name = nameOf(c).name;
  const q = encodeURIComponent(`${name} 캠핑`);
  const v = (d?.videos ?? []).filter((x) => x.yt).slice(0, 8);
  const seen = new Set();
  const posts = [...(d?.reviews ?? []), ...(d?.cafe ?? []), ...(d?.web ?? [])].filter((x) => x.url && x.title && !seen.has(x.url) && seen.add(x.url))
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  const naverPosts = posts.filter((x) => isHost(x.url, /naver\.com$|naver\.me$/)).slice(0, 6);
  const daumPosts = posts.filter((x) => isHost(x.url, /daum\.net$|kakao\.com$|tistory\.com$/)).slice(0, 6);
  const postList = (rows) => `<div class="mh-posts">${rows.map((x) => `<a class="mh-post" href="${esc(x.url)}" target="_blank" rel="noopener"><b>${esc(serviceText(x.title, 60))}</b><i>${esc(sourceName(x.src, hostOf(x.url) || "원문"))}${x.date ? ` · ${esc(formatKoreanDate(x.date))}` : ""}</i>${ic("external", "line")}</a>`).join("")}</div>`;
  const tabs = [
    { key: "youtube", label: "YouTube", n: v.length, panel: v.length ? `__RAIL__` : null, url: `https://www.youtube.com/results?search_query=${q}` },
    { key: "naver", label: "네이버", n: naverPosts.length, panel: naverPosts.length ? postList(naverPosts) : null, url: `https://search.naver.com/search.naver?query=${q}` },
    { key: "daum", label: "다음", n: daumPosts.length, panel: daumPosts.length ? postList(daumPosts) : null, url: `https://search.daum.net/search?q=${q}` },
    { key: "instagram", label: "Instagram", url: `https://www.instagram.com/explore/search/keyword/?q=${q}` },
    { key: "facebook", label: "Facebook", url: `https://www.facebook.com/search/posts/?q=${q}` },
    { key: "tiktok", label: "TikTok", url: `https://www.tiktok.com/search?q=${q}` },
  ];
  const inSite = tabs.filter((t) => t.panel);
  const chip = (t) => t.panel
    ? `<button type="button" role="tab" id="mh-t-${t.key}" data-mh-tab="${t.key}" aria-controls="mh-p-${t.key}" aria-selected="${t === inSite[0]}">${platIc(t.key)}${esc(t.label)}<i>${t.n}</i></button>`
    : `<a class="mh-link" href="${esc(t.url)}" target="_blank" rel="noopener" title="${esc(t.label)}에서 ${esc(name)} 검색">${platIc(t.key)}${esc(t.label)}${ic("external", "line")}</a>`;
  const panels = inSite.map((t, i) => `<section class="mh-panel" id="mh-p-${t.key}" role="tabpanel" aria-labelledby="mh-t-${t.key}"${i ? " hidden" : ""}>${t.panel}${t.panel === "__RAIL__" ? "" : `<a class="mh-more" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.label)}에서 더 찾기${ic("right")}</a>`}</section>`).join("");
  const rail = v.length ? `<div class="rail vids" data-cgrid>${v.map((x, i) => {
    const fact = sourceFact({ src: "YouTube", url: x.url ?? `https://www.youtube.com/watch?v=${x.yt}`, date: x.date, title: x.title }, "YouTube");
    return `<article class="vid-wrap"><button type="button" class="vid" data-yt="${esc(x.yt)}"><img src="https://i.ytimg.com/vi/${encodeURIComponent(x.yt)}/hqdefault.jpg" alt="" loading="lazy" decoding="async"><span class="vid-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg></span><b>${esc(serviceText(x.title, 60) || `현장 영상 ${i + 1}`)}</b><i>${esc([x.author, x.date ? formatKoreanDate(x.date) : ""].filter(Boolean).join(" · ") || "재생하기")}</i></button>${srcTip(fact, `관련 영상 ${i + 1}`)}</article>`;
  }).join("")}</div>` : "";
  return `<section class="d-sec media-hub" id="sec-media"><div class="sec-head">${iconTitle("video", "SNS 영상")}</div><div class="nb-tabs mh-tabs" role="tablist" aria-label="플랫폼">${tabs.map(chip).join("")}</div>${panels.replace("__RAIL__", rail)}</section>`;
}
function reviewSummary(value) {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  const parts = text.split(/(?<=[.!?])\s+|\s{2,}/).map((x) => serviceText(x, 76)).filter(Boolean);
  const useful = /캠핑|사이트|시설|풍경|주차|전기|화장실|샤워|반려|텐트|잔디|숲|바다|요금|입실|대여/;
  const candidate = parts.find((x) => x.length >= 12 && useful.test(x) && !/^[^가-힣A-Za-z]*(?:\d{4}[./-]\d|\d{1,2}:\d{2})/.test(x) && !/^[^\p{L}\p{N}]{1,}/u.test(x) && !/^(못|ㅋㅋ|ㅎㅎ|ㅠㅠ|\.{2,})/.test(x) && !/[가-힣]+(?:시|군|구|읍|면|리).{0,24}(?:길|로|\d)/.test(x));
  return candidate || "";
}
function reviewLinksHtml(d, c) {
  const campName = c ? nameOf(c).name : "";
  const q = encodeURIComponent(`${campName} 캠핑장 후기`);
  const naverSearch = `https://search.naver.com/search.naver?where=blog&query=${q}`;
  const daumSearch = `https://search.daum.net/search?w=blog&q=${q}`;
  const kakaoMap = c?.lat && c?.lng ? `https://map.kakao.com/link/search/${encodeURIComponent(campName)}` : `https://map.kakao.com/link/search/${q}`;
  const gcReview = c?.gc_url || "https://www.gocamping.or.kr/";
  const catChips = `
    <div class="rail chips review-cat-chips" aria-label="후기 채널 바로가기">
      <a class="chip rmc-chip" href="${naverSearch}" target="_blank" rel="noopener">${platIc("naver")}네이버</a>
      <a class="chip rmc-chip" href="${daumSearch}" target="_blank" rel="noopener">${platIc("kakao")}카카오</a>
      <a class="chip rmc-chip" href="${kakaoMap}" target="_blank" rel="noopener">${platIc("kakaomap")}카카오맵</a>
      ${c?.gc_url ? `<a class="chip rmc-chip" href="${esc(gcReview)}" target="_blank" rel="noopener">${platIc("gocamping")}고캠핑</a>` : ""}
    </div>`;

  const seenUrl = new Set();
  const titleByUrl = new Map();
  for (const r of [...(d?.reviews ?? []), ...(d?.cafe ?? []), ...(d?.web ?? [])]) {
    if (r.url && r.title) titleByUrl.set(r.url, r.title);
  }
  const rawReviews = [...(d?.reviews ?? []), ...(d?.cafe ?? []), ...(d?.web ?? [])].filter((x) => x.url && x.title && !seenUrl.has(x.url) && seenUrl.add(x.url));
  const photos = snsImages(d);
  const photoByUrl = new Map(photos.map((x) => [x.url, x]));
  const photoReviews = photos.filter((x) => x.url && !seenUrl.has(x.url) && seenUrl.add(x.url)).map((x, i) => {
    const fallbackTitle = campName ? `${campName} 캠퍼 사진 후기` : `캠퍼 사진 후기`;
    const resolvedTitle = x.title || titleByUrl.get(x.url) || fallbackTitle;
    return {
      url: x.url,
      title: resolvedTitle,
      date: x.date,
      src: x.src || "캠퍼 사진",
      thumb: mediaSmall(x),
      img: mediaFull(x),
      isPhoto: true,
    };
  });
  const allItems = [...rawReviews, ...photoReviews].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  if (!allItems.length) {
    return `<section class="d-sec" id="sec-reviews"><div class="sec-head">${iconTitle("file-text", "방문후기")}<span class="sec-note">실시간 검색 연동</span></div>
      ${catChips}
      <p class="review-empty-note">연동된 본문 후기가 적은 곳입니다. 위 공식 검색 채널에서 최신 방문자 후기를 바로 확인하세요.</p>
    </section>`;
  }

  const campShot = photosOf(c)[0] ? photoUrl(photosOf(c)[0]) : "";
  const cards = allItems.map((x, i) => {
    const pk = sourcePlatformKey(x);
    const platformLabel = sourcePlatformLabel(x);
    const fact = sourceFact(x, platformLabel, [x.title, x.snippet].filter(Boolean).join("\n"));
    const summary = reviewSummary(x.snippet);
    const host = (() => { try { return new URL(x.url).hostname; } catch { return ""; } })();
    const fav = host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : "";
    const matchedPhoto = photoByUrl.get(x.url);
    const thumb = (matchedPhoto && mediaSmall(matchedPhoto)) || (x.thumb) || (canPreviewExternalMedia(x) && externalImage(x)) || apiThumb(x) || fav || campShot;
    const media = `<div class="media-card-photo">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(campShot || fav)}'">` : ic("file-text")}</div>`;
    const dateStr = formatKoreanDate(x.date);
    const relStr = formatRelativeDate(x.date);
    const dateHtml = dateStr ? `<span class="media-card-date"><span>${esc(dateStr)}</span>${relStr ? `<small class="date-rel">${esc(relStr)}</small>` : ""}</span>` : "";
    return `<article class="review-link-card media-card"><a href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="${platformLabel} 후기 ${i + 1} 원문 열기">${media}<div class="media-card-body"><span class="media-card-source">${platIc(pk)}<span>${esc(platformLabel)}</span></span><b>${esc(serviceText(x.title, 54) || `방문 후기 ${i + 1}`)}</b>${summary ? `<em>${esc(summary)}</em>` : ""}${dateHtml}</div></a>${srcTip(fact, `${platformLabel} 후기 ${i + 1}`)}</article>`;
  }).join("");

  return `<section class="d-sec" id="sec-reviews"><div class="sec-head">${iconTitle("file-text", "방문후기")}<span class="sec-note">후기 ${allItems.length}건</span></div>
    ${catChips}
    <div class="review-links" data-cgrid>${cards}</div>
  </section>`;
}
// 고캠핑 등록 부가값(c.gx)·공공 우수야영장(c.best). 값이 없으면 줄을 만들지 않는다(0·미입력은 "없음"이 아니다).
const BEST_LABEL = { ECO: "친환경", FAMILY: "가족친화", ACCESSIBLE: "교통약자 배려", PET: "반려동물 친화" };
function registryRows(c) {
  const g = c.gx ?? {}, sf = g.sf ?? [];
  const safety = [["소화기", sf[0]], ["방화수", sf[1]], ["방화사", sf[2]], ["화재감지기", sf[3]]].filter(([, n]) => n > 0).map(([l, n]) => `${l} ${n}`);
  const manage = [g.staff ? `상주 ${g.staff}명` : null, g.org].filter(Boolean);
  const best = (c.best ?? []).map(([y, f]) => `${y} ${BEST_LABEL[f] ?? f}`);
  return [
    ["우수야영장", best.length ? `${esc(best.join(" · "))} <span class="muted">공공 선정</span>` : null],
    ["안전시설", safety.length ? esc(safety.join(" · ")) : null],
    ["보험", g.ins ? "영업배상책임보험 가입" : null],
    ["관리", manage.length ? esc(manage.join(" · ")) : null],
    ["사이트 간격", g.gap ? `${esc(g.gap)}m` : null],
    ["휴장", g.cl ? esc(`${g.cl[0] ?? ""} ~ ${g.cl[1] ?? ""}`) : null],
    ["인허가일", g.lic ? esc(g.lic) : null],
  ];
}
// 전화번호 표기: 앞뒤 하이픈·공백을 정리한다(“1522-1861-” → “1522-1861”).
const telText = (t) => String(t ?? "").trim().replace(/^[-\s]+|[-\s]+$/g, "").replace(/\s*-\s*/g, "-").replace(/-{2,}/g, "-");
function infoHtml(c) {
  const name = encodeURIComponent(nameOf(c).name);
  const map = c.lat ? `https://map.kakao.com/link/map/${name},${c.lat},${c.lng}` : null;
  const to = c.lat ? `https://map.kakao.com/link/to/${name},${c.lat},${c.lng}` : null;
  const rv = c.lat ? `https://map.kakao.com/link/roadview/${c.lat},${c.lng}` : null;
  const addressActions = map ? `<span class="addr-actions"><a href="${map}" target="_blank" rel="noopener">${ic("map")}지도</a><a href="${to}" target="_blank" rel="noopener">${ic("pin")}길찾기</a><a href="${rv}" target="_blank" rel="noopener">${ic("roadview")}로드뷰</a></span>` : "";
  const gcSrc = (field, quote) => ({ g: "c", src: { label: "한국관광공사 고캠핑 등록 현황", url: c.gc_url, quote: quote ? String(quote) : null } });
  const rows = [
    ["주소", c.addr ? `<span class="address-value">${esc(c.addr)}${addressActions}</span>` : null, gcSrc("주소", c.addr)],
    ["전화", telText(c.tel) ? `<a href="tel:${esc(telText(c.tel).replace(/[^\d+]/g, ""))}">${esc(telText(c.tel))}</a>` : null, gcSrc("전화", c.tel)],
    ["홈페이지", c.homepage && !c.dl?.includes(c.homepage) ? `<a href="${esc(c.homepage)}" target="_blank" rel="noopener">${esc(hostOf(c.homepage) || c.homepage)}</a>` : null, { g: "c", src: { label: "공식 홈페이지", url: c.homepage } }],
    // 운영 기간(계절)은 ‘이용 정보’에 있으므로 여기서는 운영 주체·요일만 둔다.
    ["운영", [OP[c.op], (c.days ?? [])[0]].filter(Boolean).map(esc).join(" · ") || null, gcSrc("운영 정보")],
    ...registryRows(c),
  ].filter(([, v]) => v);
  const savedMapH = Number(store.get("mc-detail-map-h", 280));
  const detailMapHeight = Number.isFinite(savedMapH) && savedMapH >= 160 && savedMapH <= 800 ? savedMapH : 280;
  return `<section class="d-sec info-sec" id="sec-info"><div class="sec-head">${iconTitle("info", "업체 정보")}${c.gc_url ? `<a class="link" href="${esc(c.gc_url)}" target="_blank" rel="noopener">고캠핑 ${ic("right")}</a>` : ""}</div>
    ${c.lat && c.lng ? `
    <div class="detail-map-box" id="detail-map-box">
      <div class="detail-map" id="detail-map" style="height:${detailMapHeight}px;" data-lat="${c.lat}" data-lng="${c.lng}"></div>
      <div class="detail-map-handle" id="detail-map-handle" role="separator" aria-orientation="horizontal" aria-label="지도 크기 조절" tabindex="0" title="드래그하여 지도 높이 조절">
        <span class="handle-bar"></span>
      </div>
    </div>` : ""}
    <dl class="uses info">${rows.map(([l, v, src]) => `<div class="use"><dt>${l}</dt><dd><span class="use-val">${v}</span>${src ? `<span class="use-meta">${dot(src.g)}${srcTip(src, l)}</span>` : ""}</dd></div>`).join("")}</dl>
  </section>`;
}
// 비회원 한마디(Supabase campground_comment). 비밀번호 열은 읽지 않는다 — 지우기는 이 브라우저에서 쓴 글만.
const SB = { url: document.querySelector('meta[name="supabase-url"]')?.content || "", key: document.querySelector('meta[name="supabase-anon-key"]')?.content || "" };
function commentsHtml(c) {
  if (!SB.url || !SB.key) return "";
  return `<section class="d-sec" id="cmt"><div class="sec-head">${iconTitle("heart", "캠퍼 한마디")}<span class="sec-note">로그인 없이</span></div>
    <form class="cmt-form" data-cmt="${esc(c.id)}"><input name="nickname" maxlength="20" placeholder="닉네임" required aria-label="닉네임"><textarea name="content" maxlength="500" rows="2" placeholder="다녀온 소식, 현장 팁" required aria-label="내용"></textarea><button class="btn primary" type="submit">남기기</button></form>
    <ul class="cmts" data-cmts><li class="muted">불러오는 중…</li></ul></section>`;
}
async function loadComments(id) {
  const box = $("[data-cmts]");
  if (!box) return;
  try {
    const r = await fetch(`${SB.url}/rest/v1/campground_comment?select=id,nickname,content,created_at&campground_id=eq.${encodeURIComponent(id)}&is_deleted=eq.false&order=created_at.desc&limit=30`, { headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}` } });
    const list = r.ok ? await r.json() : [];
    const mine = store.get("mc-my-comments", []);
    box.innerHTML = list.length ? list.map((x) => `<li><b>${esc(x.nickname)}</b><i>${esc(formatKoreanDate(x.created_at))}</i>${mine.includes(String(x.id)) ? `<button type="button" class="link" data-cmt-del="${esc(x.id)}">지우기</button>` : ""}<p>${esc(x.content)}</p></li>`).join("") : `<li class="muted">첫 한마디를 남겨 주세요.</li>`;
  } catch { box.innerHTML = `<li class="muted">지금은 불러오지 못했어요.</li>`; }
}
// ── 주간 날씨 예보 & 일자별 상세 모달 (모여라 캘린더 동일 구조) ──────
const WEATHER_CACHE = new Map();

function getWeatherDescription(code) {
  const c = Number(code);
  if (c === 0) return "맑음";
  if (c === 1) return "대체로 맑음";
  if (c === 2) return "구름 조금";
  if (c === 3) return "흐림";
  if ([45, 48].includes(c)) return "안개";
  if ([51, 53, 55].includes(c)) return "이슬비";
  if ([56, 57].includes(c)) return "어는 이슬비";
  if (c === 61) return "약한 비";
  if (c === 63) return "비";
  if (c === 65) return "강한 비";
  if ([66, 67].includes(c)) return "어는 비";
  if ([71, 73, 75].includes(c)) return "눈";
  if (c === 77) return "싸락눈";
  if ([80, 81, 82].includes(c)) return "소나기";
  if ([85, 86].includes(c)) return "눈보라/소낙눈";
  if (c === 95) return "뇌우";
  if ([96, 99].includes(c)) return "우박을 동반한 뇌우";
  return "맑음";
}

function weatherIconSvg(sky, pty, size = 26) {
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

function getWeatherIconSvg(code, size = 24) {
  const c = Number(code);
  if (c === 0) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-sun" aria-hidden="true"><circle class="w-sun-core" cx="12" cy="12" r="4.2"/><g class="w-sun-rays"><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="6.7" y2="6.7"/><line x1="17.3" y1="17.3" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="6.7" y2="17.3"/><line x1="17.3" y1="6.7" x2="19.07" y2="4.93"/></g></svg>`;
  }
  if ([1, 2].includes(c)) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-sun-cloud" aria-hidden="true"><g class="w-sun-peeking"><circle cx="16.5" cy="7.5" r="3"/><line x1="16.5" y1="2.5" x2="16.5" y2="3.8"/><line x1="20.5" y1="5.5" x2="21.7" y2="5"/><line x1="20.5" y1="9.5" x2="21.7" y2="10"/><line x1="13.5" y1="3.5" x2="12.5" y2="2.7"/></g><path class="w-cloud-body" d="M6.5 19a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 16.5 12a4 4 0 0 1 2 7.45H6.5z"/></svg>`;
  }
  if (c === 3) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-cloud" aria-hidden="true"><path class="w-cloud-body" d="M7 18a4.6 4.4 0 0 1 0-9h.1a5 4.5 0 0 1 11 2h.9a4 3.5 0 0 1 0 7h-12z"/></svg>`;
  }
  if ([45, 48].includes(c)) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-mist" aria-hidden="true"><line class="w-mist-line m1" x1="4" y1="7" x2="20" y2="7"/><line class="w-mist-line m2" x1="6" y1="11" x2="18" y2="11"/><line class="w-mist-line m3" x1="3" y1="15" x2="21" y2="15"/><line class="w-mist-line m4" x1="7" y1="19" x2="17" y2="19"/></svg>`;
  }
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(c)) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-rain" aria-hidden="true"><path class="w-cloud-body" d="M7 14a4.6 4.4 0 0 1 0-9h.1a5 4.5 0 0 1 11 2h.9a4 3.5 0 0 1 0 7h-12z"/><g class="w-rain-drops"><line class="w-drop d1" x1="8" y1="16.5" x2="7" y2="19.5"/><line class="w-drop d2" x1="12" y1="16.5" x2="11" y2="19.5"/><line class="w-drop d3" x1="16" y1="16.5" x2="15" y2="19.5"/></g></svg>`;
  }
  if ([71, 73, 75, 77, 85, 86].includes(c)) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-snow" aria-hidden="true"><path class="w-cloud-body" d="M7 14a4.6 4.4 0 0 1 0-9h.1a5 4.5 0 0 1 11 2h.9a4 3.5 0 0 1 0 7h-12z"/><g class="w-snow-flakes"><circle class="w-flake f1" cx="8" cy="18" r="1.3" fill="currentColor"/><circle class="w-flake f2" cx="12" cy="19" r="1.3" fill="currentColor"/><circle class="w-flake f3" cx="16" cy="18" r="1.3" fill="currentColor"/></g></svg>`;
  }
  if ([95, 96, 99].includes(c)) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-lightning" aria-hidden="true"><path class="w-cloud-body" d="M7 14a4.6 4.4 0 0 1 0-9h.1a5 4.5 0 0 1 11 2h.9a4 3.5 0 0 1 0 7h-12z"/><polygon class="w-bolt" points="13 13 10 17 13 17 11 22 16 16 13 16 14 13" fill="currentColor" stroke="none"/></svg>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-icon w-sun" aria-hidden="true"><circle class="w-sun-core" cx="12" cy="12" r="4.2"/><g class="w-sun-rays"><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="6.7" y2="6.7"/><line x1="17.3" y1="17.3" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="6.7" y2="17.3"/><line x1="17.3" y1="6.7" x2="19.07" y2="4.93"/></g></svg>`;
}

// 상세 ‘주간 날씨’ 칸(conditions/card.js)과 같은 기호를 쓴다(팝업·페이지 통일).
function weatherEmoji(code) {
  return getWeatherIconSvg(code, 26);
}
// 페이지 ‘주간 날씨’ 칸(기상청 단기·중기예보)의 날짜별 값. 팝업의 날짜 칸·하루 요약은 이 값을 먼저 쓴다(같은 날 숫자가 다르지 않게).
function pageForecast() {
  const out = {};
  for (const b of $$("[data-fc-date]")) {
    const n = (v) => (v === "" || v == null ? null : Number(v));
    out[b.dataset.fcDate] = { rel: b.dataset.fcRel, sky: b.dataset.fcSky, pty: b.dataset.fcPty, desc: b.dataset.fcDesc, tmin: n(b.dataset.fcTmin), tmax: n(b.dataset.fcTmax), pop: n(b.dataset.fcPop), src: b.dataset.fcSrc };
  }
  return out;
}
function getAirQualityGrade(type, val) {
  if (val == null || Number.isNaN(Number(val))) return { text: "보통", color: "#10B981" };
  const v = Number(val);
  if (type === "pm10") {
    if (v <= 30) return { text: "좋음", color: "#3B82F6" };
    if (v <= 80) return { text: "보통", color: "#10B981" };
    if (v <= 150) return { text: "나쁨", color: "#F59E0B" };
    return { text: "매우나쁨", color: "#EF4444" };
  }
  if (v <= 15) return { text: "좋음", color: "#3B82F6" };
  if (v <= 35) return { text: "보통", color: "#10B981" };
  if (v <= 75) return { text: "나쁨", color: "#F59E0B" };
  return { text: "매우나쁨", color: "#EF4444" };
}

function getUvText(uv) {
  if (uv == null) return "보통";
  const u = Number(uv);
  if (u <= 2) return `낮음 (${u})`;
  if (u <= 5) return `보통 (${u})`;
  if (u <= 7) return `높음 (${u})`;
  if (u <= 10) return `매우높음 (${u})`;
  return `위험 (${u})`;
}

async function fetchCampWeather(lat, lon) {
  const key = `${Number(lat).toFixed(3)}_${Number(lon).toFixed(3)}`;
  if (WEATHER_CACHE.has(key)) {
    const entry = WEATHER_CACHE.get(key);
    if (Date.now() - entry.time < 3600000) return entry.data;
  }
  const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${Number(lat).toFixed(3)}&longitude=${Number(lon).toFixed(3)}&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,uv_index&timezone=Asia%2FSeoul&past_days=1&forecast_days=10`;
  const aUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${Number(lat).toFixed(3)}&longitude=${Number(lon).toFixed(3)}&hourly=pm10,pm2_5,european_aqi&timezone=Asia%2FSeoul&past_days=1&forecast_days=7`;

  try {
    const [fRes, aRes] = await Promise.all([
      fetch(fUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(aUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (!fRes || !fRes.daily) return null;

    const dailyMap = {};
    const daysList = [];
    (fRes.daily.time || []).forEach((t, i) => {
      const dayItem = {
        dateStr: t,
        code: fRes.daily.weather_code?.[i] ?? 0,
        max: Math.round(fRes.daily.temperature_2m_max?.[i] ?? 0),
        min: Math.round(fRes.daily.temperature_2m_min?.[i] ?? 0),
        apparentMax: Math.round(fRes.daily.apparent_temperature_max?.[i] ?? 0),
        apparentMin: Math.round(fRes.daily.apparent_temperature_min?.[i] ?? 0),
        precipSum: Math.round((fRes.daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
        precipProb: Math.round(fRes.daily.precipitation_probability_max?.[i] ?? 0),
        windSpeed: Math.round(((fRes.daily.wind_speed_10m_max?.[i] ?? 0) / 3.6) * 10) / 10,
        uv: Math.round(fRes.daily.uv_index_max?.[i] ?? 0),
      };
      dailyMap[t] = dayItem;
      daysList.push(dayItem);
    });

    const hourlyMap = {};
    if (fRes.hourly && Array.isArray(fRes.hourly.time)) {
      fRes.hourly.time.forEach((iso, idx) => {
        const dStr = iso.slice(0, 10);
        if (!hourlyMap[dStr]) hourlyMap[dStr] = [];
        const rawWind = fRes.hourly.wind_speed_10m?.[idx];
        hourlyMap[dStr].push({
          time: iso.slice(11, 16),
          iso,
          temp: Math.round(fRes.hourly.temperature_2m?.[idx] ?? 0),
          apparent: Math.round(fRes.hourly.apparent_temperature?.[idx] ?? 0),
          humidity: Math.round(fRes.hourly.relative_humidity_2m?.[idx] ?? 0),
          precipProb: Math.round(fRes.hourly.precipitation_probability?.[idx] ?? 0),
          precip: Math.round((fRes.hourly.precipitation?.[idx] ?? 0) * 10) / 10,
          code: fRes.hourly.weather_code?.[idx] ?? 0,
          windSpeed: rawWind != null ? Math.round((rawWind / 3.6) * 10) / 10 : null,
          uv: fRes.hourly.uv_index?.[idx] != null ? Math.round(fRes.hourly.uv_index[idx]) : null,
          pm10: null,
          pm2_5: null,
        });
      });
    }

    const airMap = {};
    if (aRes?.hourly?.time) {
      const pm10ByDay = {}, pm25ByDay = {};
      const hourByIso = {};
      Object.values(hourlyMap).forEach((list) => list.forEach((h) => { hourByIso[h.iso] = h; }));

      aRes.hourly.time.forEach((iso, idx) => {
        const dStr = iso.slice(0, 10);
        if (!pm10ByDay[dStr]) pm10ByDay[dStr] = [];
        if (!pm25ByDay[dStr]) pm25ByDay[dStr] = [];
        const v10 = aRes.hourly.pm10?.[idx];
        const v25 = aRes.hourly.pm2_5?.[idx];
        if (v10 != null && !Number.isNaN(v10)) {
          pm10ByDay[dStr].push(v10);
          if (hourByIso[iso]) hourByIso[iso].pm10 = Math.round(v10);
        }
        if (v25 != null && !Number.isNaN(v25)) {
          pm25ByDay[dStr].push(v25);
          if (hourByIso[iso]) hourByIso[iso].pm2_5 = Math.round(v25);
        }
      });

      Object.keys(pm10ByDay).forEach((dStr) => {
        const v10 = pm10ByDay[dStr], v25 = pm25ByDay[dStr] || [];
        const avg10 = v10.length ? Math.round(v10.reduce((a, b) => a + b, 0) / v10.length) : null;
        const avg25 = v25.length ? Math.round(v25.reduce((a, b) => a + b, 0) / v25.length) : null;
        airMap[dStr] = {
          pm10: avg10,
          pm2_5: avg25,
          grade10: getAirQualityGrade("pm10", avg10),
          grade25: getAirQualityGrade("pm2_5", avg25),
        };
      });
    }

    const compiled = { daily: dailyMap, days: daysList, hourly: hourlyMap, air: airMap };
    WEATHER_CACHE.set(key, { time: Date.now(), data: compiled });
    return compiled;
  } catch (err) {
    console.warn("Weather fetch error", err);
    return null;
  }
}

function parseKstDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const diffTime = date.getTime() - new Date(todayStr).getTime();
  const diffDays = Math.round(diffTime / 86400000);
  const dayName = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  let rel = `${m}.${d}`;
  if (diffDays === -1) rel = "어제";
  else if (diffDays === 0) rel = "오늘";
  else if (diffDays === 1) rel = "내일";
  else if (diffDays === 2) rel = "모레";
  return { rel, dayName, diffDays, fullDate: `${String(y).slice(2)}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")} (${dayName})`, tabLabel: diffDays === 0 ? `오늘(${dayName})` : `${m}.${d}(${dayName})` };
}

function weatherSectionHtml(c) {
  if (!c.lat || !c.lng) return "";
  return `<section class="d-sec weather-sec" id="sec-weather">
    <div class="sec-head">
      ${iconTitle("cloud", "주간 날씨 예보")}
      <span class="sec-note">현장 좌표 실시간 예보 · 일자별 날씨 클릭 시 상세</span>
    </div>
    <div class="weather-hero-card" id="weather-hero-card">
      <div class="weather-hero-head">
        <span>📍 ${esc(c.name)} 현장 날씨</span>
        <span>Open-Meteo 실시간 연동</span>
      </div>
      <div class="weather-hero-days" id="weather-hero-days">
        <div style="padding: 10px 0; font-size: 0.85rem; opacity: 0.8;">날씨 정보를 실시간으로 불러오는 중…</div>
      </div>
    </div>
  </section>`;
}

async function initCampWeather(c) {
  const container = $("#weather-hero-days");
  if (!container || !c?.lat || !c?.lng) return;
  const data = await fetchCampWeather(c.lat, c.lng);
  if (!data || !data.days?.length) {
    container.innerHTML = `<div style="padding: 10px 0; font-size: 0.85rem; opacity: 0.8;">현재 날씨 정보를 불러올 수 없습니다.</div>`;
    return;
  }
  container.innerHTML = data.days.map((d) => {
    const meta = parseKstDate(d.dateStr);
    const isToday = meta.diffDays === 0;
    return `<button type="button" class="w-day-pill${isToday ? " is-today" : ""}" data-wdate="${esc(d.dateStr)}" title="${meta.fullDate} 날씨 상세 보기">
      <span class="w-rel">${meta.rel}</span>
      <span class="w-icon-wrap">${getWeatherIconSvg(d.code, 20)}</span>
      <span class="w-temp">${d.max}°</span>
    </button>`;
  }).join("");

  container.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-wdate]");
    if (!btn) return;
    openWeatherModal(c, btn.dataset.wdate, data);
  });
}

function renderHourlyTimeline(hourlyList, tab, isToday, nowHour) {
  const colWidth = 52;
  const totalWidth = hourlyList.length * colWidth;

  if (tab === "weather") {
    const temps = hourlyList.map((h) => h.temp);
    const minT = Math.min(...temps);
    const maxT = Math.max(...temps);
    const spanT = Math.max(2, maxT - minT);
    const chartHeight = 58;

    const points = hourlyList.map((h, idx) => {
      const x = idx * colWidth + colWidth / 2;
      const y = 18 + ((maxT - h.temp) / spanT) * (chartHeight - 26);
      return { x, y, temp: h.temp, code: h.code, time: h.time };
    });

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    return `<div style="display:flex; flex-direction:column; min-width:${totalWidth}px;">
      <svg width="${totalWidth}" height="${chartHeight}" style="overflow:visible; display:block;">
        <path d="${pathD}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        ${points.map((p) => `
          <circle cx="${p.x}" cy="${p.y}" r="3" fill="currentColor"/>
          <text x="${p.x}" y="${p.y - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink)">${p.temp}°</text>
        `).join("")}
      </svg>
      <div class="w-hourly-bottom-row">
        ${hourlyList.map((h) => {
          const hourNum = parseInt(h.time.split(":")[0], 10);
          const isNow = isToday && hourNum === nowHour;
          return `<div class="w-hourly-col${isNow ? " is-now" : ""}">
            <div style="height:20px; display:flex; align-items:center; justify-content:center; font-size:15px;">${weatherEmoji(h.code)}</div>
            <span class="w-hour-label">${hourNum}시</span>
          </div>`;
        }).join("")}
      </div>
    </div>`;
  }

  return `<div style="display:flex; min-width:${totalWidth}px;">
    ${hourlyList.map((h) => {
      const hourNum = parseInt(h.time.split(":")[0], 10);
      const isNow = isToday && hourNum === nowHour;
      let valText = "";
      if (tab === "precip") valText = `${h.precip}mm\n(${h.precipProb}%)`;
      else if (tab === "wind") valText = `${h.windSpeed ?? "-"}m/s`;
      else if (tab === "humidity") valText = `${h.humidity}%`;
      else if (tab === "air") valText = h.pm10 ? `${h.pm10}/${h.pm2_5}` : "-";
      else if (tab === "uv") valText = h.uv != null ? `${h.uv}` : "-";

      return `<div class="w-hourly-col${isNow ? " is-now" : ""}">
        <span class="w-hourly-val" style="white-space:pre-line; height:32px; display:flex; align-items:center; justify-content:center;">${valText}</span>
        <span class="w-hour-label">${hourNum}시</span>
      </div>`;
    }).join("")}
  </div>`;
}

function openWeatherModal(c, initialDate, data) {
  let selectedDate = initialDate;
  let currentTab = "weather";

  const dlg = document.createElement("dialog");
  dlg.className = "weather-modal";

  const kma = pageForecast();
  const stripDays = Object.keys(kma).length ? Object.keys(kma).sort() : data.days.map((d) => d.dateStr);
  function render() {
    const dayItem = data.daily[selectedDate] || data.days[0];
    const k = kma[selectedDate];
    const dateMeta = parseKstDate(selectedDate);
    const air = data.air[selectedDate];
    const hourlyList = data.hourly[selectedDate] || [];

    const nowHour = new Date().getHours();
    const isToday = dateMeta.diffDays === 0;

    dlg.innerHTML = `
      <div class="w-modal-drag"></div>
      <div class="w-modal-header">
        <div class="w-modal-date-badge">
          ${dateMeta.diffDays === 0 ? `<span class="w-badge-tag">오늘</span>` : dateMeta.diffDays === 1 ? `<span class="w-badge-tag">내일</span>` : ""}
          <span>${dateMeta.fullDate}</span>
        </div>
        <button type="button" class="w-modal-close" aria-label="닫기">${ic("close")}</button>
      </div>
      <div class="fc-strip w-modal-days-strip">
        ${stripDays.map((ds) => {
          const m = parseKstDate(ds), kd = kma[ds], od = data.daily[ds];
          const temp = kd?.tmax ?? od?.max;
          const icon = kd?.sky || kd?.pty ? weatherIconSvg(kd.sky, kd.pty, 24) : (od ? getWeatherIconSvg(od.code, 24) : "");
          return `<button type="button" class="fc-day${ds === selectedDate ? " is-active" : ""}" data-switch-date="${esc(ds)}"><span class="lbl">${esc(kd?.rel ?? m.tabLabel)}</span><span class="ic">${icon}</span><span class="t">${temp != null ? `${temp}°` : "–"}</span></button>`;
        }).join("")}
      </div>
      <div class="w-modal-body">
        <div class="w-highlight-card">
          <div class="w-highlight-top">
            <span class="w-highlight-desc">${esc(k?.desc || getWeatherDescription(dayItem.code))}</span>
            <div class="w-highlight-icon">${k?.sky || k?.pty ? weatherIconSvg(k.sky, k.pty, 56) : getWeatherIconSvg(dayItem.code, 56)}</div>
          </div>
          <div class="w-highlight-main">
            <span class="w-highlight-temp">${k?.tmax ?? dayItem.max}</span>
            <span class="w-highlight-unit">°</span>
          </div>
          <div class="w-highlight-sub">
            ${k ? `최고 ${k.tmax ?? "–"}° / 최저 ${k.tmin ?? "–"}°${k.pop != null ? ` · 강수확률 ${k.pop}%` : ""} · 기상청 ${k.src === "mid" ? "중기" : "단기"}예보` : `체감 ${dayItem.apparentMax}° · 최고 ${dayItem.max}° / 최저 ${dayItem.min}°`}
          </div>
          <div class="w-highlight-loc">
            ${ic("pin")}<span>${esc(c.sigungu || c.sido || "")} · ${esc(c.name)}</span>
          </div>
        </div>

        <div class="w-metrics-grid">
          <div class="w-metric-card">
            <div class="w-metric-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 18a4.6 4.4 0 0 1 0-9h.1a5 4.5 0 0 1 11 2h.9a4 3.5 0 0 1 0 7h-12M8 22l-.5-1.5M12 22l-.5-1.5M16 22l-.5-1.5"/></svg>
              <span>강수량 및 확률</span>
            </div>
            <div class="w-metric-val">
              <span>${dayItem.precipSum} mm</span>
              <span class="w-prob">(확률 ${k?.pop ?? dayItem.precipProb}%)</span>
            </div>
          </div>

          <div class="w-metric-card">
            <div class="w-metric-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l8-4v18M19 21v-8l-6-4M9 9h1M9 13h1M9 17h1"/></svg>
              <span>대기질 (미세먼지)</span>
            </div>
            ${air ? `
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <div class="w-air-row">
                  <span style="color: #64748b;">미세 ${air.pm10 ?? "-"}µg</span>
                  <span class="w-badge-grade" style="color:${air.grade10.color}; background:${air.grade10.color}20;">${air.grade10.text}</span>
                </div>
                <div class="w-air-row">
                  <span style="color: #64748b;">초미세 ${air.pm2_5 ?? "-"}µg</span>
                  <span class="w-badge-grade" style="color:${air.grade25.color}; background:${air.grade25.color}20;">${air.grade25.text}</span>
                </div>
              </div>
            ` : `<div class="w-metric-val" style="font-size: 0.9rem; color: #10B981;">보통 / 쾌적</div>`}
          </div>

          <div class="w-metric-card">
            <div class="w-metric-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8h8.5a2.5 2.5 0 1 0-2.34-3.24M3 12h15.5a2.5 2.5 0 1 1-2.34 3.24M4 16h5.5a2.5 2.5 0 1 1-2.34 3.24"/></svg>
              <span>최대 풍속</span>
            </div>
            <div class="w-metric-val">${dayItem.windSpeed ? `${dayItem.windSpeed} m/s` : "산들바람"}</div>
          </div>

          <div class="w-metric-card">
            <div class="w-metric-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
              <span>자외선 지수</span>
            </div>
            <div class="w-metric-val">${getUvText(dayItem.uv)}</div>
          </div>
        </div>

        ${hourlyList.length ? `
          <div class="w-hourly-sec">
            <div class="w-hourly-title">시간별 예보 <span>Open-Meteo 모델 · 참고용</span></div>
            <div class="w-hourly-tabs">
              ${[
                ["weather", "날씨"],
                ["precip", "강수"],
                ["wind", "바람"],
                ["humidity", "습도"],
                ["air", "대기"],
                ["uv", "자외선"]
              ].map(([k, lbl]) => `<button type="button" class="w-hourly-tab-btn${currentTab === k ? " is-active" : ""}" data-hourly-tab="${k}">${lbl}</button>`).join("")}
            </div>
            <div class="w-hourly-timeline">
              ${renderHourlyTimeline(hourlyList, currentTab, isToday, nowHour)}
            </div>
          </div>
        ` : ""}
      </div>
      <div class="w-modal-footer">
        <a class="w-btn-windy" href="https://www.windy.com/?${Number(c.lat).toFixed(4)},${Number(c.lng).toFixed(4)},9" target="_blank" rel="noopener">
          ${ic("map")}Windy 레이더
        </a>
        <button type="button" class="btn primary w-btn-close">닫기</button>
      </div>
    `;

    // 고른 날짜 칸이 보이게 가로 위치를 맞춘다(모바일에서 10/24가 화면 밖에 있던 문제).
    centerDay();
    // Event listeners
    $(".w-modal-close", dlg).onclick = () => dlg.close();
    $(".w-btn-close", dlg).onclick = () => dlg.close();
    $$("[data-switch-date]", dlg).forEach((btn) => {
      btn.onclick = () => {
        selectedDate = btn.dataset.switchDate;
        render();
      };
    });
    $$("[data-hourly-tab]", dlg).forEach((btn) => {
      btn.onclick = () => {
        currentTab = btn.dataset.hourlyTab;
        render();
      };
    });

    // Drag-to-scroll timeline
    const timeline = $(".w-hourly-timeline", dlg);
    if (timeline) {
      let isDown = false, startX = 0, scrollLeft = 0;
      timeline.addEventListener("pointerdown", (e) => {
        isDown = true;
        startX = e.pageX - timeline.offsetLeft;
        scrollLeft = timeline.scrollLeft;
        try { timeline.setPointerCapture?.(e.pointerId); } catch (_) {}
      });
      timeline.addEventListener("pointerleave", () => { isDown = false; });
      timeline.addEventListener("pointerup", (e) => {
        isDown = false;
        try { timeline.releasePointerCapture?.(e.pointerId); } catch (_) {}
      });
      timeline.addEventListener("pointermove", (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - timeline.offsetLeft;
        const walk = (x - startX) * 1.5;
        timeline.scrollLeft = scrollLeft - walk;
      });

      if (isToday) {
        requestAnimationFrame(() => {
          const nowCol = $(".w-hourly-col.is-now", dlg);
          if (nowCol) timeline.scrollLeft = Math.max(0, nowCol.offsetLeft - timeline.clientWidth / 2 + nowCol.clientWidth / 2);
        });
      }
    }

    const dayStrip = $(".w-modal-days-strip", dlg);
    if (dayStrip) {
      const activeBtn = $(".w-modal-day-btn.is-active", dlg);
      if (activeBtn) {
        requestAnimationFrame(() => {
          dayStrip.scrollLeft = Math.max(0, activeBtn.offsetLeft - dayStrip.clientWidth / 2 + activeBtn.clientWidth / 2);
        });
      }
    }
  }

  function centerDay() {
    const strip = $(".w-modal-days-strip", dlg), act = $(".fc-day.is-active", dlg);
    if (strip && act) strip.scrollLeft = act.offsetLeft - strip.offsetLeft - (strip.clientWidth - act.offsetWidth) / 2;
  }
  render();
  document.body.append(dlg);
  dlg.showModal();
  centerDay();
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
}

function reserveDock(c) {
  const options = bookingOptions(c);
  const main = options[0] ?? null;
  const label = main ? `${bookingLabel(main)}에서 예약` : "예약하기";
  return `<div class="d-dock-in">${heartBtn(c)}${c.tel && main ? `<a class="btn ghost" href="tel:${esc(c.tel)}" aria-label="전화">${ic("phone")}</a>` : ""}${main ? `<a class="btn primary wide" href="${esc(main.url)}" target="_blank" rel="noopener">${esc(label)}</a>` : c.tel ? `<a class="btn primary wide" href="tel:${esc(c.tel)}">${ic("phone")}전화 문의</a>` : ""}</div>`;
}
// 상세 보조 모듈(/conditions·/context·/operator)은 사이트 루트(/camp/)에 있다.
function bindDetail() {
  hostTips($("#view"));
  if ("MutationObserver" in window) { const mo = new MutationObserver(() => { if ($(".ib[data-tip]", $("#view"))) hostTips($("#view")); }); mo.observe($("#view"), { childList: true, subtree: true }); cleanup.push(() => mo.disconnect()); }
  initCarousels($("#view"));
  const back = $("[data-back]");
  back?.addEventListener("click", (e) => { if (history.length > 1 && S.cameFromApp) { e.preventDefault(); history.back(); } });
  $$(".gal-cell").forEach((b) => b.addEventListener("click", () => openLightbox(S.byId.get($(".detail").dataset.id), Number(b.dataset.gal))));
  // 영상: 누를 때만 YouTube(쿠키 없는 주소) 플레이어를 붙인다.
  $$("[data-yt]").forEach((b) => b.addEventListener("click", () => {
    b.outerHTML = `<div class="vid playing"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?autoplay=1" title="영상" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  }));
  const id = $(".detail")?.dataset.id;
  const currentCamp = S.byId.get(id);
  if (currentCamp?.lat && currentCamp?.lng) {
    const cond = $("[data-cond]");
    cond?.addEventListener("click", async (ev) => {
      const day = ev.target.closest("[data-fc-date]");
      if (!day) return;
      const data = await fetchCampWeather(currentCamp.lat, currentCamp.lng);
      if (data) openWeatherModal(currentCamp, day.dataset.fcDate, data);
    });
  }
  // 이번 주말 컨디션(날씨·일출일몰·달·미세먼지·산불·물때): /conditions/card.js가 있을 때만 붙인다. 실패하면 칸을 숨긴 채 둔다.
  const condEl = $("[data-cond]"), condCamp = S.byId.get(id);
  // 모듈 카드의 제목에도 다른 섹션과 같은 선 아이콘을 붙인다.
  const titleIcon = (el, icon) => { const t = el?.querySelector(".sec-title"); if (t && !t.querySelector("svg")) t.insertAdjacentHTML("afterbegin", ic(icon, "line")); };
  if (condEl && condCamp) import(new URL(`${MOD_ROOT}conditions/card.js`, import.meta.url).href).then((m) => m.mount(condEl, condCamp)).then(() => titleIcon(condEl, "moon")).catch(() => {});
  // 여행 참고 정보(고도·응급실·전기차 충전·주변 축제 등): /context/card.js가 있을 때만. 실패하면 칸을 숨긴 채 둔다.
  const exEl = $("[data-extras]");
  if (condCamp) import(new URL(`${MOD_ROOT}context/card.js`, import.meta.url).href).then((m) => {
    if (exEl) m.mount(exEl, condCamp).then(() => titleIcon(exEl, "route")).catch(() => {});
    m.evFor(id).then(mountNearbyEv).catch(() => {});
  }).catch(() => {});
  // 콘텐츠 카드 격자(후기·사진·영상): 태블릿부터 여러 단 + 더보기. 업장 기본 정보 칸에는 붙이지 않는다.
  import(new URL(`${MOD_ROOT}context/cgrid.js`, import.meta.url).href).then((m) => m.setupAll($(".detail") ?? document)).catch(() => {});
  // 주변 축제·행사 포스터 카드(CultureFlow + 관광공사 축제): /context/events.js가 있을 때만. 실패하면 칸을 숨긴 채 둔다.
  const evSec = $("[data-events]");
  if (evSec && condCamp) import(new URL(`${MOD_ROOT}context/events.js`, import.meta.url).href).then((m) => m.mount(evSec, condCamp)).catch(() => {});
  // 운영자 정보 바로잡기(로그인 없이, Supabase operator_submission에 넣기만): /operator/form.js
  const opEl = $("[data-opform-sec]");
  if (opEl && condCamp && SB.url && SB.key) import(new URL(`${MOD_ROOT}operator/form.js`, import.meta.url).href).then((m) => m.mount(opEl, condCamp, SB)).catch(() => {});
  // ── 시설배치도 라이트박스 열기 (단일/후보 다중) ──
  $$("[data-layout-open]").forEach((b) => b.addEventListener("click", async () => {
    const d = await detailOf(id);
    const allImages = (d?.layout?.images ?? [])
      .filter((x) => x && (x.img || x.thumb))
      .filter((x, i, arr) => arr.findIndex((y) => (y.img || y.thumb) === (x.img || x.thumb)) === i);
    const officialList = allImages.filter(isOfficialLayout);
    const ordered = officialList.length > 0
      ? [officialList[0], ...allImages.filter((x) => x !== officialList[0]).slice(0, 4)]
      : allImages.slice(0, 6);
    const idx = Math.max(0, Math.min(Number(b.dataset.layoutOpen) || 0, ordered.length - 1));
    const urls = ordered.map((x) => x.img || x.thumb);
    const caps = ordered.map((x, i) => {
      if (officialList.length > 0 && i === 0) return "시설 배치도: 고캠핑 등록 원본";
      return `시설 배치도 추정 후보 ${i + 1} (${sourceName(x.src, hostOf(x.url) || "후기 사진")})`;
    });
    if (urls.length) openLightboxUrls(urls, idx, caps);
  }));
  $$("img[data-fb]", $("#view")).forEach((im) => {
    const swap = () => { if (im.dataset.fb && im.src !== im.dataset.fb) { im.src = im.dataset.fb; delete im.dataset.fb; } };
    im.addEventListener("error", swap);
    if (im.complete && !im.naturalWidth) swap();
  });
  // 상세 바로가기: 보이는 칸만 링크를 켜고(축제 칸처럼 늦게 열리는 칸은 열릴 때 켠다), 지금 읽는 칸을 표시한다.
  const jumps = $$("[data-jump]");
  const syncJumps = () => jumps.forEach((a) => { const t = document.getElementById(a.dataset.jump); a.hidden = !t || t.hidden; });
  syncJumps();
  const late = jumps.map((a) => document.getElementById(a.dataset.jump)).filter(Boolean);
  if (late.length) {
    const mo = new MutationObserver(syncJumps);
    late.forEach((t) => mo.observe(t, { attributes: true, attributeFilter: ["hidden"] }));
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) jumps.forEach((a) => a.toggleAttribute("aria-current", a.dataset.jump === e.target.id)); }), { rootMargin: "-30% 0px -60% 0px" });
      late.forEach((t) => io.observe(t));
    }
  }
  $(".d-jump")?.addEventListener("click", (e) => {
    const a = e.target.closest("[data-jump]");
    if (!a) return;
    e.preventDefault();
    const t = document.getElementById(a.dataset.jump);
    t?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    t?.setAttribute("tabindex", "-1"); t?.focus({ preventScroll: true });
  });
  // 관련 영상 · SNS 칩: 이 자리 목록 전환(바깥 플랫폼 칩은 링크라 그대로 새 탭)
  $(".media-hub")?.addEventListener("click", (e) => {
    const t = e.target.closest("[data-mh-tab]");
    if (!t) return;
    $$(".media-hub [data-mh-tab]").forEach((b) => b.setAttribute("aria-selected", String(b === t)));
    $$(".media-hub [role='tabpanel']").forEach((p) => { p.hidden = p.id !== t.getAttribute("aria-controls"); });
  });
  $(".nearby-hub")?.addEventListener("click", (e) => {
    const t = e.target.closest("[data-nb-tab]");
    if (!t) return;
    $$("[data-nb-tab]").forEach((b) => b.setAttribute("aria-selected", String(b === t)));
    $$(".nearby-hub [role='tabpanel']").forEach((p) => { p.hidden = p.id !== t.getAttribute("aria-controls"); });
  });
  $(".nearby-hub [role='tablist']")?.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const tabs = $$("[data-nb-tab]:not([hidden])"), i = tabs.indexOf(document.activeElement);
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    n?.focus(); n?.click();
  });
  $$("[data-media-lb]").forEach((b) => b.addEventListener("click", async () => {
    const d = await detailOf(id), kind = b.dataset.mediaLb;
    const list = kind === "layout" ? layoutImages(d) : snsImages(d);
    const label = kind === "layout" ? "시설 배치도" : "캠퍼 사진";
    openLightboxUrls(list.map((x) => ({ src: mediaFull(x), fb: mediaSmall(x), link: x.url, cap: `${label} · ${sourceName(x.src, hostOf(x.url) || "원문")}` })), Number(b.dataset.index) || 0, label);
  }));
  $$('[data-external-media="sns"]').forEach((b) => b.addEventListener("click", async () => {
    const d = await detailOf(id);
    const rows = (d?.sns_images ?? []).filter((x) => x?.url && canPreviewExternalMedia(x) && externalImage(x));
    const idx = Math.min(Number(b.dataset.index) || 0, Math.max(0, rows.length - 1));
    if (rows.length) openLightboxUrls(rows.map(externalImage), idx, "캠퍼 사진 · 원문 제공 이미지");
  }));

  // ── 업체 지도 및 드래그 높이 조절 핸들 ──
  const mapEl = $("#detail-map");
  if (mapEl && currentCamp?.lat && currentCamp?.lng) {
    try {
      const pinHtml = `<div class="detail-map-pin"><span class="pin-icon">${ic("pin")}</span><span class="pin-name">${esc(nameOf(currentCamp).name)}</span></div>`;
      // 카카오 지도 우선, 실패하면 OSM(아래 osmDetail). detailMap은 높이 조절 핸들이 부르는 invalidateSize()만 맞춘다.
      let detailMap = { invalidateSize() {} }, alive = true;
      cleanup.push(() => { alive = false; });
      const osmDetail = () => {
        if (!alive || !window.L) return;
        mapEl.innerHTML = ""; mapEl.dataset.engine = "osm";
        const lm = L.map("detail-map", {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true,
        }).setView([currentCamp.lat, currentCamp.lng], 15);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(lm);
        L.marker([currentCamp.lat, currentCamp.lng], {
          icon: L.divIcon({ className: "detail-map-marker-wrap", html: pinHtml, iconSize: [0, 0], iconAnchor: [0, 0] }),
        }).addTo(lm);
        setTimeout(() => { lm.invalidateSize(); }, 200);
        detailMap = lm;
        cleanup.push(() => { try { lm.remove(); } catch {} });
      };
      loadKakao().then(async (kakao) => {
        if (!alive) return;
        const pos = new kakao.maps.LatLng(currentCamp.lat, currentCamp.lng);
        const km = new kakao.maps.Map(mapEl, { center: pos, level: 4 });
        mapEl.dataset.engine = "kakao";
        km.setZoomable(false); // 페이지 스크롤 중 휠로 확대되지 않게(OSM 때와 같음). 확대는 버튼으로.
        km.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.TOPRIGHT);
        kOverlay(kakao, km, currentCamp.lat, currentCamp.lng, pinHtml);
        detailMap = { invalidateSize() { km.relayout(); km.setCenter(pos); } };
        setTimeout(() => detailMap.invalidateSize(), 200);
        await kakaoTilesOk(kakao, km, mapEl);
      }).catch(osmDetail);

      const handle = $("#detail-map-handle");
      if (handle) {
        let isDragging = false;
        let startY = 0;
        let startH = 0;

        const onPointerDown = (e) => {
          isDragging = true;
          startY = e.clientY;
          startH = mapEl.offsetHeight;
          handle.setPointerCapture(e.pointerId);
          handle.classList.add("dragging");
          document.body.style.userSelect = "none";
          document.body.style.cursor = "ns-resize";
          e.preventDefault();
        };

        const onPointerMove = (e) => {
          if (!isDragging) return;
          const dy = e.clientY - startY;
          const newH = Math.max(160, Math.min(800, Math.round(startH + dy)));
          mapEl.style.height = `${newH}px`;
          detailMap.invalidateSize();
        };

        const onPointerUp = (e) => {
          if (!isDragging) return;
          isDragging = false;
          try { handle.releasePointerCapture(e.pointerId); } catch {}
          handle.classList.remove("dragging");
          document.body.style.userSelect = "";
          document.body.style.cursor = "";
          const finalH = mapEl.offsetHeight;
          store.set("mc-detail-map-h", finalH);
          detailMap.invalidateSize();
        };

        handle.addEventListener("pointerdown", onPointerDown);
        handle.addEventListener("pointermove", onPointerMove);
        handle.addEventListener("pointerup", onPointerUp);
        handle.addEventListener("pointercancel", onPointerUp);

        handle.addEventListener("keydown", (e) => {
          const curH = mapEl.offsetHeight;
          let nextH = curH;
          if (e.key === "ArrowDown") nextH = Math.min(800, curH + 40);
          else if (e.key === "ArrowUp") nextH = Math.max(160, curH - 40);
          else return;
          e.preventDefault();
          mapEl.style.height = `${nextH}px`;
          store.set("mc-detail-map-h", nextH);
          detailMap.invalidateSize();
        });
      }
    } catch (err) {
      console.warn("Detail map error", err);
    }
  }
  if (id && $("[data-cmts]")) loadComments(id);
  $("[data-cmt]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = $("button", f);
    btn.disabled = true;
    try {
      const r = await fetch(`${SB.url}/rest/v1/campground_comment`, { method: "POST", headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ campground_id: f.dataset.cmt, nickname: f.nickname.value.trim(), content: f.content.value.trim(), tag: "general", password_hash: crypto.randomUUID() }) });
      const row = r.ok ? (await r.json())[0] : null;
      if (row?.id) store.set("mc-my-comments", [...store.get("mc-my-comments", []), String(row.id)]);
      f.content.value = "";
      toast(r.ok ? "남겼어요" : "지금은 남기지 못했어요");
    } catch { toast("지금은 남기지 못했어요"); }
    btn.disabled = false;
    loadComments(f.dataset.cmt);
  });
  $("[data-cmts]")?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cmt-del]");
    if (!b) return;
    await fetch(`${SB.url}/rest/v1/campground_comment?id=eq.${encodeURIComponent(b.dataset.cmtDel)}`, { method: "PATCH", headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ is_deleted: true }) }).catch(() => null);
    loadComments(id);
  });
}
function openLightbox(c, start) {
  const base = photosOf(c), have = new Set(base.map(photoName));
  const extra = (S.detailCache.get(c.id)?.gcd?.photos ?? []).filter((u) => !have.has(photoName(u)));
  openLightboxUrls([...base.map(photoHiUrl), ...extra.map((u) => ({ src: u, fb: u.replace(/\/upload\/camp\/(\d+)\/([^/]+)$/, "/upload/camp/$1/thumb/thumb_1000_$2"), cap: "시설 사진: 고캠핑 등록" }))], start, "사진: 한국관광공사 고캠핑");
}
// urls: 주소 문자열 또는 { src, fb(못 불러오면 대신 보일 작은 그림), link(원문), cap(설명) }.
function openLightboxUrls(urls, start = 0, caption = "사진") {
  const ph = urls.filter(Boolean).map((u) => (typeof u === "string" ? { src: u } : u)).filter((u) => u.src || u.fb);
  if (!ph.length) return;
  const dlg = document.createElement("dialog");
  dlg.className = "lightbox";
  dlg.setAttribute("aria-label", caption);
  dlg.innerHTML = `<button class="icon-btn lb-x" aria-label="닫기">${ic("close")}</button>${ph.length > 1 ? `<button class="icon-btn lb-nav lb-prev" aria-label="이전 사진">${ic("left")}</button><button class="icon-btn lb-nav lb-next" aria-label="다음 사진">${ic("right")}</button>` : ""}<div class="lb-track">${ph.map((u, i) => `<img src="${esc(u.src || u.fb)}"${u.fb && u.src ? ` data-fb="${esc(u.fb)}"` : ""} alt="${esc(u.cap || `${caption} ${i + 1}`)}" decoding="async" referrerpolicy="no-referrer">`).join("")}</div><p class="lb-cap" aria-live="polite"></p>`;
  document.body.append(dlg);
  $$(".lb-track img[data-fb]", dlg).forEach((im) => im.addEventListener("error", () => { if (im.dataset.fb && im.src !== im.dataset.fb) { im.src = im.dataset.fb; delete im.dataset.fb; } }));
  dlg.showModal();
  const tr = $(".lb-track", dlg), cap = $(".lb-cap", dlg);
  let active = Math.max(0, Math.min(start, ph.length - 1));
  const label = () => {
    const u = ph[active];
    cap.innerHTML = `${esc(u.cap || caption)}${ph.length > 1 ? ` · ${active + 1}/${ph.length}` : ""}${u.link ? ` · <a href="${esc(u.link)}" target="_blank" rel="noopener">원문 보기</a>` : ""}`;
  };
  const move = (n) => { active = (n + ph.length) % ph.length; tr.scrollTo({ left: active * tr.clientWidth, behavior: "smooth" }); label(); };
  requestAnimationFrame(() => (tr.scrollLeft = active * tr.clientWidth));
  label();
  $(".lb-x", dlg).onclick = () => dlg.close();
  $(".lb-prev", dlg)?.addEventListener("click", () => move(active - 1));
  $(".lb-next", dlg)?.addEventListener("click", () => move(active + 1));
  tr.addEventListener("scroll", () => { const n = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth)); if (n !== active) { active = n; label(); } }, { passive: true });
  dlg.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") move(active - 1); if (e.key === "ArrowRight") move(active + 1); });
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
}

// ── 화면: 비교 ───────────────────────────────────────────────
async function compareView() {
  const saved = S.saved.map((id) => S.byId.get(id)).filter(Boolean);
  if (!saved.length) {
    return `<section class="cmp-page"><div class="sec-head big"><h1>찜한 <em>캠핑장</em></h1></div>
      <div class="empty">${ic("heart-o")}<b>이름 옆 ${ic("heart-o", "inline")}로 찜하고 나란히 비교해요</b><button class="btn primary" type="button" data-sample>예시로 보기</button></div></section>`;
  }
  S.pick = S.pick.filter((id) => S.saved.includes(id));
  if (!S.pick.length) S.pick = saved.slice(0, 3).map((c) => String(c.id));
  const camps = S.pick.map((id) => S.byId.get(id)).filter(Boolean);
  const picker = `<div class="rail picks">${saved.map((c) => { const on = S.pick.includes(String(c.id)); return `<button type="button" class="pick${on ? " on" : ""}" data-pick="${esc(c.id)}" aria-pressed="${on}">${campThumb(c, { sizes: "36px" })}<span>${esc(nameOf(c).name)}</span>${ic(on ? "check" : "plus")}</button>`; }).join("")}</div>`;
  const ds = await Promise.all(camps.map((c) => detailOf(c.id)));
  const rowsDef = [
    ["현장 조건", [["주차", (c) => facts(c).park, "car"], ["전기", (c) => facts(c).power, "bolt"], ["장작·숯", (c) => facts(c).fire, "flame"], ["사이트 규격", (c) => facts(c).size, "size"], ["바닥", (c) => facts(c).ground, "layers"], ["위생", (c) => facts(c).sanitary, "bath"], ["반려동물", (c) => facts(c).pet, "paw"]]],
    ["사이트", [["타입", (c) => (c.st?.length ? { v: typeLine2(c), g: "c", src: { label: "한국관광공사 고캠핑 등록 현황", url: c.gc_url } } : null), "tent"], ["사이트 수", (c, d) => profFact(PF(d, "TYPE")), "layers"]]],
    ["시간·요금", [["입실", (c, d) => usage(c, d)[0][1], "clock-in"], ["퇴실", (c, d) => usage(c, d)[1][1], "clock-out"], ["매너타임", (c, d) => usage(c, d)[2][1], "bed"], ["요금", (c, d) => usage(c, d)[3][1], "won"]]],
    ["시설·주변", [["편의시설", (c) => ((c.amenities ?? []).length ? { v: c.amenities.slice(0, 6).join(" · "), g: "c", src: { label: "고캠핑 등록 편의시설", url: c.gc_url } } : null), "drop"], ["대여", (c) => ((c.rental ?? []).length ? { v: c.rental.join(" · "), g: "c", src: { label: "고캠핑 등록 대여품목", url: c.gc_url } } : null), "cart"], ["편의점", (c) => (c.nl?.c ? { v: km(c.nl.c), g: "c", src: { label: "카카오맵 주변 검색", url: c.lat ? `https://map.kakao.com/link/search/${encodeURIComponent(nameOf(c).name)}+편의점` : null } } : null), "store"], ["마트", (c) => (c.nl?.m ? { v: km(c.nl.m), g: "c", src: { label: "카카오맵 주변 검색", url: c.lat ? `https://map.kakao.com/link/search/${encodeURIComponent(nameOf(c).name)}+마트` : null } } : null), "cart"], ["후기 장점", (c) => (c.rv?.p?.length ? { v: c.rv.p.slice(0, 2).map(([t]) => t).join(" · "), g: "m", src: { label: "방문자 후기 분석", url: c.gc_url } } : null), "thumb-up"]]],
  ];
  const head = camps.map((c) => `<th scope="col"><a class="ch" href="#/c/${encodeURIComponent(c.id)}">${campThumb(c, { sizes: "64px" })}<span><b>${esc(nameOf(c).name)}</b><i>${esc(region(c))}</i></span></a><button class="icon-btn ch-x" type="button" data-pick="${esc(c.id)}" aria-label="비교에서 빼기">${ic("close")}</button></th>`).join("");
  const opens = camps.map((c) => { const o = openingOf(c); const ch = primaryBooking(c); return `<td class="${o ? "hot" : ""}">${o ? `<b>${esc(o.txt)}</b> · ` : ""}${esc(ch ? bookingLabel(ch) : "–")}</td>`; }).join("");
  const body = rowsDef.map(([g, rows]) => `<tr class="grp"><th scope="rowgroup" colspan="${camps.length + 1}">${g}</th></tr>${rows.map(([l, get, rIc]) => {
    const vals = camps.map((c, i) => get(c, ds[i]));
    const keys = vals.map((v) => v?.v ?? "");
    const diff = new Set(keys).size > 1;
    return `<tr class="${diff ? "diff" : ""}"><th scope="row">${rIc ? ic(rIc) : ""}${l}</th>${vals.map((v) => `<td class="cmp-cell"><div class="cmp-cell-inner"><span class="cmp-val">${v ? `${esc(v.v)}${dot(v.g)}` : '<span class="none">–</span>'}</span>${v ? srcTip(v, l) : ""}</div></td>`).join("")}</tr>`;
  }).join("")}`).join("");
  const acts = camps.map((c) => { const ch = primaryBooking(c); return `<td>${ch ? `<a class="btn primary wide" href="${esc(ch.url)}" target="_blank" rel="noopener">예약</a>` : `<a class="btn ghost wide" href="#/c/${encodeURIComponent(c.id)}">자세히</a>`}</td>`; }).join("");
  return `<section class="cmp-page">
    <div class="sec-head big"><h1>찜 ${saved.length} · <em>${camps.length}곳 비교</em></h1><span class="sec-tools"><label class="switch"><input type="checkbox" data-diff checked><span>다른 점만 강조</span></label></span></div>
    ${picker}
    <div class="cmp-scroll"><table class="cmp-table diff-on">
      <thead><tr><th class="corner" scope="col"></th>${head}</tr></thead>
      <tbody><tr class="hotrow"><th scope="row">예약</th>${opens}</tr>${body}<tr class="acts"><th></th>${acts}</tr></tbody>
    </table></div>
  </section>`;
}
function bindCompare() {
  $("[data-diff]")?.addEventListener("change", (e) => $(".cmp-table").classList.toggle("diff-on", e.target.checked));
  $("[data-sample]")?.addEventListener("click", () => {
    S.saved = S.camps.filter((c) => facts(c).power && facts(c).fire && facts(c).park && photosOf(c).length).sort((a, b) => rich(b) - rich(a)).slice(0, 4).map((c) => String(c.id));
    S.pick = S.saved.slice(0, 3);
    store.set("mc-saved", S.saved); store.set("mc-pick", S.pick); syncCompare(); route();
  });
  $$("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    const id = String(b.dataset.pick);
    if (S.pick.includes(id)) S.pick = S.pick.filter((x) => x !== id);
    else { if (S.pick.length >= 3) { toast("3곳까지 나란히 볼 수 있어요"); return; } S.pick.push(id); }
    store.set("mc-pick", S.pick); route();
  }));
}

// ── 화면: 지도 ───────────────────────────────────────────────
let MAP = null, selected = null;
function mapView() {
  return `<section class="map-page">
    <aside class="map-panel">
      <form class="search sm" role="search" data-msearch>${ic("search", "search-ic")}<input type="search" name="q" value="${esc(S.q)}" placeholder="지역 · 캠핑장" aria-label="검색어" autocomplete="off"></form>
      <div class="rail chips">${Object.entries(QUICK).map(([k, q]) => `<button type="button" class="chip qc-${q.cls}" data-mquick="${k}" aria-pressed="${S.quick.has(k)}">${ic(q.icon)}${q.label}</button>`).join("")}</div>
      <p class="map-count"><b data-mcount>0</b>곳 · 지도 안</p>
      <div class="map-list" data-mlist></div>
    </aside>
    <div class="map-canvas" id="map"></div>
    <div class="map-peek" data-peek hidden></div>
  </section>`;
}
function pinLabel(c) {
  const o = openingOf(c);
  if (o) return [o.txt, "pin-hot"];
  const f = facts(c);
  if (filled(f.power) && f.power.w) return [kw(f.power.w), "pin-volt"];
  return [null, ""];
}
function drawMap() {
  if (!MAP) return;
  const inB = MAP.bounds(0.15), z = MAP.zoom();
  const inView = S.camps.filter((c) => c.lat && c.lng && inB(c.lat, c.lng) && matches(c, { useArea: false }));
  const strict = MAP.bounds();
  const visible = inView.filter((c) => strict(c.lat, c.lng)).sort((a, b2) => photoLast(a) - photoLast(b2) || rich(b2) - rich(a));
  $("[data-mcount]").textContent = fmt(visible.length);
  MAP.clear();
  const cell = z >= 12 ? 0 : z >= 10 ? 60 : 90, buckets = new Map();
  for (const c of inView) {
    const p = MAP.point(c.lat, c.lng);
    const k = cell ? `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}` : c.id;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(c);
  }
  for (const arr of buckets.values()) {
    if (arr.length > 1) {
      const lat = arr.reduce((s, c) => s + c.lat, 0) / arr.length, lng = arr.reduce((s, c) => s + c.lng, 0) / arr.length;
      const n = arr.length, size = n > 99 ? 46 : n > 9 ? 40 : 34;
      MAP.add(lat, lng, `<span class="cl" style="--s:${size}px">${n}</span>`, { center: true, size, onClick: () => MAP.setView(lat, lng, Math.min(z + 2, 14)) });
    } else {
      const c = arr[0], [t, cls] = pinLabel(c), on = selected === String(c.id);
      const html = t || on ? `<span class="pin ${cls}${on ? " on" : ""}">${esc(on ? nameOf(c).name.slice(0, 14) : t)}</span>` : `<span class="pdot"></span>`;
      MAP.add(c.lat, c.lng, html, { z: on ? 1000 : t ? 100 : 0, onClick: () => selectPin(c) });
    }
  }
  const list = $("[data-mlist]");
  list.innerHTML = visible.filter(hasPhoto).slice(0, 40).map(mapItem).join("") + (visible.length > 40 ? `<p class="map-more">지도를 확대하면 ${fmt(visible.length - 40)}곳 더</p>` : "");
  initCarousels(list);
}
function mapItem(c) {
  const on = selected === String(c.id);
  return `<article class="mi${on ? " on" : ""}" data-mid="${esc(c.id)}">
    <a class="card-hit" href="#/c/${encodeURIComponent(c.id)}" draggable="false" aria-label="${esc(nameOf(c).name)} 자세히"></a>
    <div class="mi-ph">${carousel(c)}</div>
    <div class="mi-b"><p class="card-meta">${esc(region(c))}${typeLine(c) ? ` · ${esc(typeLine(c))}` : ""}</p><h3>${esc(nameOf(c).name)}</h3><span class="bdgs inline">${badges(c, 3)}</span></div>
    ${heartBtn(c)}
  </article>`;
}
function selectPin(c) {
  selected = String(c.id);
  drawMap();
  const peek = $("[data-peek]");
  peek.hidden = false;
  peek.innerHTML = `<button class="icon-btn peek-x" type="button" data-peek-x aria-label="닫기">${ic("close")}</button>${mapItem(c)}`;
  initCarousels(peek);
  const it = $(`.map-list [data-mid="${CSS.escape(selected)}"]`);
  it?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function bindMap() {
  document.body.classList.add("map-mode");
  cleanup.push(() => { document.body.classList.remove("map-mode"); MAP?.remove(); MAP = null; });
  const el = $("#map"), opts = { center: [36.2, 127.9], zoom: innerWidth < 760 ? 6 : 7 };
  let alive = true;
  cleanup.push(() => { alive = false; });
  const start = (adapter) => {
    MAP = adapter;
    el.dataset.engine = adapter.kind;
    if (S.area !== "all") { const pts = S.camps.filter((c) => AREA_OF[sidoShort(c.sido)] === S.area && c.lat).map((c) => [c.lat, c.lng]); if (pts.length) MAP.fit(pts); }
    MAP.onMove(drawMap);
    MAP.onClick(() => { selected = null; $("[data-peek]").hidden = true; drawMap(); });
    drawMap();
  };
  const osm = () => {
    if (!alive) return;
    MAP?.remove?.(); MAP = null; el.innerHTML = "";
    if (!window.L) { el.innerHTML = `<div class="empty">${ic("map")}<b>지도를 불러오지 못했어요</b></div>`; return; }
    start(leafletAdapter(el, opts));
  };
  loadKakao().then(async (kakao) => {
    if (!alive) return;
    const a = kakaoAdapter(kakao, el, opts);
    start(a);
    await kakaoTilesOk(kakao, a.map, el);
  }).catch(osm);
  const v = $("#view");
  const onSubmit = (e) => {
    const f = e.target.closest("[data-msearch]"); if (!f) return; e.preventDefault(); S.q = f.q.value.trim();
    const hit = S.camps.filter((c) => c.lat && matches(c, { useArea: false }));
    if (!MAP) return;
    if (S.q && hit.length) MAP.fit(hit.map((c) => [c.lat, c.lng]), { padding: 40, maxZoom: 13 }); else drawMap();
  };
  const onClick = (e) => {
    const q = e.target.closest("[data-mquick]");
    if (q) { const k = q.dataset.mquick; if (S.quick.has(k)) S.quick.delete(k); else S.quick.add(k); q.setAttribute("aria-pressed", String(S.quick.has(k))); drawMap(); return; }
    if (e.target.closest("[data-peek-x]")) { selected = null; $("[data-peek]").hidden = true; drawMap(); return; }
    const it = e.target.closest(".map-list .mi");
    if (it && !e.target.closest("[data-save]") && innerWidth >= 900 && !e.target.closest(".card-hit")) { const c = S.byId.get(it.dataset.mid); MAP?.setView(c.lat, c.lng, Math.max(MAP.zoom(), 12)); selectPin(c); }
  };
  v.addEventListener("submit", onSubmit); v.addEventListener("click", onClick);
  cleanup.push(() => { v.removeEventListener("submit", onSubmit); v.removeEventListener("click", onClick); });
}

// ── 라우터 ───────────────────────────────────────────────────
const cleanup = [];
let lastRoute = "";
async function render() {
  while (cleanup.length) cleanup.pop()();
  TIPS.clear(); $("#pop").hidden = true;
  const h = location.hash || "#/";
  const v = $("#view");
  const name = h.startsWith("#/c/") ? "detail" : h.startsWith("#/map") ? "map" : h.startsWith("#/compare") ? "compare" : h.startsWith("#/theme/") ? "theme" : h.startsWith("#/list") ? "list" : "home";
  $$("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === (name === "detail" || name === "list" || name === "theme" ? "home" : name)));
  document.body.dataset.view = name;
  if (name === "home") { v.innerHTML = homeView(); bindHome(); }
  else if (name === "theme") { const tk = decodeURIComponent(h.slice(8)); v.innerHTML = themeView(tk); bindTheme(tk); }
  else if (name === "detail") { v.innerHTML = `<div class="loading"></div>`; v.innerHTML = await detailView(decodeURIComponent(h.slice(4))); bindDetail(); }
  else if (name === "compare") { v.innerHTML = await compareView(); bindCompare(); }
  else if (name === "list") { v.innerHTML = listView(); bindList(); }
  else { v.innerHTML = mapView(); bindMap(); }
  initDraggableRails(v);
  return name;
}
async function route() {
  const prev = lastRoute;
  if (prev === "home") S.homeScroll = scrollY;
  const name = await render();
  lastRoute = name;
  S.cameFromApp = Boolean(prev);
  if (name === "home" && (prev === "detail" || prev === "theme")) scrollTo(0, S.homeScroll);
  else if (name !== prev || name === "detail" || name === "theme") scrollTo(0, 0);
  updateHeaderGlass();
}
addEventListener("hashchange", route);
// ── 바깥 링크를 기기에 맞는 화면으로(소유자 2026-10-20: 모바일에서 네이버 예약이 PC 화면으로 열려 잘림) ──────────
// 같은 글·장소라도 PC·모바일 주소가 다른 플랫폼(네이버 검색·블로그·카페·예약·지도·플레이스, 다음 카페·검색, 카카오 장소)은
// 누르는 순간 기기에 맞는 주소로 바꾼다. 고캠핑·관광공사·국립공원·캠핏·카카오맵 링크는 한 주소가 알아서 맞춰 열린다(확인 2026-10-20).
const IS_MOBILE = (() => { try { return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (matchMedia("(pointer: coarse)").matches && matchMedia("(max-width: 1024px)").matches); } catch { return false; } })();
const MOBILE_HOST = { "search.naver.com": "m.search.naver.com", "blog.naver.com": "m.blog.naver.com", "cafe.naver.com": "m.cafe.naver.com", "booking.naver.com": "m.booking.naver.com", "cafe.daum.net": "m.cafe.daum.net", "search.daum.net": "m.search.daum.net", "www.youtube.com": "m.youtube.com" };
const PC_HOST = Object.fromEntries(Object.entries(MOBILE_HOST).map(([pc, m]) => [m, pc]));
function deviceUrl(href, mobile = IS_MOBILE) {
  let u; try { u = new URL(href); } catch { return href; }
  if (!/^https?:$/.test(u.protocol)) return href;
  const h = u.hostname.toLowerCase();
  if (mobile) {
    if (MOBILE_HOST[h]) { u.hostname = MOBILE_HOST[h]; return u.toString(); }
    // 네이버 지도: 장소 → 모바일 플레이스, 검색 → 모바일 지도 검색
    if (h === "map.naver.com") {
      const place = u.pathname.match(/\/(?:entry\/)?place\/(\d+)/);
      if (place) return `https://m.place.naver.com/place/${place[1]}/home`;
      const q = u.pathname.match(/\/p\/search\/([^/]+)/);
      if (q) return `https://m.map.naver.com/search2/search.naver?query=${q[1]}`;
      return `https://m.map.naver.com/`;
    }
    const kp = h === "place.map.kakao.com" && u.pathname.match(/^\/(\d+)/);
    if (kp) return `https://place.map.kakao.com/m/${kp[1]}`;
    return href;
  }
  if (PC_HOST[h]) { u.hostname = PC_HOST[h]; return u.toString(); }
  if (h === "m.place.naver.com" || h === "pcmap.place.naver.com") { const id = u.pathname.match(/\/(?:\w+\/)?(\d+)/); return id ? `https://map.naver.com/p/entry/place/${id[1]}` : href; }
  if (h === "m.map.naver.com") { const q = u.searchParams.get("query"); return q ? `https://map.naver.com/p/search/${encodeURIComponent(q)}` : "https://map.naver.com/"; }
  const km = h === "place.map.kakao.com" && u.pathname.match(/^\/m\/(\d+)/);
  if (km) return `https://place.map.kakao.com/${km[1]}`;
  return href;
}
// 모든 바깥 링크: 누르기(새 탭·가운데 클릭 포함) 직전에 주소를 바꾼다. 화면에 그린 HTML은 그대로 둔다.
const fitLink = (e) => {
  const a = e.target.closest?.("a[href^='http']");
  if (!a) return;
  const to = deviceUrl(a.href);
  if (to !== a.href) a.href = to;
};
addEventListener("click", fitLink, true);
addEventListener("auxclick", fitLink, true);
addEventListener("contextmenu", fitLink, true);
// 주변시설 사진을 누르면 원문 글을 연다(사진이 든 줄 자체는 지도 링크).
addEventListener("click", (e) => {
  const im = e.target.closest?.("img[data-open]");
  if (!im) return;
  e.preventDefault(); e.stopPropagation();
  window.open(deviceUrl(im.dataset.open), "_blank", "noopener");
}, true);
// 주변시설 ‘로드뷰’: 카카오 지도 JS SDK(도메인 제한 키, 무료 한도)의 로드뷰를 팝업으로. 키·SDK가 없으면 카카오맵 로드뷰 링크를 연다.
let kakaoSdk = null;
// 지도 공통(소유자 2026-10-20): 카카오 지도 JS를 먼저 쓰고, 키 거부·한도 초과(429)·SDK 로드 실패·시간 초과면 Leaflet+OSM으로 자동 전환.
// 시험용 주소 플래그: ?map=osm(카카오 끄기) · ?map=badkey(잘못된 키로 실패 경로 확인).
const MAP_FLAG = new URLSearchParams(location.search).get("map") ?? "";
let kakaoDead = MAP_FLAG === "osm";
function loadKakao() {
  let key = document.querySelector('meta[name="kakao-js-key"]')?.content;
  if (MAP_FLAG === "badkey") key = "0000000000000000badkey0000000000";
  if (!key || kakaoDead) return Promise.reject(new Error("no key"));
  return (kakaoSdk ??= new Promise((ok, no) => {
    const fail = (why) => { clearTimeout(t); kakaoDead = true; console.warn("[map] 카카오 지도 실패 → OSM:", why); no(new Error(why)); };
    const t = setTimeout(() => fail("timeout"), 8000);
    const sc = document.createElement("script");
    sc.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    sc.onload = () => window.kakao?.maps?.load ? window.kakao.maps.load(() => { clearTimeout(t); ok(window.kakao); }) : fail("sdk");
    sc.onerror = () => fail("sdk load error");
    document.head.append(sc);
  }));
}
// 지도를 만든 뒤 바탕 타일이 실제로 그려졌는지 확인한다(키 거부·429면 SDK는 떠도 타일이 오지 않는다).
function kakaoTilesOk(kakao, map, el, ms = 10000) {
  return new Promise((ok, no) => {
    let done = false;
    const fin = (good, why) => { if (done) return; done = true; clearTimeout(t); good ? ok() : (kakaoDead = true, console.warn("[map] 카카오 타일 실패 → OSM:", why), no(new Error(why))); };
    // tilesloaded는 타일이 실패해도(빈 칸) 오므로, 실제로 그림이 들어온 타일 이미지가 하나라도 있는지 본다.
    const drawn = () => { const im = [...el.querySelectorAll("img")].filter((i) => /kakaocdn|daumcdn/.test(i.src) && /tile|map_/.test(i.src)); return !im.length ? null : im.some((i) => i.complete && i.naturalWidth > 1); };
    const t = setTimeout(() => fin(drawn() === true, "tiles timeout"), ms);
    kakao.maps.event.addListener(map, "tilesloaded", () => setTimeout(() => { const d = drawn(); if (d !== null) fin(d, "tiles blocked"); }, 1500));
  });
}
// 마커 html(위치 기준점이 왼쪽 위)을 카카오 CustomOverlay로. center=true면 가운데 기준(묶음 원).
function kOverlay(kakao, map, lat, lng, html, { center = false, z = 0, onClick } = {}) {
  const el = document.createElement("div");
  el.className = "k-ov";
  if (!center) el.style.cssText = "position:relative;width:0;height:0";
  el.innerHTML = html;
  if (onClick) el.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  const ov = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(lat, lng), content: el, xAnchor: center ? 0.5 : 0, yAnchor: center ? 0.5 : 0, zIndex: z, clickable: true });
  ov.setMap(map);
  return ov;
}
// 카카오 레벨(1 가까움~14 멀리) ↔ Leaflet 줌(대략 19-레벨)
const k2z = (lv) => 19 - lv, z2k = (z) => Math.max(1, Math.min(14, 19 - z));
/** 지도 탭 어댑터: drawMap 등은 이 공통 함수만 쓴다. */
function leafletAdapter(el, opts) {
  const m = L.map(el, { zoomControl: false, attributionControl: true, minZoom: 6, maxZoom: 17 }).setView(opts.center, opts.zoom);
  L.control.zoom({ position: "bottomright" }).addTo(m);
  // 지도 바탕: OpenStreetMap 표준 타일(무료·출처 표시). 화면에서는 CSS로 채도를 낮춘다.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
  const layer = L.layerGroup().addTo(m);
  return {
    kind: "osm",
    bounds(pad = 0) { const b = pad ? m.getBounds().pad(pad) : m.getBounds(); return (lat, lng) => b.contains([lat, lng]); },
    zoom: () => m.getZoom(),
    point: (lat, lng) => m.latLngToLayerPoint([lat, lng]),
    clear: () => layer.clearLayers(),
    add(lat, lng, html, { center, size, z, onClick } = {}) { const mk = L.marker([lat, lng], { icon: L.divIcon({ className: "", html, iconSize: center ? [size, size] : null }), zIndexOffset: z ?? 0 }); if (onClick) mk.on("click", onClick); layer.addLayer(mk); },
    setView: (lat, lng, z) => m.setView([lat, lng], z),
    fit: (pts, { padding = 30, maxZoom } = {}) => m.fitBounds(pts, { padding: [padding, padding], ...(maxZoom ? { maxZoom } : {}) }),
    onMove: (f) => m.on("moveend", f),
    onClick: (f) => m.on("click", f),
    remove: () => m.remove(),
  };
}
function kakaoAdapter(kakao, el, opts) {
  const m = new kakao.maps.Map(el, { center: new kakao.maps.LatLng(...opts.center), level: z2k(opts.zoom) });
  m.setMinLevel?.(z2k(17)); m.setMaxLevel?.(z2k(6));
  m.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.BOTTOMRIGHT);
  let ovs = [];
  return {
    kind: "kakao", map: m,
    bounds(pad = 0) { const b = m.getBounds(), sw = b.getSouthWest(), ne = b.getNorthEast(); const dy = (ne.getLat() - sw.getLat()) * pad, dx = (ne.getLng() - sw.getLng()) * pad; return (lat, lng) => lat >= sw.getLat() - dy && lat <= ne.getLat() + dy && lng >= sw.getLng() - dx && lng <= ne.getLng() + dx; },
    zoom: () => k2z(m.getLevel()),
    point: (lat, lng) => m.getProjection().containerPointFromCoords(new kakao.maps.LatLng(lat, lng)),
    clear() { ovs.forEach((o) => o.setMap(null)); ovs = []; },
    add(lat, lng, html, { center, z, onClick } = {}) { ovs.push(kOverlay(kakao, m, lat, lng, html, { center, z, onClick })); },
    setView: (lat, lng, z) => { m.setLevel(z2k(z)); m.setCenter(new kakao.maps.LatLng(lat, lng)); },
    fit(pts, { maxZoom } = {}) { const b = new kakao.maps.LatLngBounds(); pts.forEach(([a, c]) => b.extend(new kakao.maps.LatLng(a, c))); m.setBounds(b, 30, 30, 30, 30); if (maxZoom && k2z(m.getLevel()) > maxZoom) m.setLevel(z2k(maxZoom)); },
    onMove: (f) => kakao.maps.event.addListener(m, "idle", f),
    onClick: (f) => kakao.maps.event.addListener(m, "click", f),
    remove() { this.clear(); el.innerHTML = ""; },
  };
}
async function openRoadview(lat, lng, name) {
  const link = `https://map.kakao.com/link/roadview/${lat},${lng}`;
  const dlg = document.createElement("dialog");
  dlg.className = "rv-modal";
  dlg.innerHTML = `<div class="rv-head"><b>${esc(name)}</b><span>로드뷰 · 실제 거리 모습(촬영 시점은 다를 수 있어요)</span><button type="button" class="w-modal-close" data-rv-close aria-label="닫기">${ic("close")}</button></div>
    <div class="rv-view" data-rv-view><p class="rv-msg">로드뷰를 불러오는 중…</p></div>
    <div class="rv-foot"><a class="w-btn-windy" href="${esc(link)}" target="_blank" rel="noopener">${ic("map")}카카오맵에서 크게 보기</a><button type="button" class="btn primary w-btn-close" data-rv-close>닫기</button></div>`;
  document.body.append(dlg);
  dlg.showModal();
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-rv-close]")) dlg.close(); });
  const view = $("[data-rv-view]", dlg);
  try {
    const kakao = await loadKakao();
    const pos = new kakao.maps.LatLng(Number(lat), Number(lng));
    view.innerHTML = "";
    const rv = new kakao.maps.Roadview(view);
    new kakao.maps.RoadviewClient().getNearestPanoId(pos, 120, (panoId) => {
      if (panoId == null) { view.innerHTML = `<p class="rv-msg">이 장소 근처(120m)에는 로드뷰 사진이 없어요.</p>`; return; }
      rv.setPanoId(panoId, pos);
    });
  } catch {
    dlg.close();
    window.open(deviceUrl(link), "_blank", "noopener");
  }
}
addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-rv]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const [lat, lng] = b.dataset.rv.split(",");
  openRoadview(lat, lng, b.dataset.rvName || "주변 장소");
}, true);
addEventListener("keydown", (e) => {
  const b = e.target.closest?.("[data-rv]");
  if (!b || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault(); b.click();
}, true);

// ── 시작 ─────────────────────────────────────────────────────
// 상세 사진 묶음에서 깨진 사진: 그 칸을 빼고 남은 칸으로 격자를 다시 짠다(빈 회색 칸 금지).
addEventListener("error", (e) => {
  const im = e.target;
  if (!(im instanceof HTMLImageElement)) return;
  // 후기 사진 원본이 막히면 검색 썸네일로 한 번 바꾼다
  const fb = PT_FB.get(im.getAttribute("src"));
  if (fb) { im.removeAttribute("srcset"); im.setAttribute("src", fb); return; }
  // 검색 썸네일이 사라졌으면 그 칸을 빼고, 후기 글 카드는 아이콘 자리로 둔다.
  const thumb = im.closest(".thumb-links a");
  if (thumb) { const box = thumb.parentElement; thumb.remove(); if (!box.children.length) { const sec = box.closest(".d-sec"); box.remove(); if (sec && !sec.querySelector(".thumb-links a, .visitor-sources a, .layout-links a, .visitor-gallery button, .layout-viewer")) sec.remove(); } return; }
  if (im.closest(".review-link-media")) { im.remove(); return; }
  if (im.parentElement?.classList.contains("nearby-place")) { im.parentElement.classList.remove("has-image"); im.outerHTML = `<span class="nearby-place-icon">${ic("pin")}</span>`; return; }
  const cell = im.closest(".gal-cell");
  if (!cell) return;
  DEAD.add(im.getAttribute("src"));
  const grid = cell.parentElement;
  cell.remove();
  const cells = $$(".gal-cell", grid);
  cells.forEach((x, i) => { x.dataset.gal = i; });
  grid.className = `gal-grid n${cells.length}`;
  if (!cells.length) grid.remove();
}, true);
(async function boot() {
  $("#view").innerHTML = `<div class="loading"></div>`;
  const [camps, photos, openings, cards, avail, vac] = await Promise.all([
    fetch(`${DATA}campgrounds.json`).then((r) => r.json()),
    fetch(`${DATA}photos.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch(`${DATA}openings.json`).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch(`${MEDIA}cards/index.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch(`${DATA}availability.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`${DATA}vacancy.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  S.camps = camps.filter((c) => c.status !== "폐업");
  S.byId = new Map(S.camps.map((c) => [String(c.id), c]));
  S.photos = photos;
  S.cards = cards?.camps ?? {};
  for (const o of openings.items ?? []) if (!S.openings.has(String(o.id)) || o.kind !== "접수 마감") S.openings.set(String(o.id), o);
  S.saved = S.saved.filter((id) => S.byId.has(id));
  // 공식 접수 상태(서울 공공서비스예약 등)는 짧은 유효기간이 있다. 만료된 파일은 쓰지 않는다.
  S.avail = new Map();
  if (avail && Date.parse(avail.expires_at) > Date.now()) for (const r of avail.records ?? []) if (r.state === "OFFICIAL_APPLICATION_OPEN") { const k = String(r.campground_id); S.avail.set(k, [...(S.avail.get(k) ?? []), { ...r, disclaimer: avail.disclaimer, source_name: avail.source?.name }]); }
  // 예약 화면 빈자리 관측도 만료 시각이 지나면 쓰지 않는다.
  S.vac = vac && Date.parse(vac.expires_at) > Date.now() && Array.isArray(vac.dates) ? vac : null;
  // 이전 주소(#c=1554)도 새 상세 주소로 보정해 공유 링크를 깨지 않는다.
  const legacy = location.hash.match(/^#c=(.+)$/);
  if (legacy) history.replaceState(null, "", `#/c/${legacy[1]}`);
  syncCompare(); updateHeaderGlass();
  route();
})();
