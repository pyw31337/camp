// 모여라캠핑 리뉴얼 시안 (design/renewal → /camp/renewal/). 기획: docs/RENEWAL_PLAN.md
// 데이터는 탐색 화면과 같은 공개 파일을 읽는다(../explore/data). 사진 색인은 scripts/build-renewal-data.mjs.
// 원칙: 값만 짧게, 출처는 (i), 모르는 칸은 상세 규격에서만 회색 ‘확인필요’ 글자. 채운 배지는 원문 대조·공식 등록·운영자 공개 값만.

// /renewal/은 시안 확인 주소로 남기고, 실제 서비스 주소 /explore/도 같은 화면을 쓴다.
// 두 주소에서만 데이터의 상대 경로가 다르다.
const DATA = location.pathname.includes("/explore/") ? "./data/" : "../explore/data/";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
const fmt = (n) => Number(n).toLocaleString("ko-KR");
const band = (n) => {
  if (n == null) return "-";
  const m = Math.floor(n / 10000);
  return m < 1 ? `${Math.round(n / 1000)}천원` : `${m}만원`;
};
const ic = (id, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = {
  stype: "", camps: [], byId: new Map(), photos: {}, cards: {}, openings: new Map(),
  q: "", area: "all", quick: new Set(), theme: null, feeBand: store.get("mc-feeband", ""), sort: "rich", shown: 24, mode: "keyword",
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
  const u = new URL(location.href); u.searchParams.set("v", v); history.replaceState(null, "", u);
}
// A 포스터를 공개 서비스의 기본 표현으로 고정한다. B/C는 더 이상 고객 화면에 노출하지 않는다.
setVariant("a");

function updateHeaderGlass() {
  document.querySelector(".top")?.classList.toggle("is-glass", scrollY > 12);
}
addEventListener("scroll", updateHeaderGlass, { passive: true });

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

// 포스터 배지: 값이 ‘가능·있음’이면 붙인다(등급은 카드 줄·상세의 점과 (i)로). 전기=라임 · 불=주황 · 주차=블루 · 반려견=잉크
// 전기는 W를 알면 ‘600W’, 모르면 ‘전기’.
const pos = (f) => f && f.g;
function badges(c, max = 4) {
  const f = facts(c), out = [];
  if (pos(f.power) && f.power.ok) out.push(`<span class="bdg bdg-volt">${ic("bolt")}${esc(f.power.short)}</span>`);
  if (pos(f.fire) && f.fire.kind === "FIREWOOD_OK") out.push(`<span class="bdg bdg-flame">${ic("flame")}장작</span>`);
  else if (pos(f.fire) && f.fire.kind === "CHARCOAL_ONLY") out.push(`<span class="bdg bdg-flame-soft">${ic("flame")}숯만</span>`);
  if (pos(f.park) && f.park.ok === true) out.push(`<span class="bdg bdg-cobalt">${ic("car")}텐트 옆</span>`);
  if (pos(f.pet) && f.pet.ok) out.push(`<span class="bdg bdg-ink">${ic("paw")}반려견</span>`);
  return out.slice(0, max).join("");
}
const dot = (g) => (g ? `<i class="gd gd-${g}" title="${GRADE_TXT[g]}"></i>` : "");

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
const campFeeMin = (c) => c.fee?.min ?? c.pf?.p?.min;
const campFeeMax = (c) => c.fee?.max ?? c.pf?.p?.max ?? campFeeMin(c);
const AREAS = [["all", "전국"], ["서울·경기", "서울·경기"], ["강원", "강원"], ["충청", "충청"], ["전라", "전라"], ["경상", "경상"], ["제주", "제주"]];
const AREA_OF = { 서울: "서울·경기", 인천: "서울·경기", 경기: "서울·경기", 강원: "강원", 충북: "충청", 충남: "충청", 대전: "충청", 세종: "충청", 전북: "전라", 전남: "전라", 광주: "전라", 경북: "경상", 경남: "경상", 대구: "경상", 부산: "경상", 울산: "경상", 제주: "제주" };
const QUICK = {
  power: { label: "전기", icon: "bolt", cls: "volt", test: (c) => pos(facts(c).power) && facts(c).power.ok },
  fire: { label: "장작", icon: "flame", cls: "flame", test: (c) => pos(facts(c).fire) && facts(c).fire.kind === "FIREWOOD_OK" },
  park: { label: "텐트 옆 주차", icon: "car", cls: "cobalt", test: (c) => pos(facts(c).park) && facts(c).park.ok === true },
  pet: { label: "반려견", icon: "paw", cls: "ink", test: (c) => pos(facts(c).pet) && facts(c).pet.ok },
};
const THEMES = [
  ["VALLEY", "계곡", (c) => c.pf?.t?.includes("VALLEY")],
  ["FOREST", "숲", (c) => c.pf?.t?.includes("FOREST")],
  ["BEACH", "바다", (c) => c.pf?.t?.includes("BEACH") || c.th?.includes("sea")],
  ["LAKE", "호수·강", (c) => c.pf?.t?.includes("LAKE") || c.pf?.t?.includes("RIVER")],
  ["FAMILY", "아이와", (c) => c.pf?.t?.includes("FAMILY")],
  ["PET", "반려견", (c) => c.pf?.t?.includes("PET_OK")],
  ["GLAMPING", "글램핑", (c) => c.pf?.t?.includes("GLAMPING")],
  ["CARAVAN", "카라반", (c) => c.pf?.t?.includes("CARAVAN")],
  ["WINTER", "겨울", (c) => c.pf?.t?.includes("WINTER")],
  ["AUTO", "오토캠핑", (c) => c.pf?.t?.includes("AUTO")],
];
function matches(c, { useArea = true } = {}) {
  if (useArea && S.area !== "all" && AREA_OF[sidoShort(c.sido)] !== S.area) return false;
  for (const k of S.quick) if (!QUICK[k].test(c)) return false;
  const fMin = campFeeMin(c), fMax = campFeeMax(c);
  if (S.feeBand === "u3" && !(fMin && fMin <= 30000)) return false;
  if (S.feeBand === "3to5" && !(fMin && fMin <= 50000 && (fMax == null || fMax >= 30000))) return false;
  if (S.feeBand === "5to7" && !(fMin && fMin <= 70000 && (fMax == null || fMax >= 50000))) return false;
  if (S.feeBand === "o7" && !(fMin && (fMin >= 70000 || (fMax && fMax >= 70000)))) return false;
  if (S.theme && S.theme !== "ALL") { const t = THEMES.find((x) => x[0] === S.theme); if (t && !t[2](c)) return false; }
  if (S.theme === "AVAIL" && !S.avail?.has(String(c.id))) return false;
  if (S.theme === "OPEN" && !openingOf(c)) return false;
  if (S.stype && !hasType(c, S.stype)) return false;
  if (S.q) {
    const hay = c._hay ??= `${c.name} ${c.addr} ${c.sido} ${c.sigungu} ${(c.env ?? []).join(" ")} ${(c.types ?? []).join(" ")} ${c.pf?.s ?? ""} ${(c.st ?? []).map(([k, , , sub]) => `${ST[k]?.label ?? ""} ${sub ?? ""}`).join(" ")} ${(c.amenities ?? []).join(" ")} ${(c.rental ?? []).join(" ")} ${c.line ?? ""}`.toLowerCase();
    if (!S.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}
const rich = (c) => (c.pf?.k ?? 0) * 10 + (S.photos[c.id]?.length ?? 0) + (Object.values(facts(c)).filter(filled).length);
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
    <a class="card-hit" href="#/c/${encodeURIComponent(c.id)}" aria-label="${esc(nameOf(c).name)} 자세히"></a>
    <div class="card-media review-pick-media">${carousel(c, { eager: i < 3 })}<span class="review-total">${ic("file-text")}후기 ${fmt(r.total)}</span></div>
    <div class="card-body review-pick-body"><p class="review-place">${esc(region(c))}</p><h3>${esc(nameOf(c).name)}</h3><div class="review-topics">${reviewTopics(r.rv.p, "good", "thumb-up")}${reviewTopics(r.rv.c, "watch", "alert")}</div></div>
  </article>`;
}
function results() {
  const list = S.camps.filter((c) => matches(c));
  if (S.sort === "name") list.sort((a, b) => nameOf(a).name.localeCompare(nameOf(b).name, "ko"));
  else list.sort((a, b) => rich(b) - rich(a));
  return list;
}

// ── 사진 ─────────────────────────────────────────────────────
const photoUrl = (u) => {
  const value = String(u ?? "");
  return value.startsWith("media/") ? `../${value}` : value;
};
// 목록은 480px 파생본을 우선 쓰되, 고밀도 화면에서는 같은 공식 원본의 1280px 파생본을 선택한다.
// 외부 원문 URL은 변형하지 않아 원천의 표시 조건과 주소를 유지한다.
const photoHiUrl = (u) => photoUrl(u).replace(/-t\.webp(?=\?|$)/, "-l.webp");
function imageTag(u, alt, { eager = false, sizes = "(max-width: 759px) 80vw, 320px" } = {}) {
  const src = photoUrl(u), high = photoHiUrl(u);
  const srcset = high !== src ? ` srcset="${esc(src)} 480w, ${esc(high)} 1280w" sizes="${sizes}"` : "";
  return `<img src="${esc(src)}"${srcset} alt="${alt}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" draggable="false">`;
}
// 비교·찜처럼 사진이 보조 역할인 곳은 빈 src를 만들지 않고, 사진 미보유를 중립적인 아이콘으로 표시한다.
function campThumb(c, { alt = "", sizes } = {}) {
  const u = photosOf(c)[0];
  if (u) return imageTag(u, alt, { sizes });
  return `<span class="photo-empty" role="img" aria-label="${esc(`${nameOf(c).name} 사진 없음`)}">${ic("tent")}</span>`;
}
// 카드 사진: GitHub Pages 배포 단계에서 합쳐지는 고캠핑 공식 webp를 우선 사용한다.
// 원본 URL은 사진 브랜치에 아직 파생본이 없을 때만 보조로 쓴다.
// 원본이 지워져 404가 난 사진 주소(이 방문 동안 기억). 상세 사진 묶음·라이트박스에서 뺀다.
const DEAD = new Set();
function photosOf(c) {
  return photosAll(c).filter((u) => !DEAD.has(photoUrl(u)));
}
function photosAll(c) {
  const p = S.photos[c.id] ?? [];
  const own = S.cards[c.id];
  const remote = p.filter((x) => !String(x).startsWith("media/"));
  const local = p.filter((x) => String(x).startsWith("media/"));
  if (local.length) return [...local, ...(own ?? []).map((x) => `media/${x}`), ...remote].slice(0, 5);
  if (own?.length) return [...(c.ph ? [`media/${c.ph}`] : []), ...own.map((x) => `media/${x}`), ...remote].slice(0, 5);
  if (remote.length) return remote;
  if (c.ph) return [`media/${c.ph}`];
  if (c.img) return [c.img];
  return [];
}
// 카드 사진 레일: 첫 장만 바로, 나머지는 손이 닿을 때(hover·터치·스크롤) 받는다.
function carousel(c, { eager = false, cls = "" } = {}) {
  const ph = photosOf(c);
  const alt = esc(nameOf(c).name);
  if (!ph.length) return `<div class="car car-empty ${cls}">${ic("tent")}</div>`;
  const slides = ph.map((u, i) => i === 0
    ? imageTag(u, alt, { eager })
    : `<img data-src="${esc(photoUrl(u))}" data-hi-src="${esc(photoHiUrl(u))}" alt="" decoding="async" draggable="false">`).join("");
  const dots = ph.length > 1 ? `<span class="car-dots" aria-hidden="true">${ph.map((_, i) => `<i${i ? "" : ' class="on"'}></i>`).join("")}</span>` : "";
  const nav = ph.length > 1 ? `<button class="car-nav prev" type="button" aria-label="이전 사진" tabindex="-1">${ic("left")}</button><button class="car-nav next" type="button" aria-label="다음 사진" tabindex="-1">${ic("right")}</button>` : "";
  return `<div class="car ${cls}" data-n="${ph.length}"><div class="car-track">${slides}</div>${dots}${nav}</div>`;
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
function initCarousels(root) {
  for (const car of $$(".car[data-n]", root)) {
    if (car.dataset.init) continue;
    car.dataset.init = 1;
    const tr = $(".car-track", car);
    let dots = $$(".car-dots i", car);
    // 깨진 사진은 그 장을 빼고, 남는 사진이 없으면 카드를 지운다(빈 썸네일 금지).
    $$("img", tr).forEach((im) => im.addEventListener("error", () => {
      im.remove();
      const left = $$("img", tr).length;
      const d = $(".car-dots", car);
      if (d) { d.lastElementChild?.remove(); dots = $$(".car-dots i", car); if (left < 2) d.remove(); }
      if (!left) (car.closest(".card, .mi, .review-pick") ?? car).remove();
    }, { once: true }));
    ["pointerenter", "touchstart", "focusin"].forEach((ev) => car.addEventListener(ev, () => hydrate(car), { passive: true, once: true }));
    tr.addEventListener("scroll", () => {
      hydrate(car);
      const i = Math.round(tr.scrollLeft / tr.clientWidth);
      dots.forEach((d, k) => d.classList.toggle("on", k === i));
    }, { passive: true });
    $$(".car-nav", car).forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); hydrate(car);
      tr.scrollBy({ left: (b.classList.contains("next") ? 1 : -1) * tr.clientWidth, behavior: "smooth" });
    }));
    // 마우스 끌기(데스크톱). 끌었으면 카드 열기를 막는다.
    let x0 = null, s0 = 0, moved = false;
    tr.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") return; x0 = e.clientX; s0 = tr.scrollLeft; moved = false; tr.classList.add("drag"); hydrate(car); });
    window.addEventListener("pointermove", (e) => { if (x0 === null) return; const dx = e.clientX - x0; if (Math.abs(dx) > 4) moved = true; tr.scrollLeft = s0 - dx; });
    window.addEventListener("pointerup", () => {
      if (x0 === null) return;
      x0 = null; tr.classList.remove("drag");
      tr.scrollTo({ left: Math.round(tr.scrollLeft / tr.clientWidth) * tr.clientWidth, behavior: "smooth" });
    });
    tr.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    // 사진 레일은 카드 링크 위에 있다(가로 스와이프를 받으려고). 사진을 누르면 카드 링크로 간다.
    tr.addEventListener("click", () => { const hit = car.closest(".card, .mi, .review-pick")?.querySelector(".card-hit"); if (hit) location.hash = hit.getAttribute("href"); });
  }
}

// ── 카드 ─────────────────────────────────────────────────────
function rowsHtml(c) {
  const f = facts(c);
  const row = (n, label, x) => `<li><span class="rn">${n}</span><span class="rl">${label}</span><span class="rv${x ? "" : " none"}">${x ? esc(x.v) : "–"}</span>${x ? dot(x.g) : ""}</li>`;
  return `<ol class="rows">${row("01", "주차", f.park)}${row("02", "전기", f.power)}${row("03", "장작", f.fire)}</ol>`;
}
// 가는 길 장보기: 편의점·마트·정육점 중 5km 안 가까운 두 곳(LOCALDATA 인허가).
function nearLine(c) {
  const nl = c.nl ?? {};
  return [["c", "편의점"], ["m", "마트"], ["b", "정육점"]].filter(([k]) => nl[k] && nl[k] <= 5000).sort((a, b) => nl[a[0]] - nl[b[0]]).slice(0, 2).map(([k, l]) => `${l} ${km(nl[k])}`).join(" · ");
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
function card(c, i = 0) {
  const { tag } = nameOf(c), o = openingOf(c);
  return `<article class="card" data-id="${esc(c.id)}">
    <a class="card-hit" href="#/c/${encodeURIComponent(c.id)}" aria-label="${esc(nameOf(c).name)} 자세히"></a>
    <div class="card-media">${carousel(c, { eager: i < 4 })}
      ${o ? `<span class="sig">${ic("clock")}${esc(o.txt)}</span>` : S.avail?.has(String(c.id)) ? `<span class="sig live">${ic("check")}접수 중</span>` : ""}
      <span class="bdgs">${badges(c, 3)}</span>
    </div>
    <div class="card-body">
      <div class="name-row"><h3 class="card-name">${esc(nameOf(c).name)}</h3>${heartBtn(c)}</div>
      <p class="card-meta">${esc(region(c))}${tag ? ` · ${esc(tag)}` : ""}${!c.st?.length && typeLine(c) ? ` · ${esc(typeLine(c))}` : ""}</p>
      ${c.st?.length ? `<p class="card-types">${ic("tent")}${esc(typeLine2(c))}</p>` : ""}
      ${rowsHtml(c)}
      ${c.rv && (c.rv.p?.length || c.rv.c?.length || c.rv.n > 0) ? `<div class="card-reviews">${cardReviewPills(c.rv)}</div>` : ""}
      ${nearLine(c) ? `<p class="card-near">${ic("store")}${esc(nearLine(c))}</p>` : ""}
      ${c.fee?.text ? `<p class="card-price"><span>1박</span><b>${esc(c.fee.text)}</b>${dot(GR(c.fee.grade))}</p>` : c.fee?.min ? `<p class="card-price"><span>1박</span><b>${band(c.fee.min)}부터</b>${dot(GR(c.fee.grade))}</p>` : ""}
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
  const d = s.at ? String(s.at).slice(0, 10) : "";
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
function homeView() {
  const openings = S.camps.map((c) => [c, openingOf(c)]).filter(([c, o]) => o && hasPhoto(c)).sort((a, b) => a[1].dd - b[1].dd);
  const usedThemeCovers = new Set();
  const themeItems = THEMES.map(([key, label, test]) => {
    const candidates = S.camps.filter((c) => test(c) && hasPhoto(c)).sort((a, b) => rich(b) - rich(a));
    const cover = candidates.find((c) => !usedThemeCovers.has(String(c.id))) ?? candidates[0];
    if (!cover) return "";
    usedThemeCovers.add(String(cover.id));
    return `<button class="theme-card" type="button" data-theme-all="${key}">${imageTag(photosOf(cover)[0], "", { sizes: "210px" })}<span><b>${esc(label)}</b><i>${fmt(countOf(test))}곳</i></span></button>`;
  }).join("");
  const openingSection = openings.length ? `<section class="opens" aria-labelledby="op-t">
    <div class="sec-head"><h2 id="op-t">곧 <em>오픈</em></h2><button type="button" class="link" data-theme-all="OPEN">전체 보기 ${ic("right")}</button></div>
    <div class="rail opens-rail">${openings.map(([c, o]) => `<a class="open-card" href="#/c/${encodeURIComponent(c.id)}">${imageTag(photosOf(c)[0] ?? "", "", { sizes: "250px" })}<span class="open-dd">${esc(o.txt)}</span><b>${esc(nameOf(c).name)}</b><i>${esc(region(c))} · ${esc(o.platform ?? "")}</i></a>`).join("")}</div>
  </section>` : "";
  const picks = reviewPicks();
  const reviewSection = picks.length ? `<section class="review-picks" aria-labelledby="review-picks-t">
    <div class="sec-head"><div><h2 id="review-picks-t"><em>긍정 후기</em></h2><p class="sec-sub">후기 수 · 긍정 언급</p></div><span class="sec-note">${tip("<b>긍정 후기</b><span>연결된 블로그·카페 후기에서 집계한 주제와 건수입니다. 별점·실시간 인기 순위가 아니며, 원문은 상세에서 바로 열 수 있어요.</span>")}</span></div>
    <div class="rail review-picks-rail">${picks.map(reviewPickCard).join("")}</div>
  </section>` : "";
  const themeSection = themeItems ? `<section class="themes-catalog" aria-labelledby="theme-t">
    <div class="sec-head"><h2 id="theme-t">테마로 <em>고르기</em></h2><button type="button" class="link" data-theme-all="ALL">전체 보기 ${ic("right")}</button></div>
    <div class="rail theme-catalog-rail">${themeItems}</div>
  </section>` : "";
  return `
  <section class="hero" aria-labelledby="hero-t">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="hero-in">
      <h1 id="hero-t"><span class="h1-a">이번 주말,</span> <span class="h1-b"><em>빈자리부터.</em></span></h1>
      <p class="hero-summary">전국 <b>${fmt(S.camps.length)}개</b> 캠핑장 소식 · 현재 오픈 <b>${fmt(openings.length)}개</b></p>
      <div class="finder"><div class="rail chips finder-regions" aria-label="지역">${AREAS.map(([k, l]) => `<button type="button" class="chip" data-area="${k}" aria-pressed="${S.area === k}">${l}</button>`).join("")}</div><form class="finder-form" role="search" data-search>
        <label class="finder-field finder-destination"><small>어디로</small><input type="search" name="q" value="${esc(S.q)}" placeholder="전국 또는 캠핑장명" aria-label="지역 또는 캠핑장명" autocomplete="off" enterkeyhint="search"></label>
        <button class="finder-field finder-static" type="button" data-open="date"><small>언제</small><b data-stay-label>${esc(stayLabel())}</b></button>
        <button class="finder-field finder-static finder-cond" type="button" data-open-cond><small>조건</small><b data-cond-label>${esc(condSummary())}</b></button>
        <button class="finder-go" type="submit">${ic("search")}<span>찾기</span></button>
      </form><div class="rail chips finder-presets" aria-label="자주 찾는 조건">${PRESETS.map(([l], i) => `<button type="button" class="chip" data-preset="${i}" aria-pressed="${presetOn(i)}">${esc(l)}</button>`).join("")}</div></div>
    </div>
  </section>

  ${openingSection}
  ${reviewSection}
  ${themeSection}
  <section class="filter-zone" aria-label="캠핑장 조건 필터">
    <div class="filter-zone-head"><span>${ic("list")}조건으로 찾기</span><i>목록에 바로 반영</i></div>
    <div class="type-filter" aria-label="사이트 타입"><div class="rail type-chips">
      <span class="fee-band-lbl">사이트</span><button type="button" class="chip" data-stype="" aria-pressed="${!S.stype}">전체</button>
      ${STYPES.filter(([k]) => k !== "PITCH" && k !== "PRIVATE_BATH").map(([k, l, i]) => { const n = countOf((c) => hasType(c, k)); return n ? `<button type="button" class="chip type-chip" data-stype="${k}" aria-pressed="${S.stype === k}">${ic(i)}${l} <i>${fmt(n)}</i></button>` : ""; }).join("")}
    </div></div>
    <div class="fee-filter" aria-label="1박 요금대"><div class="rail fee-bands">
      <span class="fee-band-lbl">1박 요금</span><button type="button" class="chip fee-chip" data-fee-band="" aria-pressed="${!S.feeBand}">전체</button>
      <button type="button" class="chip fee-chip" data-fee-band="u3" aria-pressed="${S.feeBand === 'u3'}">~3만원 <i>${fmt(countOf((c) => Boolean(campFeeMin(c) && campFeeMin(c) <= 30000)))}</i></button>
      <button type="button" class="chip fee-chip" data-fee-band="3to5" aria-pressed="${S.feeBand === '3to5'}">3~5만원 <i>${fmt(countOf((c) => { const mn = campFeeMin(c), mx = campFeeMax(c); return Boolean(mn && mn <= 50000 && (mx == null || mx >= 30000)); }))}</i></button>
      <button type="button" class="chip fee-chip" data-fee-band="5to7" aria-pressed="${S.feeBand === '5to7'}">5~7만원 <i>${fmt(countOf((c) => { const mn = campFeeMin(c), mx = campFeeMax(c); return Boolean(mn && mn <= 70000 && (mx == null || mx >= 50000)); }))}</i></button>
      <button type="button" class="chip fee-chip" data-fee-band="o7" aria-pressed="${S.feeBand === 'o7'}">7만원+ <i>${fmt(countOf((c) => { const mn = campFeeMin(c), mx = campFeeMax(c); return Boolean(mn && (mn >= 70000 || (mx && mx >= 70000))); }))}</i></button>
    </div></div>
  </section>
  <section class="results" id="results" aria-labelledby="res-t">
    <div class="res-head">
      <h2 id="res-t" data-res-title></h2>
      <div class="res-tools">
        <div class="rail active-chips" data-active></div>
        <label class="sort">${ic("list")}<select data-sort aria-label="정렬">
          <option value="rich"${S.sort === "rich" ? " selected" : ""}>정보 많은 순</option>
          <option value="name"${S.sort === "name" ? " selected" : ""}>이름순</option>
        </select></label>
      </div>
    </div>
    <div class="trows" data-rows></div>
    <div class="grid" data-grid></div>
    <div class="nophoto" data-nophoto></div>
    <div class="more-wrap"><button class="btn ghost" type="button" data-more>더 보기</button></div>
    <p class="credit">사진: 한국관광공사 고캠핑 · 정보: 각 원문(i)</p>
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
    <div class="trow-head"><h3>${esc(label)} <i>${fmt(all.length)}</i></h3><button type="button" class="link" data-theme-all="${k}">모두 ${ic("right")}</button></div>
    <div class="rail trow-rail">${items.map((c, i) => card(c, first && i < 4 ? i : 9)).join("")}</div>
  </section>`;
}
const themeName = (k) => (k === "ALL" ? "전체" : k === "AVAIL" ? "공식 접수 중" : k === "OPEN" ? "곧 오픈" : THEMES.find((t) => t[0] === k)?.[1] ?? "");
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
    const fbLabel = { u3: "~3만원", "3to5": "3~5만원", "5to7": "5~7만원", o7: "7만원+" }[S.feeBand] ?? S.feeBand;
    act.push(`<button class="chip on" data-clear="feeBand">${esc(fbLabel)} ${ic("close")}</button>`);
  }
  for (const k of S.quick) act.push(`<button class="chip on" data-clear="quick:${k}">${esc(QUICK[k].label)} ${ic("close")}</button>`);
  $("[data-active]").innerHTML = act.join("");
  if (S.stype) act.push(`<button class="chip on" data-clear="stype">${esc(ST[S.stype].label)} ${ic("close")}</button>`);
  $("[data-active]").innerHTML = act.join("");
  const rows = $("[data-rows]"), noph = $("[data-nophoto]");
  // 둘러보기(검색어·테마·사이트 타입 없음): 테마·사이트 타입마다 한 줄씩 가로로 넘기는 줄(소유자 요청). 고르면 격자.
  if (!S.q && !S.theme && !S.stype) {
    $("[data-res-title]").innerHTML = `테마별 <b>캠핑장</b>`;
    const defs = [["AVAIL", "지금 공식 접수 중", (c) => S.avail.has(String(c.id))], ["ALL", "정보 많은 곳", () => true], ...THEMES.slice(0, 3), ["T:HOUSE", "캐빈·방갈로 숙박동", (c) => hasType(c, "HOUSE")], ...THEMES.slice(3, 6), ["T:DECK", "데크 사이트", (c) => hasType(c, "DECK")], ...THEMES.slice(6), ["T:CAR_CAMP", "차박", (c) => hasType(c, "CAR_CAMP")], ["T:PET_SITE", "반려견 전용 사이트", (c) => hasType(c, "PET_SITE")]];
    const used = new Set();
    rows.innerHTML = list.length ? defs.map((dd, i) => themeRow(dd, list, i === 0, used)).join("") : `<div class="empty">${ic("search")}<b>맞는 곳이 없어요</b><button class="btn ghost" data-clear="all">조건 지우기</button></div>`;
    grid.innerHTML = ""; noph.innerHTML = "";
    $("[data-more]").hidden = true;
    initCarousels(rows);
    return;
  }
  rows.innerHTML = "";
  const shown = list.filter(hasPhoto), bare = list.filter((c) => !hasPhoto(c));
  $("[data-res-title]").innerHTML = S.theme ? `${esc(themeName(S.theme))} <b>${fmt(list.length)}</b>곳` : `<b>${fmt(shown.length)}</b>곳을 찾았어요`;
  grid.innerHTML = shown.length ? shown.slice(0, S.shown).map(card).join("") : bare.length ? "" : `<div class="empty">${ic("search")}<b>맞는 곳이 없어요</b><button class="btn ghost" data-clear="all">조건 지우기</button></div>`;
  $("[data-more]").hidden = shown.length <= S.shown;
  noph.innerHTML = S.q && bare.length ? `<h4>사진 없는 곳 ${fmt(bare.length)}</h4><ul>${bare.slice(0, 30).map((c) => `<li><a href="#/c/${encodeURIComponent(c.id)}"><b>${esc(nameOf(c).name)}</b><i>${esc(region(c))}</i></a>${heartBtn(c)}</li>`).join("")}</ul>` : "";
  initCarousels(grid);
}
function moreResults() {
  const list = results().filter(hasPhoto), grid = $("[data-grid]");
  const from = S.shown; S.shown += 24;
  grid.insertAdjacentHTML("beforeend", list.slice(from, S.shown).map((c, i) => card(c, from + i)).join(""));
  $("[data-more]").hidden = list.length <= S.shown;
  initCarousels(grid);
}
// ── 조건 검색(히어로·목록 공통, 소유자 2026-10-19) ─────────────────
// 키워드 대신 조건을 조합한다: 지역 여러 곳 · 시군 주변 반경 · 상품(글램핑·카라반 등, 하나라도) · 반려견 · 전기 W · 사이트 크기 · 장작 · 텐트 옆 주차 · 1박 요금.
// 값을 모르는 곳은 그 조건으로 걸러지지 않는다(“없음”으로 보지 않음) — 조건을 켜면 근거가 있는 곳만 남는다.
const SIDOS = ["서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "대구", "부산", "울산", "제주"];
const maxSide = (c) => (c._ms ??= Math.max(0, ...(c.field_conditions?.site_size?.groups ?? []).map((g) => Math.max(Number(g.width_m) || 0, Number(g.depth_m) || 0))));
const wattsOf = (c) => (c._w ??= facts(c).power?.w ?? 0);
const hasPower = (c) => (c._pw ??= Boolean(facts(c).power?.ok));
const petOk = (c) => (/가능/.test(c.pets ?? "") && !/불가/.test(c.pets ?? "")) || Boolean(c.pf?.t?.includes("PET_OK"));
const dayUse = (c) => (c.types ?? []).includes("캠프닉") || /캠프닉|캠크닉|데이\s*캠핑|당일\s*(캠핑|이용)/.test(`${c.name} ${(c.amenities ?? []).join(" ")} ${c.pf?.s ?? ""}`);
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
  const feeOk = (c, fb) => { const mn = campFeeMin(c), mx = campFeeMax(c); return !fb || (fb === "u3" ? mn && mn <= 30000 : fb === "3to5" ? mn && mn <= 50000 && (mx == null || mx >= 30000) : fb === "5to7" ? mn && mn <= 70000 && (mx == null || mx >= 50000) : mn && (mn >= 70000 || (mx && mx >= 70000))); };
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
      <section><h3>1박 요금</h3><div class="cond-chips">${[["u3", "~3만원"], ["3to5", "3~5만원"], ["5to7", "5~7만원"], ["o7", "7만원+"]].map(([v, l]) => chip("fee", v, l, S.feeDraft === v, count("fee", (c) => feeOk(c, v)))).join("")}</div></section>
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
  // 조건이 근거로 맞는 곳 → 법령 기준으로 맞는 곳 → 정보 없어 확인 필요한 곳 순, 그 안에서 날짜·정보량
  else shown.sort((a, b) => (a.ce?.unknown ?? 0) - (b.ce?.unknown ?? 0) || (a.ce?.ref ?? 0) - (b.ce?.ref ?? 0) || (a.st?.rank ?? 5) - (b.st?.rank ?? 5) || rich(b.c) - rich(a.c));
  return { shown, closed: list.length - list.filter((x) => x.st?.k !== "closed").length };
}
// 등록 규격 중 가장 큰 사이트(가로×세로). 조건 검색의 ‘사이트 크기’와 같은 값.
function siteSizeText(c) {
  const gs = (c.field_conditions?.site_size?.groups ?? []).filter((g) => g.width_m && g.depth_m);
  if (!gs.length) return "";
  const big = gs.reduce((a, g) => (Math.max(g.width_m, g.depth_m) > Math.max(a.width_m, a.depth_m) ? g : a));
  return `사이트 최대 ${big.width_m}×${big.depth_m}m`;
}
function listFact(label, value, g) {
  return `<div class="lf${value ? "" : " none"}"><dt>${label}</dt><dd>${value ? `${esc(value)}${dot(g)}` : "–"}</dd></div>`;
}
// 켜진 조건이 이 캠핑장에서 어떻게 맞는지: ✓ 근거 · 법정 기준 · 확인 필요
function condLine(c, ce) {
  if (!ce || !Object.keys(ce.st).length) return "";
  const txt = { kind: () => S.cond.kind.map((x) => KIND[x]?.label).join("·"), pet: () => "반려견", w: () => (S.cond.w === 1 ? "전기" : `전기 ${fmt(S.cond.w)}W+`), size: () => `사이트 ${S.cond.size}m+`, fire: () => "장작", park: () => "텐트 옆 주차" };
  return `<p class="lrow-cond">${Object.entries(ce.st).map(([k, v]) => `<span class="cs cs-${v === "?" ? "unk" : v}">${v === "y" ? ic("check") : ""}${esc(txt[k]())}${v === "ref" ? " · 법정 기준 600W" : v === "?" ? " · 확인 필요" : ""}</span>`).join("")}</p>`;
}
function listRow({ c, st, ce }, i = 0) {
  const f = facts(c), { tag } = nameOf(c), ti = c.ti ?? {}, r = reviewMeta(c), main = bookingChannels(c)[0];
  const fee = c.fee?.text ? c.fee.text : c.fee?.min ? `${band(c.fee.min)}부터` : null;
  const href = `#/c/${encodeURIComponent(c.id)}`;
  return `<article class="lrow" data-id="${esc(c.id)}">
    <a class="lrow-media" href="${href}" tabindex="-1" aria-hidden="true">${campThumb(c, { sizes: "(max-width: 759px) 132px, 300px" })}<span class="bdgs">${badges(c, 2)}</span></a>
    <div class="lrow-body">
      <div class="lrow-top">
        <div class="lrow-title"><p class="lrow-meta">${esc(region(c))}${tag ? ` · ${esc(tag)}` : ""}</p><h3><a href="${href}">${esc(nameOf(c).name)}</a></h3></div>
        ${heartBtn(c)}
      </div>
      ${st ? `<p class="lrow-date st-${st.k}">${ic(st.icon)}<b>${esc(st.txt)}</b><i>${esc(st.sub)}</i></p>` : ""}
      ${condLine(c, ce)}
      <dl class="lrow-facts">
        ${listFact("1박", fee, GR(c.fee?.grade))}
        ${listFact("입실", ti.i?.[0], ti.i?.[1])}
        ${listFact("퇴실", ti.o?.[0], ti.o?.[1])}
        ${listFact("매너타임", ti.m?.[0] ? `${ti.m[0]}부터` : null, ti.m?.[1])}
        ${listFact("전기", f.power?.v, f.power?.g)}
        ${listFact("주차", f.park?.v, f.park?.g)}
        ${listFact("장작", f.fire?.v, f.fire?.g)}
        ${listFact("반려견", f.pet?.v, f.pet?.g)}
      </dl>
      ${c.st?.length || typeLine(c) || siteSizeText(c) ? `<p class="lrow-line">${ic("tent")}<span>${esc([c.st?.length ? typeLine2(c) : typeLine(c), siteSizeText(c)].filter(Boolean).join(" · "))}</span></p>` : ""}
      ${nearLine(c) ? `<p class="lrow-line">${ic("store")}<span>${esc(nearLine(c))}</span></p>` : ""}
      ${r.total ? `<p class="lrow-line lrow-review">${ic("heart")}<span>후기 ${fmt(r.total)}건</span>${reviewTopics(r.rv.p, "good", "heart")}${reviewTopics(r.rv.c, "watch", "down")}</p>` : ""}
      <div class="lrow-cta">
        ${st?.url ? `<a class="btn primary" href="${esc(st.url)}" target="_blank" rel="noopener">공식 접수 보기</a>` : main ? `<a class="btn primary" href="${esc(main.url)}" target="_blank" rel="noopener" title="${esc(bookingLabel(main))}"><span>날짜 확인 · ${esc(bookingLabel(main))}</span></a>` : c.tel ? `<a class="btn primary" href="tel:${esc(c.tel)}">${ic("phone")}전화 문의</a>` : ""}
        <a class="btn ghost" href="${href}">자세히</a>
      </div>
    </div>
  </article>`;
}
function listView() {
  const p = listParams();
  S.area = p.cond.sido.length ? "all" : p.area; S.q = p.q; if (p.d) S.stay = p.d;
  S.cond = p.cond; if (["u3", "3to5", "5to7", "o7", ""].includes(p.fee)) S.feeBand = p.fee;
  S.condStrict = new URLSearchParams(location.hash.split("?")[1] ?? "").get("strict") === "1";
  // 목록 화면에 보이지 않는 조건(홈의 테마·사이트 타입·빠른 조건)은 적용하지 않는다 — 보이는 조건만 결과를 바꾼다.
  S.theme = null; S.stype = null; S.quick.clear();
  const areaLabel = S.cond.near ? `${S.cond._ctr?.label ?? S.cond.near} 주변` : S.cond.sido.length ? S.cond.sido.join("·") : AREAS.find(([k]) => k === S.area)?.[1] ?? "전국";
  const feeChip = (k, l) => `<button type="button" class="chip fee-chip" data-fee-band="${k}" aria-pressed="${(S.feeBand ?? "") === k}">${l}</button>`;
  const dateTip = tip("<b>날짜로 보기</b><span>날짜별 빈자리는 각 예약처만 알고 있어 여기서 확정하지 않아요. 공식 접수 중(그날이 이용 기간에 포함된 공공 예약), 예약 오픈 예정, 운영 기간(고캠핑·운영자 안내의 운영 계절)만 판단하고, 운영 기간 밖인 곳은 기본으로 뺍니다. 예약 가능 여부는 각 행의 예약처에서 확인하세요.</span>", "날짜 판단 기준");
  return `<section class="list-page" aria-labelledby="list-t">
    <div class="list-head">
      <a class="link list-back" href="#/">${ic("left")}처음으로</a>
      <h1 id="list-t"><span data-list-area>${esc(areaLabel)}</span> 캠핑장 <b data-list-count></b></h1>
      <form class="list-search" role="search" data-list-search>
        <label class="finder-field"><small>어디로</small><input type="search" name="q" value="${esc(S.q)}" placeholder="전국 또는 캠핑장명" aria-label="지역 또는 캠핑장명" autocomplete="off" enterkeyhint="search"></label>
        <button class="finder-field finder-static" type="button" data-open="date"><small>언제</small><b data-stay-label>${esc(stayLabel())}</b></button>
        <button class="finder-go" type="submit">${ic("search")}<span>찾기</span></button>
      </form>
      <div class="rail chips" aria-label="지역">${AREAS.map(([k, l]) => `<button type="button" class="chip" data-list-area-k="${k}" aria-pressed="${S.area === k && !S.cond.sido.length}">${l}</button>`).join("")}</div>
      <div class="rail chips cond-active" aria-label="조건"><button type="button" class="chip cond-open" data-open-cond>${ic("list")}조건${condActive() ? ` <i>${condActive()}</i>` : ""}</button>${condChips().map(([key, l]) => `<button type="button" class="chip on" data-cond-x="${esc(key)}">${esc(l)} ${ic("close")}</button>`).join("")}${condActive() ? `<button type="button" class="chip" data-strict aria-pressed="${Boolean(S.condStrict)}">확인된 곳만</button>` : ""}</div>
      <div class="rail chips fee-bands" aria-label="1박 요금대"><span class="fee-band-lbl">1박 요금</span>${feeChip("", "전체")}${feeChip("u3", "~3만원")}${feeChip("3to5", "3~5만원")}${feeChip("5to7", "5~7만원")}${feeChip("o7", "7만원+")}</div>
      <div class="list-tools">
        <p class="list-date-note" data-list-note></p>
        <label class="sort">${ic("list")}<select data-list-sort aria-label="정렬">
          <option value="date"${(S.listSort ?? "date") === "date" ? " selected" : ""}>${S.stay ? "날짜 맞는 순" : "정보 많은 순"}</option>
          <option value="fee"${S.listSort === "fee" ? " selected" : ""}>요금 낮은 순</option>
          <option value="name"${S.listSort === "name" ? " selected" : ""}>이름순</option>
        </select></label>
      </div>
      <p class="list-explain">${S.stay ? `<b>${esc(stayLabel())}</b> 기준 · 빈자리는 예약처에서 확인 ${dateTip}` : "날짜를 고르면 운영 기간 밖인 곳을 빼고, 공식 접수 중·오픈 예정인 곳을 먼저 보여 줘요."}</p>
    </div>
    <div class="lrows" data-lrows></div>
    <div class="more-wrap"><button class="btn ghost" type="button" data-list-more>더 보기</button></div>
    <p class="credit">사진: 한국관광공사 고캠핑 · 정보: 각 원문(i)</p>
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
  cleanup.push(() => { io.disconnect(); v.removeEventListener("submit", onSubmit); v.removeEventListener("click", onClick); v.removeEventListener("change", onChange); });
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
    if (!k.startsWith("T:")) { S.theme = k; if (location.hash !== "#/themes") location.hash = "#/themes"; else render(); return; }
    S.stype = k.slice(2);
    render(); $("#results").scrollIntoView({ block: "start" }); return;
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
async function detailOf(id) {
  if (S.detailCache.has(id)) return S.detailCache.get(id);
  const d = await fetch(`${DATA}camps/${encodeURIComponent(id)}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  S.detailCache.set(id, d);
  return d;
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
    ["요금", profFact(PF(d, "PRICE")) ?? (c.fee ? { v: c.fee.text || (c.fee.min ? `${band(c.fee.min)}부터` : null), g: GR(c.fee.grade) || "c", src: { label: c.fee.basis, url: c.fee.url, at: c.fee.checked_at } } : null), "won"],
    ["추가 요금", profFact(PF(d, "EXTRA_FEE")) ?? specFact(d, "EXTRA_PERSON_FEE"), "won"],
    ["환불", profFact(PF(d, "REFUND")) ?? specFact(d, "REFUND_POLICY"), "calc"],
    ["운영", profFact(PF(d, "SEASON")) ?? ((c.seasons ?? []).length ? { v: (c.seasons ?? []).length === 4 ? "사계절 운영" : `${(c.seasons ?? []).join("·")} 운영`, g: "c", src: { label: "고캠핑 등록 운영 기간", url: c.gc_url } } : null), "calendar"],
    ["반려동물", f.pet ?? profFact(PF(d, "PET")) ?? specFact(d, "PET_POLICY"), "paw"],
    ["대여", (d?.field_conditions ?? c.field_conditions)?.rental_offers?.length ? { v: (d?.field_conditions ?? c.field_conditions).rental_offers.map((r) => r.item).slice(0, 5).join(" · "), g: "c", src: srcOf(c.field_conditions) } : (specFact(d, "RENTAL") ?? null), "cart"],
  ];
}
function sitePricingHtml(c, d) {
  const feeInfo = c.fee;
  const groups = c.field_conditions?.site_size?.groups ?? [];
  const prods = d?.products ?? [];
  if (!feeInfo && !groups.length && !prods.length) return "";
  const feeFact = feeInfo ? { g: GR(feeInfo.grade) || "m", src: { label: sourceName(feeInfo.basis, "요금 근거"), url: feeInfo.url, at: feeInfo.checked_at, quote: feeInfo.quote } } : null;
  const prodFact = (p) => ({ g: "c", src: { label: d?.products_src?.label || "한국관광공사 상품 등록 기준가", url: d?.products_src?.url || c.gc_url, at: d?.products_src?.checked_at, quote: p.name ? `${p.name} ${p.price ? `${fmt(p.price)}원` : ""}` : null } });
  let rows = "";
  if (prods.length) {
    rows = prods.map((p, i) => {
      const tip = srcTip(prodFact(p), p.name || `사이트 ${i + 1} 요금`);
      return `<tr><td><b>${esc(serviceText(p.name, 26) || `사이트 ${i + 1}`)}</b></td><td>${esc(serviceText(p.size, 20) || "-")}</td><td>${esc(p.base ? `기준 ${serviceText(p.base, 16)}인` : "-")}</td><td class="text-price"><div class="price-cell"><span class="price-val">${p.price ? fmt(p.price) + "원" : "예약처 확인"}</span>${tip}</div></td></tr>`;
    }).join("");
  } else if (groups.length) {
    rows = groups.map((g) => {
      const tip = feeFact ? srcTip(feeFact, g.name || "요금") : "";
      return `<tr><td><b>${esc(g.name || "일반 사이트")}</b></td><td>${g.width_m && g.depth_m ? `${g.width_m}×${g.depth_m}m` : "-"}</td><td>${g.count ? `${g.count}면` : "-"}</td><td class="text-price"><div class="price-cell"><span class="price-val">${feeInfo?.text ? esc(feeInfo.text) : (feeInfo?.min ? `${band(feeInfo.min)}대` : "예약처 확인")}</span>${tip}</div></td></tr>`;
    }).join("");
  } else if (feeInfo) {
    const tip = feeFact ? srcTip(feeFact, "1박 기준 요금") : "";
    rows = `<tr><td><b>1박 기준 요금</b></td><td>-</td><td>-</td><td class="text-price"><div class="price-cell"><span class="price-val">${feeInfo.text ? esc(feeInfo.text) : (feeInfo.min ? `${band(feeInfo.min)}부터` : "-")}</span>${tip}</div></td></tr>`;
  }
  return `<section class="d-sec">
    <div class="sec-head">${iconTitle("layers", "사이트 규격 및 1박 요금")}${feeFact ? `<span class="sec-note">기준 요금 ${srcTip(feeFact, "요금 근거")}</span>` : ""}</div>
    <div class="table-wrap"><table class="site-table"><thead><tr><th>구분</th><th>규격</th><th>규모</th><th>1박 요금</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}
function specTiles(c, d) {
  const f = facts(c);
  // 고캠핑·운영자 값이 없으면 후기·게시글 언급(MENTION)으로 채운다 — 주차 방식·전기 용량·반려동물
  const mention = {
    park: specFact(d, "PARKING"),
    power: specFact(d, "POWER_W"),
    pet: specFact(d, "PET_POLICY"),
  };
  const T = [["size", "size", "설치 공간", ""], ["park", "car", "텐트 옆 주차", "cobalt"], ["power", "bolt", "전기", "volt"], ["fire", "flame", "장작·숯", "flame"], ["ground", "layers", "바닥", ""], ["shelter", "tent", "텐트·타프", ""], ["sanitary", "drop", "위생", ""], ["hot", "drop", "온수", ""], ["pet", "paw", "반려동물", ""]];
  return T.map(([k, i, l, cls]) => {
    let x = f[k] ?? mention[k] ?? null;
    if (k === "power" && f.power?.v === "있음" && mention.power?.v) x = mention.power;
    const on = x && cls && x.ok !== false && !(k === "fire" && x.kind === "NO_FIRE");
    return `<div class="tile${x ? "" : " unk"} ${on ? `t-${cls}` : ""}"><span class="tile-ic">${ic(i)}</span><span class="tile-l">${l}</span><b class="tile-v">${x ? `${esc(detailValue(x))}${asOfMention(x)}` : "확인필요"}</b>${x ? `<span class="tile-g">${dot(x.g)}${srcTip(x, l)}</span>` : ""}</div>`;
  }).join("");
}
const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);
// 생활·안전·관광을 한 섹션으로 묶는다. 관광 사진은 한국관광공사 원본 URL이 있는 항목만 직접 보인다.
function nearbyHubHtml(c, d) {
  const nearby = d?.nearby ?? {}, licensed = d?.nearby_licensed ?? {};
  const labels = {
    CONVENIENCE: ["편의점", "store"], MART: ["마트", "cart"], BUTCHER: ["정육", "meat"], FUEL: ["주유", "fuel"],
    PHARMACY: ["약국", "cross"], HOSPITAL: ["병원", "cross"], VET: ["동물병원", "paw"],
    DROWSY_SHELTER: ["졸음쉼터", "route"], REST_AREA: ["휴게소", "route"], TOILET: ["공중화장실", "drop"],
    TOUR: ["관광", "pin"], FOOD: ["맛집", "meat"],
    OTC_MEDICINE: ["상비약", "cross"], GAS_STATION: ["주유", "fuel"], ANIMAL_HOSPITAL: ["동물병원", "paw"],
  };
  const entry = (type, x = {}) => {
    const name = x.name ?? x.n;
    const m = Number(x.m);
    return name && Number.isFinite(m) ? { type, name, m, lat: x.lat, lng: x.lng, url: x.u, image: x.img } : null;
  };
  const first = (type, rows) => (rows.map((x) => entry(type, x)).filter(Boolean).sort((a, b) => a.m - b.m)[0] ?? null);
  // 상비약 판매처는 보통 같은 편의점이다. 이름이 같으면 한 칸으로 줄인다.
  const licensedRows = Object.entries(licensed).map(([type, x]) => entry(type, x)).filter(Boolean)
    .filter((x, _, all) => x.type !== "OTC_MEDICINE" || !all.some((y) => y.type === "CONVENIENCE" && y.name === x.name));
  const local = [
    ...licensedRows,
    first("CONVENIENCE", nearby.conv ?? []), first("MART", nearby.mart ?? []), first("FUEL", nearby.fuel ?? []), first("BUTCHER", (nearby.mart ?? []).filter((x) => /정육|바베큐/.test(x.k ?? ""))),
  ].filter(Boolean);
  const safety = [
    first("PHARMACY", (nearby.medical ?? []).filter((x) => /약국|pharmacy|의약/.test(x.k ?? x.n ?? ""))),
    first("HOSPITAL", (nearby.medical ?? []).filter((x) => /병원|의료원|hospital/.test(x.k ?? x.n ?? ""))),
    first("VET", nearby.vet ?? []), first("DROWSY_SHELTER", (nearby.rest ?? []).filter((x) => x.k === "DROWSY_SHELTER")), first("REST_AREA", (nearby.rest ?? []).filter((x) => x.k === "REST_AREA")),
  ].filter(Boolean);
  const toilet = c.nearby_toilets ?? {};
  if (Number(toilet.within_500m) || Number(toilet.within_2km)) safety.push({ type: "TOILET", name: `500m ${Number(toilet.within_500m) || 0}곳 · 2km ${Number(toilet.within_2km) || 0}곳`, m: Number(toilet.within_500m) ? 500 : 2000, summary: true });
  const leisure = [...(nearby.tour ?? []).slice(0, 4).map((x) => entry("TOUR", x)), ...(nearby.food ?? []).slice(0, 4).map((x) => entry("FOOD", x))].filter(Boolean);
  const unique = (rows) => [...new Map(rows.map((x) => [`${x.type}:${x.name.replace(/\s+/g, "")}`, x])).values()].slice(0, 5);
  const groups = [["생활", "store", unique(local)], ["안전 · 이동", "route", unique(safety)], ["관광 · 맛집", "pin", unique(leisure)]]
    .filter(([, , rows]) => rows.length);
  if (!groups.length) return "";
  const isOfficialTourImage = (u) => /^https:\/\/(?:[\w-]+\.)?(?:visitkorea\.or\.kr|kto\.or\.kr)\//i.test(String(u ?? ""));
  const card = (x) => {
    const [label, icon] = labels[x.type] ?? [x.type, "pin"];
    const map = x.lat && x.lng ? `https://map.kakao.com/link/map/${encodeURIComponent(x.name)},${x.lat},${x.lng}` : x.url;
    const road = x.lat && x.lng ? `https://map.kakao.com/link/roadview/${x.lat},${x.lng}` : "";
    return `<article class="nearby-place${x.image && isOfficialTourImage(x.image) ? " has-image" : ""}">
      ${x.image && isOfficialTourImage(x.image) ? `<img src="${esc(x.image)}" alt="" loading="lazy" decoding="async">` : `<span class="nearby-place-icon">${ic(icon)}</span>`}
      <span class="nearby-place-copy"><i>${label} · ${x.summary ? "공공데이터" : km(x.m)}</i><b>${esc(x.name)}</b></span>
      <span class="nearby-place-actions">${map ? `<a href="${esc(map)}" target="_blank" rel="noopener" aria-label="${esc(x.name)} 지도">${ic("map")}</a>` : ""}${road ? `<a href="${esc(road)}" target="_blank" rel="noopener" aria-label="${esc(x.name)} 로드뷰">${ic("search")}</a>` : ""}</span>
    </article>`;
  };
  return `<section class="d-sec nearby-hub"><div class="sec-head">${iconTitle("route", "주변")}<span class="sec-note">직선거리 ${tip("<b>주변 정보</b><span>생활·안전 시설은 인허가·공공 데이터, 관광·맛집은 한국관광공사 데이터로 연결합니다. 운영 시간과 영업 여부는 원문에서 다시 확인하세요.</span>")}</span></div><div class="nearby-groups">${groups.map(([title, icon, rows]) => `<section class="nearby-group"><h3>${ic(icon)}${title}</h3><div class="nearby-places">${rows.map(card).join("")}</div></section>`).join("")}</div></section>`;
}
function reviewHtml(d, c) {
  const rv = d?.rv ?? c?.rv;
  const total = rv?.n ?? 0;
  if (!rv || (!rv.p?.length && !rv.c?.length)) return "";
  const fact = { g: "m", src: { label: "블로그·카페 방문자 후기 빅데이터 분석", url: c?.gc_url || "https://www.gocamping.or.kr/" } };
  const block = (label, rows, cls, icon) => rows?.length ? `<div class="review-block ${cls}"><span>${ic(icon)}${label}</span><div>${rows.map(([topic, count]) => `<b>${esc(topic)} <i>${count}</i></b>`).join("")}</div></div>` : "";
  return `<section class="d-sec review-summary"><div class="sec-head">${iconTitle("thumb-up", "캠퍼 평가 · 장점 & 아쉬운 점")}<span class="sec-note">후기 ${fmt(total)}건 분석 ${srcTip(fact, "후기 장단점 분석")}</span></div><div class="review-summary-grid">${block("캠퍼들이 꼽은 장점", rv.p, "pro", "thumb-up")}${block("방문 전 미리 볼 점", rv.c, "con", "alert")}</div></section>`;
}
function bookingRank(channel) {
  const hay = `${channel?.platform_id ?? ""} ${channel?.platform_name ?? ""} ${channel?.url ?? ""}`.toLowerCase();
  if (/campit|캠핏/.test(hay)) return 0;
  // 네이버 카페·블로그는 운영자 페이지일 수 있으므로, 네이버 예약 경로만 2순위로 본다.
  if (/booking\.naver\.com|m\.booking\.naver\.com|naver\.me|naver[_ -]?reservation|네이버\s*예약/.test(hay)) return 1;
  if (/thank.?camp|땡큐/.test(hay)) return 2;
  if (channel?.kind === "online") return 3;
  if (channel?.kind === "homepage") return 4;
  if (channel?.kind === "phone") return 5;
  return 10;
}
function bookingChannels(c) {
  return [...(c.booking?.channels ?? [])]
    .filter((x) => x?.url)
    .sort((a, b) => bookingRank(a) - bookingRank(b) || Number(b.confidence ?? 0) - Number(a.confidence ?? 0));
}
function bookingLabel(channel) {
  const hay = `${channel?.platform_id ?? ""} ${channel?.platform_name ?? ""} ${channel?.url ?? ""}`.toLowerCase();
  if (/campit|캠핏/.test(hay)) return "캠핏";
  if (/booking\.naver\.com|m\.booking\.naver\.com|naver\.me|naver[_ -]?reservation|네이버\s*예약/.test(hay)) return "네이버 예약";
  if (/thank.?camp|땡큐/.test(hay)) return "땡큐캠핑";
  if (channel?.kind === "homepage") return "홈페이지";
  return serviceText(channel?.platform_name, 20) || "온라인 예약";
}
// 한 캠핑장에는 하나의 대표 예약 동선만 쓴다.
// 캠핏 → 네이버 예약 → 땡큐캠핑 → 기타 온라인 → 운영자 홈페이지 순이며,
// 전화·현장 접수는 보조 문의 수단으로만 남긴다.
function primaryBooking(c) {
  return bookingChannels(c).find((x) => x.kind === "online" || x.kind === "homepage") ?? null;
}
function bookingSource(channel, label = "대표 예약 채널") {
  const evidence = Array.isArray(channel?.evidence) ? channel.evidence.join(" · ") : "";
  return sourceFact({
    g: "c",
    src: { label: "등록된 예약 경로", url: channel?.url, quote: [bookingLabel(channel), evidence].filter(Boolean).join("\n") },
  }, label);
}
function reserveCard(c) {
  const main = primaryBooking(c);
  const o = openingOf(c) ?? (S.openings.get(String(c.id)) ?? null);
  return `<div class="reserve">
    <div class="rs-top"><span>${esc(main ? bookingLabel(main) : "예약")}</span>${o ? `<span class="rs-dd">${esc(o.txt ?? o.kind)}</span>` : ""}</div>
    ${o ? `<p class="rs-open"><b>${esc(new Date(o.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }))}</b><span>${esc(o.label ?? "")}</span></p>` : ""}
    ${availHtml(c)}
    <div class="rs-btns">
      ${main ? `<a class="btn primary wide" href="${esc(main.url)}" target="_blank" rel="noopener">${esc(bookingLabel(main))} 예약</a>` : c.gc_url ? `<a class="btn primary wide" href="${esc(c.gc_url)}" target="_blank" rel="noopener">고캠핑에서 보기</a>` : ""}
      ${c.tel ? `<a class="btn ghost" href="tel:${esc(c.tel)}">${ic("phone")}전화</a>` : ""}
      ${heartBtn(c, { label: true })}
    </div>
  </div>`;
}
function galleryHtml(c) {
  const ph = photosOf(c);
  if (!ph.length) return "";
  const alt = esc(nameOf(c).name);
  const grid = `<div class="gal-grid n${Math.min(ph.length, 5)}">${ph.slice(0, 5).map((u, i) => `<button type="button" class="gal-cell" data-gal="${i}">${imageTag(u, i ? "" : alt, { eager: !i, sizes: "(max-width: 759px) 100vw, 65vw" })}</button>`).join("")}</div>`;
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
      <p class="d-eyebrow">${esc(region(c))}${c.op && OP[c.op] ? ` · ${OP[c.op]}` : tag ? ` · ${esc(tag)}` : ""}${!c.st?.length && typeLine(c) ? ` · ${esc(typeLine(c))}` : ""}</p>
      <h1 class="d-title">${titleHtml(c)}</h1>
      ${c.line ? `<p class="d-line">${esc(serviceText(c.line, 84))}${c.gc_url ? srcTip({ g: "c", src: { label: "고캠핑 소개", url: c.gc_url, quote: c.line } }, "한 줄 소개") : ""}</p>` : ""}
      <div class="d-bdgs">${badges(c, 5)}</div>
    </header>
    ${galleryHtml(c)}
    <div class="d-sum">
      <div><span>확인된 규격</span><b>${known}<i>/${spec.length}</i></b></div>
      <div><span>${ic("file-text")}후기</span><b>${c.rv?.n ? fmt(c.rv.n) : "–"}</b></div>
      <div><span>다음 오픈</span><b class="${o ? "hot" : "muted"}">${o ? esc(o.txt) : "–"}</b></div>
    </div>
    <div class="d-body">
      <div class="d-main">
        ${siteTypesHtml(c, d)}
        <section class="d-sec"><div class="sec-head">${iconTitle("info", "기본 규격")}<span class="sec-note legend">${dot("v")}원문 ${dot("c")}공식 ${dot("m")}언급</span></div><div class="tiles">${specTiles(c, d)}</div></section>
        ${sitePricingHtml(c, d)}
        ${priceMentionsHtml(d)}
        <section class="d-sec"><div class="sec-head">${iconTitle("info", "이용 정보")}</div><dl class="uses">${us.map(([l, x, icon]) => `<div class="use${x ? "" : " unk"}"><dt>${icon ? ic(icon) : ""}${l}</dt><dd><span class="use-val">${x ? `${esc(detailValue(x))}${asOfMention(x)}` : "확인필요"}</span>${x ? `<span class="use-meta">${dot(x.g)}${srcTip(x, l)}</span>` : ""}</dd></div>`).join("")}</dl></section>
        <section class="d-sec" data-cond hidden></section>
        ${reviewHtml(d, c)}
        ${operatorHtml(d)}
        ${bookingHtml(c, d)}
        ${amenityHtml(c)}
        ${introHtml(d)}
        ${programsHtml(d)}
        ${layoutHtml(d)}
        ${snsHtml(d, c)}
        ${videosHtml(d)}
        ${platformHubHtml(d, c)}
        ${nearbyHubHtml(c, d)}
        ${reviewLinksHtml(d, c)}
        ${infoHtml(c)}
        ${commentsHtml(c)}
      </div>
      <aside class="d-side">${reserveCard(c, d)}</aside>
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
  return `<section class="d-sec intro-sec"><div class="sec-head">${iconTitle("spark", "업장 소개")}<span class="sec-note">고캠핑 소개 ${srcTip(fact, "업장 소개")}</span></div><details class="intro"><summary><p class="intro-copy">${esc(t)}</p></summary></details></section>`;
}
function amenityIcon(x) {
  const s = String(x ?? "");
  if (/인터넷|와이파이|wifi/i.test(s)) return ic("broadcast");
  if (/화장실/i.test(s)) return ic("poo");
  if (/샤워/i.test(s)) return ic("bath");
  if (/개수대/i.test(s)) return ic("fountain");
  if (/전기/i.test(s)) return ic("bolt");
  if (/장작|화로|바비큐/i.test(s)) return ic("flame");
  if (/온수/i.test(s)) return ic("drop");
  if (/마트|매점/i.test(s)) return ic("store");
  if (/물놀이|수영/i.test(s)) return ic("fountain");
  return "";
}
function amenityHtml(c) {
  const a = (c.amenities ?? []).map((x) => x.replace(".", "·"));
  const cnt = [["화장실", c.toilets, "poo"], ["샤워실", c.showers, "bath"], ["개수대", c.sinks, "fountain"]].filter(([, n]) => n > 0);
  const rent = c.rental ?? [];
  const pt = c.nearby_toilets?.within_2km;
  if (!a.length && !cnt.length && !rent.length) return "";
  return `<section class="d-sec"><div class="sec-head">${iconTitle("drop", "편의시설")}<span class="sec-note">고캠핑 등록 ${srcTip({ g: "c", src: { label: "고캠핑 등록 편의시설", url: c.gc_url } }, "편의시설")}</span></div>
    ${cnt.length ? `<div class="amen-n">${cnt.map(([l, n, icon]) => `<div><b>${ic(icon)} ${fmt(n)}</b><span>${l}</span></div>`).join("")}${pt ? `<div><b>${ic("poo")} ${fmt(pt)}</b><span>2km 안 공중화장실 ${tip("<b>공중화장실</b><span>행정안전부 공중화장실 표준데이터 기준, 캠핑장 2km 안 개수입니다.</span>")}</span></div>` : ""}</div>` : ""}
    ${a.length ? `<div class="amen">${a.map((x) => `<span>${amenityIcon(x)}${esc(x)}</span>`).join("")}</div>` : ""}
    ${rent.length ? `<p class="amen-rent"><b>${ic("cart")}대여</b>${rent.map((x) => `<span>${esc(x)}</span>`).join("")}</p>` : ""}
  </section>`;
}
// 블로그 후기에 언급된 1박 요금(MENTION). 원문 링크와 문장을 그대로 남긴다.
const DAY = { weekday: "평일", weekend: "주말", holiday: "공휴일" };
function priceMentionsHtml(d) {
  const ps = (d?.prices ?? []).filter((p) => p.won).slice(0, 6);
  if (!ps.length) return "";
  return `<section class="d-sec"><div class="sec-head">${iconTitle("info", "요금 언급")}<span class="sec-note">${dot("m")}후기 기준 · 예약처 확인</span></div><ul class="plist">${ps.map((p, i) => {
    const context = [serviceText(p.label, 22), DAY[p.day], serviceText(p.season, 14)].filter(Boolean).join(" · ") || "1박 기준";
    const evidence = sourceFact(p, "후기 원문", p.quote);
    return `<li><b>${fmt(p.won)}원</b><span>${esc(context)}</span>${asOf(p.date)}${srcTip(evidence, `요금 언급 ${i + 1}`)}</li>`;
  }).join("")}</ul></section>`;
}
// 운영자 원문은 말투·질문·반복이 섞여 있으므로, 예약에 필요한 항목으로 묶어 읽기 좋게 정리한다.
// 값 자체는 바꾸지 않고 같은 항목의 짧은 원문만 합치며, 전체 원문은 작은 (i)에서 다시 열 수 있다.
const OPERATOR_CATEGORIES = [
  ["입·퇴실", /입실|퇴실|얼리.?체크/], ["요금 · 환불", /요금|할인|환불|취소|수수료|\d+원/],
  ["주차", /주차|차량|견인|차박/], ["전기", /전기|리드선|차단/], ["불멍 · 화로", /화로|장작|숯|불씨|화재/],
  ["반려동물", /반려동물|반려견|마리/], ["시설", /온수|화장실|휴게실|산책로|편의시설/],
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
  if (label === "요금 · 환불") {
    const prices = [...scan.matchAll(/(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?(?:만|천)?)\s*원/g)].map((x) => x[0].replace(/\s+/g, ""));
    if (prices.length) return [...new Set(prices)].slice(0, 2).join(" · ");
    if (/환불|취소/.test(text)) return "취소·환불 규정 확인";
    return "이용 요금 확인";
  }
  if (label === "주차") return /텐트.?옆|사이트.?옆/.test(text) ? "사이트 옆 주차 안내" : /외부|공용/.test(text) ? "외부 주차 안내" : "주차 방법 확인";
  if (label === "전기") {
    const watts = matches(/\d+(?:\.\d+)?\s*(?:kW|W)/gi);
    if (watts[0]) return watts[0];
    return /없음|불가/.test(text) ? "전기 이용 불가" : "전기 이용 안내";
  }
  if (label === "불멍 · 화로") return /장작/.test(text) ? "장작 이용 안내" : /숯/.test(text) ? "숯 이용 안내" : /불가|금지/.test(text) ? "화기 이용 불가" : "화기 이용 안내";
  if (label === "반려동물") return /불가|금지/.test(text) ? "반려동물 동반 불가" : "반려동물 동반 안내";
  if (label === "시설") return "시설 이용 안내";
  if (label === "사이트 이용") return "사이트 이용 안내";
  return "운영 규정 확인";
}
function operatorHtml(d) {
  const used = new Set(), grouped = new Map();
  for (const raw of d?.operator_snippets ?? []) {
    const x = typeof raw === "string" ? { text: raw } : raw;
    const text = compactOperatorText(x.text);
    if (text.length < 14 || used.has(text) || /^(캠핑 이용요금|예약 취소|이용요금 환불기준|.+가능한가요)\??$/.test(text)) continue;
    used.add(text);
    const label = OPERATOR_CATEGORIES.find(([, re]) => re.test(text))?.[0] ?? "운영 안내";
    const row = grouped.get(label) ?? { label, texts: [], url: x.url, src: x.src, at: x.date, image: null };
    if (x.image && !row.image) row.image = x.image;
    if (row.texts.length < 3 && !row.texts.some((t) => t.includes(text) || text.includes(t))) row.texts.push(text);
    if (!row.url && x.url) row.url = x.url;
    grouped.set(label, row);
  }
  const order = new Map(OPERATOR_CATEGORIES.map(([label], i) => [label, i]));
  const rows = [...grouped.values()].filter((x) => x.texts.length).sort((a, b) => (order.get(a.label) ?? 99) - (order.get(b.label) ?? 99)).slice(0, 8);
  if (!rows.length) return "";
  return `<section class="d-sec operator-sec"><div class="sec-head">${iconTitle("report", "운영자 안내 · 공지사항")}<span class="sec-note">${dot("c")}항목별 정리</span></div><div class="operator-grid">${rows.map((x) => {
    const source = srcTip({ g: "c", src: { label: x.image ? "운영자 안내 이미지(글자 인식)" : sourceName(x.src, "운영자 홈페이지"), url: x.url, at: x.at, quote: x.texts.join("\n"), image: x.image } }, x.label);
    const sum = operatorSummary(x.label, x.texts);
    // ‘○○ 안내’ ‘○○ 확인’ 같은 빈 요약 대신 운영자가 쓴 첫 문장을 짧게 정리해 보인다.
    const statement = x.texts.find((t) => !/(\?|까요|나요|가요|인가요)\s*$/.test(t));
    const value = /(안내|확인)$/.test(sum) && statement ? serviceText(statement, 64) || sum : sum;
    const opIc = /입실|퇴실/.test(x.label) ? "clock-in" : /요금|환불/.test(x.label) ? "won" : /주차/.test(x.label) ? "car" : /전기/.test(x.label) ? "bolt" : /화로|장작/.test(x.label) ? "flame" : /반려/.test(x.label) ? "paw" : /시설/.test(x.label) ? "drop" : "report";
    return `<article><span>${ic(opIc)}${esc(x.label)}</span><p>${esc(value)}</p>${source}</article>`;
  }).join("")}</div></section>`;
}
// 예약 방법: 화면에는 우선순위로 고른 대표 채널 하나만 보이고, 모든 원본 채널은 데이터에 보존한다.
function bookingHtml(c, d) {
  const main = primaryBooking(c);
  const g = d?.guide, steps = (g?.steps ?? []).filter((x) => x.t && !/https?:\/\//.test(x.t));
  if (!main && !c.tel && !steps.length) return "";
  const pf = g?.platform ?? {};
  const meta = [["오픈", pf.opening], ["결제", pf.payment], ["취소", pf.cancel], ["대기", pf.waitlist]].filter(([, v]) => v && !/운영자 안내에 따름|홈페이지마다 다름/.test(v));
  const guideFact = sourceFact({ src: g?.source?.label ?? g?.source, url: g?.source?.url, date: g?.source?.date, quote: [...steps.map((x) => x.t), ...(pf.tips ?? [])].join("\n") }, "예약 안내");
  const stepName = (text, n) => {
    if (/날짜|일정|입실|체크인/.test(text)) return "날짜 선택";
    if (/상품|사이트|객실|구역|타입/.test(text)) return "상품 선택";
    if (/인원|차량|옵션/.test(text)) return "인원·옵션 확인";
    if (/결제|입금/.test(text)) return "결제 진행";
    if (/취소|환불/.test(text)) return "취소 규정 확인";
    return `예약 안내 ${n + 1}`;
  };
  return `<section class="d-sec"><div class="sec-head">${iconTitle("calendar", "예약 방법")}${main || steps.length || (pf.tips ?? []).length ? `<span class="sec-note">${main ? `대표 채널 ${srcTip(bookingSource(main), "대표 예약 채널")}` : ""}${steps.length || (pf.tips ?? []).length ? srcTip(guideFact, "예약 안내") : ""}</span>` : ""}</div>
    ${main || c.tel ? `<div class="chans">${main ? `<a class="chan" href="${esc(main.url)}" target="_blank" rel="noopener">${ic("right")}<b>${esc(bookingLabel(main))}</b><i>예약 페이지</i></a>` : ""}${c.tel ? `<a class="chan" href="tel:${esc(c.tel)}">${ic("phone")}<b>전화 문의</b><i>${esc(c.tel)}</i></a>` : ""}</div>` : ""}
    ${meta.length ? `<dl class="uses">${meta.map(([l, v]) => `<div class="use"><dt>${l}</dt><dd><span class="use-val">${esc(serviceText(v, 32))}</span><span class="use-meta">${dot("c")}${srcTip({ g: "c", src: { label: "예약 안내", url: g?.source?.url, at: g?.source?.date, quote: v } }, l)}</span></dd></div>`).join("")}</dl>` : ""}
    ${steps.length ? `<ol class="steps">${[...new Set(steps.map((x, i) => serviceText(x.t, 52) || stepName(x.t, i)))].slice(0, 5).map((t) => `<li>${esc(t)}</li>`).join("")}</ol>` : ""}
    ${(pf.tips ?? []).length ? `<ul class="tips">${pf.tips.slice(0, 3).map((t) => `<li>${esc(serviceText(t, 60))}</li>`).join("")}</ul>` : ""}
  </section>`;
}
// 공식 접수 중(서울 공공서비스예약 Open API). 남은 자리는 예약처 확인.
function availHtml(c) {
  const rs = S.avail?.get(String(c.id)) ?? [];
  if (!rs.length) return "";
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
function snsHtml(d, c) {
  const im = (d?.sns_images ?? []).filter((x) => x.url).slice(0, 8);
  if (!im.length) return "";
  const previews = im.filter(canPreviewExternalMedia).filter((x) => externalImage(x));
  const thumbs = im.filter((x) => !previews.includes(x) && apiThumb(x));
  const references = im.filter((x) => !previews.includes(x) && !thumbs.includes(x));
  return `<section class="d-sec"><div class="sec-head">${iconTitle("camera", "캠퍼 사진")}<span class="sec-note">${c.soc?.[0] ? `후기 ${fmt(c.soc[0])} · ` : ""}${c.soc?.[1] ? `영상 ${fmt(c.soc[1])}` : "원문"}</span></div>
    ${previews.length ? `<div class="visitor-gallery">${previews.map((x, i) => `<button type="button" data-external-media="sns" data-index="${i}"><img src="${esc(externalImage(x))}" alt="방문 사진" loading="lazy" decoding="async"></button>`).join("")}</div>` : ""}
    ${thumbs.length ? thumbLinks(thumbs, "캠퍼 사진") : ""}
    ${references.length ? `<div class="visitor-sources">${references.map((x, i) => `<a href="${esc(x.url)}" target="_blank" rel="noopener"><span>${ic("camera")}방문 사진 ${i + 1}</span><i>원문 열기 · ${esc(sourceName(x.src, "외부 콘텐츠"))}</i>${ic("external", "line")}</a>`).join("")}</div>` : ""}
  </section>`;
}
function layoutHtml(d) {
  const imgs = (d?.layout?.images ?? []).filter((x) => x.url).filter((x, i, all) => all.findIndex((y) => y.url === x.url) === i).slice(0, 6);
  if (!imgs.length) return "";
  const previews = imgs.filter(canPreviewExternalMedia).filter((x) => externalImage(x));
  const thumbs = imgs.filter((x) => !previews.includes(x) && apiThumb(x));
  const references = imgs.filter((x) => !previews.includes(x) && !thumbs.includes(x));
  return `<section class="d-sec"><div class="sec-head">${iconTitle("layers", "시설 배치도")}<span class="sec-note">${imgs.length}개</span></div>
    ${previews.length ? `<div class="layout-viewer"><button class="layout-main" type="button" data-external-media="layout" data-index="0"><img src="${esc(externalImage(previews[0]))}" alt="시설 배치도" decoding="async"><span>${ic("search")}크게 보기</span></button><div class="layout-thumbs">${previews.map((x, i) => `<button type="button" data-layout-thumb="${i}"><img src="${esc(externalImage(x))}" alt="배치도 ${i + 1}" loading="lazy" decoding="async"></button>`).join("")}</div></div>` : ""}
    ${thumbs.length ? thumbLinks(thumbs, "배치도") : ""}
    ${references.length ? `<div class="layout-links">${references.map((x, i) => `<a href="${esc(x.url)}" target="_blank" rel="noopener"><span>${ic("layers", "line")}배치도 ${i + 1}</span><i>원문 열기 · ${esc(sourceName(x.src, "외부 안내"))}</i>${ic("external", "line")}</a>`).join("")}</div>` : ""}
  </section>`;
}
// 플랫폼별 더 보기(docs/PLATFORM_HUB.md, 2026-10-19): 수집한 영상은 위 영상 칸에서 재생하고,
// 직접 수집하지 않는 플랫폼(인스타·페이스북·틱톡 등)은 캠핑장 이름 검색 결과로 새 탭에서 연다.
function platformHubHtml(d, c) {
  const name = nameOf(c).name;
  const q = encodeURIComponent(`${name} 캠핑`);
  const platforms = [
    { label: "YouTube", icon: "video", url: `https://www.youtube.com/results?search_query=${q}`, has: (d?.videos ?? []).length > 0 },
    { label: "Instagram", icon: "camera", url: `https://www.instagram.com/explore/search/keyword/?q=${q}` },
    { label: "Facebook", icon: "external", url: `https://www.facebook.com/search/posts/?q=${q}` },
    { label: "TikTok", icon: "video", url: `https://www.tiktok.com/search?q=${q}` },
    { label: "네이버", icon: "search", url: `https://search.naver.com/search.naver?query=${q}` },
    { label: "다음", icon: "search", url: `https://search.daum.net/search?q=${q}` },
  ];
  return `<section class="d-sec plat-hub"><div class="sec-head">${iconTitle("external", "더 보기")}<span class="sec-note">플랫폼별 검색</span></div><div class="plat-btns">${platforms.map((p) => `<a class="plat-btn${p.has ? " has" : ""}" href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(p.label)}에서 ${esc(name)} 검색">${ic(p.icon)}<span>${esc(p.label)}</span>${p.has ? "<i>영상 있음</i>" : ""}</a>`).join("")}</div></section>`;
}
function videosHtml(d) {
  const v = (d?.videos ?? []).filter((x) => x.yt).slice(0, 8);
  if (!v.length) return "";
  return `<section class="d-sec"><div class="sec-head">${iconTitle("video", "관련 영상")}<span class="sec-note">YouTube</span></div><div class="rail vids">${v.map((x, i) => {
    const fact = sourceFact({ src: "YouTube", url: x.url ?? `https://www.youtube.com/watch?v=${x.yt}`, date: x.date, title: x.title }, "YouTube");
    return `<article class="vid-wrap"><button type="button" class="vid" data-yt="${esc(x.yt)}"><img src="https://i.ytimg.com/vi/${encodeURIComponent(x.yt)}/hqdefault.jpg" alt="" loading="lazy" decoding="async"><span class="vid-play">${ic("video")}</span><b>${esc(serviceText(x.title, 60) || `현장 영상 ${i + 1}`)}</b><i>${esc([x.author, x.date ? String(x.date).slice(0, 7) : ""].filter(Boolean).join(" · ") || "재생하기")}</i></button>${srcTip(fact, `관련 영상 ${i + 1}`)}</article>`;
  }).join("")}</div></section>`;
}
function reviewSummary(value) {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  const parts = text.split(/(?<=[.!?])\s+|\s{2,}/).map((x) => serviceText(x, 76)).filter(Boolean);
  const useful = /캠핑|사이트|시설|풍경|주차|전기|화장실|샤워|반려|텐트|잔디|숲|바다|요금|입실|대여/;
  const candidate = parts.find((x) => x.length >= 12 && useful.test(x) && !/^[^가-힣A-Za-z]*(?:\d{4}[./-]\d|\d{1,2}:\d{2})/.test(x) && !/^[^\p{L}\p{N}]{1,}/u.test(x) && !/^(못|ㅋㅋ|ㅎㅎ|ㅠㅠ|\.{2,})/.test(x) && !/[가-힣]+(?:시|군|구|읍|면|리).{0,24}(?:길|로|\d)/.test(x));
  return candidate || "";
}
function reviewLinksHtml(d, c) {
  // 카카오 후기·카페 + 네이버 블로그·카페·웹문서·지식iN(같은 글은 한 번), 최신순
  const seenUrl = new Set();
  const r = [...(d?.reviews ?? []), ...(d?.cafe ?? []), ...(d?.web ?? [])].filter((x) => x.url && x.title && !seenUrl.has(x.url) && seenUrl.add(x.url))
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))).slice(0, 12);
  const campName = c ? nameOf(c).name : "";
  const q = encodeURIComponent(`${campName} 캠핑장 후기`);
  const naverSearch = `https://search.naver.com/search.naver?where=blog&query=${q}`;
  const daumSearch = `https://search.daum.net/search?w=blog&q=${q}`;
  const kakaoMap = c?.lat && c?.lng ? `https://map.kakao.com/link/search/${encodeURIComponent(campName)}` : `https://map.kakao.com/link/search/${q}`;
  const gcReview = c?.gc_url || "https://www.gocamping.or.kr/";
  const directLinks = `
    <div class="review-more-channels">
      <span class="rmc-title">${ic("file-text")}업체별 실시간 방문자 후기 5건 이상 바로 확인</span>
      <div class="rmc-btns">
        <a class="rmc-btn" href="${naverSearch}" target="_blank" rel="noopener">${ic("polaroid")}네이버 블로그·포토 후기 검색</a>
        <a class="rmc-btn" href="${daumSearch}" target="_blank" rel="noopener">${ic("file-text")}다음·카카오 카페/블로그 검색</a>
        <a class="rmc-btn" href="${kakaoMap}" target="_blank" rel="noopener">${ic("pin")}카카오맵 방문자 리뷰</a>
        ${c?.gc_url ? `<a class="rmc-btn" href="${esc(gcReview)}" target="_blank" rel="noopener">${ic("right")}고캠핑 등록 후기</a>` : ""}
      </div>
    </div>`;

  if (!r.length) {
    return `<section class="d-sec"><div class="sec-head">${iconTitle("file-text", "블로그 · 카페 후기")}<span class="sec-note">실시간 검색 연동</span></div>
      <p class="review-empty-note">연동된 본문 후기가 적은 곳입니다. 아래 공식 검색 채널에서 최신 방문자 후기 5건 이상을 바로 확인하세요.</p>
      ${directLinks}
    </section>`;
  }
  return `<section class="d-sec"><div class="sec-head">${iconTitle("file-text", "블로그 · 카페 후기")}<span class="sec-note">${r.length}건 수집</span></div>
    <div class="review-links">${r.map((x, i) => {
      const platform = /cafe/.test(x.t ?? "") ? "카페" : x.t === "kin" ? "지식iN" : x.t === "web" ? "웹문서" : "블로그";
      const fact = sourceFact(x, platform, [x.title, x.snippet].filter(Boolean).join("\n"));
      const summary = reviewSummary(x.snippet);
      return `<article class="review-link-card"><a href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="${platform} 후기 ${i + 1} 원문 열기"><span class="review-link-media">${canPreviewExternalMedia(x) && externalImage(x) ? `<img src="${esc(externalImage(x))}" alt="" loading="lazy" decoding="async">` : apiThumb(x) ? `<img src="${esc(apiThumb(x))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ic(x.image ? "polaroid" : "file-text")}</span><span><i>${esc(sourceName(x.src, platform))}${x.date ? ` · ${esc(String(x.date).slice(0, 10))}` : ""}</i><b>${esc(serviceText(x.title, 54) || `방문 후기 ${i + 1}`)}</b>${summary ? `<em>${esc(summary)}</em>` : ""}</span>${ic("external", "line")}</a>${srcTip(fact, `${platform} 후기 ${i + 1}`)}</article>`;
    }).join("")}</div>
    ${directLinks}
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
function infoHtml(c) {
  const name = encodeURIComponent(nameOf(c).name);
  const map = c.lat ? `https://map.kakao.com/link/map/${name},${c.lat},${c.lng}` : null;
  const to = c.lat ? `https://map.kakao.com/link/to/${name},${c.lat},${c.lng}` : null;
  const rv = c.lat ? `https://map.kakao.com/link/roadview/${c.lat},${c.lng}` : null;
  const addressActions = map ? `<span class="addr-actions"><a href="${map}" target="_blank" rel="noopener">${ic("map")}지도</a><a href="${to}" target="_blank" rel="noopener">${ic("pin")}길찾기</a><a href="${rv}" target="_blank" rel="noopener">${ic("search")}로드뷰</a></span>` : "";
  const gcSrc = (field, quote) => ({ g: "c", src: { label: "한국관광공사 고캠핑 등록 현황", url: c.gc_url, quote: quote ? String(quote) : null } });
  const rows = [
    ["주소", c.addr ? `<span class="address-value">${esc(c.addr)}${addressActions}</span>` : null, gcSrc("주소", c.addr)],
    ["전화", c.tel ? `<a href="tel:${esc(c.tel)}">${esc(c.tel)}</a>` : null, gcSrc("전화", c.tel)],
    ["홈페이지", c.homepage ? `<a href="${esc(c.homepage)}" target="_blank" rel="noopener">${esc(hostOf(c.homepage) || c.homepage)}</a>` : null, { g: "c", src: { label: "공식 홈페이지", url: c.homepage } }],
    ["운영", [OP[c.op], (c.seasons ?? []).length === 4 ? "사계절" : (c.seasons ?? []).join("·"), (c.days ?? [])[0]].filter(Boolean).map(esc).join(" · ") || null, gcSrc("운영 정보")],
    ...registryRows(c),
  ].filter(([, v]) => v);
  return `<section class="d-sec"><div class="sec-head">${iconTitle("info", "업체 정보")}${c.gc_url ? `<a class="link" href="${esc(c.gc_url)}" target="_blank" rel="noopener">고캠핑 ${ic("right")}</a>` : ""}</div>
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
    box.innerHTML = list.length ? list.map((x) => `<li><b>${esc(x.nickname)}</b><i>${esc(String(x.created_at).slice(0, 10))}</i>${mine.includes(String(x.id)) ? `<button type="button" class="link" data-cmt-del="${esc(x.id)}">지우기</button>` : ""}<p>${esc(x.content)}</p></li>`).join("") : `<li class="muted">첫 한마디를 남겨 주세요.</li>`;
  } catch { box.innerHTML = `<li class="muted">지금은 불러오지 못했어요.</li>`; }
}
function reserveDock(c) {
  const main = primaryBooking(c);
  return `${heartBtn(c)}${c.tel ? `<a class="btn ghost" href="tel:${esc(c.tel)}" aria-label="전화">${ic("phone")}</a>` : ""}${main ? `<a class="btn primary wide" href="${esc(main.url)}" target="_blank" rel="noopener">예약하기</a>` : ""}`;
}
function bindDetail() {
  initCarousels($("#view"));
  const back = $("[data-back]");
  back?.addEventListener("click", (e) => { if (history.length > 1 && S.cameFromApp) { e.preventDefault(); history.back(); } });
  $$(".gal-cell").forEach((b) => b.addEventListener("click", () => openLightbox(S.byId.get($(".detail").dataset.id), Number(b.dataset.gal))));
  // 영상: 누를 때만 YouTube(쿠키 없는 주소) 플레이어를 붙인다.
  $$("[data-yt]").forEach((b) => b.addEventListener("click", () => {
    b.outerHTML = `<div class="vid playing"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?autoplay=1" title="영상" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  }));
  const id = $(".detail")?.dataset.id;
  // 이번 주말 컨디션(날씨·일출일몰·달·미세먼지·산불·물때): /conditions/card.js가 있을 때만 붙인다. 실패하면 칸을 숨긴 채 둔다.
  const condEl = $("[data-cond]"), condCamp = S.byId.get(id);
  if (condEl && condCamp) import(new URL("../conditions/card.js", import.meta.url).href).then((m) => m.mount(condEl, condCamp)).catch(() => {});
  const previewItems = async (kind) => {
    const d = await detailOf(id);
    const rows = kind === "layout" ? (d?.layout?.images ?? []) : (d?.sns_images ?? []);
    return rows.filter((x) => x?.url && canPreviewExternalMedia(x) && externalImage(x));
  };
  $$('[data-external-media]').forEach((b) => b.addEventListener("click", async () => {
    const items = await previewItems(b.dataset.externalMedia);
    const idx = Math.min(Number(b.dataset.index) || 0, Math.max(0, items.length - 1));
    if (items.length) openLightboxUrls(items.map(externalImage), idx, b.dataset.externalMedia === "layout" ? "시설 배치도 · 원문 제공 이미지" : "캠퍼 사진 · 원문 제공 이미지");
  }));
  $$('[data-layout-thumb]').forEach((b) => b.addEventListener("click", async () => {
    const items = await previewItems("layout"), i = Number(b.dataset.layoutThumb);
    const main = $(".layout-main");
    if (!items[i] || !main) return;
    $("img", main).src = externalImage(items[i]);
    main.dataset.index = String(i);
    $$("[data-layout-thumb]").forEach((x, n) => x.toggleAttribute("aria-current", n === i));
  }));
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
  openLightboxUrls(photosOf(c).map(photoHiUrl), start, "사진: 한국관광공사 고캠핑");
}
function openLightboxUrls(urls, start = 0, caption = "사진") {
  const ph = urls.filter(Boolean);
  if (!ph.length) return;
  const dlg = document.createElement("dialog");
  dlg.className = "lightbox";
  dlg.innerHTML = `<button class="icon-btn lb-x" aria-label="닫기">${ic("close")}</button>${ph.length > 1 ? `<button class="icon-btn lb-nav lb-prev" aria-label="이전 사진">${ic("left")}</button><button class="icon-btn lb-nav lb-next" aria-label="다음 사진">${ic("right")}</button>` : ""}<div class="lb-track">${ph.map((u) => `<img src="${esc(u)}" alt="" decoding="async">`).join("")}</div><p class="lb-cap">${esc(caption)}</p>`;
  document.body.append(dlg);
  dlg.showModal();
  const tr = $(".lb-track", dlg);
  let active = Math.max(0, Math.min(start, ph.length - 1));
  const move = (n) => { active = (n + ph.length) % ph.length; tr.scrollTo({ left: active * tr.clientWidth, behavior: "smooth" }); };
  requestAnimationFrame(() => (tr.scrollLeft = active * tr.clientWidth));
  $(".lb-x", dlg).onclick = () => dlg.close();
  $(".lb-prev", dlg)?.addEventListener("click", () => move(active - 1));
  $(".lb-next", dlg)?.addEventListener("click", () => move(active + 1));
  tr.addEventListener("scroll", () => { active = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth)); }, { passive: true });
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
    <div class="sec-head big"><h1>찜 ${saved.length} · <em>${camps.length}곳 비교</em></h1><span class="sec-tools"><span class="sec-note legend">${dot("v")}원문 ${dot("c")}공식 ${dot("m")}언급</span><label class="switch"><input type="checkbox" data-diff checked><span>다른 점만 강조</span></label></span></div>
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
let MAP = null, mapLayer = null, selected = null;
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
  const b = MAP.getBounds().pad(0.15), z = MAP.getZoom();
  const inView = S.camps.filter((c) => c.lat && c.lng && b.contains([c.lat, c.lng]) && matches(c, { useArea: false }));
  const strict = MAP.getBounds();
  const visible = inView.filter((c) => strict.contains([c.lat, c.lng])).sort((a, b2) => rich(b2) - rich(a));
  $("[data-mcount]").textContent = fmt(visible.length);
  mapLayer.clearLayers();
  const cell = z >= 12 ? 0 : z >= 10 ? 60 : 90, buckets = new Map();
  for (const c of inView) {
    const p = MAP.latLngToLayerPoint([c.lat, c.lng]);
    const k = cell ? `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}` : c.id;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(c);
  }
  for (const arr of buckets.values()) {
    if (arr.length > 1) {
      const lat = arr.reduce((s, c) => s + c.lat, 0) / arr.length, lng = arr.reduce((s, c) => s + c.lng, 0) / arr.length;
      const n = arr.length, size = n > 99 ? 46 : n > 9 ? 40 : 34;
      const m = L.marker([lat, lng], { icon: L.divIcon({ className: "", html: `<span class="cl" style="--s:${size}px">${n}</span>`, iconSize: [size, size] }) });
      m.on("click", () => MAP.setView([lat, lng], Math.min(z + 2, 14)));
      mapLayer.addLayer(m);
    } else {
      const c = arr[0], [t, cls] = pinLabel(c), on = selected === String(c.id);
      const html = t || on ? `<span class="pin ${cls}${on ? " on" : ""}">${esc(on ? nameOf(c).name.slice(0, 14) : t)}</span>` : `<span class="pdot"></span>`;
      const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "", html, iconSize: null }), zIndexOffset: on ? 1000 : t ? 100 : 0 });
      m.on("click", () => selectPin(c));
      mapLayer.addLayer(m);
    }
  }
  const list = $("[data-mlist]");
  list.innerHTML = visible.filter(hasPhoto).slice(0, 40).map(mapItem).join("") + (visible.length > 40 ? `<p class="map-more">지도를 확대하면 ${fmt(visible.length - 40)}곳 더</p>` : "");
  initCarousels(list);
}
function mapItem(c) {
  const on = selected === String(c.id);
  return `<article class="mi${on ? " on" : ""}" data-mid="${esc(c.id)}">
    <a class="card-hit" href="#/c/${encodeURIComponent(c.id)}" aria-label="${esc(nameOf(c).name)} 자세히"></a>
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
  if (!window.L) { $("#map").innerHTML = `<div class="empty">${ic("map")}<b>지도를 불러오지 못했어요</b></div>`; return; }
  MAP = L.map("map", { zoomControl: false, attributionControl: true, minZoom: 6, maxZoom: 17 }).setView([36.2, 127.9], innerWidth < 760 ? 6 : 7);
  L.control.zoom({ position: "bottomright" }).addTo(MAP);
  // 지도 바탕: OpenStreetMap 표준 타일(무료·출처 표시). 화면에서는 CSS로 채도를 낮춘다.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(MAP);
  mapLayer = L.layerGroup().addTo(MAP);
  if (S.area !== "all") { const pts = S.camps.filter((c) => AREA_OF[sidoShort(c.sido)] === S.area && c.lat).map((c) => [c.lat, c.lng]); if (pts.length) MAP.fitBounds(pts, { padding: [30, 30] }); }
  MAP.on("moveend", drawMap);
  MAP.on("click", () => { selected = null; $("[data-peek]").hidden = true; drawMap(); });
  drawMap();
  const v = $("#view");
  const onSubmit = (e) => {
    const f = e.target.closest("[data-msearch]"); if (!f) return; e.preventDefault(); S.q = f.q.value.trim();
    const hit = S.camps.filter((c) => c.lat && matches(c, { useArea: false }));
    if (S.q && hit.length) MAP.fitBounds(hit.map((c) => [c.lat, c.lng]), { padding: [40, 40], maxZoom: 13 }); else drawMap();
  };
  const onClick = (e) => {
    const q = e.target.closest("[data-mquick]");
    if (q) { const k = q.dataset.mquick; if (S.quick.has(k)) S.quick.delete(k); else S.quick.add(k); q.setAttribute("aria-pressed", String(S.quick.has(k))); drawMap(); return; }
    if (e.target.closest("[data-peek-x]")) { selected = null; $("[data-peek]").hidden = true; drawMap(); return; }
    const it = e.target.closest(".map-list .mi");
    if (it && !e.target.closest("[data-save]") && innerWidth >= 900 && !e.target.closest(".card-hit")) { const c = S.byId.get(it.dataset.mid); MAP.setView([c.lat, c.lng], Math.max(MAP.getZoom(), 12)); selectPin(c); }
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
  const name = h.startsWith("#/c/") ? "detail" : h.startsWith("#/map") ? "map" : h.startsWith("#/compare") ? "compare" : h.startsWith("#/list") ? "list" : "home";
  $$("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === (name === "detail" || name === "list" ? "home" : name)));
  document.body.dataset.view = name;
  if (name === "home") { v.innerHTML = homeView(); bindHome(); }
  else if (name === "detail") { v.innerHTML = `<div class="loading"></div>`; v.innerHTML = await detailView(decodeURIComponent(h.slice(4))); bindDetail(); }
  else if (name === "compare") { v.innerHTML = await compareView(); bindCompare(); }
  else if (name === "list") { v.innerHTML = listView(); bindList(); }
  else { v.innerHTML = mapView(); bindMap(); }
  return name;
}
async function route() {
  const prev = lastRoute;
  if (prev === "home") S.homeScroll = scrollY;
  const name = await render();
  lastRoute = name;
  S.cameFromApp = Boolean(prev);
  if (name === "home" && prev === "detail") scrollTo(0, S.homeScroll);
  else if (name !== prev || name === "detail") scrollTo(0, 0);
  updateHeaderGlass();
}
addEventListener("hashchange", route);

// ── 시작 ─────────────────────────────────────────────────────
// 상세 사진 묶음에서 깨진 사진: 그 칸을 빼고 남은 칸으로 격자를 다시 짠다(빈 회색 칸 금지).
addEventListener("error", (e) => {
  const im = e.target;
  if (!(im instanceof HTMLImageElement)) return;
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
  const [camps, photos, openings, cards, avail] = await Promise.all([
    fetch(`${DATA}campgrounds.json`).then((r) => r.json()),
    fetch("./data/photos.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch(`${DATA}openings.json`).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch("../media/cards/index.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch(`${DATA}availability.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
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
  // 이전 주소(#c=1554)도 새 상세 주소로 보정해 공유 링크를 깨지 않는다.
  const legacy = location.hash.match(/^#c=(.+)$/);
  if (legacy) history.replaceState(null, "", `#/c/${legacy[1]}`);
  syncCompare(); updateHeaderGlass();
  route();
})();
