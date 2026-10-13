// 모여라 캠핑 · 전국 캠핑장 탐색. 데이터: data/campgrounds.json, data/meta.json (pipeline build:explore)
const KAKAO_KEY = document.querySelector('meta[name="kakao-js-key"]')?.content ?? "";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ic = (id, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="${id}"/></svg>`;
const won = (n) => `${Math.round(n / 1000) * 1000 >= 10000 ? (n / 10000).toFixed(n % 10000 ? 1 : 0) + "만" : n.toLocaleString()}원`;
const ymd = (s) => { const d = new Date(s); return Number.isNaN(+d) ? "" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
const KIND = { AUTO_PITCH: ["오토캠핑", "#l-car"], PITCH: ["일반 캠핑", "#t-tent"], GLAMPING: ["글램핑", "#l-bed-double"], CARAVAN_RENTAL: ["카라반", "#t-caravan"], RV_PITCH: ["개인 카라반", "#t-caravan"], TARP_ZONE: ["타프존", "#t-building-pavilion"], SHELTER_ZONE: ["쉘터존", "#l-warehouse"], CAMPNIC_DAY: ["캠프닉", "#t-grill"] };
const AREAS = ["전국", "서울·경기", "강원", "충청", "전라", "경상", "제주"];
const OP = { LOCAL_GOVERNMENT: "지자체", PRIVATE: "민간", NATIONAL_PARK: "국립공원", NATURAL_RECREATION_FOREST: "자연휴양림", PUBLIC_LEISURE: "국민여가", UNKNOWN: "" };
const GEAR = [["", "장비 크기 무관"], ["4x4", "돔텐트 4×4m"], ["5.5x8", "리빙쉘 5.5×8m"], ["6x9.5", "텐트+타프 6×9.5m"], ["8x10", "대형 8×10m"]];
const PAGE = 30;
// 테마 정의는 파이프라인(lib/themes.mjs)이 meta.themes로 내려준다. 아이콘은 스프라이트에 넣기 위해 여기서 매핑한다.
const THEME_ICON = { valley: "#l-waves", sea: "#l-sailboat", forest: "#l-trees", lake: "#l-droplets", mountain: "#l-mountain", city: "#l-building-2", summer: "#l-sun", autumn: "#l-leaf", winter: "#l-snowflake", spring: "#l-flower-2", sunrise: "#l-sunrise", kids: "#l-baby", pet: "#l-dog", glamping: "#l-bed-double", caravan: "#t-caravan", auto: "#l-car", trailer: "#t-caravan", fishing: "#l-fish", walk: "#l-footprints", comfort: "#l-plug-zap", wifi: "#l-wifi", public: "#l-landmark", realtime: "#l-zap" };
// 이름순 정렬은 “(주)”, “(에드203)” 같은 괄호 접두어와 법인 표기를 빼고 비교한다.
const sortName = (c) => (c._sort ??= c.name.replace(/^[\s(（［\[]*[^)）］\]]*[)）］\]]\s*/, "").replace(/^(주식회사|㈜|유한회사|농업회사법인)\s*/, "") || c.name);
// 데이터는 빈 값을 빼고 배포하므로 화면에서 기본값을 채운다.
const withDefaults = (c) => ({ th: [], kinds: [], sizes: [], floors: [], amenities: [], env: [], themes: [], rental: [], seasons: [], days: [], types: [], seoul: [], ...c, booking: { methods: [], url: null, provider: null, ...(c.booking ?? {}) } });

// 글자 크기 설정(작게·보통·크게·아주 크게): html의 font-size만 바꾸면 rem 단위 글자가 모두 비례해 바뀐다.
const FS = [["s", "작게"], ["m", "보통"], ["l", "크게"], ["xl", "아주 크게"]];
function applyFs(v) {
  const i = Math.max(0, FS.findIndex(([k]) => k === v));
  document.documentElement.dataset.fs = FS[i][0];
  const label = document.getElementById("fsLabel"); if (label) label.textContent = FS[i][1];
  try { localStorage.setItem("moyeora-fs", FS[i][0]); } catch {}
}
try { applyFs(localStorage.getItem("moyeora-fs") ?? "m"); } catch { applyFs("m"); }
const state = { q: "", area: "전국", kinds: new Set(), realtime: false, pet: false, fee: false, toilet: false, savedOnly: false, inView: false, theme: "", sgg: "", gear: "", sort: "best", shown: PAGE, here: null, open: null, saved: new Set() };
let ALL = [], META = null, map = null, clusterer = null, markers = new Map();

function load() {
  try { const s = JSON.parse(localStorage.getItem("moyeora-explore") ?? "{}"); Object.assign(state, { area: s.area ?? "전국", gear: s.gear ?? "", saved: new Set(Array.isArray(s.saved) ? s.saved : []) }); } catch {}
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("c")) state.open = h.get("c");
  if (h.get("t")) state.theme = h.get("t");
  if (h.get("a") && AREAS.includes(h.get("a"))) state.area = h.get("a");
  if (h.get("g")) state.sgg = h.get("g");
}
// 관심 캠핑장은 이 기기 브라우저에만 저장한다(로그인 없음).
const save = () => { try { localStorage.setItem("moyeora-explore", JSON.stringify({ area: state.area, gear: state.gear, saved: [...state.saved] })); } catch {} };
const inBounds = (c) => { if (!state.inView || !map) return true; const b = map.getBounds(); return b.contain(new kakao.maps.LatLng(c.lat, c.lng)); };

const fits = (c) => {
  if (!state.gear) return true;
  if (c.kinds.length && c.kinds.every(([k]) => ["GLAMPING", "CARAVAN_RENTAL", "CAMPNIC_DAY"].includes(k))) return true;
  const [w, d] = state.gear.split("x").map(Number);
  return c.sizes.some(([sw, sd]) => (sw >= w && sd >= d) || (sw >= d && sd >= w));
};
// 추천순: 바로 예약할 수 있고 정보가 풍부한 곳을 먼저(온라인 실시간 예약 > 예약 링크 > 사진 > 사이트 구성·크기 > 요금 안내 > 주변 화장실)
const richness = (c) => (c._rich ??= (isRealtime(c) ? 8 : 0) + (c.booking.url ? 6 : c.homepage ? 2 : 0) + (c.img ? 4 : 0) + (c.kinds.length ? 2 : 0) + (c.sizes.length ? 1 : 0) + (c.fee ? 2 : 0) + (c.nearby_toilets ? 1 : 0));
// 서울시 공공예약 원문 상태가 “접수중”인 상품이 있는 곳(확인 시각은 상세에 표시)
const openNow = (c) => c.seoul.some((s) => /접수중/.test(s.status ?? ""));
// 시도 표기(강원도/강원특별자치도 등)가 섞여 있어 짧은 이름으로 묶는다: “강원 평창군”, “경북 경주시”
const SIDO_SHORT = [[/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"], [/^광주/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"], [/^경기/, "경기"], [/^강원/, "강원"], [/^충청북|^충북/, "충북"], [/^충청남|^충남/, "충남"], [/^전라북|^전북/, "전북"], [/^전라남|^전남/, "전남"], [/^경상북|^경북/, "경북"], [/^경상남|^경남/, "경남"], [/^제주/, "제주"]];
const sidoShort = (s) => SIDO_SHORT.find(([re]) => re.test(s ?? ""))?.[1] ?? (s ?? "");
const sggKey = (c) => (c._sgg ??= `${sidoShort(c.sido)} ${c.sigungu ?? ""}`.trim());
const sggLabel = (k) => k;
const isRealtime = (c) => c.booking.methods.some((m) => /실시간/.test(m));
const petOk = (c) => /가능/.test(c.pets ?? "") && !/불가/.test(c.pets ?? "");
const dist = (a, b) => { const R = 6371, t = Math.PI / 180, x = (b.lat - a.lat) * t, y = (b.lng - a.lng) * t; const h = Math.sin(x / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

// 지도 마커는 “지도에 보이는 곳만” 조건을 빼고 그린다(지도를 옮기면 다른 곳도 보이도록).
function filtered({ forMap = false } = {}) {
  const q = state.q.trim().replace(/\s+/g, "");
  const list = ALL.filter((c) => {
    if (state.savedOnly && !state.saved.has(c.id)) return false;
    if (!forMap && !inBounds(c)) return false;
    if (state.area !== "전국" && c.area !== state.area) return false;
    if (state.sgg && sggKey(c) !== state.sgg) return false;
    if (state.theme && !c.th.includes(state.theme)) return false;
    if (q && !`${c.name}${c.sido}${c.sigungu}${c.addr}`.replace(/\s+/g, "").includes(q)) return false;
    if (state.kinds.size && !c.kinds.some(([k]) => state.kinds.has(k))) return false;
    if (state.realtime && !isRealtime(c)) return false;
    if (state.pet && !petOk(c)) return false;
    if (state.fee && !c.fee?.min) return false;
    if (state.toilet && !(c.nearby_toilets?.nearest?.[0]?.m <= 500)) return false;
    return fits(c);
  });
  if (state.sort === "near" && state.here) list.sort((a, b) => dist(state.here, a) - dist(state.here, b));
  else if (state.sort === "fee") list.sort((a, b) => (a.fee?.min ?? 9e9) - (b.fee?.min ?? 9e9));
  else if (state.sort === "best") list.sort((a, b) => richness(b) - richness(a) || sortName(a).localeCompare(sortName(b), "ko"));
  else list.sort((a, b) => sortName(a).localeCompare(sortName(b), "ko"));
  return list;
}

function card(c) {
  const kinds = c.kinds.map(([k, n]) => KIND[k] ? `<span class="tag">${ic(KIND[k][1], "i-xs")}${KIND[k][0]} <span class="num">${n}</span></span>` : "").join("");
  const km = state.here ? ` · ${dist(state.here, c).toFixed(0)}km` : "";
  return `<button class="card" type="button" data-open="${c.id}" aria-current="${state.open === c.id}">
    <span class="thumb">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ic("#t-tent")}</span>
    <span class="card-body">
      <span class="card-title"><h3>${esc(c.name)}</h3>${state.saved.has(c.id) ? ic("#l-heart", "i-xs saved-mark") : ""}</span>
      <span class="loc">${ic("#l-map-pin", "i-xs")}${esc([c.sido, c.sigungu].filter(Boolean).join(" "))}${km}${OP[c.op] ? ` · ${OP[c.op]}` : ""}</span>
      <span class="tags">${openNow(c) ? `<span class="tag tag-green">${ic("#l-circle-check", "i-xs")}서울 공공예약 접수중</span>` : ""}${isRealtime(c) ? `<span class="tag tag-green">${ic("#l-zap", "i-xs")}온라인 실시간 예약</span>` : ""}${kinds}${petOk(c) ? `<span class="tag">${ic("#l-dog", "i-xs")}반려견</span>` : ""}</span>
      <span class="price">${c.fee?.min ? `<b>${won(c.fee.min)}~</b><span>공식 안내 요금</span>` : `<span>요금은 예약처에서 확인</span>`}</span>
    </span></button>`;
}

function renderChips() {
  const count = (pred) => ALL.filter(pred).length;
  $("#areaChips").innerHTML = AREAS.map((a) => `<button class="pill" type="button" data-area="${a}" aria-pressed="${state.area === a}">${a}</button>`).join("");
  // 권역을 고르면 그 안의 시군구로 한 단계 더 들어간다(캠핑장 많은 순).
  const sggs = state.area === "전국" ? [] : Object.entries(ALL.filter((c) => c.area === state.area).reduce((m, c) => ({ ...m, [sggKey(c)]: (m[sggKey(c)] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  $("#sggChips").hidden = !sggs.length;
  $("#sggChips").innerHTML = sggs.length ? [`<button class="pill pill-sub" type="button" data-sgg="" aria-pressed="${!state.sgg}">${esc(state.area)} 전체</button>`, ...sggs.map(([k, n]) => `<button class="pill pill-sub" type="button" data-sgg="${esc(k)}" aria-pressed="${state.sgg === k}">${esc(sggLabel(k))} <span class="num">${n}</span></button>`)].join("") : "";
  $("#filterChips").innerHTML = [
    `<button class="pill" type="button" data-toggle="savedOnly" aria-pressed="${state.savedOnly}">${ic("#l-heart", "i-sm")}관심 <span class="num">${state.saved.size}</span></button>`,
    map ? `<button class="pill" type="button" data-toggle="inView" aria-pressed="${state.inView}">${ic("#l-scan-search", "i-sm")}지도에 보이는 곳만</button>` : "",
    `<button class="pill" type="button" data-toggle="realtime" aria-pressed="${state.realtime}">${ic("#l-zap", "i-sm")}실시간 예약 <span class="num">${count(isRealtime)}</span></button>`,
    ...Object.entries(KIND).filter(([k]) => k !== "RV_PITCH").map(([k, [l, i]]) => `<button class="pill" type="button" data-kind="${k}" aria-pressed="${state.kinds.has(k)}">${ic(i, "i-sm")}${l}</button>`),
    `<span class="sep"></span>`,
    `<button class="pill" type="button" data-toggle="pet" aria-pressed="${state.pet}">${ic("#l-dog", "i-sm")}반려견</button>`,
    `<button class="pill" type="button" data-toggle="fee" aria-pressed="${state.fee}">${ic("#t-coin", "i-sm")}요금 안내 있음</button>`,
    `<button class="pill" type="button" data-toggle="toilet" aria-pressed="${state.toilet}">${ic("#l-toilet", "i-sm")}공중화장실 500m</button>`,
    `<label class="pill">${ic("#l-ruler", "i-sm")}<select data-gear aria-label="내 장비 크기">${GEAR.map(([v, l]) => `<option value="${v}" ${state.gear === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`,
  ].join("");
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
  if (state.q || state.savedOnly) { hub.innerHTML = ""; return; }
  // 지금 고른 지역 안에서 테마별 개수(0곳 테마는 숨김)
  const base = ALL.filter((c) => (state.area === "전국" || c.area === state.area) && (!state.sgg || sggKey(c) === state.sgg));
  const groups = [...new Set(themes.map((x) => x.group))];
  const tiles = (g) => themes.filter((x) => x.group === g).map((x) => [x, base.filter((c) => c.th.includes(x.id)).length]).filter(([, n]) => n > 0)
    .map(([x, n]) => `<button class="theme-tile" type="button" data-th="${x.id}"><span class="theme-ic">${ic(THEME_ICON[x.id] ?? "#t-tent")}</span><b>${esc(x.label)}</b><small class="num">${n.toLocaleString()}곳</small></button>`).join("");
  const body = groups.map((g) => { const h = tiles(g); return h ? `<div class="theme-group"><h3>${esc(g)}</h3><div class="theme-grid">${h}</div></div>` : ""; }).join("");
  hub.innerHTML = body ? `<section class="hub" aria-label="테마로 찾기"><div class="hub-head"><h2>${esc(scope)} 테마로 찾기</h2><button class="link-btn" type="button" data-hub-toggle aria-expanded="${!state.hubFolded}">${state.hubFolded ? "펼치기" : "접기"}</button></div>${state.hubFolded ? "" : body}</section>` : "";
}
function renderListOnly() {
  const list = filtered();
  $("#resultTitle").textContent = `캠핑장 ${list.length.toLocaleString()}곳`;
  $("#cards").innerHTML = list.length ? list.slice(0, state.shown).map(card).join("") : emptyBox();
  $("#moreBtn").hidden = list.length <= state.shown;
}
const emptyBox = () => `<div class="empty">${ic("#t-tent-off")}<b>${state.savedOnly && !state.saved.size ? "아직 관심 캠핑장이 없어요" : "조건에 맞는 캠핑장이 없어요"}</b><span data-wrap-ok>${state.savedOnly && !state.saved.size ? "상세 화면의 하트를 누르면 이 기기에 저장돼요." : state.inView ? "지도를 옮기거나 축소해 보세요." : "필터를 줄여 보세요."}</span></div>`;
function renderList() {
  renderHub();
  const list = filtered();
  $("#resultTitle").textContent = `캠핑장 ${list.length.toLocaleString()}곳`;
  $("#resultSub").textContent = META ? `고캠핑 ${ymd(META.sources[0]?.fetched_at)} 기준` : "";
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
const SECTIONS = [["sec-info", "기본정보"], ["sec-book", "예약"], ["sec-site", "사이트·요금"], ["sec-fac", "시설"], ["sec-near", "주변"], ["sec-media", "사진·후기"], ["sec-talk", "댓글"]];
const NEAR_GROUPS = [["toilet", "화장실", "#l-toilet"], ["mart", "마트·장보기", "#l-shopping-cart"], ["conv", "편의점", "#l-store"], ["fuel", "주유소", "#l-fuel"], ["medical", "병원·약국", "#l-cross"], ["rest", "휴게소·졸음쉼터", "#l-coffee"], ["tour", "주변 관광", "#l-camera"], ["food", "맛집", "#l-utensils"], ["gear", "철물·캠핑용품", "#l-wrench"]];
let DETAIL = new Map();
const POI_KIND = { supermarket: "마트", convenience: "편의점", butcher: "정육점", greengrocer: "청과·채소", hardware: "철물점", outdoor: "캠핑·아웃도어", fuel: "주유소", pharmacy: "약국", hospital: "병원", SERVICE_AREA: "고속도로 휴게소", REST_AREA: "휴게소", DROWSY_SHELTER: "졸음쉼터" };

function bookingTarget(c) {
  if (c.booking.url) return { href: c.booking.url, label: "예약하기", ext: true };
  if (c.homepage) return { href: c.homepage, label: "홈페이지에서 예약", ext: true };
  if (c.tel) return { href: telHref(c.tel), label: "전화로 예약", ext: false };
  return null;
}
function providerBlock(c) {
  const p = META?.providers?.find((x) => x.id === c.booking.provider);
  if (!p) return "";
  const evs = p.events.slice(0, 4).map((e) => { const d = new Date(e.at); return `<time>${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}${e.time_known ? ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : ""}</time><span data-wrap-ok>${esc(e.label)}${e.needs_verification ? " · 확인 필요" : ""}</span>`; }).join("");
  return `<div class="sub"><h4>${esc(p.name)} 공통 규칙</h4>
    ${p.rules.map((r) => `<p class="pre" data-wrap-ok>${esc(r.summary ?? r.label)}</p>`).join("")}
    ${evs ? `<div class="ev">${evs}</div>` : ""}
    <span class="trust">${ic("#l-info", "i-xs")}예약처 공지 기준 · 시설마다 다를 수 있어요</span></div>`;
}
function guideBlock(c, d) {
  const g = d?.guide;
  if (!g) return `<div class="guide-slot">${providerBlock(c)}</div>`;
  const next = (g.next_openings ?? []).slice(0, 3).map((t) => `<li><b class="num">${ymd(t)} ${new Date(t).toTimeString().slice(0, 5)}</b></li>`).join("");
  return `<div class="guide-slot">
    ${g.open_rules?.length ? `<div class="sub"><h4>${ic("#l-alarm-clock", "i-sm")}이 캠핑장의 예약 오픈</h4>
      ${g.open_rules.map((r) => `<p class="pre" data-wrap-ok>${esc(r.label ?? r.snippet)}</p><span class="trust ${["A", "B"].includes(r.tier) ? "ok" : ""}">${ic("#l-quote", "i-xs")}${esc(r.source_label ?? "운영자 안내")} · ${esc(r.checked_at ? ymd(r.checked_at) : "")}</span>`).join("")}
      ${next ? `<p class="note">다음 오픈 예상</p><ul class="next">${next}</ul>` : ""}</div>` : ""}
    ${g.steps?.length ? `<div class="sub"><h4>${ic("#l-list-ordered", "i-sm")}${esc(g.platform?.name ?? "예약처")} 예약 방법</h4>
      <ol class="steps">${g.steps.map((s) => `<li data-wrap-ok>${esc(s)}</li>`).join("")}</ol>
      ${g.tips?.length ? `<ul class="tips">${g.tips.map((s) => `<li data-wrap-ok>${esc(s)}</li>`).join("")}</ul>` : ""}
      ${g.platform?.help_url ? `<a class="link-row" href="${esc(g.platform.help_url)}" target="_blank" rel="noopener">${ic("#l-external-link", "i-xs")}예약처 공식 안내</a>` : ""}</div>` : ""}
    ${(g.warnings ?? []).map((w) => `<p class="note warn" data-wrap-ok>${esc(w)}</p>`).join("")}
    ${providerBlock(c)}
  </div>`;
}
function nearBlock(c, d) {
  const n = { ...(d?.nearby ?? {}) };
  if (c.nearby_toilets?.nearest?.length) n.toilet = c.nearby_toilets.nearest.map((t) => ({ n: t.name, m: t.m, k: t.h24 ? "24시간 개방" : "공중화장실" }));
  const groups = NEAR_GROUPS.filter(([g]) => n[g]?.length);
  if (!groups.length) return `<p class="note" data-wrap-ok>주변 정보를 모으는 중입니다. 지도 앱에서 주변을 확인하세요.</p>`;
  const active = groups[0][0];
  return `<div class="seg-tabs" role="tablist">${groups.map(([g, l, i]) => `<button type="button" role="tab" data-near="${g}" aria-selected="${g === active}">${ic(i, "i-sm")}${l}</button>`).join("")}</div>
  ${groups.map(([g]) => `<div class="near-list" data-near-panel="${g}" ${g === active ? "" : "hidden"}>${n[g].map((p) => {
    const body = `<span class="near-name"><b>${esc(p.n)}</b><small>${esc([p.ty ?? POI_KIND[p.k] ?? p.k, p.e ? "응급실" : null, p.b, p.h, p.r].filter(Boolean).join(" · "))}</small></span><span class="m">${p.m != null ? km(p.m) : ""}</span>`;
    return p.lat ? `<a class="near-row" href="${esc(p.u ?? mapLink(p.n, p.lat, p.lng))}" target="_blank" rel="noopener">${p.img ? `<img src="${esc(p.img.replace(/^http:/, "https:"))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${body}</a>` : `<div class="near-row">${body}</div>`;
  }).join("")}</div>`).join("")}
  <p class="note" data-wrap-ok>직선거리 기준 · 한국관광공사 TourAPI, OpenStreetMap(© 기여자, ODbL), 행정안전부 공중화장실정보, 한국도로공사·졸음쉼터 표준데이터</p>`;
}
function mediaBlock(c, d) {
  const q = encodeURIComponent(c.name);
  const tag = encodeURIComponent(c.name.replace(/\s+|[()（）]/g, ""));
  const links = [
    ["https://search.naver.com/search.naver?ssc=tab.blog.all&query=" + q, "네이버 블로그 후기", "#l-notebook-pen"],
    ["https://map.kakao.com/?q=" + q, "카카오맵 별점·리뷰", "#l-star"],
    ["https://map.naver.com/p/search/" + q, "네이버 지도 리뷰", "#l-map-pin"],
    ["https://www.youtube.com/results?search_query=" + encodeURIComponent(c.name + " 캠핑"), "유튜브 영상", "#t-brand-youtube"],
    ["https://www.instagram.com/explore/tags/" + tag + "/", "인스타그램 #" + c.name.replace(/\s+/g, ""), "#t-brand-instagram"],
  ];
  const reviews = (d?.reviews ?? []).slice(0, 5).map((r) => `<a class="review" href="${esc(r.url)}" target="_blank" rel="noopener"><b>${esc(r.title)}</b><p data-wrap-ok>${esc(r.snippet ?? "")}</p><small>${esc([r.author, r.date && ymd(r.date)].filter(Boolean).join(" · "))}</small></a>`).join("");
  const videos = (d?.videos ?? []).slice(0, 4).map((v) => `<button class="video" type="button" data-video="${esc(v.id)}" aria-label="${esc(v.title)} 재생"><img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy"><span>${ic("#l-play")}</span><b>${esc(v.title)}</b></button>`).join("");
  return `${reviews ? `<div class="sub"><h4>블로그 후기</h4>${reviews}<span class="trust">${ic("#l-info", "i-xs")}네이버 검색 API 결과 · 글쓴이 원문으로 연결</span></div>` : ""}
    ${videos ? `<div class="sub"><h4>영상</h4><div class="videos">${videos}</div></div>` : ""}
    <div class="link-grid">${links.map(([u, l, i]) => `<a class="link-tile" href="${esc(u)}" target="_blank" rel="noopener">${ic(i, "i-sm")}<span>${esc(l)}</span>${ic("#l-arrow-up-right", "i-xs")}</a>`).join("")}</div>
    <p class="note" data-wrap-ok>다른 플랫폼의 사진·영상·후기는 각 서비스 화면에서 열립니다(저작권·이용약관 준수). 별점은 카카오맵·네이버 지도에서 확인하세요.</p>`;
}
function talkBlock(c) {
  const g = window.GISCUS;
  if (!g?.repoId) return `<p class="note" data-wrap-ok>댓글 기능을 준비하고 있어요. 곧 이 캠핑장 이야기를 나눌 수 있습니다.</p>`;
  return `<div class="giscus" data-camp="${c.id}"></div><p class="note" data-wrap-ok>GitHub 계정으로 댓글을 남길 수 있어요(무료). 개인정보·전화번호는 적지 마세요.</p>`;
}
function detail(c) {
  const d = DETAIL.get(c.id);
  const kinds = c.kinds.filter(([k]) => KIND[k]).map(([k, n]) => `<div class="fact"><small>${KIND[k][0]}</small><b class="num">${n}면</b></div>`).join("");
  const sizes = c.sizes.length ? c.sizes.map(([w, dd, n]) => `${w}×${dd}m${n ? ` ${n}면` : ""}`).join(" · ") : "정보 없음";
  const floors = c.floors.length ? c.floors.map(([f, n]) => `${f} ${n}`).join(" · ") : "정보 없음";
  const target = bookingTarget(c);
  const photos = d?.photos?.length ? d.photos : c.ph ? [{ t: c.ph, l: c.ph }] : [];
  const hero = photos.length
    ? `<div class="gallery" aria-label="공식 사진">${photos.map((p, i) => `<img src="${MEDIA}${esc(p.l)}" srcset="${MEDIA}${esc(p.t)} 480w, ${MEDIA}${esc(p.l)} 1280w" sizes="(max-width: 720px) 100vw, 560px" alt="${esc(c.name)} 공식 사진 ${i + 1}" ${i ? 'loading="lazy"' : ""}>`).join("")}</div>${photos.length > 1 ? `<span class="count num">${photos.length}장</span>` : ""}<span class="credit">사진: 한국관광공사 고캠핑</span>`
    : c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)} 대표 사진" referrerpolicy="no-referrer"><span class="credit">사진: 한국관광공사 고캠핑</span>` : ic("#t-tent");
  const themes = (META?.themes ?? []).filter((t) => c.th.includes(t.id));
  const info = [
    ["주소", c.addr, c.addr ? `<button class="mini" type="button" data-copy="${esc(c.addr)}">복사</button>` : ""],
    ["전화", c.tel, c.tel ? `<a class="mini" href="${telHref(c.tel)}">걸기</a>` : ""],
    ["홈페이지", c.homepage ? c.homepage.replace(/^https?:\/\//, "").replace(/\/$/, "") : null, c.homepage ? `<a class="mini" href="${esc(c.homepage)}" target="_blank" rel="noopener">열기</a>` : ""],
    ["운영 기간", c.seasons.join("·") || null, ""],
    ["운영 요일", c.days.join("·") || null, ""],
    ["운영 주체", [OP[c.op], c.types.join("·")].filter(Boolean).join(" · ") || null, ""],
    ["운영 상태", c.status, ""],
  ].filter(([, v]) => v).map(([k, v, a]) => `<div class="info-row"><small>${k}</small><span data-wrap-ok>${esc(v)}</span>${a}</div>`).join("");
  return `<div class="sheet-close"><button class="round" type="button" data-close aria-label="닫기">${ic("#l-x")}</button></div>
  <div class="d-hero">${hero}</div>
  <div class="d-body">
    <div class="d-title"><h2>${esc(c.name)}</h2>${c.line ? `<p class="d-line" data-wrap-ok>${esc(c.line)}</p>` : ""}<p data-wrap-ok>${esc([c.sido, c.sigungu].filter(Boolean).join(" "))}${OP[c.op] ? ` · ${OP[c.op]}` : ""}</p>
      ${themes.length ? `<div class="tags">${themes.map((t) => `<button class="tag tag-btn" type="button" data-th="${t.id}" data-close-then>${ic(THEME_ICON[t.id] ?? "#t-tent", "i-xs")}${esc(t.label)}</button>`).join("")}</div>` : ""}</div>
    <div class="d-actions">
      <a class="act" href="${routeLink(c.name, c.lat, c.lng)}" target="_blank" rel="noopener">${ic("#l-navigation")}길찾기</a>
      ${c.tel ? `<a class="act" href="${telHref(c.tel)}">${ic("#l-phone")}전화</a>` : `<span class="act" aria-disabled="true">${ic("#l-phone")}전화 없음</span>`}
      <button class="act" type="button" data-save="${c.id}" aria-pressed="${state.saved.has(c.id)}">${ic("#l-heart")}${state.saved.has(c.id) ? "저장됨" : "관심"}</button>
      <button class="act" type="button" data-share="${c.id}">${ic("#l-share-2")}공유</button>
    </div>
    <nav class="d-nav" aria-label="상세 목차">${SECTIONS.map(([id, l]) => `<button type="button" data-jump="${id}">${l}</button>`).join("")}</nav>
    <section class="box" id="sec-info"><h3>${ic("#l-info", "i-sm")}기본 정보</h3>${info || `<p class="note">등록된 기본 정보가 없습니다.</p>`}</section>
    <section class="box box-book" id="sec-book"><h3>${ic("#l-calendar", "i-sm")}예약</h3>
      <div class="tags">${c.booking.methods.map((m) => `<span class="tag ${/실시간/.test(m) ? "tag-green" : ""}">${esc(m)}</span>`).join("") || `<span class="tag">예약 방법 정보 없음</span>`}</div>
      ${target ? `<a class="btn btn-primary" href="${esc(target.href)}" ${target.ext ? 'target="_blank" rel="noopener"' : ""}>${ic(target.ext ? "#l-external-link" : "#l-phone", "i-sm")}${target.label}</a>` : ""}
      ${c.seoul.length ? `<div class="sub"><h4>서울 공공예약 접수 상태</h4>${c.seoul.map((s) => `<a class="row" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="tag ${/접수중/.test(s.status ?? "") ? "tag-green" : ""}">${esc(s.status ?? "상태 없음")}</span><span data-wrap-ok>${esc(s.name)}${s.to ? ` · ${ymd(s.to)}까지` : ""}</span></a>`).join("")}<span class="trust ok">${ic("#l-shield-check", "i-xs")}서울 열린데이터광장 · ${ymd(c.seoul[0].checked_at)} 확인</span></div>` : ""}
      ${guideBlock(c, d)}
      <p class="note" data-wrap-ok>빈자리와 최종 요금은 예약처 화면에서 확정됩니다. 모여라 캠핑은 결제를 받지 않고 공식 예약처로 연결합니다.</p>
    </section>
    <section class="box" id="sec-site"><h3>${ic("#t-tent", "i-sm")}사이트·요금</h3>
      <div class="facts">${kinds || `<div class="fact"><small>구성</small><b>정보 없음</b></div>`}</div>
      <div class="row">${ic("#l-ruler", "i-sm")}<span data-wrap-ok>${esc(sizes)}</span></div>
      <div class="row">${ic("#l-layers", "i-sm")}<span data-wrap-ok>바닥 ${esc(floors)}</span></div>
      <div class="sub"><h4>요금</h4>${c.fee ? `<p class="pre" data-wrap-ok>${esc(c.fee.text)}</p><span class="trust">${ic("#l-info", "i-xs")}한국관광공사 등록 안내 · ${ymd(c.fee.checked_at)} 확인 · <a href="${esc(c.fee.url)}" target="_blank" rel="noopener">원문</a></span>` : `<p class="note" data-wrap-ok>공식 원천에 등록된 요금 안내가 없습니다. 예약처에서 확인하세요.</p>`}</div>
    </section>
    <section class="box" id="sec-fac"><h3>${ic("#l-plug-zap", "i-sm")}시설·규칙</h3>
      <div class="facts">
        <div class="fact"><small>반려견</small><b>${esc(c.pets ?? "정보 없음")}</b></div>
        <div class="fact"><small>화로대</small><b>${esc(c.fire ?? "정보 없음")}</b></div>
        <div class="fact"><small>화장실·샤워</small><b class="num">${c.toilets ?? "-"} · ${c.showers ?? "-"}</b></div>
        <div class="fact"><small>개수대</small><b class="num">${c.sinks ?? "-"}</b></div>
        ${c.trailer != null ? `<div class="fact"><small>트레일러</small><b>${c.trailer ? "가능" : "불가"}</b></div>` : ""}
        ${c.caravan != null ? `<div class="fact"><small>개인 카라반</small><b>${c.caravan ? "가능" : "불가"}</b></div>` : ""}
      </div>
      ${c.amenities.length ? `<div class="tags">${c.amenities.map((a) => `<span class="tag">${esc(a)}</span>`).join("")}</div>` : ""}
      ${c.rental.length ? `<div class="row">${ic("#l-package", "i-sm")}<span data-wrap-ok>장비 대여 ${esc(c.rental.join(" · "))}</span></div>` : ""}
      <div id="introSlot"></div>
    </section>
    <section class="box" id="sec-near"><h3>${ic("#l-map-pinned", "i-sm")}주변 정보</h3><div id="nearSlot">${nearBlock(c, d)}</div></section>
    <section class="box" id="sec-media"><h3>${ic("#l-images", "i-sm")}사진·영상·후기</h3><div id="mediaSlot">${mediaBlock(c, d)}</div></section>
    <section class="box" id="sec-talk"><h3>${ic("#l-messages-square", "i-sm")}댓글</h3>${talkBlock(c)}</section>
    <p class="note" data-wrap-ok>출처: 한국관광공사 고캠핑(${ymd(c.modified_at)} 수정)${c.gc_url ? ` · <a href="${esc(c.gc_url)}" target="_blank" rel="noopener">고캠핑 원문</a>` : ""} · 정보가 다르면 운영자 공지가 우선합니다.</p>
  </div>
  ${target ? `<div class="d-cta"><a class="btn btn-primary" href="${esc(target.href)}" ${target.ext ? 'target="_blank" rel="noopener"' : ""}>${ic(target.ext ? "#l-external-link" : "#l-phone", "i-sm")}${target.label}</a>${c.tel && target.ext ? `<a class="btn btn-line btn-icon" href="${telHref(c.tel)}" aria-label="전화">${ic("#l-phone", "i-sm")}</a>` : ""}</div>` : ""}`;
}
function introHtml(t) {
  if (!t || !(t.intro || t.feature || t.nearby?.length || t.programs)) return "";
  return `<div class="sub"><h4>운영자 소개</h4>
    ${t.intro ? `<p class="pre" data-wrap-ok>${esc(t.intro)}</p>` : ""}
    ${t.feature ? `<p class="pre" data-wrap-ok>${esc(t.feature)}</p>` : ""}
    ${t.nearby?.length ? `<div class="tags">${t.nearby.map((n) => `<span class="tag">${esc(n)}</span>`).join("")}</div>` : ""}
    ${t.programs ? `<div class="row">${ic("#l-sparkles", "i-sm")}<span data-wrap-ok>체험 ${esc(t.programs)}</span></div>` : ""}
    <p class="note" data-wrap-ok>운영자가 고캠핑에 등록한 문구입니다.</p></div>`;
}
function openDetail(id) {
  const c = ALL.find((x) => x.id === id);
  if (!c) return;
  state.open = id;
  history.replaceState(null, "", `#c=${id}`);
  document.title = `${c.name} · 모여라 캠핑`;
  $("#sheetRoot").innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(c.name)}"><div class="sheet-scrim" data-close></div><div class="sheet-panel">${detail(c)}</div></div>`;
  document.body.style.overflow = "hidden";
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
// 탐색 상태(테마·권역·시군구)를 주소에 남겨 그대로 공유할 수 있게 한다.
function syncHash() {
  if (state.open) return;
  const h = new URLSearchParams();
  if (state.theme) h.set("t", state.theme);
  if (state.area !== "전국") h.set("a", state.area);
  if (state.sgg) h.set("g", state.sgg);
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
function toast(msg) {
  const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
  document.body.append(el); setTimeout(() => el.remove(), 2000);
}
function closeDetail() { document.title = BASE_TITLE; state.open = null; $("#sheetRoot").innerHTML = ""; document.body.style.overflow = ""; history.replaceState(null, "", location.pathname); syncHash(); }

/* ---------- 이벤트 ---------- */
function rerender(resetPage = true) { if (resetPage) state.shown = PAGE; save(); renderChips(); renderList(); }
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-open],[data-close],[data-save],[data-share],[data-share-theme],[data-jump],[data-near],[data-copy],[data-video],[data-th],[data-sgg],[data-hub-toggle],#fsBtn,[data-area],[data-kind],[data-toggle],#moreBtn,#viewSwitch,#clearQ,#nearBtn");
  if (!t) return;
  if (t.dataset.jump) { const el = document.getElementById(t.dataset.jump); return el?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  if (t.dataset.near) {
    $$("[data-near]").forEach((b) => b.setAttribute("aria-selected", String(b === t)));
    $$("[data-near-panel]").forEach((p) => { p.hidden = p.dataset.nearPanel !== t.dataset.near; });
    return;
  }
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
    toast(on ? "관심 캠핑장에 저장했어요(이 기기)" : "관심에서 뺐어요");
    return rerender(false);
  }
  if (t.id === "fsBtn") { const i = FS.findIndex(([k]) => k === document.documentElement.dataset.fs); applyFs(FS[(i + 1) % FS.length][0]); toast(`글자 크기: ${FS[(i + 1) % FS.length][1]}`); return head(); }
  if (t.dataset.share) return share(ALL.find((x) => x.id === t.dataset.share));
  if (t.dataset.open) return openDetail(t.dataset.open);
  if (t.hasAttribute("data-close")) return closeDetail();
  if (t.dataset.area) { state.area = t.dataset.area; state.sgg = ""; syncHash(); return rerender(); }
  if (t.dataset.sgg !== undefined) { state.sgg = t.dataset.sgg; syncHash(); return rerender(); }
  if (t.dataset.th !== undefined) { state.theme = t.dataset.th; syncHash(); rerender(); return $(".list-col")?.scrollIntoView({ block: "start", behavior: "smooth" }); }
  if (t.hasAttribute("data-hub-toggle")) { state.hubFolded = !state.hubFolded; return renderHub(); }
  if (t.hasAttribute("data-share-theme")) return shareUrl(`${location.origin}${location.pathname}${location.hash}`, `${META.themes.find((x) => x.id === state.theme)?.label ?? ""} 캠핑장 · 모여라 캠핑`);
  if (t.dataset.kind) { state.kinds.has(t.dataset.kind) ? state.kinds.delete(t.dataset.kind) : state.kinds.add(t.dataset.kind); return rerender(); }
  if (t.dataset.toggle) { state[t.dataset.toggle] = !state[t.dataset.toggle]; return rerender(); }
  if (t.id === "moreBtn") { state.shown += PAGE; return renderList(); }
  if (t.id === "clearQ") { state.q = ""; $("#q").value = ""; return rerender(); }
  if (t.id === "viewSwitch") {
    const toMap = document.body.dataset.view !== "map";
    document.body.dataset.view = toMap ? "map" : "list";
    t.innerHTML = toMap ? `${ic("#l-list", "i-sm")}목록 보기` : `${ic("#l-map", "i-sm")}지도 보기`;
    if (map) setTimeout(() => map.relayout(), 50);
  }
  if (t.id === "nearBtn") {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => { state.here = { lat: p.coords.latitude, lng: p.coords.longitude }; state.sort = "near"; $("#sort").value = "near"; rerender(); }, () => alert("위치 권한이 없어 가까운 순으로 정렬할 수 없어요."));
  }
});
document.addEventListener("change", (e) => {
  if (e.target.matches("[data-gear]")) { state.gear = e.target.value; rerender(); }
  if (e.target.id === "sort") {
    state.sort = e.target.value;
    if (state.sort === "near" && !state.here) { $("#nearBtn").click(); return; }
    rerender();
  }
});
let qTimer;
document.addEventListener("input", (e) => { if (e.target.id === "q") { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; rerender(); }, 160); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.open) closeDetail(); });
const head = () => document.documentElement.style.setProperty("--head", `${$(".top").offsetHeight + $(".bar").offsetHeight}px`);
new ResizeObserver(head).observe(document.body);

const BASE_TITLE = document.title;
async function boot() {
  load();
  // 댓글(giscus) 설정은 배포 시 메타 태그로 넣는다. 없으면 댓글 칸에 준비 중 안내.
  try { window.GISCUS = JSON.parse(document.querySelector('meta[name="giscus"]')?.content || "null"); } catch {}
  try {
    const [cg, meta] = await Promise.all([fetch("data/campgrounds.json").then((r) => r.json()), fetch("data/meta.json").then((r) => r.json()).catch(() => null)]);
    ALL = cg.map(withDefaults); META = meta;
  } catch (e) {
    $("#cards").innerHTML = `<div class="empty">${ic("#l-circle-alert")}<b>데이터를 불러오지 못했어요</b><span data-wrap-ok>잠시 후 다시 시도해 주세요.</span></div>`;
    return;
  }
  renderChips(); renderList(); head(); initMap();
  if (state.open) openDetail(state.open);
}
boot();
