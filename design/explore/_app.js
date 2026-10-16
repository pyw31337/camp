// 모여라 캠핑 · 전국 캠핑장 탐색. 데이터: data/campgrounds.json, data/meta.json,
// data/availability.json(짧은 TTL의 공식 접수 상태, pipeline build:explore)
const KAKAO_KEY = document.querySelector('meta[name="kakao-js-key"]')?.content ?? "";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ic = (id, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="${id}"/></svg>`;
// 가격은 “13만원대”처럼 구간으로만 보여 준다(1만원 미만은 “8천원대”).
const band = (n) => (n >= 10000 ? `${Math.floor(n / 10000)}만원대` : `${Math.max(1, Math.floor(n / 1000))}천원대`);
const won = (n) => `${Math.round(n / 1000) * 1000 >= 10000 ? (n / 10000).toFixed(n % 10000 ? 1 : 0) + "만" : n.toLocaleString()}원`;
// 날짜·시각은 보는 사람의 기기 시간대와 무관하게 한국 시간(KST)으로 보여 준다.
const kst = (s) => { const d = new Date(s); if (Number.isNaN(+d)) return null; const k = new Date(+d + 9 * 3600e3); return { y: k.getUTCFullYear(), mo: k.getUTCMonth() + 1, d: k.getUTCDate(), wd: k.getUTCDay(), h: k.getUTCHours(), mi: k.getUTCMinutes() }; };
const p2 = (n) => String(n).padStart(2, "0");
const ymd = (s) => { const k = kst(s); return k ? `${k.y}.${p2(k.mo)}.${p2(k.d)}` : ""; };
const KIND = { AUTO_PITCH: ["오토캠핑", "#l-car"], PITCH: ["일반 캠핑", "#t-tent"], GLAMPING: ["글램핑", "#l-bed-double"], CARAVAN_RENTAL: ["카라반", "#t-caravan"], RV_PITCH: ["개인 카라반", "#t-caravan"], TARP_ZONE: ["타프존", "#t-building-pavilion"], SHELTER_ZONE: ["쉘터존", "#l-warehouse"], CAMPNIC_DAY: ["캠프닉", "#t-grill"] };
const AREAS = ["전국", "서울·경기", "강원", "충청", "전라", "경상", "제주"];
// 고캠핑 바닥 코드 → 한글
const FLOOR = { GRASS: "잔디", CRUSHED_STONE: "파쇄석", DECK: "데크", GRAVEL: "자갈", SOIL: "맨흙·마사토" };
const floorName = (f) => FLOOR[f] ?? f;
const OP = { LOCAL_GOVERNMENT: "지자체", PRIVATE: "민간", NATIONAL_PARK: "국립공원", NATURAL_RECREATION_FOREST: "자연휴양림", PUBLIC_LEISURE: "국민여가", UNKNOWN: "" };
const GEAR = [["", "장비 크기 무관"], ["4x4", "돔텐트 4×4m"], ["5.5x8", "리빙쉘 5.5×8m"], ["6x9.5", "텐트+타프 6×9.5m"], ["8x10", "대형 8×10m"]];
const PAGE = 40;
// 테마 정의는 파이프라인(lib/themes.mjs)이 meta.themes로 내려준다. 아이콘은 스프라이트에 넣기 위해 여기서 매핑한다.
const THEME_ICON = { valley: "#l-waves", sea: "#l-sailboat", forest: "#l-trees", lake: "#l-droplets", mountain: "#l-mountain", city: "#l-building-2", summer: "#l-sun", autumn: "#l-leaf", winter: "#l-snowflake", spring: "#l-flower-2", sunrise: "#l-sunrise", kids: "#l-baby", pet: "#l-dog", glamping: "#l-bed-double", caravan: "#t-caravan", auto: "#l-car", trailer: "#t-caravan", fishing: "#l-fish", walk: "#l-footprints", comfort: "#l-plug-zap", wifi: "#l-wifi", public: "#l-landmark", realtime: "#l-zap" };
// 이름순 정렬은 “(주)”, “(에드203)” 같은 괄호 접두어와 법인 표기를 빼고 비교한다.
const sortName = (c) => (c._sort ??= c.name.replace(/^[\s(（［\[]*[^)）］\]]*[)）］\]]\s*/, "").replace(/^(주식회사|㈜|유한회사|농업회사법인)\s*/, "") || c.name);
// 데이터는 빈 값을 빼고 배포하므로 화면에서 기본값을 채운다.
const withDefaults = (c) => ({ th: [], kinds: [], sizes: [], floors: [], amenities: [], env: [], themes: [], rental: [], seasons: [], days: [], types: [], seoul: [], field_conditions: null, ...c, booking: { methods: [], url: null, provider: null, channels: [], source: null, ...(c.booking ?? {}) } });

const state = { q: "", area: "전국", kinds: new Set(), realtime: false, availabilityOnly: false, checkIn: "", checkOut: "", pet: false, fee: false, toilet: false, power: false, siteSize: false, floor: false, naverBooking: false, camfitBooking: false, parkingSide: false, parkingCart: false, firewoodAllowed: false, powerHigh: false, privateBath: false, kidsPlay: false, savedOnly: false, inView: false, theme: "", sgg: "", gear: "", profilePower: "", profileParking: false, profileFirewood: false, profileFilter: false, profileStrict: false, sort: "best", shown: PAGE, here: null, open: null, saved: new Set(), seen: new Set(), compare: new Set() };
let ALL = [], META = null, AVAILABILITY = null, map = null, clusterer = null, markers = new Map();

function load() {
  loadUser();
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("c")) state.open = h.get("c");
  // 홈 검색창·분류 버튼에서 넘어온 검색어(q)·사이트 형태(k)
  if (h.get("q")) state.q = h.get("q");
  if (h.get("k")) state.kinds = new Set(h.get("k").split(","));
  // 헤더 공통 메뉴에서 넘어온 요청: 관심만 보기(s=1), 내 주변(near=1)
  if (h.get("s") === "1") state.savedOnly = true;
  if (h.get("near") === "1") state.nearOnBoot = true;
  if (h.get("t")) state.theme = h.get("t");
  if (h.get("a") && AREAS.includes(h.get("a"))) state.area = h.get("a");
  if (h.get("g")) state.sgg = h.get("g");
  if (/^\d{4}-\d{2}-\d{2}$/.test(h.get("ci") ?? "")) state.checkIn = h.get("ci");
  if (/^\d{4}-\d{2}-\d{2}$/.test(h.get("co") ?? "")) state.checkOut = h.get("co");
  if (h.get("av") === "1") state.availabilityOnly = true;
  // 비교 공유 링크(#cmp=id1,id2[,id3]): 가족과 같은 비교표를 본다(로드맵 R5).
  if (h.get("cmp")) state.compareOnBoot = h.get("cmp").split(",").filter(Boolean).slice(0, 3);
}
// 관심 캠핑장은 이 기기 브라우저에만, 헤더에서 고른 사용자별로 따로 저장한다(로그인 없음).
const userKey = () => window.moyeoraUser?.key("moyeora-explore") ?? "moyeora-explore";
function loadUser() {
  try {
    const s = JSON.parse(localStorage.getItem(userKey()) ?? "{}");
    Object.assign(state, {
      area: s.area ?? "전국", gear: s.gear ?? "", profilePower: s.profilePower ?? "",
      profileParking: Boolean(s.profileParking), profileFirewood: Boolean(s.profileFirewood),
      profileFilter: Boolean(s.profileFilter), profileStrict: Boolean(s.profileStrict),
      saved: new Set(Array.isArray(s.saved) ? s.saved : []), seen: new Set(Array.isArray(s.seen) ? s.seen : []),
      compare: new Set(Array.isArray(s.compare) ? s.compare : []),
    });
  } catch { Object.assign(state, { saved: new Set(), seen: new Set(), compare: new Set() }); }
}
const save = () => { try { localStorage.setItem(userKey(), JSON.stringify({ area: state.area, gear: state.gear, profilePower: state.profilePower, profileParking: state.profileParking, profileFirewood: state.profileFirewood, profileFilter: state.profileFilter, profileStrict: state.profileStrict, saved: [...state.saved], seen: [...state.seen].slice(-120), compare: [...state.compare] })); } catch {} };
// 헤더 이름 뱃지로 사용자를 바꾸면 그 사람의 관심·최근 본 목록으로 다시 그린다.
window.addEventListener("moyeora:user", (e) => {
  loadUser(); state.shown = PAGE; renderAvailabilityQuery(); renderSetupQuery(); renderChips(); renderList();
  if (state.open) { const c = ALL.find((x) => x.id === state.open); const panel = $(".sheet-panel"); if (c && panel) { const top = panel.scrollTop; panel.innerHTML = detail(c); tipify(panel); panel.scrollTop = top; } }
  toast(`${e.detail?.name ?? "사용자"}님의 관심 목록으로 바꿨어요`);
});
const inBounds = (c) => { if (!state.inView || !map) return true; const b = map.getBounds(); return b.contain(new kakao.maps.LatLng(c.lat, c.lng)); };

const hasPower = (c) => c.field_conditions?.power?.available === true || c.amenities?.some((amenity) => /전기/.test(amenity)) || Boolean(c.of?.w);
const isTentSideParking = (c) => c.field_conditions?.parking?.tent_side === true || c.field_conditions?.parking?.mode === "SITE_ADJACENT" || (c.field_conditions?.parking?.auto_camping_sites > 0) || c.kinds?.some(([k]) => k === "AUTO_PITCH") || c.of?.pk?.v === "SITE_SIDE";
const isCartParking = (c) => c.field_conditions?.parking?.cart_required === true || c.field_conditions?.parking?.mode === "CART_REQUIRED" || Boolean(c.field_conditions?.parking?.cart_required);
const isFirewoodAllowed = (c) => c.field_conditions?.firewood?.allowed === true || c.field_conditions?.firewood?.sold === true || (c.fire && !/불가/.test(c.fire)) || c.of?.fire?.v === "FIREWOOD_OK";
const isHighPower = (c) => (c.field_conditions?.power?.limit_w >= 700 || c.field_conditions?.power?.max_w >= 700 || c.of?.w?.v >= 700);

const sizeGroups = (c) => {
  const registered = c.field_conditions?.site_size?.groups;
  const direct = Array.isArray(c.sizes) ? c.sizes : [];
  const registeredSizes = Array.isArray(registered)
    ? registered.map((x) => [x?.width_m, x?.depth_m])
    : [];
  const groups = direct.length ? direct : registeredSizes;
  return groups.map(([w, d]) => [Number(w), Number(d)]).filter(([w, d]) => w > 0 && d > 0);
};
const hasSetup = () => Boolean(state.gear || state.profilePower || state.profileParking || state.profileFirewood);
const setupStatus = (c) => {
  const checks = [];
  const f = c.field_conditions ?? {};
  if (state.gear) {
    const [w, d] = state.gear.split("x").map(Number), sizes = sizeGroups(c);
    const fixedStay = c.kinds.length && c.kinds.every(([k]) => ["GLAMPING", "CARAVAN_RENTAL", "CAMPNIC_DAY"].includes(k));
    const fitsIn = ([sw, sd]) => (sw >= w && sd >= d) || (sw >= d && sd >= w);
    const ok = sizes.filter(fitsIn).length;
    const kind = fixedStay || !sizes.length ? "UNKNOWN" : ok === sizes.length ? "MATCH" : ok ? "CONDITIONAL" : "MISMATCH";
    const fitList = sizes.filter(fitsIn).map(([sw, sd]) => `${sw}×${sd}m`).join(", ");
    checks.push({ key: "gear", label: `설치 공간 ${w}×${d}m`, state: kind, text: fixedStay ? "텐트 설치형 상품이 아니라 규격을 비교할 수 없어요." : !sizes.length ? "사이트 가로·세로가 등록되지 않았어요." : kind === "MATCH" ? "등록된 모든 사이트 규격에 들어가요." : kind === "CONDITIONAL" ? `등록 규격 ${sizes.length}종 중 ${ok}종(${fitList})에만 들어가요. 예약 때 그 구역을 고르세요.` : "등록된 사이트 규격에는 들어가는 곳이 없어요." });
  }
  if (state.profilePower) {
    const required = Number(state.profilePower);
    const limit = Number(f.power?.limit_w ?? f.power?.max_w ?? f.power?.regulatory_reference_w ?? c.of?.w?.v ?? (hasPower(c) ? 600 : NaN));
    const known = Number.isFinite(limit) && limit > 0;
    const kind = !known ? "UNKNOWN" : limit >= required ? "MATCH" : "MISMATCH";
    checks.push({ key: "power", label: `${required.toLocaleString()}W 이상`, state: kind, text: !known ? "전기 제공 정보가 확인되지 않았어요." : kind === "MATCH" ? `최대 ${limit.toLocaleString()}W 이용 가능 조건이에요.` : `최대 ${limit.toLocaleString()}W로, 필요한 전력보다 낮아요.` });
  }
  if (state.profileParking) {
    const parking = f.parking ?? {};
    const mode = parking.mode ?? parking.parking_mode ?? null;
    const zones = parking.tent_side_zones;
    const partial = zones && zones.adjacent > 0 && zones.adjacent < zones.total;
    const isTentSide = isTentSideParking(c);
    const isCart = isCartParking(c) || ["SHARED_NEARBY", "DROP_OFF_EXTERNAL"].includes(mode);
    const kind = isTentSide ? "MATCH" : partial ? "CONDITIONAL" : (parking.tent_side === false || isCart) ? "MISMATCH" : "UNKNOWN";
    checks.push({ key: "parking", label: "텐트 옆 주차", state: kind, text: kind === "MATCH" ? "사이트 바로 옆 주차(오토캠핑) 가능 조건이에요." : kind === "CONDITIONAL" ? `원문 대조 결과 ${zones.total}개 구역 중 ${zones.adjacent}곳만 텐트 옆 주차예요.` : kind === "MISMATCH" ? "사이트 옆 주차가 아니거나 짐수레 이동 구역이에요." : "주차 동선 정보 확인이 필요해요." });
  }
  if (state.profileFirewood) {
    const raw = f.firewood?.rule ?? f.firewood?.allowed;
    const allowFire = isFirewoodAllowed(c);
    const banFire = raw === false || raw === "PROHIBITED" || c.fire === "불가" || c.of?.fire?.v === "NO_FIRE";
    const kind = allowFire ? "MATCH" : raw === "DESIGNATED_ONLY" ? "CONDITIONAL" : banFire ? "MISMATCH" : "UNKNOWN";
    checks.push({ key: "firewood", label: "장작 불멍", state: kind, text: kind === "MATCH" ? "개별 화로대 장작 사용 가능 조건이에요." : kind === "CONDITIONAL" ? "지정 화로대·구역에서만 가능해요." : kind === "MISMATCH" ? "장작 사용 금지 구역이에요." : "장작 허용 여부 확인이 필요해요." });
  }
  const states = checks.map((x) => x.state);
  const overall = !checks.length ? "NONE" : states.includes("MISMATCH") ? "MISMATCH" : states.includes("UNKNOWN") ? "UNKNOWN" : states.includes("CONDITIONAL") ? "CONDITIONAL" : "MATCH";
  return { overall, checks };
};
const SETUP_LABEL = { MATCH: "내 세팅에 맞음", CONDITIONAL: "조건부", UNKNOWN: "확인 필요", MISMATCH: "맞지 않음", NONE: "설정 안 함" };
const fits = (c) => {
  if (!state.profileFilter || !hasSetup()) return true;
  const overall = setupStatus(c).overall;
  return overall !== "MISMATCH" && (!state.profileStrict || overall === "MATCH");
};
// 추천순: 온라인 예약 채널·공식 안내가 풍부한 곳을 먼저. 온라인 예약 방식은 빈자리 확정값이 아니다.
const richness = (c) => (c._rich ??= (isRealtime(c) ? 8 : 0) + (c.booking.url ? 6 : c.homepage ? 2 : 0) + (c.img ? 4 : 0) + (c.kinds.length ? 2 : 0) + (c.sizes.length ? 1 : 0) + (c.fee ? 2 : 0) + (c.nearby_toilets ? 1 : 0));
const isFreshAvailability = () => {
  const expires = Date.parse(AVAILABILITY?.expires_at ?? "");
  return Number.isFinite(expires) && expires >= Date.now() && Array.isArray(AVAILABILITY?.records);
};
const dayValue = (value) => /^\d{4}-\d{2}-\d{2}/.test(String(value ?? "")) ? Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`) : NaN;
const previousDay = (value) => {
  const at = dayValue(value);
  return Number.isFinite(at) ? at - 86400000 : NaN;
};
// 요청한 숙박의 모든 밤이 공식 원문의 이용 기간 안에 있어야 한다. 원문에 이용 기간이
// 없거나 당일 체험이면 날짜별 후보로 섞지 않는다.
const coversStay = (record) => {
  if (!state.checkIn && !state.checkOut) return true;
  const from = dayValue(record?.use?.from), to = dayValue(record?.use?.to);
  const checkIn = dayValue(state.checkIn), lastNight = previousDay(state.checkOut);
  return [from, to, checkIn, lastNight].every(Number.isFinite) && from <= checkIn && to >= lastNight;
};
const availableRecords = (c, { dateMatch = false } = {}) => {
  if (!isFreshAvailability()) return [];
  return (AVAILABILITY?.records ?? []).filter((record) => record.campground_id === c.id && (record.state === "OFFICIAL_APPLICATION_OPEN" || record.state === "OBSERVED_AVAILABLE") && (!dateMatch || coversStay(record)));
};
const officialOpenRecords = availableRecords;
// 시도 표기(강원도/강원특별자치도 등)가 섞여 있어 짧은 이름으로 묶는다: “강원 평창군”, “경북 경주시”
const SIDO_SHORT = [[/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"], [/^광주/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"], [/^경기/, "경기"], [/^강원/, "강원"], [/^충청북|^충북/, "충북"], [/^충청남|^충남/, "충남"], [/^전라북|^전북/, "전북"], [/^전라남|^전남/, "전남"], [/^경상북|^경북/, "경북"], [/^경상남|^경남/, "경남"], [/^제주/, "제주"]];
const sidoShort = (s) => SIDO_SHORT.find(([re]) => re.test(s ?? ""))?.[1] ?? (s ?? "");
const sggKey = (c) => (c._sgg ??= `${sidoShort(c.sido)} ${c.sigungu ?? ""}`.trim());
const sggLabel = (k) => k;
const haystack = (c) => (c._hay ??= [c.name, c.sido, sidoShort(c.sido), c.sigungu, c.addr, c.line, ...c.th.map((id) => THEME_LABEL[id] ?? ""), ...c.kinds.map(([k]) => KIND[k]?.[0] ?? ""), ...c.amenities, ...c.env, ...c.themes, OP[c.op], ...c.types, ...c.booking.methods].filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, ""));
const THEME_LABEL = {};
const isRealtime = (c) => c.booking.methods.some((m) => /실시간/.test(m));
const hasChannel = (c, id) => c.booking.channels.some((channel) => channel.platform_id === id);
const hasSiteSize = (c) => c.field_conditions?.site_size?.groups?.length > 0 || c.sizes.length > 0;
const hasFloor = (c) => c.field_conditions?.ground?.types?.length > 0 || c.floors.length > 0;
const petOk = (c) => /가능/.test(c.pets ?? "") && !/불가/.test(c.pets ?? "");
const dist = (a, b) => { const R = 6371, t = Math.PI / 180, x = (b.lat - a.lat) * t, y = (b.lng - a.lng) * t; const h = Math.sin(x / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const hasKidsPlay = (c) =>
  c.field_conditions?.features?.some((f) => ["SWIMMING_POOL", "TRAMPOLINE", "AIR_BOUNCE", "PLAYGROUND", "CHILDREN_PLAYGROUND", "KIDS_PLAY", "TUBE_SLED", "INDOOR_PLAYROOM", "VIKING_RIDE", "ANIMAL_FEEDING"].includes(f)) ||
  c.amenities.some((a) => /물놀이|수영|트렘|방방|놀이터|에어바운스|썰매/.test(a));

// 현장 조건의 단일 표시 계약. 모든 화면(포스터 배지·카드 태그·필터·비교·상세)은 이 함수만 읽는다.
// grade: VERIFIED(파일럿 원문 대조) > CONFIRMED(고캠핑 구조화 등록값) > SURVEYED(소개글 신호) > UNKNOWN.
// 강한 배지·필터·내 세팅 확정 판정은 VERIFIED(일부는 CONFIRMED)만 쓰고, SURVEYED는 ‘소개글 기반’으로만 보인다.
// 모르는 값은 기본값(600W, 지정 주차, 온수 상시 등)으로 채우지 않는다.
// OPERATOR: 운영자가 자기 홈페이지에 공개한 문장에서 자동으로 꺼낸 값(원문 문장·URL·확인 시각 보존). 사람이 대조한 VERIFIED와 다르다.
const GRADE_LABEL = { VERIFIED: "원문 대조", OPERATOR: "운영자 공개", CONFIRMED: "고캠핑 등록값", SURVEYED: "소개글 기반", UNKNOWN: "확인 필요" };
const GRADE_CLASS = { VERIFIED: "confirmed", OPERATOR: "confirmed", CONFIRMED: "confirmed", SURVEYED: "partial", UNKNOWN: "unknown" };
const gradeOf = (part, f) => {
  if (f?.status === "VERIFIED" && part) return part.state === "UNKNOWN" ? "UNKNOWN" : "VERIFIED";
  const s = part?.state;
  return s === "VERIFIED" || s === "CONFIRMED" || s === "SURVEYED" ? s : s === "PARTIAL" ? "CONFIRMED" : "UNKNOWN";
};
const isFact = (g) => g === "VERIFIED" || g === "OPERATOR" || g === "CONFIRMED";
// 운영자 홈페이지 사실(c.of: w·pk·fire·cc). 각 값은 { v, q(원문 문장), u(URL), t(확인 시각) }.
const opSrc = (x) => x ? { label: "운영자 홈페이지", url: x.u, checked_at: x.t, quote: x.q } : null;
const KIDS_AMENITY_RE = /물놀이|수영|트렘|방방|놀이터|에어바운스|썰매/;
function conditionView(c) {
  if (c._cv) return c._cv;
  const f = c.field_conditions ?? {};
  const verified = f.status === "VERIFIED";
  const out = {};
  // 주차
  {
    const p = f.parking ?? {}, g = gradeOf(p, f), z = p.tent_side_zones;
    const mode = p.mode && p.mode !== "UNKNOWN" ? p.mode : null;
    const partialZones = z && z.adjacent > 0 && z.adjacent < z.total;
    const autoSites = p.auto_camping_sites ?? null;
    out.parking = {
      grade: mode || p.tent_side != null || partialZones ? g : "UNKNOWN",
      tentSide: p.tent_side === true ? true : p.tent_side === false ? false : null,
      partial: partialZones ? z : null,
      cart: p.cart_required === true || mode === "CART_REQUIRED",
      value: partialZones ? `${z.total}개 구역 중 ${z.adjacent}곳 텐트 옆` : p.tent_side === true ? "텐트 옆 주차" : mode === "CART_REQUIRED" ? "짐수레 이동" : mode ? (PARKING_NAME[mode] ?? mode) : autoSites ? `오토 사이트 ${autoSites}면` : "확인 필요",
      note: partialZones ? "구역마다 주차 동선이 달라요. 예약할 구역을 확인하세요." : mode ? "" : autoSites ? "오토 사이트 수는 등록돼 있지만, 텐트 바로 옆 주차인지는 구역별로 달라요." : "주차 동선이 등록되지 않았어요.",
    };
    if (out.parking.grade === "UNKNOWN" && autoSites) out.parking.grade = "UNKNOWN";
  }
  // 전력
  {
    const p = f.power ?? {}, g = gradeOf(p, f);
    const w = Number(p.limit_w) > 0 ? Number(p.limit_w) : null;
    const available = p.available === true || c.amenities.some((a) => /전기/.test(a));
    out.power = {
      grade: w ? g : available ? "CONFIRMED" : "UNKNOWN",
      watts: w, available,
      value: w ? `최대 ${w.toLocaleString()}W` : available ? "전기 제공 · W 미확인" : "확인 필요",
      note: w ? [p.breaker_capacity && `차단기 ${p.breaker_capacity}`, g === "SURVEYED" && "소개글에 적힌 수치"].filter(Boolean).join(" · ") : available ? "사이트당 사용 가능 W는 예약처 공지를 확인하세요." : "",
    };
  }
  // 장작·숯
  {
    const fw = f.firewood ?? {}, ch = f.charcoal ?? {};
    const fwg = fw.allowed != null || fw.rule === "DESIGNATED_ONLY" ? gradeOf(fw, f) : "UNKNOWN";
    const designated = fw.rule === "DESIGNATED_ONLY";
    out.firewood = {
      grade: fwg, allowed: fw.allowed ?? null, designated,
      value: designated ? "지정 구역만 장작" : fw.allowed === true ? "장작 불멍 가능" : fw.allowed === false ? "장작 금지" : fw.sold ? "장작 판매(사용 규정 미확인)" : "확인 필요",
      note: fw.allowed == null && fw.sold ? "장작 판매와 장작 사용 허용은 다른 정보예요." : "",
    };
    const chg = ch.allowed != null ? gradeOf(ch, f) : "UNKNOWN";
    const pit = f.fire_pit?.arrangement ?? null;
    out.charcoal = {
      grade: chg, allowed: ch.allowed ?? null,
      value: ch.allowed === true ? "숯 사용 가능" : ch.allowed === false ? "숯 금지" : "확인 필요",
      note: pit ? `화로대: ${pit}` : "",
    };
  }
  // 위생
  {
    const s = f.sanitary ?? {};
    const bathGrade = verified ? (s.private_bathroom != null ? "VERIFIED" : "UNKNOWN") : s.private_bathroom ? (s.private_bathroom_state ?? "SURVEYED") : "UNKNOWN";
    const toilets = s.toilets_count ?? c.toilets ?? null, showers = s.showers_count ?? c.showers ?? null;
    out.sanitary = {
      grade: s.private_bathroom === true ? bathGrade : toilets || showers ? (verified ? "VERIFIED" : "CONFIRMED") : "UNKNOWN",
      privateBath: s.private_bathroom === true, bathGrade,
      value: s.private_bathroom === true ? "개별 욕실" : toilets || showers ? [toilets && `화장실 ${toilets}`, showers && `샤워실 ${showers}`].filter(Boolean).join(" · ") : "확인 필요",
      note: [s.hot_water && `온수 ${s.hot_water}`, verified && s.note].filter(Boolean).join(" · "),
    };
  }
  // 규격·바닥
  {
    const groups = f.site_size?.groups?.length ? f.site_size.groups : c.sizes.map(([w, d, n]) => ({ width_m: w, depth_m: d, count: n }));
    const sg = f.site_size?.groups?.length ? gradeOf(f.site_size, f) : c.sizes.length ? "CONFIRMED" : "UNKNOWN";
    out.size = { grade: sg, groups, value: groups.length ? groups.map((g) => `${g.width_m}×${g.depth_m}m${g.count ? ` ${g.count}면` : ""}`).join(" / ") : "확인 필요", note: "" };
    const floors = f.ground?.types?.length ? f.ground.types.map((x) => [x.type, x.count]) : c.floors;
    out.floor = { grade: floors.length ? (verified ? "VERIFIED" : "CONFIRMED") : "UNKNOWN", value: floors.length ? floors.map(([t, n]) => `${floorName(t)}${n ? ` ${n}면` : ""}`).join(" · ") : "확인 필요", note: "" };
  }
  // 텐트·타프·캐노피 규정: 원문 대조값만. 면적으로 추정하지 않는다.
  {
    const sh = f.shelter_setup ?? {}, g = verified && (sh.max_tents != null || sh.max_tarps != null || sh.canopy_allowed != null) ? "VERIFIED" : "UNKNOWN";
    out.shelter = {
      grade: g,
      value: g === "UNKNOWN" ? "확인 필요" : [sh.max_tents != null && `텐트 ${sh.max_tents}동`, sh.max_tarps != null && `타프 ${sh.max_tarps}개`, sh.canopy_allowed === true ? "캐노피 가능" : sh.canopy_allowed === false ? "캐노피 불가" : null].filter(Boolean).join(" · "),
      note: g === "UNKNOWN" ? "추가 타프·캐노피 설치 기준은 운영자 공지를 확인하세요." : sh.note ?? "",
    };
  }
  // 아이·놀거리: 고캠핑 부대시설(구조화)은 CONFIRMED, 소개글 키워드는 SURVEYED, 파일럿은 VERIFIED
  {
    const amen = c.amenities.filter((a) => KIDS_AMENITY_RE.test(a));
    const feats = (f.features ?? []).filter((x) => FEATURE_NAME[x]);
    out.kids = {
      grade: verified && feats.length ? "VERIFIED" : amen.length ? "CONFIRMED" : feats.length ? "SURVEYED" : "UNKNOWN",
      amenities: amen, features: feats,
      value: verified && feats.length ? feats.map((x) => FEATURE_NAME[x]).join(" · ") : amen.length ? amen.join(" · ") : feats.length ? feats.map((x) => FEATURE_NAME[x]).join(" · ") : "확인 필요",
      note: "수영장·체험은 운영 기간이 있어요. 방문 날짜에 운영하는지 확인하세요.",
    };
  }
  // 대여
  {
    const r = f.rental_offers ?? [];
    out.rental = { grade: r.length ? (verified ? "VERIFIED" : "CONFIRMED") : "UNKNOWN", items: r, value: r.length ? r.map((x) => x.item).join(" · ") : "확인 필요", note: "" };
  }
  // 운영자 홈페이지 문장(OPERATOR)은 원문 대조(VERIFIED)가 없는 칸만 채운다. 내 세팅 MATCH/MISMATCH에는 쓰지 않는다.
  const of = c.of ?? {};
  if (of.w && out.power.grade !== "VERIFIED") {
    const w = of.w.v;
    out.power = { ...out.power, grade: "OPERATOR", watts: w, available: true, value: `최대 ${w.toLocaleString()}W${of.w.max && of.w.max !== w ? ` (다른 안내 ${of.w.max.toLocaleString()}W)` : ""}`, note: "", src: opSrc(of.w) };
  }
  if (of.pk && out.parking.grade !== "VERIFIED") {
    const side = of.pk.v === "SITE_SIDE";
    out.parking = { ...out.parking, grade: "OPERATOR", tentSide: side ? true : false, cart: false, site: side, external: !side, value: side ? "사이트 옆 주차" : "외부 주차 후 이동", note: "", src: opSrc(of.pk) };
  }
  if (of.fire && out.firewood.grade !== "VERIFIED") {
    const v = of.fire.v;
    out.firewood = { ...out.firewood, grade: "OPERATOR", allowed: v === "FIREWOOD_OK", designated: false, value: v === "FIREWOOD_OK" ? "장작 불멍 가능" : v === "CHARCOAL_ONLY" ? "장작 금지 · 숯만" : "개인 화기 반입·사용 불가", note: "", src: opSrc(of.fire) };
    if (out.charcoal.grade !== "VERIFIED" && v !== "FIREWOOD_OK") out.charcoal = { ...out.charcoal, grade: "OPERATOR", allowed: v === "CHARCOAL_ONLY", value: v === "CHARCOAL_ONLY" ? "숯 사용 가능" : "숯 금지", src: opSrc(of.fire) };
  }
  out.carCamp = of.cc ? { grade: "OPERATOR", allowed: of.cc.v === true, value: of.cc.v ? "차박 가능" : "차박 불가", src: opSrc(of.cc) } : { grade: "UNKNOWN", allowed: null, value: "확인 필요" };
  out.firePit = c.fire ?? f.fire_pit?.arrangement ?? null; // 고캠핑 화로대 등록값(개별/불가/공동취사장)
  out.source = f.source ?? { url: c.gc_url, checked_at: c.modified_at, label: "한국관광공사 고캠핑 운영자 등록값" };
  out.verified = verified;
  return (c._cv = out);
}
const gradeChip = (g) => `<em class="grade grade-${g.toLowerCase()}">${GRADE_LABEL[g]}</em>`;

// 지도 마커는 “지도에 보이는 곳만” 조건을 빼고 그린다(지도를 옮기면 다른 곳도 보이도록).
function filtered({ forMap = false } = {}) {
  // 검색어는 띄어쓰기로 나눠 모두 포함하는 곳만(이름·지역·주소·한 줄 소개·테마·사이트 형태·시설·입지)
  const tokens = state.q.trim().toLowerCase().split(/\s+/).filter((t) => t && t !== "전국");
  const list = ALL.filter((c) => {
    if (state.savedOnly && !state.saved.has(c.id)) return false;
    if (!forMap && !inBounds(c)) return false;
    if (state.area !== "전국" && c.area !== state.area) return false;
    if (state.sgg && sggKey(c) !== state.sgg) return false;
    if (state.theme && !c.th.includes(state.theme)) return false;
    if (tokens.length && !tokens.every((t) => haystack(c).includes(t))) return false;
    if (state.kinds.size && !c.kinds.some(([k]) => state.kinds.has(k))) return false;
    if (state.realtime && !isRealtime(c)) return false;
    // 이 필터는 판매 재고가 아니라, 원천 API가 현재 “접수중”으로 응답한 상품만
    // 남긴다. 날짜가 있으면 이용 기간이 모든 숙박일을 덮는지도 함께 확인한다.
    if (state.availabilityOnly && !officialOpenRecords(c, { dateMatch: Boolean(state.checkIn && state.checkOut) }).length) return false;
    if (state.pet && !petOk(c)) return false;
    if (state.fee && !c.fee?.min) return false;
    if (state.toilet && !(c.nearby_toilets?.nearest?.[0]?.m <= 500)) return false;
    if (state.power && !hasPower(c)) return false;
    if (state.siteSize && !hasSiteSize(c)) return false;
    if (state.floor && !hasFloor(c)) return false;
    if (state.naverBooking && !hasChannel(c, "naver")) return false;
    if (state.camfitBooking && !hasChannel(c, "camfit")) return false;
    if (state.parkingSide && !isTentSideParking(c)) return false;
    if (state.parkingCart && !isCartParking(c)) return false;
    if (state.firewoodAllowed && !isFirewoodAllowed(c)) return false;
    if (state.powerHigh && !isHighPower(c)) return false;
    if (state.privateBath && !(conditionView(c).sanitary.privateBath || c.field_conditions?.sanitary?.private_bathroom === true)) return false;
    if (state.kidsPlay && !hasKidsPlay(c)) return false;
    return fits(c);
  });
  if (state.sort === "near" && state.here) list.sort((a, b) => dist(state.here, a) - dist(state.here, b));
  else if (state.sort === "fee") list.sort((a, b) => (a.fee?.min ?? 9e9) - (b.fee?.min ?? 9e9));
  else if (state.sort === "best") list.sort((a, b) => richness(b) - richness(a) || sortName(a).localeCompare(sortName(b), "ko"));
  else list.sort((a, b) => sortName(a).localeCompare(sortName(b), "ko"));
  return list;
}

// 목록에서도 480px/저품질 축소본을 늘려 보이지 않도록, 이미 media 브랜치에 함께
// 발행한 1280px 공식 파생본을 쓴다. 과거 카탈로그의 `ph`도 즉시 호환된다.
function largeLocalPhoto(path) {
  return String(path ?? "").replace(/-t\.webp(?=$|[?#])/, "-l.webp");
}

// 외부 사진은 제공자가 준 썸네일 주소 그대로(https로만 바꿔) 쓴다. 썸네일 주소 안의 원본 URL(fname)을
// 꺼내 블로그 원본을 직접 불러오거나 크기 인자를 바꾸지 않는다(제공자 표시 조건·원저작자 권리).
function remoteImg(url) {
  let u = String(url ?? "").trim().replace(/^http:\/\//i, "https://");
  if (u.includes("dthumb-phinf.pstatic.net") && u.includes("src=")) {
    try {
      const parsed = new URL(u);
      let inner = parsed.searchParams.get("src");
      if (inner) {
        inner = inner.replace(/^["']|["']$/g, "");
        u = decodeURIComponent(inner);
      }
    } catch {}
  }
  u = u.replace(/\/argon\/\d+x\d+_\d+_[a-z]+\//, "/argon/600x600_85_c/");
  if (u.includes("postfiles.pstatic.net") || u.includes("blogthumb.pstatic.net")) {
    u = u.replace(/\?type=w\d+/, "?type=w773");
  }
  return u;
}

function hiResImg(url) {
  let u = String(url ?? "").trim().replace(/^http:\/\//i, "https://");
  if (u.includes("dthumb-phinf.pstatic.net") && u.includes("src=")) {
    try {
      const parsed = new URL(u);
      let inner = parsed.searchParams.get("src");
      if (inner) {
        inner = inner.replace(/^["']|["']$/g, "");
        u = decodeURIComponent(inner);
      }
    } catch {}
  }
  const gc = u.replace(/\/thumb\/thumb_\d+_/, "/");
  let res = gc.replace(/\/argon\/\d+x\d+_\d+_[a-z]+\//, "/argon/0x0_85_c/");
  if (res.includes("postfiles.pstatic.net") || res.includes("blogthumb.pstatic.net")) {
    res = res.replace(/\?type=[a-zA-Z0-9_]+/, "?type=w966");
  }
  return res;
}

function canonicalImageKey(url) {
  if (!url) return null;
  let str = String(url).trim();
  if (/%[0-9a-fA-F]{2}/.test(str)) {
    try { str = decodeURIComponent(decodeURIComponent(str)); } catch {}
  }
  const mdaMatch = str.match(/(MDAx[a-zA-Z0-9_.-]+)/);
  if (mdaMatch) return `naver:${mdaMatch[1]}`;
  const argonMatch = str.match(/\/argon\/[^/]+\/([a-zA-Z0-9_-]+)/);
  if (argonMatch) return `argon:${argonMatch[1]}`;
  const gcMatch = str.match(/\/upload\/camp\/\d+\/(?:thumb\/thumb_\d+_)?([a-zA-Z0-9_.-]+)/);
  if (gcMatch) return `gc:${gcMatch[1]}`;
  try {
    const p = new URL(str.startsWith("http") ? str : `https://${str}`);
    const fn = (p.searchParams.get("fname") || p.pathname).split("/").filter(Boolean).pop() || "";
    const cleanFn = fn.toLowerCase().replace(/\.(jpe?g|png|webp|gif)$/, "");
    if (cleanFn && !/^(image|img|screenshot|thumbnail|photo|사진|배치도|다운로드)$/i.test(cleanFn) && cleanFn.length > 5) {
      return `fn:${cleanFn}`;
    }
  } catch {}
  return str.split("?")[0].replace(/^https?:\/\//, "");
}

function dedupeImages(items, getUrl) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const u = getUrl(it);
    if (!u) continue;
    const key = canonicalImageKey(u) || u;
    const rawKey = it?.img || it?.link || it?.url;
    const rawCanon = rawKey ? canonicalImageKey(rawKey) : null;
    if (seen.has(key)) continue;
    if (rawKey && seen.has(rawKey)) continue;
    if (rawCanon && seen.has(rawCanon)) continue;
    seen.add(key);
    if (rawKey) seen.add(rawKey);
    if (rawCanon) seen.add(rawCanon);
    out.push(it);
  }
  return out;
}

// 포스터 배지(v4): 전기 → 불멍 → 주차·차박, 늘 이 순서로 3칸 + 시간 신호 1칸(docs/DESIGN_SYSTEM.md v4).
// 채운 배지는 출처 있는 값(원문 대조·운영자 공개·고캠핑 구조화 등록값)만. 모르는 칸은 점선 ‘확인필요’로 남긴다.
// 소개글 신호(SURVEYED)·법정 참고 600W·오토 업종은 채운 배지로 만들지 않는다(PILOT_INTAKE_CONTRACT 2.1절).
const kw = (w) => (w >= 1000 ? `${+(w / 1000).toFixed(1)}kW` : `${w}W`);
function posterBadges(c) {
  const v = conditionView(c), out = [];
  const why = (d) => d?.src ? `${GRADE_LABEL[d.grade]} · ${d.src.quote ?? ""}` : d?.grade ? GRADE_LABEL[d.grade] : "";
  // 1. 불멍: 빨간 배지
  if (isFirewoodAllowed(c)) out.push(["fi", "#l-flame", v.firewood.designated ? "지정구역 불멍" : "불멍 가능", why(v.firewood) || "장작 불멍 가능", "badge-fire"]);
  else if (v.charcoal.allowed === true || v.firewood.allowed === false) out.push(["fi", "#l-flame", "숯만 가능", why(v.charcoal) || "장작 불가 (숯만)", "badge-fire-ban"]);
  else if ((v.firewood.allowed === false && v.charcoal.allowed === false) || v.firePit === "불가") out.push(["off", "#l-ban", "화기 금지", why(v.firewood) || "화기 전면 금지", "badge-fire-ban"]);
  else out.push(["uk", "#l-flame", "불멍", "확인 필요", "badge-unknown"]);

  // 2. 전기: 주황 배지
  const powerWatts = v.power.watts || (hasPower(c) ? (c.field_conditions?.power?.regulatory_reference_w || 600) : null);
  if (powerWatts) out.push(["pw", "#l-zap", `전기 ${kw(powerWatts)}`, why(v.power) || "전기 제공", "badge-power"]);
  else out.push(["uk", "#l-zap", "전기", "확인 필요", "badge-unknown"]);

  // 3. 주차·동선: 파란 배지
  if (v.carCamp.allowed === true) out.push(["pk", "#l-car", "차박 가능", why(v.carCamp), "badge-parking"]);
  else if (isTentSideParking(c)) out.push(["pk", "#l-car", "텐트 옆 주차", why(v.parking) || "오토캠핑 단독 주차", "badge-parking"]);
  else if (v.parking.grade === "VERIFIED" && v.parking.partial) out.push(["pk", "#l-car", "일부 옆 주차", why(v.parking), "badge-parking"]);
  else if (isCartParking(c)) out.push(["cart", "#l-shopping-cart", "짐수레 이동", why(v.parking) || "수레 이동 필수", "badge-cart"]);
  else out.push(["uk", "#l-car", "주차", "확인 필요", "badge-unknown"]);

  // 4. 개별 욕실 (있을 때 청록 배지)
  if (c.field_conditions?.sanitary?.private_bathroom) {
    out.push(["bath", "#l-bath", "개별 욕실", "단독 개별 화장실/샤워실 구비", "badge-bath"]);
  }
  return out;
}
const badgeHtml = ([k, i, label, why, badgeClass]) => {
  const cls = badgeClass || (
    k === "fi" ? "badge-fire" :
    k === "pw" ? "badge-power" :
    k === "pk" ? "badge-parking" :
    k === "cart" ? "badge-cart" :
    k === "bath" ? "badge-bath" :
    k === "avail" ? "badge-avail" : "badge-unknown"
  );
  return `<span class="poster-badge ${cls}"${why && k !== "uk" ? ` title="${esc(why)}"` : ""}>${ic(i, "i-xs")}${esc(label)}${k === "uk" ? ` <b class="uk-tag">확인필요</b>` : ""}</span>`;
};
function timeSignal(c, observations = []) {
  const obs = observations.find((r) => r.state === "OBSERVED_AVAILABLE");
  if (obs) return `<span class="poster-badge badge-avail">${ic("#l-sparkles", "i-xs")}빈자리 ${esc(hm(obs.observed_at) || ymd(obs.observed_at))}</span>`;
  if (observations.length) return `<span class="poster-badge badge-avail">${ic("#l-circle-check", "i-xs")}공식 접수 중</span>`;
  const nx = c.booking.next;
  if (nx) { const dd = Math.ceil((Date.parse(nx.at) - Date.now()) / 864e5); return `<span class="poster-badge badge-avail">${ic("#l-alarm-clock", "i-xs")}오픈 ${dd <= 0 ? "오늘" : `D-${dd}`}${nx.time_known ? ` · ${hm(nx.at).split(" ").pop()}` : ""}</span>`; }
  return "";
}
function renderPosterEmblems(c, observations = []) {
  return `<span class="poster-time">${timeSignal(c, observations)}</span><span class="poster-emblems" aria-label="전기·불멍·주차 요약">${posterBadges(c).map(badgeHtml).join("")}</span>`;
}

// 후기 장단점 한 줄: 이 캠핑장 이야기로 확인된 후기 요약 n건에서 센 주제(build-review-digest.mjs).
// 후기는 사실 확정값이 아니므로 건수를 함께 보인다. 단점 언급이 없으면 줄을 비우지 않고 ‘언급 없음’으로 둔다.
function rvLine(c) {
  const rv = c.rv;
  if (!rv) return "";
  const fmt = (xs) => xs.map(([t, n]) => `${esc(t)} <em>${n}</em>`).join(" · ");
  return `<span class="rv-line" title="블로그·카페 후기 요약 ${rv.n}건에서 센 주제예요(협찬 글이 섞일 수 있어요)">
    <span class="pro">${ic("#l-thumbs-up", "i-xs")}${rv.p.length ? fmt(rv.p) : `<em>장점 언급 없음</em>`}</span>
    <span class="con">${ic("#l-thumbs-down", "i-xs")}${rv.c.length ? fmt(rv.c) : `<em>단점 언급 없음</em>`}<em>· 후기 ${rv.n}건</em></span>
  </span>`;
}
function card(c) {
  const km = state.here ? ` · ${dist(state.here, c).toFixed(0)}km` : "";
  const observations = officialOpenRecords(c, { dateMatch: Boolean(state.checkIn && state.checkOut) });
  const setup = hasSetup() ? setupStatus(c) : null;
  const setupTag = !setup ? "" : `<b class="verdict v-${setup.overall.toLowerCase()}">${SETUP_LABEL[setup.overall]}${setup.overall === "UNKNOWN" ? ` ${setup.checks.filter((x) => x.state === "UNKNOWN").length}` : ""}</b>`;
  const kinds = c.kinds.filter(([k]) => KIND[k]).map(([k, n]) => `${KIND[k][0]} ${n}`).slice(0, 2).join(" · ");
  return `<button class="card" type="button" data-open="${c.id}" aria-current="${state.open === c.id}">
    <span class="thumb${!c.ph && !c.img && c.sn ? " snap" : ""}">${renderPosterEmblems(c, observations)}${c.ph ? `<img src="../media/${esc(largeLocalPhoto(c.ph))}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : c.sn ? `<img src="${esc(String(c.sn).replace(/^http:/, "https:"))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement.classList.remove('snap');this.remove()"><em class="snap-tag">검색 사진</em>` : ic("#t-tent")}</span>
    <span class="card-body">
      <span class="card-title"><h3>${esc(c.name)}</h3><span class="card-actions">${state.saved.has(c.id) ? ic("#l-heart", "i-xs saved-mark") : ""}<span role="button" tabindex="0" class="btn-compare${state.compare.has(c.id) ? " on" : ""}" data-compare="${c.id}" aria-label="${state.compare.has(c.id) ? "비교함에서 제거" : "비교함에 담기"}" title="조건 비교함">${ic("#l-columns-2", "i-xs")}</span></span></span>
      <span class="loc">${esc([sidoShort(c.sido), c.sigungu].filter(Boolean).join(" "))}${km}${kinds ? ` · ${esc(kinds)}` : ""}</span>
      <span class="card-foot">${setupTag}${c.fee?.min ? `<span class="fee"><b>${band(c.fee.min)}</b>부터</span>` : ""}</span>
      ${rvLine(c)}
    </span></button>`;
}

function renderChips() {
  const count = (pred) => ALL.filter(pred).length;
  const openCount = () => count((c) => officialOpenRecords(c, { dateMatch: Boolean(state.checkIn && state.checkOut) }).length);
  $("#areaChips").innerHTML = AREAS.map((a) => `<button class="pill" type="button" data-area="${a}" aria-pressed="${state.area === a}">${a}</button>`).join("");
  // 권역을 고르면 그 안의 시군구로 한 단계 더 들어간다(캠핑장 많은 순).
  const sggs = state.area === "전국" ? [] : Object.entries(ALL.filter((c) => c.area === state.area).reduce((m, c) => ({ ...m, [sggKey(c)]: (m[sggKey(c)] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  $("#sggChips").hidden = !sggs.length;
  $("#sggChips").innerHTML = sggs.length ? [`<button class="pill pill-sub" type="button" data-sgg="" aria-pressed="${!state.sgg}">${esc(state.area)} 전체</button>`, ...sggs.map(([k, n]) => `<button class="pill pill-sub" type="button" data-sgg="${esc(k)}" aria-pressed="${state.sgg === k}">${esc(sggLabel(k))} <span class="num">${n}</span></button>`)].join("") : "";
  $("#filterChips").innerHTML = [
    `<button class="pill" type="button" data-toggle="savedOnly" aria-pressed="${state.savedOnly}">${ic("#l-heart", "i-sm")}관심 <span class="num">${state.saved.size}</span></button>`,
    map ? `<button class="pill" type="button" data-toggle="inView" aria-pressed="${state.inView}">${ic("#l-scan-search", "i-sm")}이 지역만</button>` : "",
    `<button class="pill" type="button" data-toggle="availabilityOnly" aria-pressed="${state.availabilityOnly}" ${isFreshAvailability() ? "" : "disabled"}>${ic("#l-circle-check", "i-sm")}접수 중 <span class="num">${isFreshAvailability() ? openCount() : "-"}</span></button>`,
    `<button class="pill" type="button" data-toggle="parkingSide" aria-pressed="${state.parkingSide}">${ic("#l-car", "i-sm")}옆 주차 <span class="num">${count(isTentSideParking)}</span></button>`,
    `<button class="pill" type="button" data-toggle="parkingCart" aria-pressed="${state.parkingCart}">짐수레 <span class="num">${count(isCartParking)}</span></button>`,
    `<button class="pill" type="button" data-toggle="firewoodAllowed" aria-pressed="${state.firewoodAllowed}">${ic("#l-flame", "i-sm")}장작 <span class="num">${count(isFirewoodAllowed)}</span></button>`,
    `<button class="pill" type="button" data-toggle="powerHigh" aria-pressed="${state.powerHigh}">${ic("#l-zap", "i-sm")}700W+ <span class="num">${count(isHighPower)}</span></button>`,
    `<button class="pill" type="button" data-toggle="privateBath" aria-pressed="${state.privateBath}">${ic("#l-shower-head", "i-sm")}개별 욕실 <span class="num">${count((c) => conditionView(c).sanitary.privateBath || c.field_conditions?.sanitary?.private_bathroom === true)}</span></button>`,
    `<button class="pill" type="button" data-toggle="kidsPlay" aria-pressed="${state.kidsPlay}">${ic("#l-baby", "i-sm")}키즈 <span class="num">${count(hasKidsPlay)}</span></button>`,
    `<button class="pill" type="button" data-toggle="realtime" aria-pressed="${state.realtime}">${ic("#l-zap", "i-sm")}온라인 예약 <span class="num">${count(isRealtime)}</span></button>`,
    ...Object.entries(KIND).filter(([k]) => k !== "RV_PITCH").map(([k, [l, i]]) => `<button class="pill" type="button" data-kind="${k}" aria-pressed="${state.kinds.has(k)}">${ic(i, "i-sm")}${l}</button>`),
    `<span class="sep"></span>`,
    `<button class="pill" type="button" data-toggle="pet" aria-pressed="${state.pet}">${ic("#l-dog", "i-sm")}반려견</button>`,
    `<button class="pill" type="button" data-toggle="power" aria-pressed="${state.power}">${ic("#l-plug-zap", "i-sm")}전기 <span class="num">${count(hasPower)}</span></button>`,
    `<button class="pill" type="button" data-toggle="siteSize" aria-pressed="${state.siteSize}">${ic("#l-ruler", "i-sm")}규격 <span class="num">${count(hasSiteSize)}</span></button>`,
    `<button class="pill" type="button" data-toggle="floor" aria-pressed="${state.floor}">${ic("#t-layers-subtract", "i-sm")}바닥 <span class="num">${count(hasFloor)}</span></button>`,
    `<button class="pill" type="button" data-toggle="naverBooking" aria-pressed="${state.naverBooking}">네이버 <span class="num">${count((c) => hasChannel(c, "naver"))}</span></button>`,
    `<button class="pill" type="button" data-toggle="camfitBooking" aria-pressed="${state.camfitBooking}">캠핏 <span class="num">${count((c) => hasChannel(c, "camfit"))}</span></button>`,
    `<button class="pill" type="button" data-toggle="fee" aria-pressed="${state.fee}">${ic("#t-coin", "i-sm")}요금</button>`,
    `<button class="pill" type="button" data-setup-focus aria-pressed="${hasSetup()}">${ic("#l-backpack", "i-sm")}내 세팅</button>`,
  ].join("");
}

const tipBtn = (html, label = "설명·출처 보기") => `<button type="button" class="tip" aria-label="${label}" data-tip="${esc(html)}">${ic("#l-info", "i-xs")}</button>`;
function renderAvailabilityQuery() {
  const checkIn = $("#checkIn"), checkOut = $("#checkOut"), clear = $("#availabilityClear"), notice = $("#availabilityNotice");
  if (!checkIn || !checkOut || !clear || !notice) return;
  checkIn.value = state.checkIn;
  checkOut.value = state.checkOut;
  checkOut.min = state.checkIn || "";
  clear.hidden = !(state.checkIn || state.checkOut || state.availabilityOnly);
  const seoul = `<a href="https://yeyak.seoul.go.kr/web/main.do" target="_blank" rel="noopener">서울 공공예약에서 최종 확인</a>`;
  const nationalPark = `<a href="https://reservation.knps.or.kr/reservation/searchCampRemainSite.do" target="_blank" rel="noopener">국립공원 잔여 현황</a>`;
  const forest = `<a href="https://www.foresttrip.go.kr/rep/or/fcfsRsrvtMain.do?hmpgId=0116&amp;menuId=001001" target="_blank" rel="noopener">숲나들e 예약</a>`;
  if (!isFreshAvailability()) {
    // v4: 설명은 (i) 안으로. 화면에는 상태 한 줄만.
    notice.innerHTML = `<span>접수 상태 갱신 중</span>${tipBtn(`<p>잔여 사이트 수는 공식 예약처에서 최종 확인하세요. 잔여 수량은 제공 가능한 공식 API·제휴 채널이 연결될 때만 표시합니다.</p><p>${nationalPark} · ${forest}</p>`)}`;
    return;
  }
  const isDateQuery = Boolean(state.checkIn && state.checkOut);
  const records = AVAILABILITY.records.filter((record) => record.state === "OFFICIAL_APPLICATION_OPEN" && (!isDateQuery || coversStay(record)));
  const camps = new Set(records.map((record) => record.campground_id)).size;
  const observed = hm(AVAILABILITY.generated_at) || ymd(AVAILABILITY.generated_at);
  const dateCopy = isDateQuery ? `${state.checkIn.replaceAll("-", ".")} ~ ${state.checkOut.replaceAll("-", ".")} 숙박 기준 ` : "";
  notice.innerHTML = `<span><b>${dateCopy}공식 접수 중 ${camps.toLocaleString()}곳</b> · ${records.length.toLocaleString()}개 상품</span>${tipBtn(`<p>서울시 API ${observed} 확인. 빈자리 수·결제 확정이 아닙니다. 잔여 사이트 수는 공식 예약처에서 최종 확인하세요.</p><p>${seoul} · ${nationalPark} · ${forest}</p>`)}`;
}

function renderSetupQuery() {
  const gear = $("#profileGear"), power = $("#profilePower"), parking = $("#profileParking"), firewood = $("#profileFirewood"), filter = $("#profileFilter"), strict = $("#profileStrict"), summary = $("#setupSummary"), help = $("#setupHelp");
  if (!gear || !power || !parking || !firewood || !filter || !strict || !summary || !help) return;
  gear.value = state.gear; power.value = state.profilePower;
  parking.checked = state.profileParking; firewood.checked = state.profileFirewood;
  filter.checked = state.profileFilter; strict.checked = state.profileStrict;
  filter.disabled = !hasSetup(); strict.disabled = !hasSetup() || !state.profileFilter;
  const labels = [
    state.gear && GEAR.find(([value]) => value === state.gear)?.[1],
    state.profilePower && `${Number(state.profilePower).toLocaleString()}W 이상`,
    state.profileParking && "텐트 옆 주차",
    state.profileFirewood && "장작 불멍",
  ].filter(Boolean);
  summary.textContent = labels.length ? labels.join(" · ") : "장비와 필수 조건을 넣어 보세요";
  help.textContent = !labels.length
    ? "값은 이 기기에만 저장돼요. 조건을 고르면 카드와 상세에서 근거 기반 판정을 보여 줍니다."
    : state.profileStrict
      ? "등록된 모든 조건이 맞는 곳만 남깁니다. 미확인·조건부 정보도 제외하므로 결과가 적을 수 있어요."
      : state.profileFilter
        ? "근거상 맞지 않는 곳만 숨깁니다. ‘확인 필요’는 가능으로 처리하지 않고 목록에 남겨 직접 비교할 수 있어요."
        : "현재는 모든 후보를 보되, 카드와 상세에서 내 조건의 근거·확인 필요·불일치를 구분해 보여 줍니다.";
  // v4: 설명은 (i) 말풍선으로. ‘맞음/맞지 않음’은 사람이 원문 대조한 값으로만 판정한다는 기준도 함께.
  const tip = $("#setupTip");
  if (tip) tip.dataset.tip = `<p>${esc(help.textContent)}</p><p>전력 W·텐트 옆 주차·장작 불멍의 맞음/맞지 않음은 사람이 원문 대조한 값으로만 판정해요. 운영자 홈페이지 문장은 배지로 보여 주지만 판정에는 ‘확인 필요’로 남겨요.</p>`;
}

/* ---------- 둘러보기: 테마 공간 ---------- */
function renderHub() {
  const hub = $("#hub");
  const themes = META?.themes ?? [];
  if (!themes.length) { hub.innerHTML = ""; return; }
  const t = themes.find((x) => x.id === state.theme);
  const scope = state.sgg ? sggLabel(state.sgg) : state.area;
  if (t) {
    hub.innerHTML = `<section class="theme-head" aria-label="${esc(t.label)} 테마">
      <span class="theme-ic">${ic(THEME_ICON[t.id] ?? "#t-tent")}</span>
      <div><small>${esc(scope)} · ${esc(t.group)} 테마</small><h2>${esc(t.label)}</h2><p data-wrap-ok>${esc(t.desc)}</p></div>
      <div class="theme-act"><button class="round" type="button" data-share-theme aria-label="이 테마 공유">${ic("#l-share-2", "i-sm")}</button><button class="round" type="button" data-th="" aria-label="테마 해제">${ic("#l-x", "i-sm")}</button></div>
    </section>`;
    return;
  }
  // 테마 둘러보기는 별도 메뉴(테마 → themes/)로 옮겼다. 목록 위에는 고른 테마 머리만 둔다.
  hub.innerHTML = "";
}
const titleOf = (n) => state.availabilityOnly
  ? `${state.checkIn && state.checkOut ? `${state.checkIn.replaceAll("-", ".")} ~ ${state.checkOut.replaceAll("-", ".")} ` : ""}공식 접수 중 ${n.toLocaleString()}곳`
  : (state.q.trim() ? `‘${state.q.trim()}’ 검색 결과 ${n.toLocaleString()}곳` : `캠핑장 ${n.toLocaleString()}곳`);
function renderListOnly() {
  const list = filtered();
  $("#resultTitle").textContent = titleOf(list.length);
  $("#cards").innerHTML = list.length ? list.slice(0, state.shown).map(card).join("") : emptyBox();
  $("#moreBtn").hidden = list.length <= state.shown;
}
const emptyBox = () => `<div class="empty">${ic("#t-tent-off")}<b>${state.savedOnly && !state.saved.size ? "아직 관심 캠핑장이 없어요" : state.availabilityOnly ? "현재 확인 가능한 공식 접수 상태가 없어요" : "조건에 맞는 캠핑장이 없어요"}</b><span data-wrap-ok>${state.savedOnly && !state.saved.size ? "상세 화면의 하트를 누르면 이 기기에 저장돼요." : state.availabilityOnly ? "모든 예약처가 잔여 수량 API를 제공하지는 않습니다. 날짜를 바꾸거나 공식 예약처에서 최종 확인해 보세요." : state.inView ? "지도를 옮기거나 축소해 보세요." : "필터를 줄여 보세요."}</span></div>`;
function renderList() {
  renderHub();
  const list = filtered();
  $("#resultTitle").textContent = titleOf(list.length);
  // 출처·기준일은 화면에 늘어놓지 않고 (i) 말풍선에만(소유자 요청 2026-10-16).
  $("#resultSub").innerHTML = tipBtn(state.availabilityOnly && isFreshAvailability()
    ? `<p>공식 접수 상태 ${ymd(AVAILABILITY.generated_at)} 확인. 잔여 수량은 예약처에서 확정돼요.</p>`
    : META ? `<p>전국 캠핑장 목록: 한국관광공사 고캠핑 ${ymd(META.sources[0]?.fetched_at)} 기준.</p><p>배지 근거: 사람이 원문 대조한 값·운영자 홈페이지 문장·고캠핑 등록값. 모르는 칸은 ‘확인필요’예요.</p>` : "<p>데이터 불러오는 중</p>", "데이터 기준 보기");
  $("#cards").innerHTML = list.length ? list.slice(0, state.shown).map(card).join("")
    : emptyBox();
  $("#moreBtn").hidden = list.length <= state.shown;
  $("#moreBtn").innerHTML = `${ic("#l-chevron-down", "i-sm")}더 보기 <span class="num">${Math.min(PAGE, list.length - state.shown)}</span>`;
  renderMarkers(filtered({ forMap: true }));
}

/* ---------- 비교 UX (Compare Drawer / Modal) ---------- */
function toggleCompare(id) {
  if (state.compare.has(id)) {
    state.compare.delete(id);
    toast("비교함에서 제외했어요.");
  } else {
    if (state.compare.size >= 3) {
      toast("최대 3곳까지 동시에 비교할 수 있어요.");
      return;
    }
    state.compare.add(id);
    const c = ALL.find((x) => x.id === id);
    toast(c ? `‘${c.name}’을(를) 비교함에 담았어요.` : "비교함에 담았어요.");
  }
  save();
  renderCompareBar();
  renderListOnly();
  if (state.open === id) {
    const detailBtn = $(`[data-compare="${id}"]`, $("#sheetRoot"));
    if (detailBtn) {
      detailBtn.setAttribute("aria-pressed", String(state.compare.has(id)));
      const span = $("span", detailBtn);
      if (span) span.textContent = state.compare.has(id) ? "비교 중" : "비교함";
    }
  }
  if ($("#compareModal")) {
    if (state.compare.size < 2) closeCompareModal();
    else openCompareModal();
  }
}

function clearCompare() {
  state.compare.clear();
  save();
  renderCompareBar();
  renderListOnly();
  closeCompareModal();
  toast("비교함을 비웠습니다.");
}

function renderCompareBar() {
  const bar = $("#compareBar");
  if (!bar) return;
  const count = state.compare.size;
  if (count === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  $("#compareCount").textContent = `비교함 ${count}/3`;
  const openBtn = $("#openCompareBtn");
  if (openBtn) {
    openBtn.disabled = count < 2;
    const span = $("span", openBtn);
    if (span) span.textContent = count >= 2 ? `${count}곳 1:1 조건 비교` : "2곳 이상 선택";
  }
  const selectedCamps = [...state.compare].map((id) => ALL.find((c) => c.id === id)).filter(Boolean);
  $("#compareThumbs").innerHTML = selectedCamps.map((c) => `
    <span class="compare-chip" title="${esc(c.name)}">
      <span>${esc(c.name)}</span>
      <button class="compare-chip-del" type="button" data-compare-del="${c.id}" aria-label="제거">${ic("#l-x", "i-xs")}</button>
    </span>
  `).join("");
}

function openCompareModal() {
  const ids = [...state.compare];
  if (ids.length < 2) {
    toast("비교할 캠핑장을 2곳 이상 선택해 주세요.");
    return;
  }
  const camps = ids.map((id) => ALL.find((c) => c.id === id)).filter(Boolean);
  if (camps.length < 2) return;
  // 이용 정보 스펙은 상세 파일에 있다. 없는 곳만 받아 온 뒤 다시 그린다.
  const missing = camps.filter((c) => !DETAIL.has(c.id));
  if (missing.length) {
    Promise.all(missing.map((c) => fetch(`data/camps/${c.id}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d) => DETAIL.set(c.id, d)))).then(() => openCompareModal());
    return;
  }

  const rowCampHeader = `<tr>
    <th class="compare-col-head">캠핑장</th>
    ${camps.map((c) => `
      <td class="compare-camp-head">
        <div class="compare-camp-thumb">${c.ph ? `<img src="../media/${esc(largeLocalPhoto(c.ph))}" alt="" loading="lazy">` : c.img ? `<img src="${esc(c.img)}" alt="" referrerpolicy="no-referrer">` : c.sn ? `<img src="${esc(String(c.sn).replace(/^http:/, 'https:'))}" alt="" referrerpolicy="no-referrer">` : ic("#t-tent")}</div>
        <h4 class="compare-camp-name">${esc(c.name)}</h4>
        <div class="compare-camp-loc">${esc([c.sido, c.sigungu].filter(Boolean).join(" "))}</div>
        <div class="compare-camp-price">${c.fee?.min ? `<b>${band(c.fee.min)}부터</b>` : `<span>요금 안내 없음</span>`}</div>
        <div class="compare-camp-actions">
          <button class="compare-camp-del" type="button" data-compare-del="${c.id}">${ic("#l-trash-2", "i-xs")} 제거</button>
        </div>
      </td>
    `).join("")}
  </tr>`;

  const rowSetupFit = `<tr>
    <th class="compare-col-head">내 세팅 적합성</th>
    ${camps.map((c) => {
      if (!hasSetup()) return `<td><span class="compare-fit-badge unknown">세팅 미입력</span><p class="compare-note">상단 ‘내 캠핑 세팅’을 입력하면 장비·전력·주차·불멍 조건과 비교해요.</p></td>`;
      const setup = setupStatus(c);
      const overallClass = setup.overall.toLowerCase();
      const reasons = setup.checks.map((ch) => {
        const icon = ch.state === "MATCH" ? "#l-circle-check" : ch.state === "MISMATCH" ? "#l-circle-x" : "#l-circle-help";
        return `<span class="compare-tag ${ch.state === "MATCH" ? "highlight" : ch.state === "MISMATCH" ? "warn" : ""}">${ic(icon, "i-xs")}${esc(ch.label)}: ${esc(SETUP_LABEL[ch.state])}</span>`;
      }).join("");
      return `<td>
        <span class="compare-fit-badge ${overallClass}">${ic(setup.overall === "MATCH" ? "#l-circle-check" : setup.overall === "MISMATCH" ? "#l-circle-x" : "#l-circle-help", "i-xs")}${SETUP_LABEL[setup.overall]}</span>
        <div>${reasons}</div>
      </td>`;
    }).join("")}
  </tr>`;

  // 조건 행은 conditionView 하나에서 만든다. 값마다 근거 등급을 붙이고, 모르는 값은 ‘확인 필요’로 둔다.
  const condRow = (title, key, { good = () => false, bad = () => false } = {}) => `<tr>
    <th class="compare-col-head">${title}</th>
    ${camps.map((c) => {
      const d = conditionView(c)[key];
      const cls = d.grade === "UNKNOWN" ? "" : isFact(d.grade) && good(d) ? "highlight" : isFact(d.grade) && bad(d) ? "warn" : "";
      return `<td><span class="compare-tag ${cls}">${esc(d.value)}</span> ${gradeChip(d.grade)}${d.note ? `<div class="compare-note">${esc(d.note)}</div>` : ""}</td>`;
    }).join("")}
  </tr>`;
  const rowParking = condRow("주차 동선", "parking", { good: (d) => d.tentSide === true, bad: (d) => d.cart });
  const rowPower = condRow("전기·최대 W", "power", { good: (d) => d.watts >= 700 });
  const rowFirewood = condRow("장작 불멍", "firewood", { good: (d) => d.allowed === true, bad: (d) => d.allowed === false });
  const rowCharcoal = condRow("숯·화로대", "charcoal", { good: (d) => d.allowed === true, bad: (d) => d.allowed === false });
  const rowSanitary = condRow("위생", "sanitary", { good: (d) => d.privateBath });
  const rowKids = condRow("아이·놀거리", "kids", { good: () => true });
  const rowSizes = condRow("사이트 규격", "size");
  const rowFloor = condRow("바닥", "floor");
  const rowShelter = condRow("텐트·타프·캐노피", "shelter");
  const rowRentals = condRow("현장 대여", "rental");

  const specRows = SPEC_ORDER.flatMap(([, , rows]) => rows).map(([code, label]) => `<tr>
    <th class="compare-col-head">${label}</th>
    ${camps.map((c) => `<td class="spec-cmp">${specCell(DETAIL.get(c.id)?.spec?.fields?.[code], { compact: true })}</td>`).join("")}
  </tr>`).join("");

  const rowAvailability = `<tr>
    <th class="compare-col-head">최근 빈자리 현황</th>
    ${camps.map((c) => {
      const recs = availableRecords(c);
      if (!recs.length) return `<td><span class="compare-note">최근 관측 없음 · 예약처에서 확인</span></td>`;
      const lines = recs.slice(0, 2).map((r) => {
        const isObs = r.state === "OBSERVED_AVAILABLE";
        const tag = isObs ? `<span class="compare-tag highlight">빈자리 관측</span>` : `<span class="compare-tag">공식 접수중</span>`;
        const count = r.inventory_verified && r.remaining_count != null ? `잔여 ${r.remaining_count}자리` : "";
        const seen = isObs ? `${hm(r.observed_at) || ymd(r.observed_at)} 관측` : "";
        const dateStr = r.use?.from ? `${r.use.from.slice(5, 10).replace("-", "/")}` : "";
        return `<div>${tag} <small>${esc(r.product_name)} ${dateStr} ${count} ${seen}</small></div>`;
      }).join("");
      return `<td>${lines}</td>`;
    }).join("")}
  </tr>`;

  const rowAction = `<tr>
    <th class="compare-col-head">예약처</th>
    ${camps.map((c) => {
      const t = bookingTarget(c);
      return `<td>${t ? `<a class="compare-btn-link" href="${esc(t.href)}" ${t.ext ? 'target="_blank" rel="noopener"' : ""}><span>${esc(t.label)}</span>${ic("#l-arrow-up-right", "i-xs")}</a>` : `<span class="compare-note">등록된 예약 경로 없음</span>`}</td>`;
    }).join("")}
  </tr>`;

  const modalHtml = `
    <div class="compare-overlay" id="compareModal" role="dialog" aria-modal="true" aria-labelledby="compareTitle">
      <div class="compare-dialog">
        <div class="compare-header">
          <div class="compare-header-title">
            <h3 id="compareTitle">${ic("#l-columns-2", "i-sm")} 캠핑장 조건 1:1 비교</h3>
            <p data-wrap-ok>후보 ${camps.length}곳의 조건을 같은 기준으로 놓았어요. 값 옆 표시는 근거 수준입니다(원문 대조 · 고캠핑 등록값 · 소개글 기반 · 확인 필요).</p>
          </div>
          <div class="compare-header-actions"><button class="compare-share-btn" type="button" data-share-compare>${ic("#l-share-2", "i-xs")}비교 공유</button><button class="compare-close-btn" type="button" data-close-compare aria-label="비교 닫기">${ic("#l-x", "i-sm")}</button></div>
        </div>
        <div class="compare-scroll">
          <table class="compare-table">
            <tbody>
              ${rowCampHeader}
              ${rowSetupFit}
              <tr class="compare-sep"><th colspan="${camps.length + 1}">이용 정보 스펙</th></tr>
              ${specRows}
              <tr class="compare-sep"><th colspan="${camps.length + 1}">현장 조건</th></tr>
              ${rowParking}
              ${rowPower}
              ${rowFirewood}
              ${rowCharcoal}
              ${rowSanitary}
              ${rowKids}
              ${rowSizes}
              ${rowFloor}
              ${rowShelter}
              ${rowRentals}
              ${rowAvailability}
              ${rowAction}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  $("#compareRoot").innerHTML = modalHtml;
  document.body.classList.add("detail-open");
}

function closeCompareModal() {
  const modal = $("#compareModal");
  if (modal) {
    modal.remove();
    if (!state.open) document.body.classList.remove("detail-open");
  }
}

/* ---------- 지도(카카오) ---------- */
function initMap() {
  const el = $("#map");
  if (!KAKAO_KEY) { el.innerHTML = `<div class="map-empty"><div>${ic("#l-map")}<p data-wrap-ok>지도 키가 설정되지 않아 목록만 표시합니다.</p></div></div>`; return; }
  const s = document.createElement("script");
  s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_KEY)}&autoload=false&libraries=clusterer`;
  s.onload = () => kakao.maps.load(() => {
    map = new kakao.maps.Map(el, { center: new kakao.maps.LatLng(36.4, 127.8), level: 13 });
    map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    clusterer = new kakao.maps.MarkerClusterer({ map, averageCenter: true, minLevel: 8, disableClickZoom: false,
      styles: [{ width: "42px", height: "42px", background: "#101414", color: "#fff", boxShadow: "0 2px 10px rgba(16,20,20,.25)", borderRadius: "50%", textAlign: "center", lineHeight: "42px", fontWeight: "800", fontSize: "13px" }] });
    renderMarkers(filtered({ forMap: true }));
    renderChips();
    // 지도를 옮기거나 확대하면 “지도에 보이는 곳만” 목록을 다시 계산한다.
    kakao.maps.event.addListener(map, "idle", () => { if (state.inView) { state.shown = PAGE; renderListOnly(); } });
  });
  s.onerror = () => { el.innerHTML = `<div class="map-empty"><p data-wrap-ok>지도를 불러오지 못했습니다(도메인 등록 확인). 목록은 그대로 쓸 수 있어요.</p></div>`; };
  document.head.append(s);
}
// 지도 핀(Uber Base 패턴): 값 하나를 담은 검정 알약. 전력 W를 알면 W, 아니면 불멍, 아니면 이름 앞 글자.
// 모르는 곳은 흰 알약. 누르면 바로 상세로 가지 않고 아래 미리보기 카드를 띄운다.
function pinLabel(c) {
  const b = posterBadges(c);
  const known = b.find(([k]) => k !== "uk");
  if (known?.[0] === "pw") return ["", known[2], "var(--mc-volt)"];
  if (known?.[0] === "fi") return ["", known[2], "#ff8a5c"];
  if (known) return ["", known[2], ""];
  return ["uk", shortName(c.name).slice(0, 6), ""];
}
function renderMarkers(list) {
  if (!map || !clusterer) return;
  clusterer.clear(); markers.clear();
  const ms = list.map((c) => {
    const [cls, label, dot] = pinLabel(c);
    const el = document.createElement("button");
    el.type = "button"; el.className = `mpin ${cls}`; el.dataset.pin = c.id;
    el.setAttribute("aria-label", `${c.name} 미리보기`);
    el.innerHTML = `${dot ? `<i style="--dot:${dot}"></i>` : ""}${esc(label)}`;
    el.addEventListener("click", (e) => { e.stopPropagation(); peek(c.id); });
    const m = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(c.lat, c.lng), content: el, yAnchor: 1, clickable: true });
    markers.set(c.id, m); return m;
  });
  clusterer.addMarkers(ms);
}
// 지도 미리보기 카드: 사진·이름·지역·배지 3칸 + ‘자세히’. 핀이 초록으로 바뀐다.
function peek(id) {
  const c = ALL.find((x) => x.id === id);
  document.querySelectorAll(".mpin.on").forEach((x) => x.classList.remove("on"));
  document.querySelector(`.mpin[data-pin="${CSS.escape(String(id))}"]`)?.classList.add("on");
  let box = document.getElementById("mapPeek");
  if (!c) { box?.remove(); return; }
  if (!box) { box = document.createElement("div"); box.id = "mapPeek"; box.className = "map-peek"; $(".map-col").append(box); }
  const img = c.ph ? `../media/${largeLocalPhoto(c.ph)}` : c.img;
  box.innerHTML = `${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph'}))">` : `<span class="ph"></span>`}
    <div><b>${esc(c.name)}</b><small>${esc([sidoShort(c.sido), c.sigungu].filter(Boolean).join(" "))}${state.here ? ` · ${dist(state.here, c).toFixed(0)}km` : ""}</small>
    <span class="peek-badges">${timeSignal(c)}${posterBadges(c).map(badgeHtml).join("")}</span>
    <span class="peek-actions"><button type="button" class="peek-go" data-open="${c.id}">자세히</button><button type="button" class="peek-x" data-peek-close>닫기</button></span></div>`;
}

/* ---------- 상세 ---------- */
/* ---------- 상세: 이 화면 하나로 모든 정보를 ---------- */
const MEDIA = "../media/"; // 자체 저장 공식 사진(webp)
const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`);
const telHref = (t) => `tel:${String(t).replace(/[^\d+]/g, "")}`;
const mapLink = (name, lat, lng) => `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`;
const routeLink = (name, lat, lng) => `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
const roadviewLink = (lat, lng) => `https://map.kakao.com/link/roadview/${lat},${lng}`;
const naverMapLink = (name) => `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
const SECTIONS = [["sec-media", "사진·후기"], ["sec-info", "기본정보"], ["sec-book", "예약"], ["sec-site", "상품·요금"], ["sec-fac", "시설"], ["sec-official", "공식 안내"], ["sec-near", "주변"], ["sec-passport", "패스포트"], ["sec-talk", "댓글"]];
const NEAR_GROUPS = [["toilet", "화장실", "#l-toilet"], ["mart", "마트·장보기", "#l-shopping-cart"], ["conv", "편의점", "#l-store"], ["fuel", "주유소", "#l-fuel"], ["medical", "병원·약국", "#l-cross"], ["rest", "휴게소·졸음쉼터", "#l-coffee"], ["tour", "주변 관광", "#l-camera"], ["food", "맛집", "#l-utensils"], ["gear", "철물·캠핑용품", "#l-wrench"]];
let DETAIL = new Map();
const POI_KIND = { supermarket: "마트", convenience: "편의점", butcher: "정육점", greengrocer: "청과·채소", hardware: "철물점", outdoor: "캠핑·아웃도어", fuel: "주유소", pharmacy: "약국", hospital: "병원", SERVICE_AREA: "고속도로 휴게소", REST_AREA: "휴게소", DROWSY_SHELTER: "졸음쉼터" };

const BOOK_KIND = { online: "예약 채널", homepage: "공식 홈페이지", phone: "전화 문의", onsite: "현장 문의" };
const BOOK_TRUST = (n) => n >= .85 ? "연결 근거 높음" : n >= .6 ? "공식 등록 링크" : "확인 필요";
const BOOKING_PREFERENCE = { camfit: 0, naver: 1 };
const bookingOrder = (ch) => {
  if (ch.kind === "online" && BOOKING_PREFERENCE[ch.platform_id] != null) return BOOKING_PREFERENCE[ch.platform_id];
  if (ch.kind === "online") return 2;
  if (ch.kind === "homepage") return 3;
  if (ch.kind === "phone") return 4;
  return 5;
};
function bookingChannels(c) {
  const existing = c.booking?.channels?.filter(Boolean) ?? [];
  // 이미 등록된 업장별 링크만 재정렬한다. 캠핏/네이버의 목록 페이지를 임의로 만들지 않는다.
  if (existing.length) return [...existing].sort((a, b) => bookingOrder(a) - bookingOrder(b));
  // 이전 발행 데이터와 호환: 채널 배열이 없는 경우에도 링크를 숨기지 않는다.
  return [
    c.booking?.url && { kind: "online", url: c.booking.url, confidence: .6, platform_name: null, evidence: ["reservation.url"] },
    c.homepage && { kind: "homepage", url: c.homepage, confidence: .6, platform_name: "캠핑장 자체 홈페이지", evidence: ["contact.homepage"] },
    c.tel && { kind: "phone", url: telHref(c.tel), confidence: .5, platform_name: null, evidence: ["contact.tel"] },
  ].filter(Boolean).sort((a, b) => bookingOrder(a) - bookingOrder(b));
}
function bookingCtaLabel(ch) {
  if (ch.kind === "online" && ch.platform_id === "camfit") return "캠핏 예약";
  if (ch.kind === "online" && ch.platform_id === "naver") return "네이버 예약";
  if (ch.kind === "online") return (ch.platform_name ?? "").length <= 6 ? `${ch.platform_name || "온라인"} 예약` : "온라인 예약";
  if (ch.kind === "homepage") return "홈페이지";
  return "전화";
}
function bookingTarget(c) {
  const channels = bookingChannels(c);
  const naver = channels.find((x) => x.url && (x.platform_id === "naver" || /booking\.naver\.com/i.test(x.url)));
  const phone = channels.find((x) => x.url && x.kind === "phone");
  const defaultNaverHref = naver?.url || `https://search.naver.com/search.naver?query=${encodeURIComponent(c.name + " 예약")}`;
  const defaultCamfitHref = `https://www.camfit.co.kr/search?keyword=${encodeURIComponent(c.name)}`;
  const defaultPhoneHref = phone?.url || (c.tel ? telHref(c.tel) : null);

  // 1순위: 캠핏 채널
  const camfit = channels.find((x) => x.url && (x.platform_id === "camfit" || /camfit\.co\.kr/i.test(x.url)));
  if (camfit) {
    return {
      href: camfit.url,
      ext: true,
      channel: camfit,
      platform: "camfit",
      type: "camfit",
      label: "캠핏 예약",
      isSearch: false,
      naverHref: defaultNaverHref,
      phoneHref: defaultPhoneHref,
    };
  }
  // 2순위: 네이버 예약
  if (naver) {
    return {
      href: naver.url,
      ext: true,
      channel: naver,
      platform: "naver",
      type: "naver",
      label: "네이버 예약",
      isSearch: false,
      camfitHref: defaultCamfitHref,
      phoneHref: defaultPhoneHref,
    };
  }
  // 3순위: 기타 공식 온라인 채널
  const online = channels.find((x) => x.url && x.kind === "online");
  if (online) {
    return {
      href: online.url,
      ext: true,
      channel: online,
      platform: online.platform_name || "online",
      type: "online",
      label: (online.platform_name ?? "").length <= 6 ? `${online.platform_name || "온라인"} 예약` : "온라인 예약",
      isSearch: false,
      naverHref: defaultNaverHref,
      camfitHref: defaultCamfitHref,
      phoneHref: defaultPhoneHref,
    };
  }
  // 4순위: 공식 홈페이지
  const homepage = channels.find((x) => x.url && x.kind === "homepage");
  if (homepage) {
    return {
      href: homepage.url,
      ext: true,
      channel: homepage,
      platform: "homepage",
      type: "homepage",
      label: "홈페이지 예약",
      isSearch: false,
      naverHref: defaultNaverHref,
      camfitHref: defaultCamfitHref,
      phoneHref: defaultPhoneHref,
    };
  }
  // 5순위: 기본값 (캠핏 실시간 예약/빈자리 검색 1순위, 네이버 검색 보조)
  return {
    href: defaultCamfitHref,
    ext: true,
    channel: null,
    platform: "camfit-search",
    type: "camfit",
    label: "캠핏에서 예약·빈자리 찾기",
    isSearch: true,
    naverHref: defaultNaverHref,
    phoneHref: defaultPhoneHref,
  };
}

function bookingPaths(c) {
  const rows = bookingChannels(c);
  // 이미 발행된 카탈로그(채널 출처 필드 추가 전)도 투명하게 표시한다.
  const source = c.booking?.source ?? (c.gc_url ? { label: "고캠핑 운영자 등록 예약 정보", url: c.gc_url, checked_at: c.modified_at ?? null, tier: "C", legacy: true } : null);
  const line = (ch) => {
    const dest = ch.url ? `<a class="booking-path-go" href="${esc(ch.url)}" ${/^tel:/i.test(ch.url) ? "" : 'target="_blank" rel="noopener"'}>${esc(ch.kind === "phone" ? "전화" : "열기")}${/^tel:/i.test(ch.url) ? "" : ic("#l-arrow-up-right", "i-xs")}</a>` : `<span class="booking-path-go disabled">주소 미등록</span>`;
    const evidence = (ch.evidence ?? []).map((x) => x === "reservation.url" ? "고캠핑 예약 URL" : x === "contact.homepage" ? "고캠핑 홈페이지" : x.startsWith("methods:") ? x.slice(8) : x.includes("tel") ? "등록 전화번호" : x).join(" · ");
    return `<div class="booking-path"><span class="booking-path-ic">${ic(ch.kind === "phone" ? "#l-phone" : ch.kind === "homepage" ? "#l-building-2" : "#l-calendar", "i-sm")}</span><span><b>${esc(ch.platform_name || BOOK_KIND[ch.kind] || "예약 경로")}</b><small>${esc(evidence || BOOK_KIND[ch.kind] || "")}</small></span><em class="${ch.confidence >= .85 ? "strong" : ch.confidence < .6 ? "weak" : ""}">${BOOK_TRUST(ch.confidence ?? 0)}</em>${dest}</div>`;
  };
  return `<div class="booking-paths">${rows.length ? rows.map(line).join("") : `<p class="note" data-wrap-ok>고캠핑에 예약 주소가 등록되지 않았습니다. 공식 홈페이지·전화·고캠핑 원문을 확인하세요.</p>`}</div>
    ${source ? `<span class="trust">${ic("#l-info", "i-xs")}${esc(source.label)}${source.checked_at ? ` · ${ymd(source.checked_at)} ${source.legacy ? "시설 수정" : "수집"}` : ""}${source.url ? ` · <a href="${esc(source.url)}" target="_blank" rel="noopener">원문</a>` : ""} · 링크는 변경될 수 있어 열기 전 예약처 주소를 확인하세요.</span>` : ""}`;
}
function providerBlock(c) {
  const p = META?.providers?.find((x) => x.id === c.booking.provider);
  if (!p) return "";
  const evs = p.events.slice(0, 4).map((e) => { return `<time>${e.time_known ? hm(e.at) : md(e.at)}</time><span data-wrap-ok>${esc(e.label)}${e.needs_verification ? " · 확인 필요" : ""}</span>`; }).join("");
  return `<div class="sub"><h4>${esc(p.name)} 공통 규칙</h4>
    ${p.rules.map((r) => `<p class="pre" data-wrap-ok>${esc(r.summary ?? r.label)}</p>`).join("")}
    ${evs ? `<div class="ev">${evs}</div>` : ""}
    <span class="trust">${ic("#l-info", "i-xs")}예약처 공지 기준 · 시설마다 다를 수 있어요</span></div>`;
}
function officialStatusBlock(c) {
  const records = officialOpenRecords(c, { dateMatch: Boolean(state.checkIn && state.checkOut) });
  if (!records.length) return "";
  const dateRequested = state.checkIn && state.checkOut;
  const line = (record) => {
    const use = record.use?.from ? `${String(record.use.from).slice(0, 10).replaceAll("-", ".")}~${String(record.use?.to ?? record.use.from).slice(0, 10).replaceAll("-", ".")}` : "이용 기간 미상";
    const statusLabel = record.state === "OBSERVED_AVAILABLE"
      ? (record.remaining_count != null ? `빈자리 ${record.remaining_count}석` : "빈자리 관측")
      : (record.status_text ?? "접수중");
    const countText = record.remaining_count != null ? ` · 잔여 ${record.remaining_count}자리` : "";
    return `<a class="row" href="${esc(record.source_url)}" target="_blank" rel="noopener"><span class="tag tag-green">${esc(statusLabel)}</span><span data-wrap-ok>${esc(record.product_name)} · 이용: ${esc(use)}${countText} · 원문 열기${ic("#l-arrow-up-right", "i-xs")}</span></a>`;
  };
  const observed = hm(AVAILABILITY?.generated_at) || ymd(AVAILABILITY?.generated_at);
  const expires = hm(AVAILABILITY?.expires_at) || ymd(AVAILABILITY?.expires_at);
  const hasObs = records.some((r) => r.state === "OBSERVED_AVAILABLE");
  const blockTitle = hasObs ? "최근 빈자리 관측 및 접수 상태" : "공식 접수 상태";
  return `<div class="sub"><h4>${ic(hasObs ? "#l-sparkles" : "#l-shield-check", "i-sm")}${blockTitle}${dateRequested ? " · 선택 날짜 일치" : ""}</h4>${records.map(line).join("")}<span class="trust ok">${ic("#l-info", "i-xs")}${esc(AVAILABILITY?.source?.name ?? "공식 원천")} · ${observed} 확인 · ${expires} 이후 자동 만료 · 잔여 수량·결제 가능 여부는 예약처에서 확정</span></div>`;
}
const md = (iso) => { const k = kst(iso); return k ? `${k.mo}.${p2(k.d)}(${"일월화수목금토"[k.wd]})` : ""; };
const hm = (iso) => { const k = kst(iso); return k ? `${md(iso)} ${p2(k.h)}:${p2(k.mi)}` : ""; };
const stayText = (st) => (st?.from ? `${md(st.from + "T12:00:00+09:00")}${st.to && st.to !== st.from ? `~${md(st.to + "T12:00:00+09:00")}` : ""} 숙박분` : "");
const shortName = (n) => String(n ?? "").replace(/\s*\(.*\)\s*$/, "");
const TIER_LABEL = { A: "공식 원문", B: "공식 기반", C: "운영자 안내", E: "이용자 제보" };
function guideBlock(c, d) {
  const g = d?.guide;
  if (!g) return `<div class="guide-slot">${providerBlock(c)}</div>`;
  const p = g.platform;
  const own = g.open_rules.filter((r) => !r.applies || r.applies === "CONFIRMED");
  const cond = g.open_rules.filter((r) => r.applies === "IF_NATIONAL" || r.applies === "VARIANT");
  const rule = (r) => `<div class="rule"><b data-wrap-ok>${esc(r.label)}</b>${r.applies_to ? `<small data-wrap-ok>${esc(r.applies_to)}</small>` : ""}${r.snippet ? `<q data-wrap-ok>${esc(r.snippet)}</q>` : ""}<span class="trust ${["A", "B"].includes(r.tier) ? "ok" : ""}">${ic(["A", "B"].includes(r.tier) ? "#l-shield-check" : "#l-circle-help", "i-xs")}${esc(r.src ?? TIER_LABEL[r.tier] ?? "출처 미상")}${r.checked_at ? ` · ${esc(String(r.checked_at).slice(0, 10))} 확인` : ""}${r.unverified ? " · 확인 필요" : ""}${r.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">원문</a>` : ""}</span></div>`;
  const next = g.next.slice(0, 4).map((n) => `<li class="${n.unverified ? "maybe" : ""}"><b class="num">${n.time_known ? hm(n.at) : md(n.at)}</b><span data-wrap-ok>${esc(n.label)}${n.stay ? ` · ${esc(typeof n.stay === "string" ? n.stay : stayText(n.stay))}` : ""}${n.applies === "IF_NATIONAL" ? " · 국립일 때" : ""}${n.unverified ? " · 예상" : ""}</span></li>`).join("");
  return `<div class="guide-slot">
    ${next ? `<div class="sub"><h4>${ic("#l-alarm-clock", "i-sm")}다가오는 예약 오픈</h4><ul class="next-list">${next}</ul></div>` : ""}
    ${own.length ? `<div class="sub"><h4>${ic("#l-calendar-clock", "i-sm")}이 캠핑장의 오픈 규칙</h4>${own.map(rule).join("")}</div>` : ""}
    ${cond.length ? `<details class="sub"><summary><h4>${ic("#l-git-branch", "i-sm")}${esc(shortName(p?.name) || "예약처")} 오픈 방식</h4></summary>${cond.map(rule).join("")}</details>` : ""}
    ${g.steps.length ? `<div class="sub"><h4>${ic("#l-list-ordered", "i-sm")}${esc(shortName(p?.name) || "")} 예약 순서</h4>
      <ol class="steps">${g.steps.map((x) => `<li data-wrap-ok>${esc(x.t)}${x.v ? "" : ` <small class="unv">확인 필요</small>`}</li>`).join("")}</ol></div>` : ""}
    ${p && (p.payment || p.cancel || p.waitlist || p.account) ? `<div class="sub"><h4>${ic("#l-wallet", "i-sm")}결제·취소·대기</h4><dl class="kv">
      ${p.account ? `<dt>계정</dt><dd data-wrap-ok>${esc(p.account)}</dd>` : ""}${p.payment ? `<dt>결제 기한</dt><dd data-wrap-ok>${esc(p.payment)}</dd>` : ""}${p.waitlist ? `<dt>대기·취소표</dt><dd data-wrap-ok>${esc(p.waitlist)}</dd>` : ""}${p.cancel ? `<dt>취소 규정</dt><dd data-wrap-ok>${esc(p.cancel)}</dd>` : ""}</dl></div>` : ""}
    ${p?.tips?.length ? `<ul class="tips">${p.tips.map((t) => `<li data-wrap-ok>${esc(t)}</li>`).join("")}</ul>` : ""}
    ${p?.help?.length ? `<div class="help-links">${p.help.map((h) => `<a class="mini" href="${esc(h.url)}" ${/^tel:/.test(h.url) ? "" : 'target="_blank" rel="noopener"'}>${esc(h.label)}</a>`).join("")}</div>` : ""}
    ${g.warnings.map((w) => `<p class="note warn" data-wrap-ok>${ic("#l-triangle-alert", "i-xs")} ${esc(w)}</p>`).join("")}
  </div>`;
}
function nearBlock(c, d) {
  const n = { ...(d?.nearby ?? {}) };
  if (c.nearby_toilets?.nearest?.length) n.toilet = c.nearby_toilets.nearest.map((t) => ({ n: t.name, m: t.m, lat: t.lat, lng: t.lng, k: t.h24 ? "24시간 개방" : "공중화장실" }));
  const groups = NEAR_GROUPS.filter(([g]) => n[g]?.length);
  if (!groups.length) return `<p class="dv-empty">주변 정보를 모으는 중이에요. 지도 앱에서 확인하세요.</p>`;
  const active = groups[0][0];
  return `<div class="seg-tabs" role="tablist">${groups.map(([g, l, i]) => `<button type="button" role="tab" data-near="${g}" aria-selected="${g === active}">${ic(i, "i-sm")}${l}</button>`).join("")}</div>
  ${groups.map(([g]) => `<div class="near-list" data-near-panel="${g}" ${g === active ? "" : "hidden"}>${n[g].map((p) => {
    const name = p.n || POI_KIND[p.k] || "주변 시설";
    const meta = [p.ty ?? POI_KIND[p.k] ?? p.k, p.e ? "응급실" : null, p.b, p.h, p.r].filter(Boolean).join(" · ");
    const isHanaro = /하나로마트/.test(name) || p.b === "하나로마트";
    const isGS25 = /GS25/i.test(name) || /GS25/i.test(p.b);
    const isCU = /\bCU\b/i.test(name) || /\bCU\b/i.test(p.b);
    const isSeven = /세븐일레븐|7-eleven/i.test(name) || /세븐일레븐/i.test(p.b);
    const isEmart24 = /이마트24|emart24/i.test(name) || /이마트24/i.test(p.b);
    const isSK = /SK/i.test(name);
    const isGSFuel = /GS칼텍스/i.test(name);
    const isSOil = /S-OIL|에쓰오일/i.test(name);
    const isHD = /현대오일뱅크/i.test(name);
    const brandBadge = isHanaro ? `<span class="poi-brand hanaro">하나로</span>` :
      isGS25 ? `<span class="poi-brand gs25">GS25</span>` :
      isCU ? `<span class="poi-brand cu">CU</span>` :
      isSeven ? `<span class="poi-brand seven">7-11</span>` :
      isEmart24 ? `<span class="poi-brand emart">emart24</span>` :
      isSK ? `<span class="poi-brand sk">SK</span>` :
      isGSFuel ? `<span class="poi-brand gs-fuel">GS</span>` :
      isSOil ? `<span class="poi-brand soil">S-OIL</span>` :
      isHD ? `<span class="poi-brand hd">HD</span>` : "";

    const visual = p.img ? `<img src="${esc(remoteImg(p.img))}" alt="${esc(name)} 사진" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('no-photo');this.remove()">` : `<span class="poi-visual ${g}">${brandBadge || ic(g === "toilet" ? "#l-toilet" : g === "mart" || g === "conv" ? "#l-shopping-cart" : g === "rest" ? "#l-coffee" : g === "fuel" ? "#l-fuel" : g === "medical" ? "#l-shield-check" : "#l-map-pin")}</span>`;
    const actions = p.lat ? `<div class="near-actions"><a class="btn-roadview-direct" href="${esc(roadviewLink(p.lat, p.lng))}" target="_blank" rel="noopener">${ic("#l-camera", "i-xs")}로드뷰 바로가기${ic("#l-arrow-up-right", "i-xs")}</a><a href="${esc(p.u ?? mapLink(name, p.lat, p.lng))}" target="_blank" rel="noopener">카카오 지도${ic("#l-arrow-up-right", "i-xs")}</a><a href="${esc(naverMapLink(name))}" target="_blank" rel="noopener">네이버 지도${ic("#l-arrow-up-right", "i-xs")}</a><button type="button" data-roadview="${p.lat},${p.lng}" data-roadview-name="${esc(name)}">이 화면에서 보기</button></div>` : "";
    return `<article class="near-card"><div class="near-visual${p.img ? "" : " no-photo"}" ${p.lat ? `data-rv-thumb="${p.lat},${p.lng}" data-roadview="${p.lat},${p.lng}" data-roadview-name="${esc(name)}" title="클릭 시 로드뷰 보기"` : ""}>${visual}</div><div class="near-copy"><div><b>${esc(name)}</b><small>${esc(meta || "주변 편의 정보")}</small></div>${actions}</div>${p.m != null ? `<strong class="m">${km(p.m)}</strong>` : ""}</article>`;
  }).join("")}</div>`).join("")}
  <div class="roadview-slot" id="roadviewSlot"></div>
  <span class="trust">직선거리 기준 · ‘로드뷰 바로가기’는 시설 근처 실제 도로 파노라마 · 데이터: 한국관광공사 TourAPI, OpenStreetMap(© 기여자, ODbL), 행정안전부, 한국도로공사</span>`;
}
// 공식 사진: 자체 저장(webp) → 아직 저장 전인 고캠핑 공식 사진(원본 주소) → TourAPI 공식 사진 순서
function allPhotos(c, d) {
  // 공식 목록/갤러리 사진은 large를 그대로 표시한다. t(480px)는 원본 보관·하위 호환용이며
  // 고밀도 화면에서 확대하지 않는다.
  const own = (d?.photos?.length ? d.photos : c.ph ? [{ t: c.ph, l: largeLocalPhoto(c.ph) }] : []).map((p) => {
    const large = p.l ?? largeLocalPhoto(p.t);
    return { t: MEDIA + large, l: MEDIA + large };
  });
  // 같은 사진이 대표 사진(thumb_720_파일)·갤러리(파일)로 두 번 오지 않게 파일 이름으로 거른다. 저장 사진과 같은 대표 사진은 img_dup.
  const key = (u) => String(u).split(/[?#]/)[0].split("/").pop().toLowerCase().replace(/^thumb_\d+_/, "");
  const remoteUrls = [...(d?.photos_remote ?? []), ...(d?.tour_photos ?? []).map((x) => x.url ?? x), d?.img_dup || (own.length && !d) ? null : c.img].filter(Boolean);
  const seen = new Set();
  const remote = remoteUrls.filter((u) => !seen.has(key(u)) && seen.add(key(u))).map((u) => ({ t: u, l: u, remote: true }));
  return [...own, ...remote];
}
function talkBlock(c) {
  const g = window.GISCUS;
  if (!g?.repoId) return `<p class="dv-empty">댓글 기능을 준비하고 있어요.</p>`;
  return `<div class="giscus" data-camp="${c.id}"></div><span class="trust">GitHub 계정으로 댓글을 남길 수 있어요(무료). 개인정보·전화번호는 적지 마세요.</span>`;
}
/* ---------- 상세 v2: 사진 중심 · 섹션마다 다른 시각 요소 · 출처는 (i)로 숨김 ---------- */
// 라이트박스 묶음(그룹 → 사진 목록). 상세를 그릴 때마다 다시 채운다.
const LB = new Map();
const lbAdd = (group, items) => { LB.set(group, items); return items; };
const lbAttr = (group, i) => `data-lb="${group}" data-lb-i="${i}"`;
// 상대 날짜: 오늘 · 3일 전 · 2주 전 · 5개월 전 · 그 이상은 날짜
function relDay(s) {
  const t = Date.parse(s ?? ""); if (!Number.isFinite(t)) return "";
  const d = Math.floor((Date.now() - t) / 864e5);
  return d <= 0 ? "오늘" : d < 7 ? `${d}일 전` : d < 31 ? `${Math.floor(d / 7)}주 전` : d < 365 ? `${Math.floor(d / 30)}개월 전` : ymd(s);
}
const sum = (xs) => xs.reduce((n, x) => n + (Number(x) || 0), 0);

// 1) 사진 모자이크: 공식 사진 → 방문자 사진 순. 넓은 화면은 1+4 격자, 좁은 화면은 넘기는 슬라이드.
function heroBlock(c, d) {
  const official = allPhotos(c, d).map((p) => ({ src: p.l, cap: "공식 사진 · 한국관광공사 고캠핑", remote: p.remote }));
  const rawSnaps = (d?.sns_images ?? []).map((x) => ({ src: hiResImg(x.img ?? x.thumb), small: true, cap: `방문자 사진 · ${x.src ?? "외부"}`, link: x.url, remote: true }));
  const rawLayout = (d?.layout?.images ?? []).map((x) => ({ src: hiResImg(x.img ?? x.thumb), small: false, cap: x.sure ? "시설 배치도 (고해상도 원본)" : "시설 배치도", link: x.url ?? x.img, remote: true }));
  const snaps = dedupeImages(rawSnaps, (x) => x.src);
  const layout = dedupeImages(rawLayout, (x) => x.src);
  const items = lbAdd("all", dedupeImages([...official, ...layout, ...snaps], (x) => x.src));
  if (!items.length) return `<div class="dv-hero dv-hero-empty">${ic("#t-tent")}</div>`;
  const shown = items.slice(0, 12);
  return `<div class="dv-hero${shown.length < 3 ? " few" : ""}">
    ${shown.map((p, i) => `<button type="button" class="dv-shot${p.small ? " sm" : ""}" ${lbAttr("all", i)} aria-label="사진 ${i + 1} 크게 보기"><img src="${esc(p.src)}" alt="" ${i > 1 ? 'loading="lazy"' : ""} decoding="async" ${p.remote ? 'referrerpolicy="no-referrer"' : ""} onerror="this.parentElement.remove()"></button>`).join("")}
    <button type="button" class="dv-all" ${lbAttr("all", 0)}>${ic("#l-images", "i-sm")}사진 <span class="num">${items.length}</span>장 모두 보기</button></div>`;
}

// 2) 한눈에: 큰 아이콘 타일(사이트 면수 · 반려견 · 화장실/샤워 · 예약 방식 · 후기 · 영상)
function keyStats(c, d) {
  const total = sum(c.kinds.map(([, n]) => n)) || c.specs?.total_sites;
  const reviews = (d?.reviews?.length ?? 0) + (d?.cafe?.length ?? 0) || c.soc?.[0] || 0;
  const tiles = [
    total && ["#t-tent", `${total}면`, "사이트"],
    c.pets && [petOk(c) ? "#l-dog" : "#l-ban", petOk(c) ? "가능" : "불가", "반려견"],
    (c.toilets != null || c.showers != null) && ["#l-shower-head", `${c.toilets ?? "-"}·${c.showers ?? "-"}`, "화장실·샤워"],
    [isRealtime(c) ? "#l-zap" : "#l-phone", isRealtime(c) ? "실시간" : c.booking.methods.length ? "예약제" : "문의", "예약"],
    reviews && ["#l-message-circle", `${reviews}`, "후기"],
    (d?.videos?.length || c.soc?.[1]) && ["#l-play", `${d?.videos?.length ?? c.soc[1]}`, "영상"],
  ].filter(Boolean);
  return `<div class="dv-stats">${tiles.map(([i, v, l]) => `<div><span>${ic(i)}</span><b class="num">${esc(v)}</b><small>${l}</small></div>`).join("")}</div>`;
}

function findEnvDetail(c, d) {
  const textPool = [
    c.line || "",
    d?.intro || "",
    ...(d?.operator_snippets?.map((s) => s.text) || []),
  ].join(" ");

  let water = d?.nature?.valley_info || null;
  if (!water) {
    const valleyMatch = textPool.match(/([가-힣]{2,10}(?:계곡|천|강|내|저수지|호수|해수욕장|해변))/);
    if (valleyMatch) {
      water = valleyMatch[1];
    } else if (d?.nearby?.tour) {
      const nearWater = d.nearby.tour.find((t) => /계곡|천|강|호|해수욕장|해변/.test(t.n));
      if (nearWater) water = `${nearWater.n} (${km(nearWater.m)})`;
    }
  }

  let forest = d?.nature?.forest_type || d?.nature?.trail_info || null;
  if (!forest) {
    const mountainMatch = textPool.match(/([가-힣]{2,10}(?:산|자연휴양림|수목원|숲|군락지))/);
    if (mountainMatch) {
      forest = mountainMatch[1];
    } else if (d?.nearby?.tour) {
      const nearMountain = d.nearby.tour.find((t) => /산|휴양림|수목원|숲/.test(t.n));
      if (nearMountain) forest = `${nearMountain.n} (${km(nearMountain.m)})`;
    }
  }

  let firewoodPrice = null;
  const firewoodPriceMatch = textPool.match(/장작\s*(?:판매|세트)?\s*[:=\s]*([0-9]{1,2},?[0-9]{3})\s*원?/);
  if (firewoodPriceMatch) {
    firewoodPrice = firewoodPriceMatch[1].replace(/,/g, "") + "원";
  } else if (d?.field_conditions?.rental_offers?.some((r) => /장작|화로/.test(r.item) && r.price_krw)) {
    const ro = d.field_conditions.rental_offers.find((r) => /장작|화로/.test(r.item) && r.price_krw);
    firewoodPrice = won(ro.price_krw);
  }

  let powerLimit = null;
  const powerW = c.field_conditions?.power?.limit_w || c.field_conditions?.power?.max_w || c.of?.w?.v;
  if (powerW) {
    powerLimit = `${powerW.toLocaleString()}W`;
  } else if (hasPower(c)) {
    powerLimit = "법정 600W (고출력 온풍기 주의)";
  }

  let mart = null;
  const hasInternalMart = c.amenities?.some((a) => /마트|편의점|매점/.test(a));
  if (hasInternalMart) {
    mart = "구내 매점·편의점 운영";
  } else if (d?.nearby?.conv?.[0] || d?.nearby?.mart?.[0]) {
    const nearest = d?.nearby?.conv?.[0] || d?.nearby?.mart?.[0];
    mart = `외부 편의시설: ${nearest.n} (${km(nearest.m)})`;
  }

  return { water, forest, firewoodPrice, powerLimit, mart };
}

// 3) 이런 곳이에요: 입지·자연환경·부대시설 디테일
const AMENITY_ICON = [[/전기/, "#l-plug-zap"], [/무선|와이파이|wifi/i, "#l-wifi"], [/장작/, "#l-flame"], [/온수|샤워/, "#l-shower-head"], [/물놀이|수영/, "#l-waves"], [/운동|족구|풋살|농구|배드민턴/, "#l-dumbbell"], [/마트|편의점|매점/, "#l-store"], [/산책|둘레길|숲길/, "#l-footprints"], [/트렘|트램|방방|에어바운스/, "#l-sparkles"], [/놀이/, "#l-baby"], [/카페|커피/, "#l-coffee"], [/덤프/, "#l-truck"], [/낚시/, "#l-fish"], [/썰매/, "#l-snowflake"], [/바베큐|바비큐/, "#l-utensils-crossed"]];
const ENV_ICON = { 산: "#l-mountain", 숲: "#l-trees", 계곡: "#l-waves", 강: "#l-droplets", 호수: "#l-droplets", 해변: "#l-sailboat", 섬: "#l-sailboat", 도심: "#l-building-2" };

function highlightsBlock(c, d) {
  const envDetail = findEnvDetail(c, d);
  const env = c.env.map((e) => {
    let sub = `${e} 입지`;
    if ((e === "산" || e === "숲") && envDetail.forest) sub = `${envDetail.forest} 자락`;
    else if ((e === "계곡" || e === "강" || e === "호수") && envDetail.water) sub = `${envDetail.water} 수변`;
    return [ENV_ICON[e] ?? "#l-map-pin", `${e} 입지`, sub, e === "계곡" || e === "강" ? "sec-near" : "sec-site"];
  });
  const am = c.amenities.filter((a) => a.length <= 12).map((a) => {
    let sub = null;
    if (/장작/.test(a) && envDetail.firewoodPrice) sub = `판매가 ${envDetail.firewoodPrice}`;
    else if (/전기/.test(a) && envDetail.powerLimit) sub = envDetail.powerLimit;
    else if (/마트|편의점/.test(a) && envDetail.mart) sub = envDetail.mart;
    return [AMENITY_ICON.find(([re]) => re.test(a))?.[1] ?? "#l-circle-check", a.replace(/\./g, "·"), sub, "sec-site"];
  });
  const items = [...env, ...am].slice(0, 14);
  if (!items.length) return "";
  return `<section class="dv-sec" id="sec-good"><h3>이런 곳이에요</h3>
    <div class="dv-good-grid">${items.map(([i, l, sub, jump]) => `<div class="dv-good-card" ${jump ? `data-jump="${jump}" role="button" tabindex="0" title="${esc(l)} 상세정보 보기"` : ""}>
      <span class="dv-good-ic">${ic(i)}</span>
      <div class="dv-good-text"><b>${esc(l)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>
    </div>`).join("")}</div>
  </section>`;
}

// 4) 예약 카드: 다음 오픈(D-day) + 예약 방식 + 버튼. 자세한 경로·규칙은 접어 둔다.
function bookingCard(c, d, target) {
  const nx = d?.guide?.next?.find((n) => !n.unverified && n.applies !== "IF_NATIONAL") ?? (c.booking.next ? { ...c.booking.next } : null);
  const dday = nx ? Math.ceil((Date.parse(nx.at) - Date.now()) / 864e5) : null;
  const alternate = target?.channel?.kind === "online"
    ? bookingChannels(c).find((ch) => ch.kind === "online" && ch.url && ch.url !== target.href)
    : null;
  return `<section class="dv-sec dv-book" id="sec-book"><h3>예약</h3>
    <div class="dv-book-top">
      ${nx ? `<div class="dv-dday"><b class="num">${dday <= 0 ? "오늘" : `D-${dday}`}</b><span><small>다음 예약 오픈</small><strong class="num">${nx.time_known ? hm(nx.at) : md(nx.at)}</strong><em data-wrap-ok>${esc(nx.label)}</em></span></div>`
        : `<div class="dv-dday none"><span>${ic("#l-calendar")}</span><span><small>예약 방식</small><strong>${esc(c.booking.methods[0] ?? "예약처 문의")}</strong></span></div>`}
      ${target ? `<a class="btn btn-primary dv-go" href="${esc(target.href)}" ${target.ext ? 'target="_blank" rel="noopener"' : ""}>${ic(target.ext ? "#l-external-link" : "#l-phone", "i-sm")}${target.label}</a>` : ""}
    </div>
    ${alternate ? `<a class="dv-book-alt" href="${esc(alternate.url)}" target="_blank" rel="noopener">${ic("#l-calendar", "i-xs")}${esc(bookingCtaLabel(alternate))}${ic("#l-arrow-up-right", "i-xs")}</a>` : ""}
    ${c.booking.methods.length > 1 ? `<div class="dv-chips">${c.booking.methods.map((m) => `<span class="${/실시간/.test(m) ? "on" : ""}">${esc(m)}</span>`).join("")}</div>` : ""}
    ${officialStatusBlock(c)}
    <details class="dv-more"><summary>예약 경로·오픈 규칙 자세히</summary>${bookingPaths(c)}${guideBlock(c, d)}</details>
  </section>`;
}

// 5) 사이트·요금: 형태별 타일 + 크기·바닥 칩 + 후기 요금 막대 + 상품 + 배치도
function siteListBlock(c, d) {
  const rows = c.kinds.filter(([k]) => KIND[k]);
  const totalSites = sum(rows.map(([, n]) => n)) || c.specs?.total_sites;
  const max = Math.max(1, ...rows.map(([, n]) => n || 0));
  const v = conditionView(c);
  const sp = c.specs || {};
  const parkingCount = sp.parking_count || c.field_conditions?.parking?.parking_count;
  const areaM2 = sp.area_m2 || c.field_conditions?.area_m2;
  const gear = hasSetup() && state.gear ? setupStatus(c).checks.find((x) => x.key === "gear") : null;
  const essentials = [["#l-plug-zap", "전기", v.power], ["#l-flame", "장작", v.firewood], ["#l-car", "주차", v.parking]];

  return `<div class="dv-site-inventory">
    <div class="dv-site-stat-bar">
      ${totalSites ? `<div class="dv-stat-chip"><b>총 ${totalSites}면</b><span>관리 사이트</span></div>` : ""}
      ${parkingCount ? `<div class="dv-stat-chip"><b>주차 ${parkingCount}대</b><span>차량 수용</span></div>` : ""}
      ${areaM2 ? `<div class="dv-stat-chip"><b>${Number(areaM2).toLocaleString()}㎡</b><span>부지 면적</span></div>` : ""}
      ${c.toilets ? `<div class="dv-stat-chip"><b>화장실 ${c.toilets}개</b><span>위생 시설</span></div>` : ""}
    </div>
    ${rows.length ? `<div class="dv-sites">${rows.map(([k, n]) => `<div class="dv-site"><span>${ic(KIND[k][1])}</span><b>${esc(KIND[k][0])}</b><strong class="num">${n}<small>면</small></strong><i style="--w:${Math.round(((n || 0) / max) * 100)}%"></i></div>`).join("")}</div>` : ""}
    ${c.sizes.length || c.floors.length ? `<div class="dv-chips site-specs">${c.sizes.map(([w, dd, n]) => `<span>${ic("#l-ruler", "i-xs")}${w}×${dd}m${n ? ` · ${n}면` : ""}</span>`).join("")}${c.floors.map(([fl, n]) => `<span class="fl fl-${esc(fl)}">${esc(floorName(fl))} ${n}면</span>`).join("")}</div>` : ""}
    ${gear ? `<div class="dv-tarp-note ${gear.state === "MATCH" ? "ok" : "warn"}">${ic(gear.state === "MATCH" ? "#l-circle-check" : "#l-circle-alert", "i-xs")}<div><b>${esc(gear.label)} · ${SETUP_LABEL[gear.state]}</b><p data-wrap-ok>${esc(gear.text)} 타프·캐노피 추가 설치는 운영 규정을 따로 확인하세요.</p></div></div>`
      : c.sizes.length ? `<button class="dv-tarp-note hint" type="button" data-setup-focus>${ic("#l-backpack", "i-xs")}<div><b>내 텐트가 들어갈까?</b><p data-wrap-ok>‘내 캠핑 세팅’에서 텐트 크기를 고르면 이 규격과 비교해 드려요.</p></div></button>` : ""}
    <div class="dv-quick-essentials">${essentials.map(([icon, label, d]) => `<div class="essential-item">${ic(icon, "i-xs")}<span><b>${label} ${gradeChip(d.grade)}</b>${esc(d.value)}</span></div>`).join("")}</div>
    <span class="trust ok">한국관광공사 고캠핑 등록 정보 및 국가표준데이터 · ${ymd(c.modified_at)} 수정</span>
  </div>`;
}

const PARKING_NAME = {
  SITE_ADJACENT: "텐트 옆 주차",
  SHARED_NEARBY: "지정 주차장 주차 후 도보 이동",
  DROP_OFF_EXTERNAL: "짐 하차 후 외부 주차장 이동",
  CART_REQUIRED: "짐수레/카트 이동 필수",
};
const FEATURE_NAME = {
  SWIMMING_POOL: "야외 물놀이장/수영장",
  VALLEY: "계곡 인접",
  STREAM: "시냇물/천",
  FOREST_TRAIL: "산책로/숲길",
  WOOD_CRAFT: "목공/체험",
  TRAMPOLINE: "트램펄린(방방)",
  TUBE_SLED: "사계절 튜브썰매장",
  AIR_BOUNCE: "대형 에어바운스",
  CHILDREN_PLAYGROUND: "어린이 놀이터",
  ANIMAL_FEEDING: "동물 먹이주기 체험",
  TRAIN_RIDE: "깡통열차",
  INDOOR_PLAYROOM: "실내 놀이방",
  VIKING_RIDE: "미니 바이킹",
  ECO_ADVENTURE: "모험시설",
  STAR_WATCHING: "별보기 명당",
  PLAYGROUND: "놀이터",
  KIDS_PLAY: "아이 놀이시설",
  EXPERIENCE: "체험 프로그램",
};

// 이 화면의 조건표는 고캠핑 운영자 등록값과 검증된 파일럿 조건표를 읽는다. 없는 항목(특히 전력 W,
// 텐트 옆 주차, 숯/장작 사용 허용)은 추정하지 않고 ‘확인 필요’로 남긴다.
function fieldConditionsBlock(c) {
  const v = conditionView(c), f = c.field_conditions ?? {};
  const featIcon = (feat) => feat === "SWIMMING_POOL" || feat === "VALLEY" ? "#l-waves" : feat === "FOREST_TRAIL" ? "#l-footprints" : feat === "TRAMPOLINE" || feat === "AIR_BOUNCE" ? "#l-sparkles" : "#l-circle-check";
  const rows = [
    ["#l-car", "주차 동선", v.parking],
    ["#l-plug-zap", "전기·최대 W", v.power],
    ["#l-flame", "장작 불멍", v.firewood],
    ["#l-flame", "숯·화로대", v.charcoal],
    ["#t-tent", "텐트·타프·캐노피", v.shelter],
    ["#l-ruler", "사이트 규격", v.size],
    ["#t-layers-subtract", "바닥", v.floor],
    ["#l-shower-head", "위생", v.sanitary],
  ];
  const zones = v.verified ? (f.site_size?.groups ?? []).filter((g) => g.name) : [];
  const src = v.source;
  const reviewDue = src.next_review_due_at ? ` · ${ymd(src.next_review_due_at)}까지 재확인 예정` : "";
  return `<div class="dv-sub dv-conditions${v.verified ? " verified" : ""}">
    <div class="dv-verified-head"><h4>${ic(v.verified ? "#l-shield-check" : "#l-list-checks", "i-sm")}현장 조건</h4>${v.verified ? `<span class="badge-verified">원문 대조 확인</span>` : f.status === "SURVEYED" ? `<span class="badge-candidate">일부 소개글 기반</span>` : ""}</div>
    ${v.verified ? `<div class="verified-banner">${ic("#l-shield-check", "i-sm")}<div><b>${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.label ?? "공식 원문")}</a>` : esc(src.label ?? "공식 원문")}</b><small>${ymd(src.checked_at)} 확인${src.reviewer ? ` · 검수 ${esc(src.reviewer)}` : ""}${reviewDue}</small></div></div>` : ""}
    <div class="dv-condition-grid">${rows.map(([icon, label, d]) => `<article class="dv-condition ${GRADE_CLASS[d.grade]}"><span>${ic(icon)}</span><div><small>${esc(label)} ${gradeChip(d.grade)}</small><b>${esc(d.value)}</b>${d.note ? `<p data-wrap-ok>${esc(d.note)}</p>` : ""}</div></article>`).join("")}</div>
    ${zones.length ? `<div class="dv-table-wrap"><h5>구역별 규격·주차</h5><table class="dv-fact-table"><thead><tr><th>구역</th><th>규격</th><th>바닥</th><th>주차</th><th>면수</th></tr></thead><tbody>
      ${zones.map((g) => `<tr><td><b>${esc(g.name)}</b></td><td>${g.width_m}×${g.depth_m}m</td><td>${g.surface ? esc(floorName(g.surface)) : "-"}</td><td>${g.parking ? esc(PARKING_NAME[g.parking] ?? g.parking) : "-"}</td><td>${g.count ? `${g.count}면` : "-"}</td></tr>`).join("")}
    </tbody></table></div>` : ""}
    ${v.rental.items.length ? `<div class="dv-table-wrap"><h5>현장 대여 ${gradeChip(v.rental.grade)}</h5><table class="dv-fact-table"><thead><tr><th>품목</th><th>대여료</th><th>보증금</th></tr></thead><tbody>
      ${v.rental.items.map((r) => `<tr><td><b>${esc(r.item)}</b></td><td>${r.price_krw == null ? "현장 문의" : r.price_krw === 0 ? "무료" : won(r.price_krw)}</td><td>${r.price_krw == null ? "-" : r.deposit_krw ? won(r.deposit_krw) : "없음"}</td></tr>`).join("")}
    </tbody></table></div>` : ""}
    ${v.kids.grade !== "UNKNOWN" ? `<div class="dv-features-wrap"><h5>아이·놀거리 ${gradeChip(v.kids.grade)}</h5><div class="dv-chips">${(v.kids.grade === "CONFIRMED" ? v.kids.amenities.map((a) => [null, a]) : v.kids.features.map((x) => [x, FEATURE_NAME[x]])).map(([k, l]) => `<span class="feat-chip">${ic(k ? featIcon(k) : "#l-circle-check", "i-xs")}${esc(l)}</span>`).join("")}</div><p class="dv-cond-foot" data-wrap-ok>${esc(v.kids.note)}</p></div>` : ""}
    <span class="trust">${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.label ?? "한국관광공사 고캠핑 운영자 등록값")}</a>` : esc(src.label ?? "한국관광공사 고캠핑 운영자 등록값")}${src.checked_at ? ` · ${ymd(src.checked_at)} 확인` : ""} · ‘소개글 기반’은 운영자 소개 문장에서 찾은 단서이고, ‘확인 필요’는 불가가 아닙니다</span>
    <div class="dv-fix-links"><a class="dv-fix-link" href="${esc(correctionUrl(c))}" target="_blank" rel="noopener">${ic("#l-pencil", "i-xs")}정보 고치기·확인 결과 알리기</a><a class="dv-fix-link" href="${esc(`${REPO_ISSUES}?${new URLSearchParams({ template: "operator-condition-sheet.yml", title: `[운영자 조건표] ${c.name}`, campground: `${c.name} (id: ${c.id})` })}`)}" target="_blank" rel="noopener">${ic("#l-store", "i-xs")}운영자이신가요? 공식 조건표 등록</a></div>
  </div>`;
}

// 이용 정보 스펙 시트(docs/CAMPGROUND_SPEC_INTEGRATION.md). 모든 캠핑장을 같은 필드·같은 순서로 보여 줘
// 다나와처럼 나란히 비교할 수 있게 한다. 확정 칸에는 운영자 확인·공식 소개 문장만, 후기는 ‘언급’ 칸에 건수로만.
const SPEC_ORDER = [
  ["time", "이용 시간", [["CHECKIN_TIME", "입실"], ["CHECKOUT_TIME", "퇴실"], ["EARLY_CHECKIN", "얼리 체크인"], ["LATE_CHECKOUT", "레이트 체크아웃"]]],
  ["booking", "예약 규칙", [["MIN_STAY", "연박·최소 숙박"]]],
  ["fee", "추가 요금", [["EXTRA_PERSON_FEE", "인원 추가"], ["EXTRA_CAR_FEE", "차량 추가"], ["VISITOR_POLICY", "방문객"]]],
  ["rule", "현장 규칙", [["MANNER_TIME", "매너타임"], ["PET_POLICY", "반려동물"]]],
  ["promo", "할인·행사·대여", [["DISCOUNT", "할인 대상"], ["PROMOTION", "기간 행사"], ["RENTAL", "대여"]]],
];
const SPEC_GRADE = { OPERATOR: ["verified", "운영자 확인"], OFFICIAL_TEXT: ["confirmed", "공식 소개"], MENTION: ["surveyed", "후기 언급"] };
const specChip = (g) => `<em class="grade grade-${SPEC_GRADE[g]?.[0] ?? "unknown"}">${SPEC_GRADE[g]?.[1] ?? "확인 필요"}</em>`;
function specCell(f, { compact = false } = {}) {
  if (!f) return `<span class="spec-none">정보 없음</span>`;
  const vals = f.values ?? [], ms = f.mentions ?? [];
  const main = vals.length
    ? `<b>${vals.map((v) => esc(v.value)).join(" · ")}</b> ${specChip(f.grade)}`
    : `<span class="spec-none">확인 필요</span>`;
  const mline = ms.length ? `<span class="spec-mention">${specChip("MENTION")} ${ms.map((m) => `${esc(m.value)}${m.count > 1 ? ` <i class="num">${m.count}건</i>` : ""}`).join(" · ")}${f.conflict ? ` <em class="spec-conflict">후기마다 다름</em>` : ""}</span>` : "";
  if (compact) return `${main}${mline}`;
  const quotes = [
    ...vals.map((v) => ({ q: v.quote, url: v.source?.url, label: v.source?.label, date: v.source?.date })),
    ...ms.flatMap((m) => m.samples.map((x) => ({ q: x.quote, url: x.url, label: x.label, date: x.date }))),
  ].slice(0, 4);
  return `${main}${mline}${quotes.length ? `<details class="spec-src"><summary>원문 문장 ${quotes.length}</summary>${quotes.map((x) => `<blockquote data-wrap-ok>“${esc(x.q)}”<small>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label ?? "원문")}</a>` : esc(x.label ?? "")}${x.date ? ` · ${ymd(x.date)}` : ""}</small></blockquote>`).join("")}</details>` : ""}`;
}
function specBlock(c, d) {
  const sp = d?.spec, fields = sp?.fields ?? {};
  const filled = SPEC_ORDER.flatMap(([, , rows]) => rows).filter(([code]) => fields[code]?.values?.length).length;
  const total = SPEC_ORDER.reduce((n, [, , rows]) => n + rows.length, 0);
  return `<section class="dv-sec dv-spec" id="sec-spec"><div class="dv-sub-head"><h3>${ic("#l-list-checks", "i-sm")}이용 정보 스펙</h3><span class="spec-score"><b class="num">${filled}</b>/${total} 확인</span></div>
    <p class="spec-lead" data-wrap-ok>모든 캠핑장을 같은 항목으로 정리했어요. <b>굵은 값</b>은 운영자·공식 소개 문장에서, ‘후기 언급’은 블로그·카페 글에서 찾은 단서예요(여러 곳을 묶은 글은 뺐어요).</p>
    <div class="spec-groups">${SPEC_ORDER.map(([g, title, rows]) => `<div class="spec-group"><h4>${title}</h4><dl>${rows.map(([code, label]) => `<div class="spec-row${fields[code]?.values?.length ? " has" : fields[code] ? " hint" : ""}"><dt>${label}</dt><dd>${specCell(fields[code])}</dd></div>`).join("")}</dl></div>`).join("")}</div>
    <span class="trust">${sp ? `${ymd(sp.generated_at)} 정리 · 후기 ${sp.stats?.reviews_used ?? 0}건 반영 · 묶음 글 ${sp.stats?.roundups_skipped ?? 0}건 제외 · ` : ""}가격·운영 여부는 예약처 최신 공지가 우선입니다</span>
    <a class="dv-fix-link" href="${esc(correctionUrl(c))}" target="_blank" rel="noopener">${ic("#l-pencil", "i-xs")}이 정보 고치기·운영자 확인 알리기</a>
  </section>`;
}

// 예약 전 확인·준비(로드맵 R1·R2·R3). 모르는 조건을 ‘물어볼 질문’으로, 아는 조건을 ‘챙길 것’으로 바꾼다.
// 질문은 확인 필요/소개글 기반 항목만, 준비물은 등급이 있는 사실만 근거로 쓴다. 근거 없는 일반론은 넣지 않는다.
const REPO_ISSUES = "https://github.com/pyw31337/camp/issues/new";
const correctionUrl = (c, field = "") => `${REPO_ISSUES}?${new URLSearchParams({ template: "condition-correction.yml", title: `[정보 고치기] ${c.name}`, campground: `${c.name} (id: ${c.id})`, field }).toString()}`;
function confirmQuestions(c) {
  const v = conditionView(c), qs = [];
  const need = (d) => d.grade === "UNKNOWN" || d.grade === "SURVEYED";
  const stay = state.checkIn && state.checkOut ? `${md(state.checkIn)}~${md(state.checkOut)} ` : "";
  // 글램핑·카라반처럼 텐트를 치지 않는 상품만 있으면 규격·피칭 질문은 하지 않는다.
  const fixedStay = c.kinds.length && c.kinds.every(([k]) => ["GLAMPING", "CARAVAN_RENTAL", "CAMPNIC_DAY"].includes(k));
  if (fixedStay) { /* 텐트 설치형이 아님 */ } else if (state.gear) {
    const gear = setupStatus(c).checks.find((x) => x.key === "gear");
    if (gear && gear.state !== "MATCH") { const [w, d] = state.gear.split("x"); qs.push(["size", `${w}×${d}m 텐트(또는 리빙쉘)가 들어가는 사이트가 있나요? 있다면 어느 구역인가요?`]); }
  } else if (need(v.size)) qs.push(["size", "사이트 가로×세로 크기가 구역별로 어떻게 되나요?"]);
  if (need(v.parking) || v.parking.partial) qs.push(["parking", v.parking.partial ? "텐트 바로 옆에 주차할 수 있는 구역이 어디인가요?" : "차를 텐트 바로 옆에 댈 수 있나요? 아니면 주차 후 짐을 옮겨야 하나요(수레 제공 여부)?"]);
  if (need(v.power) || (state.profilePower && !v.power.watts)) qs.push(["power", `사이트당 전기는 최대 몇 W(몇 A)까지 쓸 수 있나요?${state.profilePower ? ` ${Number(state.profilePower).toLocaleString()}W 정도 쓰려고 해요.` : ""}`]);
  if (need(v.firewood) || v.firewood.designated) qs.push(["firewood", "개인 화로대로 장작 불멍이 가능한가요? 화로대 받침이나 지정 구역 조건이 있나요?"]);
  const spf = DETAIL.get(c.id)?.spec?.fields ?? {};
  const known = (code) => spf[code]?.values?.length;
  if (!known("CHECKIN_TIME") || !known("CHECKOUT_TIME") || spf.CHECKIN_TIME?.conflict) qs.push(["time", "입실·퇴실 시간과 얼리 체크인·레이트 체크아웃 가능 여부·요금이 어떻게 되나요?"]);
  if (!known("MIN_STAY") && state.checkIn && state.checkOut && (Date.parse(state.checkOut) - Date.parse(state.checkIn)) / 864e5 < 2) qs.push(["minstay", "주말 1박 예약도 가능한가요? 2박 우선 예약이 있나요?"]);
  if (!fixedStay && v.shelter.grade === "UNKNOWN") qs.push(["shelter", "텐트 외에 타프(또는 3×3m 캐노피)를 추가로 칠 수 있나요?"]);
  if (v.kids.grade !== "UNKNOWN" && /수영|물놀이|SWIMMING/.test([...v.kids.amenities, ...v.kids.features].join(" "))) qs.push(["kids", `${stay}물놀이장(수영장)을 운영하나요? 이용료가 따로 있나요?`]);
  return qs.slice(0, 6);
}
function prepItems(c) {
  const v = conditionView(c), out = [];
  if (v.parking.cart) out.push([v.parking.grade, "#l-shopping-cart", "짐을 수레로 옮겨야 해요", "짐을 큰 가방 몇 개로 묶고, 수레 제공 여부를 확인하세요."]);
  else if (v.parking.tentSide === true && isFact(v.parking.grade)) out.push([v.parking.grade, "#l-car", "차를 텐트 옆에 댈 수 있어요", "짐 정리를 차와 가깝게 계획해도 돼요."]);
  if (v.power.watts) out.push([v.power.grade, "#l-plug-zap", `전기는 최대 ${v.power.watts.toLocaleString()}W`, "쓸 기기의 소비전력 합이 이 값을 넘지 않게 준비하세요."]);
  else if (v.power.available) out.push([v.power.grade, "#l-plug-zap", "전기는 있지만 사용 가능 W를 몰라요", "전력이 큰 기기는 W를 확인한 뒤 챙기세요."]);
  if (isFact(v.firewood.grade) && v.firewood.allowed === false) out.push([v.firewood.grade, "#l-flame", "장작은 쓸 수 없어요", "숯·가스 등 허용된 방식으로 준비하세요."]);
  const floors = (c.field_conditions?.ground?.types?.map((x) => x.type) ?? c.floors.map(([t]) => t));
  if (floors.includes("DECK")) out.push([v.floor.grade, "#t-layers-subtract", "데크 사이트가 있어요", "데크용 고정 장비(앵커·스트링 고정구)를 챙기세요."]);
  if (floors.some((t) => t === "CRUSHED_STONE" || t === "GRAVEL")) out.push([v.floor.grade, "#t-layers-subtract", "파쇄석·자갈 사이트가 있어요", "단단한 단조팩·망치가 편해요."]);
  return out.slice(0, 5);
}
function prepBlock(c) {
  const qs = confirmQuestions(c), items = prepItems(c);
  if (!qs.length && !items.length) return "";
  const text = qs.length ? [`안녕하세요, ${c.name} 예약 전에 여쭤봐요.`, ...qs.map(([, q], i) => `${i + 1}. ${q}`)].join("\n") : "";
  return `<section class="dv-sec dv-prep" id="sec-prep"><h3>${ic("#l-list-checks", "i-sm")}예약 전 확인·준비</h3>
    ${qs.length ? `<div class="dv-sub"><h4>사장님께 물어볼 것 <span class="num">${qs.length}</span></h4>
      <ol class="prep-qs">${qs.map(([, q]) => `<li data-wrap-ok>${esc(q)}</li>`).join("")}</ol>
      <div class="prep-actions"><button type="button" class="btn btn-line" data-copy-text="${esc(text)}">${ic("#l-copy", "i-sm")}질문 복사</button>${c.tel ? `<a class="btn btn-line" href="${telHref(c.tel)}">${ic("#l-phone", "i-sm")}전화</a>` : ""}</div>
      <p class="prep-foot" data-wrap-ok>여기 질문은 근거가 아직 없거나 소개글에만 있는 항목이에요. 답을 들으셨다면 <a href="${esc(correctionUrl(c))}" target="_blank" rel="noopener">정보 고치기</a>로 알려 주세요. 검수 뒤 다른 캠퍼에게도 보여요.</p></div>` : ""}
    ${items.length ? `<div class="dv-sub"><h4>챙기면 좋은 것</h4><ul class="prep-items">${items.map(([g, icon, title, note]) => `<li>${ic(icon, "i-sm")}<div><b>${esc(title)} ${gradeChip(g)}</b><p data-wrap-ok>${esc(note)}</p></div></li>`).join("")}</ul></div>` : ""}
  </section>`;
}

// 사용자가 고른 장비·전력·주차·불멍 조건을 이미 확인된 현장 조건과만 비교한다.
// 값이 비어 있으면 허용으로 추정하지 않고 ‘확인 필요’로 남긴다.
function setupBlock(c) {
  if (!hasSetup()) return "";
  const verdict = setupStatus(c);
  const icon = { MATCH: "#l-circle-check", CONDITIONAL: "#l-circle-alert", UNKNOWN: "#l-circle-help", MISMATCH: "#l-circle-x" };
  const title = verdict.overall === "MATCH" ? "현재 등록된 조건에서는 준비 가능해요" : verdict.overall === "CONDITIONAL" ? "조건이 있어 확인하고 가세요" : verdict.overall === "MISMATCH" ? "고른 필수 조건과 맞지 않아요" : "확인하지 못한 조건이 있어요";
  return `<section class="dv-sec dv-setup ${verdict.overall.toLowerCase()}" id="sec-setup"><div class="dv-sub-head"><h3>${ic("#l-backpack", "i-sm")}내 캠핑 세팅</h3><span class="dv-setup-badge">${ic(icon[verdict.overall], "i-xs")}${SETUP_LABEL[verdict.overall]}</span></div>
    <p class="dv-setup-title" data-wrap-ok>${title}</p>
    <div class="dv-setup-list">${verdict.checks.map((check) => `<article class="${check.state.toLowerCase()}"><span>${ic(icon[check.state], "i-sm")}</span><div><b>${esc(check.label)}</b><p data-wrap-ok>${esc(check.text)}</p></div><em>${SETUP_LABEL[check.state]}</em></article>`).join("")}</div>
    <span class="trust">이 판정은 현재 입력한 조건과 근거가 있는 사이트·구역 정보만 비교합니다. ‘확인 필요’는 통과가 아닙니다.</span>
  </section>`;
}

// 상세 상단의 예약 전 핵심 공지. 실제 공지는 원문 링크·확인 시각을 가진 승인
// 레지스트리에서만 보여 준다. 값이 없는 곳은 임의의 수치 대신 확인할 항목만 안내한다.
function importantInfoBlock(c) {
  const items = c.important_info?.items ?? [];
  const f = c.field_conditions ?? {};
  const fallback = [
    f.power?.available === true && !f.power?.limit_w && ["전기 사용", "전기 제공 등록 · 사용 가능 W는 예약처 최신 공지 확인"],
    f.parking?.tent_side == null && ["주차", "텐트 옆 주차 가능 여부는 사이트별 확인"],
    f.shelter_setup?.state !== "CONFIRMED" && ["텐트·타프/캐노피", "1텐트·타프/쉘터·캐노피 추가 설치 기준은 운영자 공지 확인"],
    f.firewood?.allowed == null && ["화로·장작", "숯·장작·불멍 허용 기준은 운영자 공지 확인"],
  ].filter(Boolean).slice(0, 3);
  const typeLabel = { POWER: "전기", RENTAL: "대여", PARKING: "주차", SHELTER_SETUP: "텐트·타프", FIRE: "화로·불멍", CHECKIN: "입·퇴실", RULE: "이용 규칙", NOTICE: "운영 안내" };
  const actual = items.sort((a, b) => ({ critical: 0, high: 1, normal: 2 }[a.priority] - ({ critical: 0, high: 1, normal: 2 }[b.priority]))).slice(0, 5);
  return `<section class="dv-sec dv-important" id="sec-important"><div class="dv-sub-head"><h3>${ic("#l-info", "i-sm")}예약 전 중요 정보</h3>${actual.length ? `<span class="dv-important-badge">공식 공지 ${actual.length}건</span>` : `<span class="dv-important-badge muted">공지 원문 연동 전</span>`}</div>
    ${actual.length ? `<div class="dv-important-list">${actual.map((item) => `<article class="${esc(item.priority)}"><span>${esc(typeLabel[item.kind] ?? "운영 안내")}</span><div><b>${esc(item.title)}</b><p data-wrap-ok>${esc(item.summary)}</p><a href="${esc(item.source.url)}" target="_blank" rel="noopener">${esc(item.source.label)} · ${ymd(item.source.checked_at)} 확인${ic("#l-arrow-up-right", "i-xs")}</a></div></article>`).join("")}</div>` : `<div class="dv-important-empty"><b>운영자 공지 원문이 아직 연동되지 않았어요.</b><p data-wrap-ok>전력 W 제한·대여 품목/요금·입퇴실·주차·화로 규정은 예약 화면의 최신 공지가 우선합니다.</p></div>`}
    ${fallback.length ? `<div class="dv-important-checks">${fallback.map(([label, text]) => `<span><b>${esc(label)}</b>${esc(text)}</span>`).join("")}</div>` : ""}
    <span class="trust">플랫폼 공지의 자동 복제 대신 운영자 제공·제휴/API로 확인된 항목만 표시합니다</span>
  </section>`;
}
function priceMentionsBlock(d) {
  const list = d?.prices ?? [];
  if (!list.length) return "";
  const S = { peak: "성수기", off: "비수기" }, D = { weekend: "주말", weekday: "평일" };
  const tag = (x) => [S[x.season], D[x.day]].filter(Boolean).join(" ") || "시기 미상";
  const groups = new Map();
  for (const x of list) { const k = tag(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x.won); }
  const median = (v) => { const a = [...v].sort((p, q) => p - q); return a[Math.floor((a.length - 1) / 2)]; };
  const vals = list.map((x) => x.won), lo = Math.min(...vals), hi = Math.max(...vals);
  const pos = (v) => (hi === lo ? 50 : Math.round(((v - lo) / (hi - lo)) * 100));
  return `<div class="dv-sub"><h4>후기로 본 1박 요금</h4>
    <div class="dv-range"><div class="dv-range-bar">${[...groups].map(([k, v]) => `<i style="left:${pos(median(v))}%" title="${esc(k)}"></i>`).join("")}</div><div class="dv-range-ends"><b class="num">${band(lo)}</b><b class="num">${band(hi)}</b></div></div>
    <div class="dv-bands">${[...groups].map(([k, v]) => `<div><small>${esc(k)}</small><b class="num">${band(median(v))}</b><em>후기 ${v.length}</em></div>`).join("")}</div>
    <span class="trust">블로그·카페 글에서 자동 추출한 작성 시점 요금 · 확정 요금은 예약처</span></div>`;
}
function layoutBlock(d) {
  const rawImgs = d?.layout?.images ?? [];
  if (!rawImgs.length) return "";
  const imgs = dedupeImages(rawImgs, (x) => x.img || x.thumb);
  lbAdd("layout", imgs.map((x) => ({
    src: hiResImg(x.img || x.thumb),
    small: false,
    cap: x.sure ? "시설 배치도 (고해상도 원본)" : "시설 배치도 (참고용 고해상도)",
    link: x.url ?? x.img,
    remote: true,
  })));
  return `<div class="dv-sub"><h4>시설 배치도 <span class="num">${imgs.length}</span></h4>
    <div class="dv-thumbs">${imgs.map((x, i) => `<button type="button" class="layout-thumb-btn" ${lbAttr("layout", i)} aria-label="시설 배치도 크게 보기"><img src="${esc(remoteImg(x.img || x.thumb))}" alt="시설 배치도 ${i + 1}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"><span class="layout-zoom-hint">${ic("#l-scan-search", "i-xs")}원본 확대</span></button>`).join("")}</div>
    <span class="trust ok">${ic("#l-shield-check", "i-xs")}고해상도 원본 배치도 연동 · 클릭 시 원본 전체 화면 확대</span></div>`;
}
function productsBlock(d) {
  const list = d?.products ?? [];
  if (!list.length) return "";
  const won2 = (n) => (n ? `${Number(n).toLocaleString()}원` : null);
  return `<div class="dv-sub"><h4>객실·사이트 상품 <span class="num">${list.length}</span></h4><div class="dv-rail">${list.map((p, pi) => {
    const pr = p.price ?? {};
    const rows = [["비수기 주중", pr.off_weekday], ["비수기 주말", pr.off_weekend], ["성수기 주중", pr.peak_weekday], ["성수기 주말", pr.peak_weekend]].filter(([, v]) => v);
    const photos = lbAdd(`p${pi}`, (p.photos ?? []).map((u) => ({ src: remoteImg(u), cap: `${p.name} · 관광공사 공식 사진`, remote: true })));
    return `<article class="dv-product">${photos.length ? `<button type="button" class="dv-product-img" ${lbAttr(`p${pi}`, 0)}><img src="${esc(photos[0].src)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">${photos.length > 1 ? `<em class="num">+${photos.length - 1}</em>` : ""}</button>` : ""}
      <div><b>${esc(p.name)}</b><small>${esc([p.size, p.base || p.max ? `기준 ${p.base ?? "-"}·최대 ${p.max ?? "-"}명` : null].filter(Boolean).join(" · "))}</small>
      ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd class="num">${won2(v)}~</dd>`).join("")}</dl>` : ""}</div></article>`;
  }).join("")}</div><span class="trust">${esc(d.products_src?.basis ?? "한국관광공사 공식 등록 기준가")}${d.products_src?.checked_at ? ` · ${ymd(d.products_src.checked_at)} 확인` : ""} · 실제 요금·빈자리는 예약처에서 확정</span></div>`;
}

// 6) 후기: 영상 가로 레일 · 방문자 사진 격자 · 글(필터: 추천/최신/정확/작년 이맘때)
const REVIEW_MODES = [["rec", "추천"], ["new", "최신순"], ["acc", "정확순"], ["ly", "작년 이맘때"]];
const doy = (t) => { const x = new Date(t); return Math.floor((x - new Date(x.getFullYear(), 0, 0)) / 864e5); };
function reviewItems(d) {
  return [...(d?.reviews ?? []).map((r) => ({ ...r, kind: "블로그" })), ...(d?.cafe ?? []).map((r) => ({ ...r, kind: "카페" }))]
    .map((r) => ({ ...r, scored: r.q != null, q: r.q ?? Math.round(20 + Math.min(String(r.snippet ?? "").length, 160) / 4 + (r.thumb ? 10 : 0)), t: Date.parse(r.date ?? "") || 0 }));
}
function sortReviews(list, mode) {
  const now = Date.now(), year = new Date().getFullYear();
  const lastYear = (r) => r.t && new Date(r.t).getFullYear() < year && Math.abs(doy(r.t) - doy(now)) <= 45;
  const byDate = (a, b) => b.t - a.t, byQ = (a, b) => b.q - a.q || b.t - a.t;
  if (mode === "new") return [...list].sort(byDate);
  if (mode === "acc") return [...list].sort(byQ);
  if (mode === "ly") return list.filter(lastYear).sort((a, b) => Math.abs(doy(a.t) - doy(now)) - Math.abs(doy(b.t) - doy(now)));
  // 추천: 최근 60일 → 정보량 많은 글 → 작년 이맘때 → 나머지(최신순)
  const recent = list.filter((r) => now - r.t <= 60 * 864e5).sort(byDate);
  const rest = list.filter((r) => !recent.includes(r));
  const rich = rest.filter((r) => r.q >= 70).sort(byQ);
  const ly = rest.filter((r) => !rich.includes(r) && lastYear(r)).sort(byDate);
  return [...recent, ...rich, ...ly, ...rest.filter((r) => !rich.includes(r) && !ly.includes(r)).sort(byDate)];
}

// 후기 키워드 모아보기: 모은 블로그·카페 글의 제목·요약에서 주제별 언급 수를 센다.
// 문장을 지어내지 않는다. 표본 수·기간·근거 글 링크를 함께 보이고, 3건 미만이면 내지 않는다.
const REVIEW_TOPICS = [
  ["화장실·샤워", /화장실|샤워|온수|개수대/],
  ["매너타임·소음", /매너\s*타임|조용|소음|시끄/],
  ["사이트 넓이", /사이트[^.]{0,8}(넓|좁|크기|간격)|옆\s*사이트|프라이빗/],
  ["아이 놀거리", /아이|키즈|놀이터|방방|트램|에어바운스|수영장/],
  ["계곡·물놀이", /계곡|물놀이|냇가/],
  ["불멍·장작", /불멍|장작|화로/],
  ["전기·전력", /전기|콘센트|전력|릴선/],
  ["진입로·경사", /진입로|비포장|경사|오르막|언덕/],
  ["벌레", /벌레|모기|날파리|진드기/],
  ["바람", /바람|강풍|돌풍/],
];
function reviewSummaryBlock(c, d) {
  const reviews = reviewItems(d);
  if (reviews.length < 3) return "";
  const text = (r) => `${r.title ?? ""} ${r.snippet ?? ""}`;
  const rows = REVIEW_TOPICS.map(([label, re]) => {
    const hits = reviews.filter((r) => re.test(text(r))).sort((a, b) => b.t - a.t);
    return { label, n: hits.length, sample: hits.slice(0, 2) };
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 6);
  if (!rows.length) return "";
  const times = reviews.map((r) => r.t).filter(Boolean);
  const period = times.length ? `${ymd(new Date(Math.min(...times)).toISOString())} ~ ${ymd(new Date(Math.max(...times)).toISOString())}` : "";
  return `<div class="rv-topics">
    <div class="rv-topics-head">${ic("#l-list-checks", "i-sm")}<div><b>후기에서 많이 나온 이야기</b><small>모은 글 ${reviews.length}건${period ? ` · ${period}` : ""} · 제목·요약의 단어를 센 것이라 좋고 나쁨은 원문에서 확인하세요</small></div></div>
    <ul>${rows.map((x) => `<li><span class="rv-topic-l">${esc(x.label)}</span><span class="rv-topic-bar"><i style="--w:${Math.round((x.n / reviews.length) * 100)}%"></i></span><span class="rv-topic-n num">${x.n}건</span>
      <span class="rv-topic-src">${x.sample.map((r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(String(r.title ?? "원문").slice(0, 28))}</a>`).join("")}</span></li>`).join("")}</ul>
  </div>`;
}

