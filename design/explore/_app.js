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

const state = { q: "", area: "전국", kinds: new Set(), realtime: false, availabilityOnly: false, checkIn: "", checkOut: "", pet: false, fee: false, toilet: false, power: false, siteSize: false, floor: false, naverBooking: false, camfitBooking: false, parkingSide: false, parkingCart: false, firewoodAllowed: false, powerHigh: false, privateBath: false, kidsPlay: false, savedOnly: false, inView: false, theme: "", sgg: "", gear: "", sort: "best", shown: PAGE, here: null, open: null, saved: new Set(), seen: new Set() };
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
}
// 관심 캠핑장은 이 기기 브라우저에만, 헤더에서 고른 사용자별로 따로 저장한다(로그인 없음).
const userKey = () => window.moyeoraUser?.key("moyeora-explore") ?? "moyeora-explore";
function loadUser() {
  try { const s = JSON.parse(localStorage.getItem(userKey()) ?? "{}"); Object.assign(state, { area: s.area ?? "전국", gear: s.gear ?? "", saved: new Set(Array.isArray(s.saved) ? s.saved : []), seen: new Set(Array.isArray(s.seen) ? s.seen : []) }); } catch { Object.assign(state, { saved: new Set(), seen: new Set() }); }
}
const save = () => { try { localStorage.setItem(userKey(), JSON.stringify({ area: state.area, gear: state.gear, saved: [...state.saved], seen: [...state.seen].slice(-120) })); } catch {} };
// 헤더 이름 뱃지로 사용자를 바꾸면 그 사람의 관심·최근 본 목록으로 다시 그린다.
window.addEventListener("moyeora:user", (e) => {
  loadUser(); state.shown = PAGE; renderAvailabilityQuery(); renderChips(); renderList();
  if (state.open) { const c = ALL.find((x) => x.id === state.open); const panel = $(".sheet-panel"); if (c && panel) { const top = panel.scrollTop; panel.innerHTML = detail(c); tipify(panel); panel.scrollTop = top; } }
  toast(`${e.detail?.name ?? "사용자"}님의 관심 목록으로 바꿨어요`);
});
const inBounds = (c) => { if (!state.inView || !map) return true; const b = map.getBounds(); return b.contain(new kakao.maps.LatLng(c.lat, c.lng)); };

