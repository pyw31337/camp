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
// 이름순 정렬은 “(주)”, “(에드203)” 같은 괄호 접두어와 법인 표기를 빼고 비교한다.
const sortName = (c) => (c._sort ??= c.name.replace(/^[\s(（［\[]*[^)）］\]]*[)）］\]]\s*/, "").replace(/^(주식회사|㈜|유한회사|농업회사법인)\s*/, "") || c.name);
// 데이터는 빈 값을 빼고 배포하므로 화면에서 기본값을 채운다.
const withDefaults = (c) => ({ kinds: [], sizes: [], floors: [], amenities: [], env: [], themes: [], rental: [], seasons: [], days: [], types: [], seoul: [], ...c, booking: { methods: [], url: null, provider: null, ...(c.booking ?? {}) } });

const state = { q: "", area: "전국", kinds: new Set(), realtime: false, pet: false, fee: false, toilet: false, savedOnly: false, inView: false, gear: "", sort: "best", shown: PAGE, here: null, open: null, saved: new Set() };
let ALL = [], META = null, TEXTS = null, map = null, clusterer = null, markers = new Map();

function load() {
  try { const s = JSON.parse(localStorage.getItem("moyeora-explore") ?? "{}"); Object.assign(state, { area: s.area ?? "전국", gear: s.gear ?? "", saved: new Set(Array.isArray(s.saved) ? s.saved : []) }); } catch {}
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("c")) state.open = h.get("c");
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