function reviewCards(d, mode) {
  const list = sortReviews(reviewItems(d), mode);
  if (!list.length) return `<p class="dv-empty">${mode === "ly" ? "작년 이맘때 올라온 후기가 아직 없어요." : "모은 후기가 아직 없어요."}</p>`;

  const now = Date.now(), curYear = new Date().getFullYear();
  const isLastYearSeason = (r) => r.t && new Date(r.t).getFullYear() < curYear && Math.abs(doy(r.t) - doy(now)) <= 45;

  return `<div class="review-grid">${list.map((r) => {
    const rawThumb = r.thumb ? remoteImg(r.thumb) : null;
    const isLy = isLastYearSeason(r);
    const rich = r.scored && r.q >= 75;
    const badges = `${rich ? `<span class="review-ai-badge">${ic("#l-file-text", "i-xs")}정보 많음</span>` : ""}${isLy ? `<span class="review-season-badge">${ic("#l-calendar", "i-xs")}작년 이맘때</span>` : ""}`;
    const thumbHtml = rawThumb
      ? `<div class="review-card-thumb"><img src="${esc(rawThumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">${badges}</div>`
      : `<div class="review-card-thumb"><span class="review-no-thumb">${ic(r.kind === "카페" ? "#l-messages-square" : "#l-notebook-pen", "i-md")}</span>${badges}</div>`;

    return `<a class="review-card-vertical" href="${esc(r.url)}" target="_blank" rel="noopener">
      ${thumbHtml}
      <div class="review-card-body">
        <div class="review-card-meta">
          <span class="review-badge-kind ${r.kind === "카페" ? "cafe" : "blog"}">${r.kind}</span>
          <span class="review-src">${esc(r.src || r.kind)}</span>
          <span class="review-date">${relDay(r.date)}</span>
        </div>
        <h4 class="review-card-title">${esc(r.title)}</h4>
        ${r.snippet ? `<p class="review-card-snippet">${esc(r.snippet)}</p>` : ""}
      </div>
    </a>`;
  }).join("")}</div>`;
}