const fits = (c) => {
  if (!state.gear) return true;
  if (c.kinds.length && c.kinds.every(([k]) => ["GLAMPING", "CARAVAN_RENTAL", "CAMPNIC_DAY"].includes(k))) return true;
  const [w, d] = state.gear.split("x").map(Number);
  return c.sizes.some(([sw, sd]) => (sw >= w && sd >= d) || (sw >= d && sd >= w));
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
const officialOpenRecords = (c, { dateMatch = false } = {}) => {
  if (!isFreshAvailability()) return [];
  return AVAILABILITY.records.filter((record) => record.campground_id === c.id && record.state === "OFFICIAL_APPLICATION_OPEN" && (!dateMatch || coversStay(record)));
};
// 시도 표기(강원도/강원특별자치도 등)가 섞여 있어 짧은 이름으로 묶는다: “강원 평창군”, “경북 경주시”
const SIDO_SHORT = [[/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"], [/^광주/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"], [/^경기/, "경기"], [/^강원/, "강원"], [/^충청북|^충북/, "충북"], [/^충청남|^충남/, "충남"], [/^전라북|^전북/, "전북"], [/^전라남|^전남/, "전남"], [/^경상북|^경북/, "경북"], [/^경상남|^경남/, "경남"], [/^제주/, "제주"]];
const sidoShort = (s) => SIDO_SHORT.find(([re]) => re.test(s ?? ""))?.[1] ?? (s ?? "");
const sggKey = (c) => (c._sgg ??= `${sidoShort(c.sido)} ${c.sigungu ?? ""}`.trim());
const sggLabel = (k) => k;
const haystack = (c) => (c._hay ??= [c.name, c.sido, sidoShort(c.sido), c.sigungu, c.addr, c.line, ...c.th.map((id) => THEME_LABEL[id] ?? ""), ...c.kinds.map(([k]) => KIND[k]?.[0] ?? ""), ...c.amenities, ...c.env, ...c.themes, OP[c.op], ...c.types, ...c.booking.methods].filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, ""));
const THEME_LABEL = {};
const isRealtime = (c) => c.booking.methods.some((m) => /실시간/.test(m));
const hasChannel = (c, id) => c.booking.channels.some((channel) => channel.platform_id === id);
const hasPower = (c) => c.field_conditions?.power?.available === true || c.amenities.some((amenity) => /전기/.test(amenity));
const hasSiteSize = (c) => c.field_conditions?.site_size?.groups?.length > 0 || c.sizes.length > 0;
const hasFloor = (c) => c.field_conditions?.ground?.types?.length > 0 || c.floors.length > 0;
const petOk = (c) => /가능/.test(c.pets ?? "") && !/불가/.test(c.pets ?? "");
const dist = (a, b) => { const R = 6371, t = Math.PI / 180, x = (b.lat - a.lat) * t, y = (b.lng - a.lng) * t; const h = Math.sin(x / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const hasKidsPlay = (c) =>
  c.field_conditions?.features?.some((f) => ["SWIMMING_POOL", "TRAMPOLINE", "AIR_BOUNCE", "PLAYGROUND", "CHILDREN_PLAYGROUND", "KIDS_PLAY", "TUBE_SLED", "INDOOR_PLAYROOM", "VIKING_RIDE", "ANIMAL_FEEDING"].includes(f)) ||
  c.amenities.some((a) => /물놀이|수영|트렘|방방|놀이터|에어바운스|썰매/.test(a));

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
    if (state.parkingSide && c.field_conditions?.parking?.tent_side !== true) return false;
    if (state.parkingCart && c.field_conditions?.parking?.cart_required !== true && c.field_conditions?.parking?.mode !== "CART_REQUIRED") return false;
    if (state.firewoodAllowed && c.field_conditions?.firewood?.allowed !== true) return false;
    if (state.powerHigh && !(c.field_conditions?.power?.limit_w >= 700)) return false;
    if (state.privateBath && c.field_conditions?.sanitary?.private_bathroom !== true) return false;
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
function card(c) {
  const kinds = c.kinds.map(([k, n]) => KIND[k] ? `<span class="tag">${ic(KIND[k][1], "i-xs")}${KIND[k][0]} <span class="num">${n}</span></span>` : "").join("");
  const km = state.here ? ` · ${dist(state.here, c).toFixed(0)}km` : "";
  const applications = officialOpenRecords(c, { dateMatch: Boolean(state.checkIn && state.checkOut) });
  const verifiedBadge = c.field_conditions?.status === "VERIFIED" ? `<span class="tag tag-verified">${ic("#l-shield-check", "i-xs")}조건 검증</span>` : "";
  const verifiedTags = c.field_conditions?.status === "VERIFIED" ? [
    c.field_conditions.parking?.tent_side ? `<span class="tag">${ic("#l-car", "i-xs")}텐트 옆 주차</span>` : c.field_conditions.parking?.mode === "CART_REQUIRED" ? `<span class="tag">${ic("#l-shopping-cart", "i-xs")}짐수레 이동</span>` : "",
    c.field_conditions.power?.limit_w ? `<span class="tag">${ic("#l-plug-zap", "i-xs")}${c.field_conditions.power.limit_w}W</span>` : "",
    c.field_conditions.firewood?.allowed === true ? `<span class="tag">${ic("#l-flame", "i-xs")}장작 불멍</span>` : c.field_conditions.firewood?.allowed === false ? `<span class="tag">${ic("#l-ban", "i-xs")}장작 금지</span>` : "",
    c.field_conditions.sanitary?.private_bathroom === true ? `<span class="tag">${ic("#l-shower-head", "i-xs")}개별 욕실</span>` : "",
  ].filter(Boolean).join("") : "";
  return `<button class="card" type="button" data-open="${c.id}" aria-current="${state.open === c.id}">
    <span class="thumb${!c.ph && !c.img && c.sn ? " snap" : ""}">${c.ph ? `<img src="../media/${esc(largeLocalPhoto(c.ph))}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : c.sn ? `<img src="${esc(String(c.sn).replace(/^http:/, "https:"))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement.classList.remove('snap');this.remove()"><em class="snap-tag">검색 사진</em>` : ic("#t-tent")}</span>
    <span class="card-body">
      <span class="card-title"><h3>${esc(c.name)}</h3>${state.saved.has(c.id) ? ic("#l-heart", "i-xs saved-mark") : ""}</span>
      <span class="loc">${ic("#l-map-pin", "i-xs")}${esc([c.sido, c.sigungu].filter(Boolean).join(" "))}${km}${OP[c.op] ? ` · ${OP[c.op]}` : ""}</span>
      <span class="tags">${verifiedBadge}${verifiedTags}${c.booking.next ? `<span class="tag tag-ember">${ic("#l-alarm-clock", "i-xs")}${c.booking.next.time_known ? hm(c.booking.next.at) : md(c.booking.next.at)} 오픈</span>` : ""}${applications.length ? `<span class="tag tag-green">${ic("#l-circle-check", "i-xs")}공식 접수 중${state.checkIn && state.checkOut ? " · 날짜 일치" : ""}</span>` : ""}${isRealtime(c) ? `<span class="tag">${ic("#l-zap", "i-xs")}온라인 예약 채널</span>` : ""}${kinds}${petOk(c) ? `<span class="tag">${ic("#l-dog", "i-xs")}반려견</span>` : ""}${c.soc?.[0] ? `<span class="tag">${ic("#l-message-circle", "i-xs")}후기 ${c.soc[0]}</span>` : ""}${c.soc?.[1] ? `<span class="tag">${ic("#l-play", "i-xs")}영상 ${c.soc[1]}</span>` : ""}</span>
      <span class="price">${c.fee?.min ? `<b>${band(c.fee.min)}부터</b><span>공식 안내 요금</span>` : `<span>요금은 예약처에서 확인</span>`}</span>
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
    map ? `<button class="pill" type="button" data-toggle="inView" aria-pressed="${state.inView}">${ic("#l-scan-search", "i-sm")}지도에 보이는 곳만</button>` : "",
    `<button class="pill" type="button" data-toggle="availabilityOnly" aria-pressed="${state.availabilityOnly}" ${isFreshAvailability() ? "" : "disabled"}>${ic("#l-circle-check", "i-sm")}공식 접수 중 <span class="num">${isFreshAvailability() ? openCount() : "-"}</span></button>`,
    `<button class="pill" type="button" data-toggle="parkingSide" aria-pressed="${state.parkingSide}">${ic("#l-car", "i-sm")}텐트 옆 주차 <span class="num">${count((c) => c.field_conditions?.parking?.tent_side === true)}</span></button>`,
    `<button class="pill" type="button" data-toggle="parkingCart" aria-pressed="${state.parkingCart}">짐수레 이동 <span class="num">${count((c) => c.field_conditions?.parking?.cart_required === true || c.field_conditions?.parking?.mode === "CART_REQUIRED")}</span></button>`,
    `<button class="pill" type="button" data-toggle="firewoodAllowed" aria-pressed="${state.firewoodAllowed}">${ic("#l-flame", "i-sm")}장작 불멍 <span class="num">${count((c) => c.field_conditions?.firewood?.allowed === true)}</span></button>`,
    `<button class="pill" type="button" data-toggle="powerHigh" aria-pressed="${state.powerHigh}">${ic("#l-zap", "i-sm")}700W+ 고전력 <span class="num">${count((c) => c.field_conditions?.power?.limit_w >= 700)}</span></button>`,
    `<button class="pill" type="button" data-toggle="privateBath" aria-pressed="${state.privateBath}">${ic("#l-shower-head", "i-sm")}개별 욕실/화장실 <span class="num">${count((c) => c.field_conditions?.sanitary?.private_bathroom === true)}</span></button>`,
    `<button class="pill" type="button" data-toggle="kidsPlay" aria-pressed="${state.kidsPlay}">${ic("#l-baby", "i-sm")}키즈·놀거리 <span class="num">${count(hasKidsPlay)}</span></button>`,
    `<button class="pill" type="button" data-toggle="realtime" aria-pressed="${state.realtime}">${ic("#l-zap", "i-sm")}온라인 예약 채널 <span class="num">${count(isRealtime)}</span></button>`,
    ...Object.entries(KIND).filter(([k]) => k !== "RV_PITCH").map(([k, [l, i]]) => `<button class="pill" type="button" data-kind="${k}" aria-pressed="${state.kinds.has(k)}">${ic(i, "i-sm")}${l}</button>`),
    `<span class="sep"></span>`,
    `<button class="pill" type="button" data-toggle="pet" aria-pressed="${state.pet}">${ic("#l-dog", "i-sm")}반려견</button>`,
    `<button class="pill" type="button" data-toggle="power" aria-pressed="${state.power}">${ic("#l-plug-zap", "i-sm")}전기 제공 <span class="num">${count(hasPower)}</span></button>`,
    `<button class="pill" type="button" data-toggle="siteSize" aria-pressed="${state.siteSize}">${ic("#l-ruler", "i-sm")}규격 등록 <span class="num">${count(hasSiteSize)}</span></button>`,
    `<button class="pill" type="button" data-toggle="floor" aria-pressed="${state.floor}">${ic("#t-layers-subtract", "i-sm")}바닥 등록 <span class="num">${count(hasFloor)}</span></button>`,
    `<button class="pill" type="button" data-toggle="naverBooking" aria-pressed="${state.naverBooking}">네이버 예약 <span class="num">${count((c) => hasChannel(c, "naver"))}</span></button>`,
    `<button class="pill" type="button" data-toggle="camfitBooking" aria-pressed="${state.camfitBooking}">캠핏 <span class="num">${count((c) => hasChannel(c, "camfit"))}</span></button>`,
    `<button class="pill" type="button" data-toggle="fee" aria-pressed="${state.fee}">${ic("#t-coin", "i-sm")}요금 안내 있음</button>`,
    `<button class="pill" type="button" data-toggle="toilet" aria-pressed="${state.toilet}">${ic("#l-toilet", "i-sm")}공중화장실 500m</button>`,
    `<label class="pill">${ic("#l-ruler", "i-sm")}<select data-gear aria-label="내 장비 크기">${GEAR.map(([v, l]) => `<option value="${v}" ${state.gear === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`,
  ].join("");
}

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
    notice.innerHTML = `${ic("#l-info", "i-xs")}<span>공식 접수 상태를 갱신 중입니다. 잔여 수량은 제공 가능한 공식 API·제휴 채널이 연결될 때만 표시합니다. ${nationalPark} · ${forest}</span>`;
    return;
  }
  const isDateQuery = Boolean(state.checkIn && state.checkOut);
  const records = AVAILABILITY.records.filter((record) => record.state === "OFFICIAL_APPLICATION_OPEN" && (!isDateQuery || coversStay(record)));
  const camps = new Set(records.map((record) => record.campground_id)).size;
  const observed = hm(AVAILABILITY.generated_at) || ymd(AVAILABILITY.generated_at);
  const dateCopy = isDateQuery ? `${state.checkIn.replaceAll("-", ".")} ~ ${state.checkOut.replaceAll("-", ".")} 숙박 기준 ` : "";
  notice.innerHTML = `${ic("#l-shield-check", "i-xs")}<span><b>${dateCopy}공식 접수 중 ${camps.toLocaleString()}곳 · ${records.length.toLocaleString()}개 상품</b> · 서울시 API ${observed} 확인. 이는 빈자리 수·결제 확정이 아닙니다. ${seoul} · ${nationalPark} · ${forest}</span>`;
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
  $("#resultSub").textContent = state.availabilityOnly && isFreshAvailability()
    ? `공식 접수 상태 ${ymd(AVAILABILITY.generated_at)} 확인 · 잔여 수량은 예약처에서 확정`
    : (META ? `고캠핑 ${ymd(META.sources[0]?.fetched_at)} 기준` : "");
  $("#cards").innerHTML = list.length ? list.slice(0, state.shown).map(card).join("")
    : emptyBox();
  $("#moreBtn").hidden = list.length <= state.shown;
  $("#moreBtn").innerHTML = `${ic("#l-chevron-down", "i-sm")}더 보기 <span class="num">${Math.min(PAGE, list.length - state.shown)}</span>`;
  renderMarkers(filtered({ forMap: true }));
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
      styles: [{ width: "42px", height: "42px", background: "rgba(31,157,92,.88)", color: "#fff", borderRadius: "50%", textAlign: "center", lineHeight: "42px", fontWeight: "800", fontSize: "13px" }] });
    renderMarkers(filtered({ forMap: true }));
    renderChips();
    // 지도를 옮기거나 확대하면 “지도에 보이는 곳만” 목록을 다시 계산한다.
    kakao.maps.event.addListener(map, "idle", () => { if (state.inView) { state.shown = PAGE; renderListOnly(); } });
  });
  s.onerror = () => { el.innerHTML = `<div class="map-empty"><p data-wrap-ok>지도를 불러오지 못했습니다(도메인 등록 확인). 목록은 그대로 쓸 수 있어요.</p></div>`; };
  document.head.append(s);
}
function renderMarkers(list) {
  if (!map || !clusterer) return;
  clusterer.clear(); markers.clear();
  const ms = list.map((c) => {
    const m = new kakao.maps.Marker({ position: new kakao.maps.LatLng(c.lat, c.lng), title: c.name });
    kakao.maps.event.addListener(m, "click", () => openDetail(c.id));
    markers.set(c.id, m); return m;
  });
  clusterer.addMarkers(ms);
}

/* ---------- 상세 ---------- */
/* ---------- 상세: 이 화면 하나로 모든 정보를 ---------- */
const MEDIA = "../media/"; // 자체 저장 공식 사진(webp)
const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`);
const telHref = (t) => `tel:${String(t).replace(/[^\d+]/g, "")}`;
const mapLink = (name, lat, lng) => `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`;
const routeLink = (name, lat, lng) => `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
const naverMapLink = (name) => `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
const SECTIONS = [["sec-media", "사진·후기"], ["sec-info", "기본정보"], ["sec-book", "예약"], ["sec-site", "상품·요금"], ["sec-fac", "시설"], ["sec-official", "공식 안내"], ["sec-near", "주변"], ["sec-passport", "패스포트"], ["sec-talk", "댓글"]];
const NEAR_GROUPS = [["toilet", "화장실", "#l-toilet"], ["mart", "마트·장보기", "#l-shopping-cart"], ["conv", "편의점", "#l-store"], ["fuel", "주유소", "#l-fuel"], ["medical", "병원·약국", "#l-cross"], ["rest", "휴게소·졸음쉼터", "#l-coffee"], ["tour", "주변 관광", "#l-camera"], ["food", "맛집", "#l-utensils"], ["gear", "철물·캠핑용품", "#l-wrench"]];
let DETAIL = new Map();
const POI_KIND = { supermarket: "마트", convenience: "편의점", butcher: "정육점", greengrocer: "청과·채소", hardware: "철물점", outdoor: "캠핑·아웃도어", fuel: "주유소", pharmacy: "약국", hospital: "병원", SERVICE_AREA: "고속도로 휴게소", REST_AREA: "휴게소", DROWSY_SHELTER: "졸음쉼터" };

const BOOK_KIND = { online: "예약 채널", homepage: "공식 홈페이지", phone: "전화 문의", onsite: "현장 문의" };
const BOOK_TRUST = (n) => n >= .85 ? "연결 근거 높음" : n >= .6 ? "공식 등록 링크" : "확인 필요";
function bookingChannels(c) {
  const existing = c.booking?.channels?.filter(Boolean) ?? [];
  if (existing.length) return existing;
  // 이전 발행 데이터와 호환: 채널 배열이 없는 경우에도 링크를 숨기지 않는다.
  return [
    c.booking?.url && { kind: "online", url: c.booking.url, confidence: .6, platform_name: null, evidence: ["reservation.url"] },
    c.homepage && { kind: "homepage", url: c.homepage, confidence: .6, platform_name: "캠핑장 자체 홈페이지", evidence: ["contact.homepage"] },
    c.tel && { kind: "phone", url: telHref(c.tel), confidence: .5, platform_name: null, evidence: ["contact.tel"] },
  ].filter(Boolean);
}
function bookingTarget(c) {
  const ch = bookingChannels(c).find((x) => x.url && x.kind === "online") ?? bookingChannels(c).find((x) => x.url && x.kind === "homepage") ?? bookingChannels(c).find((x) => x.url && x.kind === "phone");
  if (!ch) return null;
  const external = !/^tel:/i.test(ch.url);
  return { href: ch.url, ext: external, channel: ch, label: ch.kind === "online" ? "예약 채널 열기" : ch.kind === "homepage" ? "공식 홈페이지 열기" : "전화로 문의" };
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
    return `<a class="row" href="${esc(record.source_url)}" target="_blank" rel="noopener"><span class="tag tag-green">${esc(record.status_text ?? "접수중")}</span><span data-wrap-ok>${esc(record.product_name)} · ${esc(use)} · 원문 열기${ic("#l-arrow-up-right", "i-xs")}</span></a>`;
  };
  const observed = hm(AVAILABILITY?.generated_at) || ymd(AVAILABILITY?.generated_at);
  const expires = hm(AVAILABILITY?.expires_at) || ymd(AVAILABILITY?.expires_at);
  return `<div class="sub"><h4>${ic("#l-shield-check", "i-sm")}공식 접수 상태${dateRequested ? " · 선택 날짜 일치" : ""}</h4>${records.map(line).join("")}<span class="trust ok">${ic("#l-info", "i-xs")}${esc(AVAILABILITY?.source?.name ?? "공식 원천")} · ${observed} 확인 · ${expires} 이후 자동 만료 · 잔여 수량·결제 가능 여부는 예약처에서 확정</span></div>`;
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
    const visual = p.img ? `<img src="${esc(p.img.replace(/^http:/, "https:"))}" alt="${esc(name)} 사진" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('no-photo');this.remove()">` : `<span class="poi-visual">${ic(g === "toilet" ? "#l-toilet" : g === "mart" || g === "conv" ? "#l-shopping-cart" : g === "rest" ? "#l-coffee" : g === "fuel" ? "#l-fuel" : "#l-map-pin")}</span>`;
    const actions = p.lat ? `<div class="near-actions"><a href="${esc(p.u ?? mapLink(name, p.lat, p.lng))}" target="_blank" rel="noopener">${p.u ? "원문" : "카카오 지도"}${ic("#l-arrow-up-right", "i-xs")}</a><a href="${esc(naverMapLink(name))}" target="_blank" rel="noopener">네이버 지도${ic("#l-arrow-up-right", "i-xs")}</a><button type="button" data-roadview="${p.lat},${p.lng}" data-roadview-name="${esc(name)}">${ic("#l-camera", "i-xs")}카카오 로드뷰</button></div>` : "";
    return `<article class="near-card"><div class="near-visual${p.img ? "" : " no-photo"}">${visual}</div><div class="near-copy"><div><b>${esc(name)}</b><small>${esc(meta || "주변 편의 정보")}</small></div>${actions}</div>${p.m != null ? `<strong class="m">${km(p.m)}</strong>` : ""}</article>`;
  }).join("")}</div>`).join("")}
  <div class="roadview-slot" id="roadviewSlot"></div>
  <span class="trust">직선거리 기준 · ‘로드뷰’는 시설 근처 실제 도로 파노라마(촬영 지점이 없으면 지도로 안내) · 데이터: 한국관광공사 TourAPI, OpenStreetMap(© 기여자, ODbL), 행정안전부, 한국도로공사</span>`;
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
  const https = (u) => String(u ?? "").replace(/^http:/, "https:");
  const official = allPhotos(c, d).map((p) => ({ src: p.l, cap: "공식 사진 · 한국관광공사 고캠핑", remote: p.remote }));
  const snaps = (d?.sns_images ?? []).map((x) => ({ src: https(x.thumb), small: true, cap: `방문자 사진 · ${x.src ?? "외부"}`, link: x.url, remote: true }));
  const layout = (d?.layout?.images ?? []).map((x) => ({ src: https(x.thumb), small: true, cap: "시설 배치도", link: x.url ?? x.img, remote: true }));
  const items = lbAdd("all", [...official, ...layout, ...snaps]);
  if (!items.length) return `<div class="dv-hero dv-hero-empty">${ic("#t-tent")}</div>`;
  const shown = items.slice(0, 12);
  return `<div class="dv-hero${shown.length < 3 ? " few" : ""}">${shown.map((p, i) => `<button type="button" class="dv-shot${p.small ? " sm" : ""}" ${lbAttr("all", i)} aria-label="사진 ${i + 1} 크게 보기"><img src="${esc(p.src)}" alt="" ${i > 1 ? 'loading="lazy"' : ""} decoding="async" ${p.remote ? 'referrerpolicy="no-referrer"' : ""} onerror="this.parentElement.remove()"></button>`).join("")}
    <button type="button" class="dv-all" ${lbAttr("all", 0)}>${ic("#l-images", "i-sm")}사진 <span class="num">${items.length}</span>장 모두 보기</button></div>`;
}