function renderListOnly() {
  const list = filtered();
  $("#resultTitle").textContent = `캠핑장 ${list.length.toLocaleString()}곳`;
  $("#cards").innerHTML = list.length ? list.slice(0, state.shown).map(card).join("") : emptyBox();
  $("#moreBtn").hidden = list.length <= state.shown;
}
const emptyBox = () => `<div class="empty">${ic("#t-tent-off")}<b>${state.savedOnly && !state.saved.size ? "아직 관심 캠핑장이 없어요" : "조건에 맞는 캠핑장이 없어요"}</b><span data-wrap-ok>${state.savedOnly && !state.saved.size ? "상세 화면의 하트를 누르면 이 기기에 저장돼요." : state.inView ? "지도를 옮기거나 축소해 보세요." : "필터를 줄여 보세요."}</span></div>`;
function renderList() {
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
function providerBlock(c) {
  const p = META?.providers?.find((x) => x.id === c.booking.provider);
  if (!p) return "";
  const evs = p.events.slice(0, 4).map((e) => { const d = new Date(e.at); return `<time>${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}${e.time_known ? ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : ""}</time><span>${esc(e.label)}${e.needs_verification ? " · 확인 필요" : ""}</span>`; }).join("");
  return `<div class="box"><h3>${ic("#l-calendar", "i-sm")}${esc(p.name)} 예약 규칙</h3>
    ${p.rules.map((r) => `<p class="pre" data-wrap-ok>${esc(r.summary ?? r.label)}</p><span class="trust ${["A", "B"].includes(r.source?.tier) ? "ok" : ""}">${ic(["A", "B"].includes(r.source?.tier) ? "#l-shield-check" : "#l-circle-help", "i-xs")}${["A", "B"].includes(r.source?.tier) ? "공식 원문" : "확인 필요"} · ${esc(r.source?.checked_at ?? "")}</span>`).join("")}
    ${evs ? `<div class="ev">${evs}</div>` : ""}</div>`;
}
function detail(c) {
  const kinds = c.kinds.filter(([k]) => KIND[k]).map(([k, n]) => `<div class="fact"><small>${KIND[k][0]}</small><b class="num">${n}면</b></div>`).join("");
  const sizes = c.sizes.length ? c.sizes.map(([w, d, n]) => `${w}×${d}m${n ? ` ${n}면` : ""}`).join(" · ") : "정보 없음";
  const floors = c.floors.length ? c.floors.map(([f, n]) => `${f} ${n}`).join(" · ") : "정보 없음";
  const bookUrl = c.booking.url || c.homepage;
  const toilets = c.nearby_toilets?.nearest?.length ? c.nearby_toilets.nearest.map((t) => `<div class="row">${ic("#l-toilet", "i-sm")}<span>${esc(t.name)}${t.h24 ? " · 24시간" : ""}</span><span class="m">${t.m < 1000 ? `${t.m}m` : `${(t.m / 1000).toFixed(1)}km`}</span></div>`).join("") : `<p class="note">반경 2km 안 공중화장실 정보 없음</p>`;
  return `<div class="sheet-close"><button class="round" type="button" data-close aria-label="닫기">${ic("#l-x")}</button></div>
  <div class="d-hero">${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)} 대표 사진" referrerpolicy="no-referrer"><span class="credit">사진: 고캠핑(운영자 등록)</span>` : ic("#t-tent")}</div>
  <div class="d-body">
    <div class="d-title"><h2>${esc(c.name)}</h2>${c.line ? `<p class="d-line" data-wrap-ok>${esc(c.line)}</p>` : ""}<p data-wrap-ok>${esc(c.addr ?? "")}</p></div>
    <div class="d-actions">
      <a class="act" href="https://map.kakao.com/link/to/${encodeURIComponent(c.name)},${c.lat},${c.lng}" target="_blank" rel="noopener">${ic("#l-navigation")}길찾기</a>
      ${c.tel ? `<a class="act" href="tel:${esc(c.tel.replace(/[^\d+]/g, ""))}">${ic("#l-phone")}전화</a>` : `<span class="act" aria-disabled="true">${ic("#l-phone")}전화 없음</span>`}
      <button class="act" type="button" data-save="${c.id}" aria-pressed="${state.saved.has(c.id)}">${ic("#l-heart")}${state.saved.has(c.id) ? "저장됨" : "관심"}</button>
      <button class="act" type="button" data-share="${c.id}">${ic("#l-share-2")}공유</button>
    </div>
    <div class="box box-book">
      <h3>${ic("#l-calendar", "i-sm")}예약</h3>
      <div class="tags">${c.booking.methods.map((m) => `<span class="tag ${/실시간/.test(m) ? "tag-green" : ""}">${esc(m)}</span>`).join("") || `<span class="tag">예약 방법 정보 없음</span>`}</div>
      ${c.homepage && c.booking.url && c.homepage !== c.booking.url ? `<a class="btn btn-line" href="${esc(c.homepage)}" target="_blank" rel="noopener">${ic("#l-globe", "i-sm")}홈페이지</a>` : ""}
      ${bookUrl ? `<a class="btn btn-primary" href="${esc(bookUrl)}" target="_blank" rel="noopener">${ic("#l-external-link", "i-sm")}예약하러 가기</a>` : c.tel ? `<a class="btn btn-primary" href="tel:${esc(c.tel.replace(/[^\d+]/g, ""))}">${ic("#l-phone", "i-sm")}전화로 예약</a>` : ""}
      <p class="note" data-wrap-ok>빈자리와 최종 요금은 예약처 화면에서 확인됩니다. 모여라 캠핑은 결제를 받지 않고 공식 예약처로 연결합니다.${c.booking.url ? "" : c.homepage ? " (고캠핑에 예약 링크가 없어 홈페이지로 연결)" : c.tel ? " (온라인 예약 링크가 없어 전화 예약)" : " 고캠핑에 예약 링크·홈페이지·전화가 없어 운영자 확인이 필요합니다."}</p>
    </div>
    ${c.seoul.length ? `<div class="box"><h3>${ic("#l-calendar-check", "i-sm")}서울 공공예약 접수</h3>
      ${c.seoul.map((s) => `<a class="row" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="tag ${/접수중/.test(s.status ?? "") ? "tag-green" : ""}">${esc(s.status ?? "상태 없음")}</span><span data-wrap-ok>${esc(s.name)}${s.to ? ` · ${ymd(s.to)}까지` : ""}</span>${ic("#l-external-link", "i-xs")}</a>`).join("")}
      <span class="trust ok">${ic("#l-shield-check", "i-xs")}서울 열린데이터광장 원문 · ${ymd(c.seoul[0].checked_at)} 확인 · 빈자리는 예약 화면에서 확정</span></div>` : ""}
    <div class="box"><h3>${ic("#t-coin", "i-sm")}요금</h3>
      ${c.fee ? `<p class="pre" data-wrap-ok>${esc(c.fee.text)}</p><span class="trust">${ic("#l-info", "i-xs")}한국관광공사 등록 안내 문구 · ${ymd(c.fee.checked_at)} 확인 · <a href="${esc(c.fee.url)}" target="_blank" rel="noopener">원문</a></span>` : `<p class="note" data-wrap-ok>공식 원천에 등록된 요금 안내가 없습니다. 예약처에서 확인하세요.</p>`}
    </div>
    <div class="box"><h3>${ic("#t-tent", "i-sm")}사이트</h3>
      <div class="facts">${kinds || `<div class="fact"><small>구성</small><b>정보 없음</b></div>`}</div>
      <div class="row">${ic("#l-ruler", "i-sm")}<span>${esc(sizes)}</span></div>
      <div class="row">${ic("#l-layers", "i-sm")}<span>바닥 ${esc(floors)}</span></div>
    </div>
    <div class="box"><h3>${ic("#l-info", "i-sm")}시설·규칙</h3>
      <div class="facts">
        <div class="fact"><small>반려견</small><b>${esc(c.pets ?? "정보 없음")}</b></div>
        <div class="fact"><small>화로대</small><b>${esc(c.fire ?? "정보 없음")}</b></div>
        <div class="fact"><small>화장실·샤워·개수대</small><b class="num">${c.toilets ?? "-"} · ${c.showers ?? "-"} · ${c.sinks ?? "-"}</b></div>
        <div class="fact"><small>운영</small><b>${esc([c.seasons.join("·"), c.days.join("·")].filter(Boolean).join(" / ") || "정보 없음")}</b></div>
      </div>
      ${c.amenities.length ? `<div class="tags">${c.amenities.map((a) => `<span class="tag">${esc(a)}</span>`).join("")}</div>` : ""}
      ${c.env.length || c.themes.length ? `<p class="note" data-wrap-ok>${esc([...c.env, ...c.themes].join(" · "))}</p>` : ""}
    </div>
    <div class="box" id="introBox" hidden></div>
    ${providerBlock(c)}
    <div class="box"><h3>${ic("#l-toilet", "i-sm")}주변 공중화장실</h3>${toilets}
      <p class="note" data-wrap-ok>행정안전부 공중화장실정보·OpenStreetMap, 직선거리 기준</p></div>
    <p class="note" data-wrap-ok>출처: 한국관광공사 고캠핑(${ymd(c.modified_at)} 수정)${c.gc_url ? ` · <a href="${esc(c.gc_url)}" target="_blank" rel="noopener">고캠핑 원문</a>` : ""} · 정보가 다르면 운영자 공지가 우선합니다.</p>
  </div>`;
}
function openDetail(id) {
  const c = ALL.find((x) => x.id === id);
  if (!c) return;
  state.open = id;
  history.replaceState(null, "", `#c=${id}`);
  $("#sheetRoot").innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(c.name)}"><div class="sheet-scrim" data-close></div><div class="sheet-panel">${detail(c)}</div></div>`;
  document.body.style.overflow = "hidden";
  if (map) { map.setLevel(Math.min(map.getLevel(), 7)); map.panTo(new kakao.maps.LatLng(c.lat, c.lng)); }
  $$(".card").forEach((el) => el.setAttribute("aria-current", String(el.dataset.open === id)));
  loadIntro(c);
}
// 긴 소개 문구는 상세를 처음 열 때 한 번만 내려받는다.
async function loadIntro(c) {
  try { TEXTS ??= await fetch("data/texts.json").then((r) => (r.ok ? r.json() : {})); } catch { TEXTS = {}; }
  const t = TEXTS[c.id], box = $("#introBox");
  if (!t || !box || state.open !== c.id) return;
  box.innerHTML = `<h3>${ic("#l-message-square-text", "i-sm")}운영자 소개</h3>
    ${t.intro ? `<p class="pre" data-wrap-ok>${esc(t.intro)}</p>` : ""}
    ${t.feature ? `<p class="pre" data-wrap-ok>${esc(t.feature)}</p>` : ""}
    ${t.nearby?.length ? `<div class="tags">${t.nearby.map((n) => `<span class="tag">${esc(n)}</span>`).join("")}</div>` : ""}
    ${t.programs ? `<div class="row">${ic("#l-sparkles", "i-sm")}<span data-wrap-ok>체험 ${esc(t.programs)}</span></div>` : ""}
    <p class="note" data-wrap-ok>운영자가 고캠핑에 등록한 문구입니다. 요금·규칙은 예약처 안내가 우선합니다.</p>`;
  box.hidden = false;
}
async function share(c) {
  const url = `${location.origin}${location.pathname}#c=${c.id}`;
  try {
    if (navigator.share) { await navigator.share({ title: c.name, text: `${c.name} · 모여라 캠핑`, url }); return; }
    await navigator.clipboard.writeText(url); toast("링크를 복사했어요");
  } catch (e) { if (e?.name !== "AbortError") toast("링크를 복사하지 못했어요"); }
}
function toast(msg) {
  const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
  document.body.append(el); setTimeout(() => el.remove(), 2000);
}
function closeDetail() { state.open = null; $("#sheetRoot").innerHTML = ""; document.body.style.overflow = ""; history.replaceState(null, "", location.pathname); }

/* ---------- 이벤트 ---------- */
function rerender(resetPage = true) { if (resetPage) state.shown = PAGE; save(); renderChips(); renderList(); }
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-open],[data-close],[data-save],[data-share],[data-area],[data-kind],[data-toggle],#moreBtn,#viewSwitch,#clearQ,#nearBtn");
  if (!t) return;
  if (t.dataset.save) {
    const id = t.dataset.save, on = !state.saved.has(id);
    on ? state.saved.add(id) : state.saved.delete(id);
    t.setAttribute("aria-pressed", String(on)); t.innerHTML = `${ic("#l-heart")}${on ? "저장됨" : "관심"}`;
    toast(on ? "관심 캠핑장에 저장했어요(이 기기)" : "관심에서 뺐어요");
    return rerender(false);
  }
  if (t.dataset.share) return share(ALL.find((x) => x.id === t.dataset.share));
  if (t.dataset.open) return openDetail(t.dataset.open);
  if (t.hasAttribute("data-close")) return closeDetail();
  if (t.dataset.area) { state.area = t.dataset.area; return rerender(); }
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

async function boot() {
  load();
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