function morePlatformsBlock(c, d) {
  const q = encodeURIComponent(c.name);
  const tagQ = encodeURIComponent(c.name.replace(/\s+|[()（）]/g, ""));
  const vids = d?.videos ?? [];
  const topVids = vids.slice(0, 2);
  const reviews = reviewItems(d);
  const snaps = (d?.sns_images ?? []).slice(0, 3);

  return `<div class="dv-sub dv-platform-hub">
    <h4>다른 플랫폼에서 더보기</h4>
    <div class="platform-hub-grid">
      <!-- 유튜브 섹션 -->
      <div class="platform-card platform-sec-card youtube">
        <div class="platform-card-header">
          <div class="platform-icon youtube">${ic("#l-play", "i-sm")}</div>
          <div class="platform-info">
            <b>유튜브 영상·쇼츠</b>
            <small>${vids.length ? `연동 영상 ${vids.length}건 · 즉시 재생 가능` : "캠핑 영상·쇼츠 탐색"}</small>
          </div>
          <a class="platform-ext-btn" href="https://www.youtube.com/results?search_query=${encodeURIComponent(c.name + " 캠핑")}" target="_blank" rel="noopener" title="유튜브에서 더보기">${ic("#l-arrow-up-right", "i-xs")}</a>
        </div>
        ${topVids.length ? `<div class="platform-inline-vids">${topVids.map((v) => `
          <button class="dv-video mini ${v.kind === "short" ? "short" : ""}" type="button" data-video="${esc(v.yt || "")}" aria-label="${esc(v.title)} 재생">
            <span class="dv-video-img"><img src="${v.yt ? `https://i.ytimg.com/vi/${esc(v.yt)}/hqdefault.jpg` : esc(remoteImg(v.thumb))}" alt="" loading="lazy"><i>${ic("#l-play")}</i></span>
            <b>${esc(v.title)}</b>
            <small>${esc([v.author, relDay(v.date)].filter(Boolean).join(" · "))}</small>
          </button>
        `).join("")}</div>` : ""}
      </div>

      <!-- 인스타그램 섹션 -->
      <div class="platform-card platform-sec-card instagram">
        <div class="platform-card-header">
          <div class="platform-icon instagram">${ic("#l-camera", "i-sm")}</div>
          <div class="platform-info">
            <b>인스타그램 해시태그</b>
            <small>#${esc(c.name.replace(/\s+/g, ""))} 피드</small>
          </div>
          <a class="platform-ext-btn" href="https://www.instagram.com/explore/tags/${tagQ}/" target="_blank" rel="noopener" title="인스타그램에서 더보기">${ic("#l-arrow-up-right", "i-xs")}</a>
        </div>
        ${snaps.length ? `<div class="platform-inline-snaps">${snaps.map((s) => `
          <a class="platform-snap-link" href="${esc(s.url || `https://www.instagram.com/explore/tags/${tagQ}/`)}" target="_blank" rel="noopener">
            <img src="${esc(remoteImg(s.thumb))}" alt="인스타그램 사진" loading="lazy">
          </a>
        `).join("")}</div>` : ""}
      </div>

      <!-- 네이버 블로그 섹션 -->
      <a class="platform-card" href="https://search.naver.com/search.naver?ssc=tab.blog.all&query=${q}" target="_blank" rel="noopener">
        <div class="platform-icon naver">${ic("#l-notebook-pen", "i-sm")}</div>
        <div class="platform-info">
          <b>네이버 블로그 후기</b>
          <small>${reviews.length ? `모은 글 ${reviews.length}건 · 최신 블로그` : "네이버 블로그 검색 열기"}</small>
        </div>
        ${ic("#l-arrow-up-right", "i-xs ext")}
      </a>

      <!-- 네이버 카페 섹션 -->
      <a class="platform-card" href="https://section.cafe.naver.com/ca-fe/home/search/articles?q=${q}" target="_blank" rel="noopener">
        <div class="platform-icon cafe">${ic("#l-coffee", "i-sm")}</div>
        <div class="platform-info">
          <b>네이버 카페 질답·후기</b>
          <small>캠핑 카페 실캠퍼 질답</small>
        </div>
        ${ic("#l-arrow-up-right", "i-xs ext")}
      </a>

      <!-- 카카오맵 리뷰 & 로드뷰 -->
      <a class="platform-card" href="https://map.kakao.com/?q=${q}" target="_blank" rel="noopener">
        <div class="platform-icon kakao">${ic("#l-map-pin", "i-sm")}</div>
        <div class="platform-info">
          <b>카카오맵 리뷰·로드뷰</b>
          <small>방문자 평점·거리뷰</small>
        </div>
        ${ic("#l-arrow-up-right", "i-xs ext")}
      </a>

      <!-- 네이버 지도 스마트플레이스 -->
      <a class="platform-card" href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener">
        <div class="platform-icon naver">${ic("#l-navigation", "i-sm")}</div>
        <div class="platform-info">
          <b>네이버 지도·플레이스</b>
          <small>네이버 스마트플레이스</small>
        </div>
        ${ic("#l-arrow-up-right", "i-xs ext")}
      </a>
    </div>
  </div>`;
}

function reviewsBlock(c, d) {
  const vids = d?.videos ?? [];
  // 쇼츠(세로)와 일반 영상(가로)은 높이가 달라 한 줄에 섞으면 빈칸이 생긴다 → 줄을 나눈다.
  const shorts = vids.filter((v) => v.kind === "short"), longs = vids.filter((v) => v.kind !== "short");
  const video = (v) => v.yt
    ? `<button class="dv-video ${v.kind === "short" ? "short" : ""}" type="button" data-video="${esc(v.yt)}" aria-label="${esc(v.title)} 재생"><span class="dv-video-img"><img src="https://i.ytimg.com/vi/${esc(v.yt)}/hqdefault.jpg" alt="" loading="lazy" decoding="async" onerror="this.remove()"><i>${ic("#l-play")}</i>${v.kind === "short" ? "<em>쇼츠</em>" : ""}</span><b>${esc(v.title)}</b><small>${esc([v.author, relDay(v.date)].filter(Boolean).join(" · "))}</small></button>`
    : `<a class="dv-video" href="${esc(v.url)}" target="_blank" rel="noopener"><span class="dv-video-img"><img src="${esc(remoteImg(v.thumb))}" alt="" loading="lazy" referrerpolicy="no-referrer"><i>${ic("#l-play")}</i></span><b>${esc(v.title)}</b><small>${esc([v.author, relDay(v.date)].filter(Boolean).join(" · "))}</small></a>`;
  
  const rawSnaps = (d?.sns_images ?? []).map((x) => ({ src: remoteImg(x.thumb), small: true, cap: `방문자 사진 · ${x.src ?? "외부"}`, link: x.url, remote: true }));
  const dedupeSnaps = dedupeImages(rawSnaps, (x) => x.src);
  const snaps = lbAdd("snaps", dedupeSnaps);
  const n = reviewItems(d).length;

  return `<section class="dv-sec" id="sec-media"><h3>후기 및 미디어 <span class="num">${n + vids.length}</span></h3>
    ${reviewSummaryBlock(c, d)}
    ${longs.length ? `<div class="dv-sub"><h4>영상 <span class="num">${longs.length}</span></h4><div class="dv-rail">${longs.map(video).join("")}</div></div>` : ""}
    ${shorts.length ? `<div class="dv-sub"><h4>쇼츠 <span class="num">${shorts.length}</span></h4><div class="dv-rail">${shorts.map(video).join("")}</div></div>` : ""}
    ${snaps.length ? `<div class="dv-sub"><h4>방문자 사진 <span class="num">${snaps.length}</span></h4><div class="dv-snaps">${snaps.slice(0, 11).map((p, i) => `<button type="button" ${lbAttr("snaps", i)} aria-label="방문자 사진 ${i + 1} 크게 보기"><img src="${esc(p.src)}" alt="방문자 사진 ${i + 1}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></button>`).join("")}${snaps.length > 11 ? `<button type="button" class="dv-snaps-more" ${lbAttr("snaps", 11)}><b class="num">+${snaps.length - 11}</b></button>` : ""}</div></div>` : ""}
    ${n ? `<div class="dv-sub"><div class="dv-sub-head"><h4>블로그·카페 후기 <span class="num">${n}</span></h4><div class="dv-seg" role="tablist">${REVIEW_MODES.map(([k, l]) => `<button type="button" role="tab" data-rv="${k}" aria-selected="${k === "rec"}">${l}</button>`).join("")}</div></div><div class="dv-reviews" id="reviewList">${reviewCards(d, "rec")}</div></div>` : ""}
    ${morePlatformsBlock(c, d)}
    ${d?.social_checked_at ? `<span class="trust">Daum 검색 제공 · ${ymd(d.social_checked_at)} 수집 · 원문의 저작권은 글쓴이에게 있어요</span>` : ""}
  </section>`;
}

// 7) 시설: 큰 숫자 타일 + 규칙 배지 + 대여 장비
function facilitiesBlock(c) {
  const facts = [["#l-toilet", c.toilets, "화장실"], ["#l-shower-head", c.showers, "샤워실"], ["#l-droplets", c.sinks, "개수대"]].filter(([, v]) => v != null);
  const yes = (v) => v == null ? null : v ? "on" : "off";
  const rules = [
    c.pets && [petOk(c) ? "on" : "off", "#l-dog", `반려견 ${petOk(c) ? "가능" : "불가"}`],
    c.fire && [/불가/.test(c.fire) ? "off" : "on", "#l-flame", `화로대 ${c.fire}`],
    yes(c.trailer) && [yes(c.trailer), "#t-caravan", `트레일러 ${c.trailer ? "가능" : "불가"}`],
    yes(c.caravan) && [yes(c.caravan), "#l-car", `개인 카라반 ${c.caravan ? "가능" : "불가"}`],
  ].filter(Boolean);
  return `<section class="dv-sec" id="sec-fac"><h3>시설·이용 규칙</h3>
    ${facts.length ? `<div class="dv-facts">${facts.map(([i, v, l]) => `<div><span>${ic(i)}</span><b class="num">${v}</b><small>${l}</small></div>`).join("")}</div>` : ""}
    ${rules.length ? `<div class="dv-rules">${rules.map(([s, i, l]) => `<span class="${s}">${ic(i, "i-sm")}${esc(l)}</span>`).join("")}</div>` : ""}
    ${c.rental.length ? `<div class="dv-sub"><h4>장비 대여</h4><div class="dv-chips">${c.rental.map((r) => `<span>${ic("#l-package", "i-xs")}${esc(r)}</span>`).join("")}</div></div>` : ""}
    <div id="introSlot"></div>
    <span class="trust ok">한국관광공사 고캠핑 등록 정보</span>
  </section>`;
}

// 8) 기본 정보: 아이콘 목록 + 공식 링크 타일
function infoBlock(c, d) {
  const rows = [
    ["#l-map-pin", "주소", c.addr, c.addr ? `<button class="mini" type="button" data-copy="${esc(c.addr)}">복사</button>` : ""],
    ["#l-phone", "전화", c.tel, c.tel ? `<a class="mini" href="${telHref(c.tel)}">걸기</a>` : ""],
    ["#l-globe", "홈페이지", c.homepage ? c.homepage.replace(/^https?:\/\//, "").replace(/\/$/, "") : null, c.homepage ? `<a class="mini" href="${esc(c.homepage)}" target="_blank" rel="noopener">열기</a>` : ""],
    ["#l-calendar", "운영 기간", d?.open_period ?? (c.seasons.join("·") || null), ""],
    ["#l-clock", "이용 시간", d?.hours ?? null, ""],
    ["#l-calendar-clock", "쉬는 날", d?.rest_days ?? null, ""],
    ["#l-car", "주차", d?.parking ?? null, ""],
    ["#l-landmark", "운영", [OP[c.op], c.types.join("·")].filter(Boolean).join(" · ") || null, ""],
  ].filter(([, , v]) => v);
  const links = [c.gc_url && [c.gc_url, "고캠핑 시설 안내"], d?.products_src?.url && [d.products_src.url, "관광공사 시설 안내"]].filter(Boolean);
  const notes = d?.tour_info ?? [];
  return `<section class="dv-sec" id="sec-info"><h3>기본 정보</h3>
    <div class="dv-info">${rows.map(([i, k, v, a]) => `<div><span>${ic(i, "i-sm")}</span><small>${k}</small><p data-wrap-ok>${esc(v)}</p>${a}</div>`).join("")}</div>
    ${notes.length ? notes.slice(0, 6).map((x) => `<details class="dv-more"><summary>${esc(x.name || "이용 안내")}</summary><p class="pre" data-wrap-ok>${esc(x.text || "")}</p></details>`).join("") : ""}
    ${links.length ? `<div class="dv-chips links">${links.map(([u, l]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}${ic("#l-arrow-up-right", "i-xs")}</a>`).join("")}</div>` : ""}
    <span class="trust">출처: 한국관광공사 고캠핑(${ymd(c.modified_at)} 수정) · 정보가 다르면 운영자 공지가 우선해요</span>
  </section>`;
}

const DV_NAV = [["sec-important", "중요"], ["sec-spec", "이용 정보"], ["sec-book", "예약"], ["sec-setup", "내 세팅"], ["sec-prep", "준비"], ["sec-site", "사이트·요금"], ["sec-media", "후기"], ["sec-fac", "시설"], ["sec-near", "주변"], ["sec-info", "정보"], ["sec-talk", "댓글"]];
// 이름을 굵기 대비로: 첫 단어는 900, 나머지는 200(A안의 강약). 한 단어면 그대로.
function titleHtml(name) {
  const n = shortName(name), parts = n.split(/\s+/);
  if (parts.length < 2) return `<b>${esc(n)}</b>`;
  return `<b>${esc(parts[0])}</b> <span>${esc(parts.slice(1).join(" "))}</span>`;
}
// 배지 (i): 각 배지의 근거(등급·원문 문장·URL·확인 시각). 화면에는 값만, 근거는 여기에.
function badgeTip(c) {
  const v = conditionView(c);
  const row = (label, d) => {
    if (!d || d.grade === "UNKNOWN") return `<p><b>${label}</b> 확인필요 — 공식 원문이 아직 없어요. 예약 전에 운영자에게 확인하세요.</p>`;
    const s = d.src ?? (d.grade === "VERIFIED" || d.grade === "CONFIRMED" ? { label: v.source.label, url: v.source.url, checked_at: v.source.checked_at } : null);
    return `<p><b>${label}</b> ${esc(d.value)} · ${GRADE_LABEL[d.grade]}${s?.quote ? ` — “${esc(s.quote)}”` : ""}${s?.url ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label ?? "원문")}</a>` : ""}${s?.checked_at ? ` · ${ymd(s.checked_at)} 확인` : ""}</p>`;
  };
  return [row("전기", v.power), row("장작", v.firewood), row("숯", v.charcoal), row("주차", v.parking), row("차박", v.carCamp), v.firePit ? `<p><b>화로대</b> ${esc(v.firePit)} · 고캠핑 등록값</p>` : ""].join("") + `<p>채운 배지 = 출처 있는 값 · 점선 = 확인필요(불가가 아님)</p>`;
}
function detail(c) {
  const d = DETAIL.get(c.id);
  LB.clear();
  const target = bookingTarget(c);
  const quickBooking = target?.ext
    ? `<a href="${esc(target.href)}" target="_blank" rel="noopener">${ic(target.type === "search" ? "#l-search" : target.type === "homepage" ? "#l-globe" : "#l-calendar-check")}<span>${target.type === "search" ? "검색" : target.type === "homepage" ? "홈페이지" : "예약"}</span></a>`
    : "";
  const themes = (META?.themes ?? []).filter((t) => c.th.includes(t.id));
  return `<div class="sheet-close"><button class="back-btn" type="button" data-close aria-label="목록으로">${ic("#l-arrow-left", "i-sm")}<span>목록</span></button></div>
  <div class="dv-cover">${heroBlock(c, d)}
    <div class="dv-glass">
      <h2>${titleHtml(c.name)}</h2>
      <p class="dv-glass-loc">${esc([c.sido, c.sigungu].filter(Boolean).join(" "))}${OP[c.op] ? ` · ${OP[c.op]}` : ""}</p>
      <div class="dv-glass-badges">${timeSignal(c, officialOpenRecords(c, { dateMatch: Boolean(state.checkIn && state.checkOut) }))}${posterBadges(c).map(badgeHtml).join("")}<button type="button" class="tip" aria-label="배지 근거 보기" data-tip="${esc(badgeTip(c))}">${ic("#l-info", "i-xs")}</button></div>
    </div>
  </div>
  <div class="d-body dv">
    <header class="dv-title">
      <h2 class="sr">${esc(c.name)}</h2>
      ${c.line ? `<p class="dv-line" data-wrap-ok>${esc(c.line)}</p>` : ""}
      <p class="dv-loc">${ic("#l-map-pin", "i-xs")}${esc([c.sido, c.sigungu].filter(Boolean).join(" "))}${OP[c.op] ? ` · ${OP[c.op]}` : ""}</p>
      ${themes.length ? `<div class="dv-themes">${themes.map((t) => `<button type="button" data-th="${t.id}" data-close-then>${ic(THEME_ICON[t.id] ?? "#t-tent", "i-xs")}${esc(t.label)}</button>`).join("")}</div>` : ""}
    </header>
    ${keyStats(c, d)}
    <div class="dv-actions">
      <a href="${routeLink(c.name, c.lat, c.lng)}" target="_blank" rel="noopener">${ic("#l-navigation")}<span>길찾기</span></a>
      <a href="${roadviewLink(c.lat, c.lng)}" target="_blank" rel="noopener">${ic("#l-camera")}<span>로드뷰</span></a>
      ${quickBooking}
      <button type="button" data-save="${c.id}" aria-pressed="${state.saved.has(c.id)}">${ic("#l-heart")}<span>${state.saved.has(c.id) ? "저장됨" : "관심"}</span></button>
      <button type="button" data-compare="${c.id}" aria-pressed="${state.compare.has(c.id)}">${ic("#l-columns-2")}<span>${state.compare.has(c.id) ? "비교 중" : "비교함"}</span></button>
      <button type="button" data-share="${c.id}">${ic("#l-share-2")}<span>공유</span></button>
      ${c.tel ? `<a class="dv-phone-action" href="${telHref(c.tel)}">${ic("#l-phone")}<span>전화</span></a>` : ""}
    </div>
    <nav class="d-nav dv-nav" aria-label="상세 목차">${DV_NAV.filter(([id]) => id !== "sec-setup" || hasSetup()).map(([id, l]) => `<button type="button" data-jump="${id}">${l}</button>`).join("")}</nav>
    ${importantInfoBlock(c)}
    ${specBlock(c, d)}
    ${bookingCard(c, d, target)}
    ${setupBlock(c)}
    ${prepBlock(c)}
    ${highlightsBlock(c, d)}
    <section class="dv-sec" id="sec-site"><h3>사이트·요금</h3>
      ${siteListBlock(c, d)}
      ${fieldConditionsBlock(c)}
      ${productsBlock(d)}
      ${priceMentionsBlock(d)}
      ${c.fee ? `<details class="dv-more"><summary>공식 요금 안내</summary><p class="pre" data-wrap-ok>${esc(c.fee.text)}</p><span class="trust">한국관광공사 등록 안내 · ${ymd(c.fee.checked_at)} 확인 · <a href="${esc(c.fee.url)}" target="_blank" rel="noopener">원문</a></span></details>` : ""}
      ${layoutBlock(d)}
    </section>
    ${reviewsBlock(c, d)}
    ${facilitiesBlock(c)}
    <section class="dv-sec" id="sec-near"><h3>주변</h3><div id="nearSlot">${nearBlock(c, d)}</div></section>
    ${infoBlock(c, d)}
    <section class="dv-sec" id="sec-talk"><h3>댓글</h3>${talkBlock(c)}</section>
  </div>
  ${target ? `<div class="d-cta">
    <div class="d-cta-actions">
      <a class="btn-cta-primary ${target.type}" href="${esc(target.href)}" ${target.ext ? 'target="_blank" rel="noopener"' : ""}>
        ${ic(target.type === "naver" ? "#l-calendar" : target.type === "camfit" ? "#l-zap" : target.type === "homepage" ? "#l-external-link" : "#l-calendar", "i-sm")}
        <span>${esc(target.label)}</span>
        ${target.ext ? ic("#l-arrow-up-right", "i-xs") : ""}
      </a>
      ${target.naverHref ? `<a class="btn-cta-secondary naver" href="${esc(target.naverHref)}" target="_blank" rel="noopener">${ic("#l-calendar", "i-xs")}네이버 예약</a>` : ""}
      ${target.camfitHref ? `<a class="btn-cta-secondary camfit" href="${esc(target.camfitHref)}" target="_blank" rel="noopener">${ic("#l-zap", "i-xs")}캠핏 검색</a>` : ""}
      ${target.phoneHref || c.tel ? `<a class="btn-cta-secondary phone" href="${esc(target.phoneHref || telHref(c.tel))}" aria-label="전화 문의">${ic("#l-phone", "i-xs")}전화 문의</a>` : ""}
    </div>
  </div>` : ""}`;
}

/* ---------- (i) 출처 안내: 본문에서 빼고 제목 옆 버튼으로 ---------- */
// 상세의 .trust(출처·확인 시각·주의 문구)를 가까운 제목 옆 (i) 버튼으로 옮긴다. 누르면 말풍선으로 보인다.
function tipify(root) {
  root.querySelectorAll(".trust").forEach((el) => {
    const html = el.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, "").trim();
    const box = el.closest(".dv-sub, .dv-sec, details, .sub, .box");
    const head = box?.querySelector(":scope > h4, :scope > h3, :scope > .dv-sub-head h4, :scope > summary");
    el.remove();
    if (!html) return;
    let btn = head?.querySelector(":scope > .tip");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button"; btn.className = "tip"; btn.setAttribute("aria-label", "출처·안내 보기");
      btn.innerHTML = ic("#l-info", "i-xs");
      btn.dataset.tip = "";
      if (head) head.append(btn); else box?.prepend(btn);
    }
    btn.dataset.tip += `<p>${html}</p>`;
  });
}
function showTip(btn) {
  let pop = document.getElementById("tipPop");
  if (pop && pop.dataset.for === btn.dataset.tipId) { pop.remove(); return; }
  pop?.remove();
  btn.dataset.tipId ||= Math.random().toString(36).slice(2);
  pop = document.createElement("div");
  pop.id = "tipPop"; pop.className = "tip-pop"; pop.setAttribute("role", "tooltip"); pop.dataset.for = btn.dataset.tipId;
  pop.innerHTML = btn.dataset.tip;
  document.body.append(pop);
  const r = btn.getBoundingClientRect(), w = Math.min(320, innerWidth - 24);
  pop.style.width = `${w}px`;
  pop.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
  const below = r.bottom + 8 + pop.offsetHeight < innerHeight;
  pop.style.top = `${below ? r.bottom + 8 : r.top - pop.offsetHeight - 8}px`;
}

/* ---------- 라이트박스: 넘기기(스와이프·드래그)·키보드·이전/다음 ---------- */
const lb = { group: null, i: 0, items: [], el: null, x0: null, dx: 0 };
function lbOpen(group, i) {
  const items = LB.get(group) ?? [];
  if (!items.length) return;
  Object.assign(lb, { group, i: Math.max(0, Math.min(items.length - 1, i)), items, back: document.activeElement });
  if (!lb.el) {
    lb.el = document.createElement("div");
    lb.el.className = "lb"; lb.el.setAttribute("role", "dialog"); lb.el.setAttribute("aria-modal", "true"); lb.el.setAttribute("aria-label", "사진 크게 보기");
    lb.el.innerHTML = `<div class="lb-top"><span class="lb-count num"></span><button type="button" class="lb-x" data-lb-close aria-label="닫기">${ic("#l-x")}</button></div>
      <div class="lb-stage"><div class="lb-track"></div></div>
      <button type="button" class="lb-nav lb-prev" data-lb-step="-1" aria-label="이전 사진">${ic("#l-chevron-left")}</button>
      <button type="button" class="lb-nav lb-next" data-lb-step="1" aria-label="다음 사진">${ic("#l-chevron-right")}</button>
      <div class="lb-cap"></div>`;
    document.body.append(lb.el);
    const stage = lb.el.querySelector(".lb-stage");
    stage.addEventListener("pointerdown", (e) => { lb.x0 = e.clientX; lb.dx = 0; stage.setPointerCapture(e.pointerId); lb.el.querySelector(".lb-track").style.transition = "none"; });
    stage.addEventListener("pointermove", (e) => { if (lb.x0 == null) return; lb.dx = e.clientX - lb.x0; lbPlace(); });
    const end = () => { if (lb.x0 == null) return; const dx = lb.dx; lb.x0 = null; lb.dx = 0; lb.dragged = Math.abs(dx) > 5; lb.el.querySelector(".lb-track").style.transition = ""; if (Math.abs(dx) > 50) lbStep(dx < 0 ? 1 : -1); else lbPlace(); };
    stage.addEventListener("pointerup", end); stage.addEventListener("pointercancel", end);
    // 사진 바깥(어두운 바탕)을 누르면 닫는다. 넘기기(드래그) 끝에 생기는 클릭은 무시한다.
    stage.addEventListener("click", (e) => { if (lb.dragged) { lb.dragged = false; return; } if (!e.target.closest("img, .lb-orig")) lbClose(); });
  }
  lb.el.querySelector(".lb-track").innerHTML = items.map((p, k) => `<figure class="lb-slide${p.small ? " small" : ""}"><img data-src="${esc(p.src)}" alt="${esc(p.cap ?? "")}" ${p.remote ? 'referrerpolicy="no-referrer"' : ""} draggable="false">${p.small && p.link ? `<a class="lb-orig" href="${esc(p.link)}" target="_blank" rel="noopener">원문에서 크게 보기${ic("#l-arrow-up-right", "i-xs")}</a>` : ""}</figure>`).join("");
  lb.el.hidden = false;
  document.documentElement.classList.add("lb-open");
  lbShow();
  lb.el.querySelector(".lb-x").focus();
}
function lbPlace() { lb.el.querySelector(".lb-track").style.transform = `translateX(calc(${-lb.i * 100}% + ${lb.dx}px))`; }
function lbShow() {
  const slides = lb.el.querySelectorAll(".lb-slide img");
  [lb.i - 1, lb.i, lb.i + 1].forEach((k) => { const im = slides[k]; if (im && !im.src) im.src = im.dataset.src; });
  lbPlace();
  const p = lb.items[lb.i];
  lb.el.querySelector(".lb-count").textContent = `${lb.i + 1} / ${lb.items.length}`;
  lb.el.querySelector(".lb-cap").innerHTML = `${esc(p.cap ?? "")}${p.link && !p.small ? ` · <a href="${esc(p.link)}" target="_blank" rel="noopener">원문</a>` : ""}`;
  lb.el.querySelector(".lb-prev").disabled = lb.i === 0;
  lb.el.querySelector(".lb-next").disabled = lb.i === lb.items.length - 1;
}
function lbStep(n) { lb.i = Math.max(0, Math.min(lb.items.length - 1, lb.i + n)); lbShow(); }
function lbClose() { if (!lb.el || lb.el.hidden) return false; lb.el.hidden = true; document.documentElement.classList.remove("lb-open"); lb.back?.focus?.(); return true; }

function introHtml(t) {
  if (!t || !(t.intro || t.feature || t.nearby?.length || t.programs)) return "";
  return `<div class="sub"><h4>운영자 소개</h4>
    ${t.intro ? `<p class="pre" data-wrap-ok>${esc(t.intro)}</p>` : ""}
    ${t.feature ? `<p class="pre" data-wrap-ok>${esc(t.feature)}</p>` : ""}
    ${t.nearby?.length ? `<div class="tags">${t.nearby.map((n) => `<span class="tag">${esc(n)}</span>`).join("")}</div>` : ""}
    ${t.programs ? `<div class="row">${ic("#l-sparkles", "i-sm")}<span data-wrap-ok>체험 ${esc(t.programs)}</span></div>` : ""}
    <span class="trust">운영자가 고캠핑에 등록한 문구입니다.</span></div>`;
}
function setDetailScrollLock(locked) {
  // documentElement까지 잠가야 Chrome/Safari에서 배경 문서와 상세 패널이 함께 스크롤되지 않는다.
  document.documentElement.classList.toggle("detail-open", locked);
  document.body.classList.toggle("detail-open", locked);
}
function openDetail(id) {
  const c = ALL.find((x) => x.id === id);
  if (!c) return;
  state.open = id;
  state.seen.add(id);
  save();
  // 상세는 별도 페이지처럼: 주소에 남기고(뒤로 가기로 목록 복귀), 화면 맨 위부터 보여 준다.
  if (new URLSearchParams(location.hash.slice(1)).get("c") !== id) history.pushState({ c: id }, "", `#c=${id}`);
  document.title = `${c.name} · 모여라 캠핑`;
  $("#sheetRoot").innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(c.name)}"><div class="sheet-scrim" data-close></div><div class="sheet-panel">${detail(c)}</div></div>`;
  tipify($(".sheet-panel"));
  setDetailScrollLock(true);
  if (map) { map.setLevel(Math.min(map.getLevel(), 7)); map.panTo(new kakao.maps.LatLng(c.lat, c.lng)); }
  $$(".card").forEach((el) => el.setAttribute("aria-current", String(el.dataset.open === id)));
  loadDetail(c);
}
// 캠핑장별 상세 파일(data/camps/{id}.json)은 처음 열 때 한 번만 받는다.
async function loadDetail(c) {
  if (!DETAIL.has(c.id)) {
    try { const r = await fetch(`data/camps/${c.id}.json`); DETAIL.set(c.id, r.ok ? await r.json() : {}); } catch { DETAIL.set(c.id, {}); }
    if (state.open !== c.id) return;
    const panel = $(".sheet-panel"), top = panel?.scrollTop ?? 0;
    if (panel) { panel.innerHTML = detail(c); panel.scrollTop = top; }
  }
  const slot = $("#introSlot"); if (slot) slot.innerHTML = introHtml(DETAIL.get(c.id));
  tipify($(".sheet-panel"));
  loadNearbyRoadviewThumbs($(".sheet-panel"));
  mountGiscus(c);
}
function mountGiscus(c) {
  const g = window.GISCUS, el = $(".giscus");
  if (!g?.repoId || !el || el.dataset.mounted) return;
  el.dataset.mounted = "1";
  const s = document.createElement("script");
  Object.entries({ src: "https://giscus.app/client.js", "data-repo": g.repo, "data-repo-id": g.repoId, "data-category": g.category, "data-category-id": g.categoryId, "data-mapping": "specific", "data-term": `camp-${c.id} ${c.name}`, "data-strict": "1", "data-reactions-enabled": "1", "data-input-position": "top", "data-theme": "preferred_color_scheme", "data-lang": "ko", "data-loading": "lazy", crossorigin: "anonymous" }).forEach(([k, v]) => s.setAttribute(k, v));
  s.async = true; el.append(s);
}
function mountRoadview(value, name) {
  const slot = $("#roadviewSlot");
  const [lat, lng] = String(value ?? "").split(",").map(Number);
  if (!slot || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const fallback = `<a class="mini" href="${esc(mapLink(name, lat, lng))}" target="_blank" rel="noopener">카카오 지도에서 주변 보기${ic("#l-arrow-up-right", "i-xs")}</a>`;
  if (!KAKAO_KEY || !window.kakao?.maps?.Roadview || !window.kakao?.maps?.RoadviewClient) {
    slot.innerHTML = `<div class="roadview-empty"><b>${esc(name)} 로드뷰</b><p data-wrap-ok>이 화면의 카카오 지도 키가 준비되지 않아 로드뷰를 표시할 수 없습니다.</p>${fallback}</div>`;
    return;
  }
  slot.innerHTML = `<div class="roadview-head"><b>${esc(name)} 주변 카카오 로드뷰</b>${fallback}</div><div class="roadview-canvas" aria-label="${esc(name)} 주변 도로 파노라마"></div>`;
  const position = new kakao.maps.LatLng(lat, lng);
  const roadview = new kakao.maps.Roadview($(".roadview-canvas", slot));
  const client = new kakao.maps.RoadviewClient();
  // Kakao 공식 예제와 같이 가까운 파노라마만 찾는다. 촬영 지점이 없으면 억지로 다른 장소를 보여 주지 않는다.
  client.getNearestPanoId(position, 100, (panoId) => {
    if (panoId) {
      roadview.setPanoId(panoId, position);
      slot.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    slot.innerHTML = `<div class="roadview-empty"><b>${esc(name)} 근처의 로드뷰가 없습니다.</b><p data-wrap-ok>도로 촬영 지점은 장소마다 다릅니다. 지도로 위치와 진입로를 확인하세요.</p>${fallback}</div>`;
    slot.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}
function loadNearbyRoadviewThumbs(container) {
  if (!window.kakao?.maps?.RoadviewClient) return;
  const client = new kakao.maps.RoadviewClient();
  const thumbs = (container || document).querySelectorAll("[data-rv-thumb]:not([data-rv-loaded])");
  thumbs.forEach((el) => {
    el.setAttribute("data-rv-loaded", "1");
    const [lat, lng] = (el.dataset.rvThumb || "").split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const pos = new kakao.maps.LatLng(lat, lng);
    client.getNearestPanoId(pos, 100, (panoId) => {
      if (panoId) {
        const img = document.createElement("img");
        img.src = `https://map2.daum.net/map/mapservice?service=openroadview&panoId=${panoId}&IW=320&IH=200&MX=${lng}&MY=${lat}&CRS=WGS84&SCALE=2.5`;
        img.alt = el.dataset.roadviewName ? `${el.dataset.roadviewName} 로드뷰` : "주변 로드뷰";
        img.loading = "lazy";
        img.className = "rv-thumb-img";
        img.onerror = () => { img.remove(); };
        img.onload = () => {
          el.classList.remove("no-photo");
          el.classList.add("has-rv-thumb");
          el.innerHTML = "";
          el.appendChild(img);
          const badge = document.createElement("span");
          badge.className = "rv-indicator";
          badge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>로드뷰`;
          el.appendChild(badge);
        };
      }
    });
  });
}
// 탐색 상태(테마·권역·시군구)를 주소에 남겨 그대로 공유할 수 있게 한다.
function syncHash() {
  if (state.open) return;
  const h = new URLSearchParams();
  if (state.theme) h.set("t", state.theme);
  if (state.area !== "전국") h.set("a", state.area);
  if (state.sgg) h.set("g", state.sgg);
  if (state.q.trim()) h.set("q", state.q.trim());
  if (state.kinds.size) h.set("k", [...state.kinds].join(","));
  if (state.checkIn) h.set("ci", state.checkIn);
  if (state.checkOut) h.set("co", state.checkOut);
  if (state.availabilityOnly) h.set("av", "1");
  history.replaceState(null, "", h.toString() ? `#${h}` : location.pathname);
}
const share = (c) => shareUrl(campUrl(c), `${c.name} · 모여라 캠핑`);
// 캠핑장마다 오픈그래프가 있는 정적 페이지(c/{id}/)가 있으면 그 주소로 공유한다.
const campUrl = (c) => new URL(`c/${c.id}/`, location.href.replace(/[#?].*$/, "")).toString();
async function shareUrl(url, title) {
  try {
    if (navigator.share) { await navigator.share({ title, url }); return; }
    await navigator.clipboard.writeText(url); toast("링크를 복사했어요");
  } catch (e) { if (e?.name !== "AbortError") toast("링크를 복사하지 못했어요"); }
}
function toast(msg, ms = 2000) {
  $$(".toast").forEach((x) => x.remove());
  const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
  document.body.append(el); setTimeout(() => el.remove(), ms);
}
function closeDetail({ fromPop = false } = {}) {
  lbClose(); document.getElementById("tipPop")?.remove();
  document.title = BASE_TITLE; state.open = null; $("#sheetRoot").innerHTML = ""; setDetailScrollLock(false);
  if (!fromPop) { if (history.state?.c) history.back(); else { history.replaceState(null, "", location.pathname); syncHash(); } }
}
// 주소의 #q=·#k=·#t=·#a=·#g=를 직접 바꾸거나 링크로 들어오면 그 조건으로 다시 그린다.
window.addEventListener("hashchange", () => {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("c")) return;
  state.q = h.get("q") ?? ""; state.kinds = new Set(h.get("k") ? h.get("k").split(",") : []);
  state.theme = h.get("t") ?? ""; state.area = AREAS.includes(h.get("a")) ? h.get("a") : "전국"; state.sgg = h.get("g") ?? "";
  state.checkIn = /^\d{4}-\d{2}-\d{2}$/.test(h.get("ci") ?? "") ? h.get("ci") : "";
  state.checkOut = /^\d{4}-\d{2}-\d{2}$/.test(h.get("co") ?? "") ? h.get("co") : "";
  state.availabilityOnly = h.get("av") === "1";
  $("#q").value = state.q; rerender();
});
window.addEventListener("popstate", () => {
  const id = new URLSearchParams(location.hash.slice(1)).get("c");
  if (id && id !== state.open) openDetail(id); else if (!id && state.open) closeDetail({ fromPop: true });
});

/* ---------- 이벤트 ---------- */
function rerender(resetPage = true) { if (resetPage) state.shown = PAGE; save(); renderAvailabilityQuery(); renderSetupQuery(); renderChips(); renderList(); }
document.addEventListener("click", (e) => {
  // (i) 출처 말풍선 · 라이트박스 · 후기 정렬은 다른 클릭보다 먼저 처리한다.
  const tipBtn = e.target.closest(".tip");
  if (tipBtn) { e.preventDefault(); return showTip(tipBtn); }
  if (e.target.closest("[data-peek-close]")) return peek(null);
  if (!e.target.closest(".tip-pop")) document.getElementById("tipPop")?.remove();
  const lbBtn = e.target.closest("[data-lb]");
  if (lbBtn) { e.preventDefault(); return lbOpen(lbBtn.dataset.lb, Number(lbBtn.dataset.lbI) || 0); }
  if (e.target.closest("[data-lb-close]")) return lbClose();
  const step = e.target.closest("[data-lb-step]");
  if (step) return lbStep(Number(step.dataset.lbStep));
  const rv = e.target.closest("[data-rv]");
  if (rv) {
    $$("[data-rv]").forEach((b) => b.setAttribute("aria-selected", String(b === rv)));
    const list = $("#reviewList"); if (list) list.innerHTML = reviewCards(DETAIL.get(state.open), rv.dataset.rv);
    return;
  }
  const t = e.target.closest("[data-open],[data-close],[data-save],[data-share],[data-share-theme],[data-jump],[data-near],[data-copy],[data-copy-text],[data-video],[data-roadview],[data-th],[data-sgg],[data-area],[data-kind],[data-toggle],[data-setup-focus],[data-mode],[data-compare],[data-compare-del],[data-close-compare],[data-share-compare],#moreBtn,#viewSwitch,#clearQ,#nearBtn,#availabilityRun,#availabilityClear,#openCompareBtn,#clearCompareBtn");
  if (!t) return;
  if (t.dataset.compare) { toggleCompare(t.dataset.compare); return; }
  if (t.dataset.compareDel) { toggleCompare(t.dataset.compareDel); return; }
  if (t.id === "openCompareBtn") { openCompareModal(); return; }
  if (t.id === "clearCompareBtn") { clearCompare(); return; }
  if (t.hasAttribute("data-close-compare") || e.target.id === "compareModal") { closeCompareModal(); return; }
  if (t.dataset.jump) { const el = document.getElementById(t.dataset.jump); return el?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  if (t.dataset.near) {
    $$("[data-near]").forEach((b) => b.setAttribute("aria-selected", String(b === t)));
    $$("[data-near-panel]").forEach((p) => { p.hidden = p.dataset.nearPanel !== t.dataset.near; });
    loadNearbyRoadviewThumbs();
    return;
  }
  if (t.dataset.roadview) return mountRoadview(t.dataset.roadview, t.dataset.roadviewName || "주변 시설");
  if (t.hasAttribute("data-share-compare")) return shareUrl(`${location.origin}${location.pathname}#cmp=${[...state.compare].join(",")}`, "캠핑장 조건 비교 · 모여라 캠핑");
  if (t.dataset.copyText) { navigator.clipboard?.writeText(t.dataset.copyText).then(() => toast("질문을 복사했어요. 문자·채팅에 붙여 넣으세요"), () => toast("복사하지 못했어요")); return; }
  if (t.dataset.copy) { navigator.clipboard?.writeText(t.dataset.copy).then(() => toast("주소를 복사했어요"), () => toast("복사하지 못했어요")); return; }
  if (t.dataset.video) {
    // 유튜브 공식 임베드(쿠키 최소화 도메인)로만 재생한다.
    t.outerHTML = `<div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.dataset.video)}?autoplay=1" title="영상" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    return;
  }
  if (t.dataset.th !== undefined && t.hasAttribute("data-close-then")) { closeDetail(); state.theme = t.dataset.th; syncHash(); rerender(); return $(".list-col")?.scrollIntoView({ block: "start" }); }
  if (t.dataset.save) {
    const id = t.dataset.save, on = !state.saved.has(id);
    on ? state.saved.add(id) : state.saved.delete(id);
    t.setAttribute("aria-pressed", String(on)); t.innerHTML = `${ic("#l-heart")}${on ? "저장됨" : "관심"}`;
    toast(on ? `${window.moyeoraUser?.active().name ?? ""}님 관심에 저장했어요`.trim() : "관심에서 뺐어요");
    return rerender(false);
  }
  if (t.dataset.share) return share(ALL.find((x) => x.id === t.dataset.share));
  if (t.dataset.open) return openDetail(t.dataset.open);
  if (t.hasAttribute("data-close")) return closeDetail();
  if (t.hasAttribute("data-setup-focus")) {
    if (state.open) closeDetail();
    const panel = $("#setupQuery"); panel.open = true;
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
    return $("#profileGear")?.focus({ preventScroll: true });
  }
  if (t.id === "availabilityRun") {
    const checkIn = $("#checkIn").value, checkOut = $("#checkOut").value;
    if (!checkIn || !checkOut) return toast("입실일과 퇴실일을 모두 골라 주세요");
    if (!(dayValue(checkIn) < dayValue(checkOut))) return toast("퇴실일은 입실일 다음 날짜여야 해요");
    state.checkIn = checkIn; state.checkOut = checkOut; state.availabilityOnly = true; syncHash(); rerender();
    return $(".list-col")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  if (t.id === "availabilityClear") { state.checkIn = ""; state.checkOut = ""; state.availabilityOnly = false; syncHash(); return rerender(); }
  if (t.dataset.area) { state.area = t.dataset.area; state.sgg = ""; syncHash(); return rerender(); }
  if (t.dataset.sgg !== undefined) { state.sgg = t.dataset.sgg; syncHash(); return rerender(); }
  if (t.dataset.th !== undefined) { state.theme = t.dataset.th; syncHash(); rerender(); return $(".list-col")?.scrollIntoView({ block: "start", behavior: "smooth" }); }
  if (t.hasAttribute("data-share-theme")) return shareUrl(`${location.origin}${location.pathname}${location.hash}`, `${META.themes.find((x) => x.id === state.theme)?.label ?? ""} 캠핑장 · 모여라 캠핑`);
  if (t.dataset.kind) { state.kinds.has(t.dataset.kind) ? state.kinds.delete(t.dataset.kind) : state.kinds.add(t.dataset.kind); syncHash(); return rerender(); }
  if (t.dataset.toggle) { state[t.dataset.toggle] = !state[t.dataset.toggle]; syncHash(); return rerender(); }
  if (t.id === "moreBtn") { state.shown += PAGE; return renderList(); }
  if (t.id === "clearQ") { state.q = ""; $("#q").value = ""; return rerender(); }
  if (t.id === "viewSwitch") setView(document.body.dataset.view !== "map" ? "map" : "list");
  if (t.dataset.mode) setView(t.dataset.mode);
  if (t.id === "nearBtn") {
    // 이미 내 주변 순이면 한 번 더 눌러 끈다.
    if (state.sort === "near" && state.here) { state.sort = "best"; $("#sort").value = "best"; t.setAttribute("aria-pressed", "false"); return rerender(); }
    return locate(t);
  }
});
// 찾는 방법: 키워드(목록) ↔ 지도. 상단 ‘지도’ 메뉴는 ?view=map으로 들어온다. 정보량은 같고 배치만 바뀐다.
function setView(view) {
  const toMap = view === "map";
  document.body.dataset.view = toMap ? "map" : "list";
  const sw = $("#viewSwitch");
  if (sw) sw.innerHTML = toMap ? `${ic("#l-list", "i-sm")}목록 보기` : `${ic("#l-map", "i-sm")}지도 보기`;
  document.querySelectorAll(".x-mode [data-mode]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === document.body.dataset.view)));
  const u = new URL(location.href);
  if (toMap) u.searchParams.set("view", "map"); else u.searchParams.delete("view");
  history.replaceState(history.state, "", u);
  // 상단·하단 메뉴의 ‘찾기’와 ‘지도’ 중 지금 보는 쪽을 표시한다.
  document.querySelectorAll('.sh-nav a, .gnb-tabbar a').forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    const on = /explore\/\?view=map$/.test(href) ? toMap : /explore\/$/.test(href) ? !toMap : null;
    if (on === true) a.setAttribute("aria-current", "page"); else if (on === false) a.removeAttribute("aria-current");
  });
  if (map) setTimeout(() => map.relayout(), 50);
}
// 현재 위치: 권한·시간 초과·위치 없음마다 이유를 알려 주고, 찾으면 가까운 순 정렬 + 지도 이동 + 내 위치 표시.
let hereMarker = null;
function locate(btn = $("#nearBtn")) {
  if (!navigator.geolocation) return toast("이 브라우저는 위치 기능을 지원하지 않아요");
  if (!window.isSecureContext) return toast("보안 연결(https)에서만 위치를 쓸 수 있어요");
  btn?.classList.add("busy"); btn?.setAttribute("aria-busy", "true");
  toast("현재 위치를 확인하는 중…");
  navigator.geolocation.getCurrentPosition((p) => {
    btn?.classList.remove("busy"); btn?.removeAttribute("aria-busy"); btn?.setAttribute("aria-pressed", "true");
    state.here = { lat: p.coords.latitude, lng: p.coords.longitude }; state.sort = "near"; $("#sort").value = "near";
    rerender();
    if (map) {
      const at = new kakao.maps.LatLng(state.here.lat, state.here.lng);
      hereMarker?.setMap(null);
      hereMarker = new kakao.maps.CustomOverlay({ position: at, content: '<span class="here-dot" title="내 위치"></span>', zIndex: 5 });
      hereMarker.setMap(map); map.setLevel(9); map.panTo(at);
    }
    $(".list-col")?.scrollIntoView({ block: "start", behavior: "smooth" });
    toast("내 위치에서 가까운 순으로 정렬했어요");
  }, (err) => {
    btn?.classList.remove("busy"); btn?.removeAttribute("aria-busy");
    const msg = err.code === 1 ? "위치 권한이 꺼져 있어요. 주소창의 자물쇠(또는 설정 → 사이트 권한)에서 위치를 허용한 뒤 다시 눌러 주세요."
      : err.code === 3 ? "위치를 찾는 데 시간이 너무 걸려요. 잠시 뒤 다시 눌러 주세요."
      : "현재 위치를 찾지 못했어요. 기기의 위치 서비스(GPS)가 켜져 있는지 확인해 주세요.";
    toast(msg, 5000);
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
}
document.addEventListener("change", (e) => {
  if (e.target.id === "profileGear") { state.gear = e.target.value; rerender(); }
  if (e.target.id === "profilePower") { state.profilePower = e.target.value; rerender(); }
  if (e.target.id === "profileParking") { state.profileParking = e.target.checked; rerender(); }
  if (e.target.id === "profileFirewood") { state.profileFirewood = e.target.checked; rerender(); }
  if (e.target.id === "profileFilter") { state.profileFilter = e.target.checked; if (!state.profileFilter) state.profileStrict = false; rerender(); }
  if (e.target.id === "profileStrict") { state.profileStrict = e.target.checked; rerender(); }
  if (e.target.id === "sort") {
    state.sort = e.target.value;
    if (state.sort === "near" && !state.here) { locate(); return; }
    rerender();
  }
});
// 말풍선은 스크롤하면 닫는다(위치가 어긋나지 않게).
document.addEventListener("scroll", () => document.getElementById("tipPop")?.remove(), true);
let qTimer;
document.addEventListener("input", (e) => { if (e.target.id === "q") { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; rerender(); syncHash(); }, 200); } });
document.addEventListener("keydown", (e) => {
  if (lb.el && !lb.el.hidden) {
    if (e.key === "Escape") { e.preventDefault(); lbClose(); } else if (e.key === "ArrowRight") lbStep(1); else if (e.key === "ArrowLeft") lbStep(-1);
    return;
  }
  // 카드 안 비교 토글은 span[role=button]이므로 Enter/Space를 직접 처리한다(카드 열기로 번지지 않게).
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("span[data-compare]")) { e.preventDefault(); e.stopPropagation(); e.target.click(); return; }
  if (e.key === "Escape" && document.getElementById("tipPop")) { document.getElementById("tipPop").remove(); return; }
  if (e.key === "Escape" && document.getElementById("compareModal")) { closeCompareModal(); return; }
  if (e.key === "Escape" && state.open) closeDetail();
});
const head = () => { const h = $(".gnb")?.offsetHeight ?? 64; document.documentElement.style.setProperty("--top", `${h}px`); document.documentElement.style.setProperty("--head", `${h + $(".bar").offsetHeight}px`); };
new ResizeObserver(head).observe(document.body);

const BASE_TITLE = document.title;
async function boot() {
  load();
  // 댓글(giscus) 설정은 배포 시 메타 태그로 넣는다. 없으면 댓글 칸에 준비 중 안내.
  try { window.GISCUS = JSON.parse(document.querySelector('meta[name="giscus"]')?.content || "null"); } catch {}
  try {
    const [cg, meta, availability] = await Promise.all([
      fetch("data/campgrounds.json").then((r) => r.json()),
      fetch("data/meta.json").then((r) => r.json()).catch(() => null),
      fetch("data/availability.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]);
    ALL = cg.map(withDefaults); META = meta; AVAILABILITY = availability;
    for (const t of META?.themes ?? []) THEME_LABEL[t.id] = t.label;
  } catch (e) {
    $("#cards").innerHTML = `<div class="empty">${ic("#l-circle-alert")}<b>데이터를 불러오지 못했어요</b><span data-wrap-ok>잠시 후 다시 시도해 주세요.</span></div>`;
    return;
  }
  if (state.q) $("#q").value = state.q;
  renderAvailabilityQuery(); renderSetupQuery(); renderChips(); renderList(); renderCompareBar(); head(); initMap();
  if (new URLSearchParams(location.search).get("view") === "map") setView("map");
  // 목록 끝에 닿으면 자동으로 더 불러온다(수백 곳도 끊김 없이).
  new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting) && !$("#moreBtn").hidden) { state.shown += PAGE; renderListOnly(); } }, { rootMargin: "600px" }).observe($("#moreBtn"));
  if (state.open) openDetail(state.open);
  if (state.nearOnBoot) locate();
  if (state.compareOnBoot) {
    const ids = state.compareOnBoot.filter((id) => ALL.some((c) => c.id === id));
    if (ids.length >= 2) { state.compare = new Set(ids); save(); renderCompareBar(); openCompareModal(); }
  }
}
boot();