// 2) 한눈에: 큰 아이콘 타일(사이트 면수 · 반려견 · 화장실/샤워 · 예약 방식 · 후기 · 영상)
function keyStats(c, d) {
  const total = sum(c.kinds.map(([, n]) => n));
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

// 3) 이런 곳이에요: 입지·부대시설을 아이콘 격자로
const AMENITY_ICON = [[/전기/, "#l-plug-zap"], [/무선|와이파이|wifi/i, "#l-wifi"], [/장작/, "#l-flame"], [/온수|샤워/, "#l-shower-head"], [/물놀이|수영/, "#l-waves"], [/운동|족구|풋살|농구|배드민턴/, "#l-dumbbell"], [/마트|편의점|매점/, "#l-store"], [/산책|둘레길|숲길/, "#l-footprints"], [/트렘|트램|방방|에어바운스/, "#l-sparkles"], [/놀이/, "#l-baby"], [/카페|커피/, "#l-coffee"], [/덤프/, "#l-truck"], [/낚시/, "#l-fish"], [/썰매/, "#l-snowflake"], [/바베큐|바비큐/, "#l-utensils-crossed"]];
const ENV_ICON = { 산: "#l-mountain", 숲: "#l-trees", 계곡: "#l-waves", 강: "#l-droplets", 호수: "#l-droplets", 해변: "#l-sailboat", 섬: "#l-sailboat", 도심: "#l-building-2" };
function highlightsBlock(c) {
  const env = c.env.map((e) => [ENV_ICON[e] ?? "#l-map-pin", `${e} 입지`]);
  const am = c.amenities.filter((a) => a.length <= 12).map((a) => [AMENITY_ICON.find(([re]) => re.test(a))?.[1] ?? "#l-circle-check", a.replace(/\./g, "·")]);
  const items = [...env, ...am].slice(0, 12);
  if (!items.length) return "";
  return `<section class="dv-sec" id="sec-good"><h3>이런 곳이에요</h3><div class="dv-good">${items.map(([i, l]) => `<div><span>${ic(i)}</span><b>${esc(l)}</b></div>`).join("")}</div></section>`;
}

// 4) 예약 카드: 다음 오픈(D-day) + 예약 방식 + 버튼. 자세한 경로·규칙은 접어 둔다.
function bookingCard(c, d, target) {
  const nx = d?.guide?.next?.find((n) => !n.unverified && n.applies !== "IF_NATIONAL") ?? (c.booking.next ? { ...c.booking.next } : null);
  const dday = nx ? Math.ceil((Date.parse(nx.at) - Date.now()) / 864e5) : null;
  return `<section class="dv-sec dv-book" id="sec-book"><h3>예약</h3>
    <div class="dv-book-top">
      ${nx ? `<div class="dv-dday"><b class="num">${dday <= 0 ? "오늘" : `D-${dday}`}</b><span><small>다음 예약 오픈</small><strong class="num">${nx.time_known ? hm(nx.at) : md(nx.at)}</strong><em data-wrap-ok>${esc(nx.label)}</em></span></div>`
        : `<div class="dv-dday none"><span>${ic("#l-calendar")}</span><span><small>예약 방식</small><strong>${esc(c.booking.methods[0] ?? "예약처 문의")}</strong></span></div>`}
      ${target ? `<a class="btn btn-primary dv-go" href="${esc(target.href)}" ${target.ext ? 'target="_blank" rel="noopener"' : ""}>${ic(target.ext ? "#l-external-link" : "#l-phone", "i-sm")}${target.label}</a>` : ""}
    </div>
    ${c.booking.methods.length > 1 ? `<div class="dv-chips">${c.booking.methods.map((m) => `<span class="${/실시간/.test(m) ? "on" : ""}">${esc(m)}</span>`).join("")}</div>` : ""}
    ${officialStatusBlock(c)}
    <details class="dv-more"><summary>예약 경로·오픈 규칙 자세히</summary>${bookingPaths(c)}${guideBlock(c, d)}</details>
  </section>`;
}

// 5) 사이트·요금: 형태별 타일 + 크기·바닥 칩 + 후기 요금 막대 + 상품 + 배치도
function siteListBlock(c) {
  const rows = c.kinds.filter(([k]) => KIND[k]);
  if (!rows.length && !c.sizes.length) return `<p class="dv-empty">사이트 구성이 등록되지 않았어요. 예약 화면에서 확인하세요.</p><span class="trust">고캠핑 미등록</span>`;
  const max = Math.max(1, ...rows.map(([, n]) => n || 0));
  return `<div class="dv-sites">${rows.map(([k, n]) => `<div class="dv-site"><span>${ic(KIND[k][1])}</span><b>${esc(KIND[k][0])}</b><strong class="num">${n}<small>면</small></strong><i style="--w:${Math.round(((n || 0) / max) * 100)}%"></i></div>`).join("")}</div>
    ${c.sizes.length || c.floors.length ? `<div class="dv-chips">${c.sizes.map(([w, dd, n]) => `<span>${ic("#l-ruler", "i-xs")}${w}×${dd}m${n ? ` · ${n}면` : ""}</span>`).join("")}${c.floors.map(([f, n]) => `<span class="fl fl-${esc(f)}">${esc(floorName(f))} ${n}면</span>`).join("")}</div>` : ""}
    <span class="trust ok">한국관광공사 고캠핑 등록 정보 · ${ymd(c.modified_at)} 수정</span>`;
}

const PARKING_NAME = {
  SITE_ADJACENT: "텐트 옆 단독 주차 (오토)",
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
};

// 이 화면의 조건표는 고캠핑 운영자 등록값과 검증된 파일럿 조건표를 읽는다. 없는 항목(특히 전력 W,
// 텐트 옆 주차, 숯/장작 사용 허용)은 추정하지 않고 ‘확인 필요’로 남긴다.
function fieldConditionsBlock(c) {
  const f = c.field_conditions ?? {};
  if (f.status === "VERIFIED") {
    const pMode = PARKING_NAME[f.parking?.mode] ?? f.parking?.mode ?? "확인됨";
    const parkingNote = f.parking?.tent_side ? "사이트 바로 옆 차량 1대 단독 주차 가능" : f.parking?.cart_required ? "짐수레/카트로 짐 이동 필요" : "지정 주차 구역 주차 후 도보 이동";
    const powerNote = f.power?.limit_w >= 1000 ? "1kW 고전력 지원 (팬히터/릴선 안전 사용)" : "사이트당 정격 전력 규정 준수 필요";
    const fireNote = f.firewood?.allowed ? "개별 화로대+받침대 필수 사용 조건" : "데크/산림 화재 예방을 위해 장작 불멍 금지 (숯만 가능)";
    const sanitaryText = f.sanitary?.private_bathroom ? "단독 개별 욕실/화장실 보유" : `공용 화장실 ${f.sanitary?.toilets_count ?? "-"}개소 · 샤워실 ${f.sanitary?.showers_count ?? "-"}개소`;

    return `<div class="dv-sub dv-conditions verified">
      <div class="dv-verified-head">
        <h4>${ic("#l-shield-check", "i-sm")}현장 조건 정밀 검증</h4>
        <span class="badge-verified">공식 원문 대조 확인됨</span>
      </div>
      <div class="verified-banner">
        ${ic("#l-shield-check", "i-sm")}
        <div>
          <b>${esc(f.source?.label ?? "공식 원문 확인")}</b>
          <small>${ymd(f.source?.checked_at)} 확인 · 검수: ${esc(f.source?.reviewer ?? "moyo-pilot-team")}</small>
        </div>
      </div>
      <div class="dv-condition-grid">
        <article class="dv-condition verified">
          <span>${ic("#l-car")}</span>
          <div>
            <small>주차 동선</small>
            <b>${esc(pMode)}</b>
            <p data-wrap-ok>${esc(parkingNote)}</p>
          </div>
        </article>
        <article class="dv-condition verified">
          <span>${ic("#l-plug-zap")}</span>
          <div>
            <small>전력 한도</small>
            <b>${f.power?.limit_w}W${f.power?.breaker_capacity ? ` (${f.power.breaker_capacity} 차단기)` : ""}</b>
            <p data-wrap-ok>${esc(powerNote)}</p>
          </div>
        </article>
        <article class="dv-condition verified">
          <span>${ic("#l-flame")}</span>
          <div>
            <small>화기 (불멍·바베큐)</small>
            <b>${f.firewood?.allowed ? "장작 불멍 허용" : "장작 금지 (숯만 가능)"}</b>
            <p data-wrap-ok>${esc(fireNote)}</p>
          </div>
        </article>
        <article class="dv-condition verified">
          <span>${ic("#l-shower-head")}</span>
          <div>
            <small>위생 시설</small>
            <b>${esc(sanitaryText)}</b>
            <p data-wrap-ok>${esc(f.sanitary?.note || (f.sanitary?.hot_water ? `온수: ${f.sanitary.hot_water}` : "위생시설 구비"))}</p>
          </div>
        </article>
      </div>

      ${f.shelter_setup?.max_tents ? `
      <div class="dv-rule-card">
        <b>${ic("#t-tent", "i-xs")}피칭 규정</b>
        <span>텐트 최대 ${f.shelter_setup.max_tents}동 · 타프 ${f.shelter_setup.max_tarps}개 ${f.shelter_setup.canopy_allowed ? "· 3×3m 캐노피 가능" : "· 캐노피 불가"} ${f.shelter_setup.note ? `· ${esc(f.shelter_setup.note)}` : ""}</span>
      </div>` : ""}

      ${f.site_size?.groups?.length ? `
      <div class="dv-table-wrap">
        <h5>구역별 사이트 규격 및 주차 동선</h5>
        <table class="dv-fact-table">
          <thead><tr><th>구역명</th><th>규격(가로×세로)</th><th>바닥재</th><th>주차 동선</th><th>면수</th></tr></thead>
          <tbody>
            ${f.site_size.groups.map((g) => `<tr><td><b>${esc(g.name || "일반 구역")}</b></td><td>${g.width_m}×${g.depth_m}m</td><td>${esc(floorName(g.surface))}</td><td>${esc(PARKING_NAME[g.parking] || g.parking)}</td><td>${g.count ? `${g.count}면` : "-"}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>` : ""}

      ${f.rental_offers?.length ? `
      <div class="dv-table-wrap">
        <h5>장비·물품 대여 요금</h5>
        <table class="dv-fact-table">
          <thead><tr><th>품목</th><th>대여료(1박)</th><th>보증금</th><th>비고</th></tr></thead>
          <tbody>
            ${f.rental_offers.map((r) => `<tr><td><b>${esc(r.item)}</b></td><td>${r.price_krw === 0 ? "무료" : won(r.price_krw)}</td><td>${r.deposit_krw ? won(r.deposit_krw) : "없음"}</td><td>${esc(r.note || "-")}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>` : ""}

      ${f.features?.length ? `
      <div class="dv-features-wrap">
        <h5>주요 시설 및 특화 놀거리</h5>
        <div class="dv-chips">${f.features.map((feat) => `<span class="feat-chip">${ic(feat === "SWIMMING_POOL" ? "#l-waves" : feat === "VALLEY" ? "#l-waves" : feat === "FOREST_TRAIL" ? "#l-footprints" : feat === "TRAMPOLINE" || feat === "AIR_BOUNCE" ? "#l-sparkles" : "#l-circle-check", "i-xs")}${esc(FEATURE_NAME[feat] || feat)}</span>`).join("")}</div>
      </div>` : ""}

      <span class="trust ok">${ic("#l-shield-check", "i-xs")}${f.source?.url ? `<a href="${esc(f.source.url)}" target="_blank" rel="noopener">${esc(f.source.label)}</a>` : esc(f.source?.label ?? "공식 원문")} · ${ymd(f.source?.checked_at)} 확인</span>
    </div>`;
  }

  const autoSites = f.parking?.auto_camping_sites ?? (c.kinds.filter(([kind]) => kind === "AUTO_PITCH").reduce((sum, [, count]) => sum + (Number(count) || 0), 0) || null);
  const electricity = f.power?.available === true || hasPower(c);
  const firewoodSale = f.firewood?.sold === true || c.amenities.some((amenity) => /장작\s*판매/.test(amenity));
  const firePit = f.fire_pit?.arrangement ?? c.fire ?? null;
  const floors = f.ground?.types?.length ? f.ground.types.map((x) => [x.type, x.count]) : c.floors;
  const sizes = f.site_size?.groups?.length ? f.site_size.groups.map((x) => [x.width_m, x.depth_m, x.count]) : c.sizes;
  const floorText = floors.length ? floors.map(([type, count]) => `${floorName(type)}${count ? ` ${count}면` : ""}`).join(" · ") : "확인 필요";
  const sizeText = sizes.length ? sizes.map(([width, depth, count]) => `${width}×${depth}m${count ? ` · ${count}면` : ""}`).join(" / ") : "확인 필요";
  const rows = [
    [autoSites ? "partial" : "unknown", "#l-car", "텐트 옆 주차", autoSites ? `자동차야영 ${autoSites}면` : "확인 필요", autoSites ? "오토 사이트 보유 정보예요. 텐트 옆 주차 가능 여부는 구역별로 확인하세요." : "고캠핑 표준 항목에 없어요."],
    ["unknown", "#t-tent", "텐트·타프/캐노피", "확인 필요", "1텐트+타프/쉘터 또는 캐노피 추가 설치는 캠핑장별 규정이 달라요. 추가 설치 수량·3×3m 캐노피 가능 여부를 운영자 공지에서 확인하세요."],
    [electricity ? "partial" : "unknown", "#l-plug-zap", "전기·전력 한도", electricity ? "전기 제공 · W 확인 필요" : "확인 필요", electricity ? "전력 사용 한도(W)는 고캠핑에 등록되지 않아 예약처 규정을 확인해야 해요." : "전기 제공 여부와 W 제한을 운영자 안내에서 확인하세요."],
    [floors.length ? "confirmed" : "unknown", "#t-layers-subtract", "바닥", floorText, floors.length ? "고캠핑에 등록된 바닥재·면수예요." : "바닥재 정보가 등록되지 않았어요."],
    [sizes.length ? "confirmed" : "unknown", "#l-ruler", "사이트 규격", sizeText, sizes.length ? "규격이 어느 상품에 적용되는지는 예약 화면에서 한 번 더 확인하세요." : "사이트별 가로×세로 정보가 등록되지 않았어요."],
    [firewoodSale ? "partial" : "unknown", "#l-flame", "장작", firewoodSale ? "장작 판매 등록" : "확인 필요", firewoodSale ? "장작 판매와 장작 사용 허용은 서로 다른 정보예요." : "장작 판매·사용 가능 여부가 등록되지 않았어요."],
    [firePit ? "confirmed" : "unknown", "#l-flame", "숯불·불멍", firePit ? `화로대 ${firePit}` : "확인 필요", firePit ? "화로대 배치 정보예요. 숯·장작 사용 허용은 운영자 이용규칙을 확인하세요." : "숯불·불멍 허용 여부가 등록되지 않았어요."],
  ];
  const source = f.source ?? { url: c.gc_url, checked_at: c.modified_at, tier: "A" };
  return `<div class="dv-sub dv-conditions"><h4>현장 조건</h4>
    <div class="dv-condition-grid">${rows.map(([state, icon, label, value, note]) => `<article class="dv-condition ${state}"><span>${ic(icon)}</span><div><small>${esc(label)}</small><b>${esc(value)}</b><p data-wrap-ok>${esc(note)}</p></div></article>`).join("")}</div>
    <span class="trust">${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener">한국관광공사 고캠핑 운영자 등록값</a>` : "한국관광공사 고캠핑 운영자 등록값"}${source.checked_at ? ` · ${ymd(source.checked_at)} 확인` : ""} · ‘확인 필요’는 불가가 아닙니다</span>
  </div>`;
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
  const imgs = d?.layout?.images ?? [];
  if (!imgs.length) return "";
  const https = (u) => String(u ?? "").replace(/^http:/, "https:");
  lbAdd("layout", imgs.map((x) => ({ src: https(x.thumb), small: true, cap: x.sure ? "시설 배치도" : "시설 배치도(다른 곳일 수 있음)", link: x.url ?? x.img, remote: true })));
  return `<div class="dv-sub"><h4>시설 배치도</h4><div class="dv-thumbs">${imgs.map((x, i) => `<button type="button" ${lbAttr("layout", i)}><img src="${esc(https(x.thumb))}" alt="시설 배치도 ${i + 1}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></button>`).join("")}</div><span class="trust">Daum 검색 제공 · 이용자가 올린 배치도라 최신 배치와 다를 수 있어요</span></div>`;
}
function productsBlock(d) {
  const list = d?.products ?? [];
  if (!list.length) return "";
  const won2 = (n) => (n ? `${Number(n).toLocaleString()}원` : null);
  return `<div class="dv-sub"><h4>객실·사이트 상품 <span class="num">${list.length}</span></h4><div class="dv-rail">${list.map((p, pi) => {
    const pr = p.price ?? {};
    const rows = [["비수기 주중", pr.off_weekday], ["비수기 주말", pr.off_weekend], ["성수기 주중", pr.peak_weekday], ["성수기 주말", pr.peak_weekend]].filter(([, v]) => v);
    const photos = lbAdd(`p${pi}`, (p.photos ?? []).map((u) => ({ src: String(u).replace(/^http:/, "https:"), cap: `${p.name} · 관광공사 공식 사진`, remote: true })));
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
function reviewCards(d, mode) {
  const list = sortReviews(reviewItems(d), mode);
  if (!list.length) return `<p class="dv-empty">${mode === "ly" ? "작년 이맘때 올라온 후기가 아직 없어요." : "모은 후기가 아직 없어요."}</p>`;
  const https = (u) => String(u ?? "").replace(/^http:/, "https:");
  return list.map((r) => `<a class="dv-review" href="${esc(r.url)}" target="_blank" rel="noopener">
    <span class="dv-review-img">${r.thumb ? `<img src="${esc(https(r.thumb))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${ic(r.kind === "카페" ? "#l-messages-square" : "#l-notebook-pen")}</span>
    <span class="dv-review-body"><b>${esc(r.title)}</b>${r.snippet ? `<p>${esc(r.snippet)}</p>` : ""}
      <span class="dv-review-meta"><em class="k-${r.kind === "카페" ? "cafe" : "blog"}">${r.kind}</em>${r.scored && r.q >= 75 ? `<em class="rich">정보 많음</em>` : ""}<small>${esc([r.src, relDay(r.date)].filter(Boolean).join(" · "))}</small></span></span></a>`).join("");
}
function reviewsBlock(c, d) {
  const https = (u) => String(u ?? "").replace(/^http:/, "https:");
  const vids = d?.videos ?? [];
  // 쇼츠(세로)와 일반 영상(가로)은 높이가 달라 한 줄에 섞으면 빈칸이 생긴다 → 줄을 나눈다.
  const shorts = vids.filter((v) => v.kind === "short"), longs = vids.filter((v) => v.kind !== "short");
  const video = (v) => v.yt
    ? `<button class="dv-video ${v.kind === "short" ? "short" : ""}" type="button" data-video="${esc(v.yt)}" aria-label="${esc(v.title)} 재생"><span class="dv-video-img"><img src="https://i.ytimg.com/vi/${esc(v.yt)}/hqdefault.jpg" alt="" loading="lazy" decoding="async" onerror="this.remove()"><i>${ic("#l-play")}</i>${v.kind === "short" ? "<em>쇼츠</em>" : ""}</span><b>${esc(v.title)}</b><small>${esc([v.author, relDay(v.date)].filter(Boolean).join(" · "))}</small></button>`
    : `<a class="dv-video" href="${esc(v.url)}" target="_blank" rel="noopener"><span class="dv-video-img"><img src="${esc(https(v.thumb))}" alt="" loading="lazy" referrerpolicy="no-referrer"><i>${ic("#l-play")}</i></span><b>${esc(v.title)}</b><small>${esc([v.author, relDay(v.date)].filter(Boolean).join(" · "))}</small></a>`;
  const snaps = lbAdd("snaps", (d?.sns_images ?? []).map((x) => ({ src: https(x.thumb), small: true, cap: `방문자 사진 · ${x.src ?? "외부"}`, link: x.url, remote: true })));
  const n = reviewItems(d).length;
  const q = encodeURIComponent(c.name);
  const more = [["https://search.naver.com/search.naver?ssc=tab.blog.all&query=" + q, "네이버 블로그"], ["https://map.kakao.com/?q=" + q, "카카오맵 리뷰"], ["https://map.naver.com/p/search/" + q, "네이버 지도"], ["https://www.youtube.com/results?search_query=" + encodeURIComponent(c.name + " 캠핑"), "유튜브"], ["https://www.instagram.com/explore/tags/" + encodeURIComponent(c.name.replace(/\s+|[()（）]/g, "")) + "/", "인스타그램"]];
  return `<section class="dv-sec" id="sec-media"><h3>후기 <span class="num">${n + vids.length}</span></h3>
    ${longs.length ? `<div class="dv-sub"><h4>영상 <span class="num">${longs.length}</span></h4><div class="dv-rail">${longs.map(video).join("")}</div></div>` : ""}
    ${shorts.length ? `<div class="dv-sub"><h4>쇼츠 <span class="num">${shorts.length}</span></h4><div class="dv-rail">${shorts.map(video).join("")}</div></div>` : ""}
    ${snaps.length ? `<div class="dv-sub"><h4>방문자 사진 <span class="num">${snaps.length}</span></h4><div class="dv-snaps">${snaps.slice(0, 11).map((p, i) => `<button type="button" ${lbAttr("snaps", i)}><img src="${esc(p.src)}" alt="방문자 사진 ${i + 1}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></button>`).join("")}${snaps.length > 11 ? `<button type="button" class="dv-snaps-more" ${lbAttr("snaps", 11)}><b class="num">+${snaps.length - 11}</b></button>` : ""}</div></div>` : ""}
    ${n ? `<div class="dv-sub"><div class="dv-sub-head"><h4>블로그·카페 <span class="num">${n}</span></h4><div class="dv-seg" role="tablist">${REVIEW_MODES.map(([k, l]) => `<button type="button" role="tab" data-rv="${k}" aria-selected="${k === "rec"}">${l}</button>`).join("")}</div></div><div class="dv-reviews" id="reviewList">${reviewCards(d, "rec")}</div></div>` : ""}
    <div class="dv-sub"><h4>다른 곳에서 더 보기</h4><div class="dv-chips links">${more.map(([u, l]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}${ic("#l-arrow-up-right", "i-xs")}</a>`).join("")}</div></div>
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

const DV_NAV = [["sec-important", "중요"], ["sec-book", "예약"], ["sec-site", "사이트·요금"], ["sec-media", "후기"], ["sec-fac", "시설"], ["sec-near", "주변"], ["sec-info", "정보"], ["sec-talk", "댓글"]];
function detail(c) {
  const d = DETAIL.get(c.id);
  LB.clear();
  const target = bookingTarget(c);
  const themes = (META?.themes ?? []).filter((t) => c.th.includes(t.id));
  return `<div class="sheet-close"><button class="back-btn" type="button" data-close aria-label="목록으로">${ic("#l-arrow-left", "i-sm")}<span>목록</span></button></div>
  ${heroBlock(c, d)}
  <div class="d-body dv">
    <header class="dv-title">
      <h2>${esc(c.name)}</h2>
      ${c.line ? `<p class="dv-line" data-wrap-ok>${esc(c.line)}</p>` : ""}
      <p class="dv-loc">${ic("#l-map-pin", "i-xs")}${esc([c.sido, c.sigungu].filter(Boolean).join(" "))}${OP[c.op] ? ` · ${OP[c.op]}` : ""}</p>
      ${themes.length ? `<div class="dv-themes">${themes.map((t) => `<button type="button" data-th="${t.id}" data-close-then>${ic(THEME_ICON[t.id] ?? "#t-tent", "i-xs")}${esc(t.label)}</button>`).join("")}</div>` : ""}
    </header>
    ${keyStats(c, d)}
    <div class="dv-actions">
      <a href="${routeLink(c.name, c.lat, c.lng)}" target="_blank" rel="noopener">${ic("#l-navigation")}<span>길찾기</span></a>
      ${c.tel ? `<a href="${telHref(c.tel)}">${ic("#l-phone")}<span>전화</span></a>` : `<span aria-disabled="true">${ic("#l-phone")}<span>전화 없음</span></span>`}
      <button type="button" data-save="${c.id}" aria-pressed="${state.saved.has(c.id)}">${ic("#l-heart")}<span>${state.saved.has(c.id) ? "저장됨" : "관심"}</span></button>
      <button type="button" data-share="${c.id}">${ic("#l-share-2")}<span>공유</span></button>
    </div>
    <nav class="d-nav dv-nav" aria-label="상세 목차">${DV_NAV.map(([id, l]) => `<button type="button" data-jump="${id}">${l}</button>`).join("")}</nav>
    ${importantInfoBlock(c)}
    ${bookingCard(c, d, target)}
    ${highlightsBlock(c)}
    <section class="dv-sec" id="sec-site"><h3>사이트·요금</h3>
      ${siteListBlock(c)}
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
  ${target ? `<div class="d-cta"><a class="btn btn-primary" href="${esc(target.href)}" ${target.ext ? 'target="_blank" rel="noopener"' : ""}>${ic(target.ext ? "#l-external-link" : "#l-phone", "i-sm")}${target.label}</a>${c.tel && target.ext ? `<a class="btn btn-line btn-icon" href="${telHref(c.tel)}" aria-label="전화">${ic("#l-phone", "i-sm")}</a>` : ""}</div>` : ""}`;
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
    if (panoId) { roadview.setPanoId(panoId, position); return; }
    slot.innerHTML = `<div class="roadview-empty"><b>${esc(name)} 근처의 로드뷰가 없습니다.</b><p data-wrap-ok>도로 촬영 지점은 장소마다 다릅니다. 지도로 위치와 진입로를 확인하세요.</p>${fallback}</div>`;
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
function rerender(resetPage = true) { if (resetPage) state.shown = PAGE; save(); renderAvailabilityQuery(); renderChips(); renderList(); }
document.addEventListener("click", (e) => {
  // (i) 출처 말풍선 · 라이트박스 · 후기 정렬은 다른 클릭보다 먼저 처리한다.
  const tipBtn = e.target.closest(".tip");
  if (tipBtn) { e.preventDefault(); return showTip(tipBtn); }
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
  const t = e.target.closest("[data-open],[data-close],[data-save],[data-share],[data-share-theme],[data-jump],[data-near],[data-copy],[data-video],[data-roadview],[data-th],[data-sgg],[data-area],[data-kind],[data-toggle],#moreBtn,#viewSwitch,#clearQ,#nearBtn,#availabilityRun,#availabilityClear");
  if (!t) return;
  if (t.dataset.jump) { const el = document.getElementById(t.dataset.jump); return el?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  if (t.dataset.near) {
    $$("[data-near]").forEach((b) => b.setAttribute("aria-selected", String(b === t)));
    $$("[data-near-panel]").forEach((p) => { p.hidden = p.dataset.nearPanel !== t.dataset.near; });
    return;
  }
  if (t.dataset.roadview) return mountRoadview(t.dataset.roadview, t.dataset.roadviewName || "주변 시설");
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
  if (t.id === "viewSwitch") {
    const toMap = document.body.dataset.view !== "map";
    document.body.dataset.view = toMap ? "map" : "list";
    t.innerHTML = toMap ? `${ic("#l-list", "i-sm")}목록 보기` : `${ic("#l-map", "i-sm")}지도 보기`;
    if (map) setTimeout(() => map.relayout(), 50);
  }
  if (t.id === "nearBtn") {
    // 이미 내 주변 순이면 한 번 더 눌러 끈다.
    if (state.sort === "near" && state.here) { state.sort = "best"; $("#sort").value = "best"; t.setAttribute("aria-pressed", "false"); return rerender(); }
    return locate(t);
  }
});
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
  if (e.target.matches("[data-gear]")) { state.gear = e.target.value; rerender(); }
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
  if (e.key === "Escape" && document.getElementById("tipPop")) { document.getElementById("tipPop").remove(); return; }
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
  renderAvailabilityQuery(); renderChips(); renderList(); head(); initMap();
  // 목록 끝에 닿으면 자동으로 더 불러온다(수백 곳도 끊김 없이).
  new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting) && !$("#moreBtn").hidden) { state.shown += PAGE; renderListOnly(); } }, { rootMargin: "600px" }).observe($("#moreBtn"));
  if (state.open) openDetail(state.open);
  if (state.nearOnBoot) locate();
}
boot();
