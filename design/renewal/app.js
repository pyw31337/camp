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
const GR = (s) => (s === "VERIFIED" ? "v" : s === "CONFIRMED" || s === "OPERATOR" ? "c" : s === "SURVEYED" || s === "MENTION" ? "m" : null);
const GRADE_TXT = { v: "원문 대조", c: "공식 등록", m: "소개·후기 언급" };
const kw = (w) => `${fmt(w)}W`; // 소유자: ‘600W’처럼 W로 통일
const GROUND = { CRUSHED_STONE: "파쇄석", MIXED: "혼합", GRAVEL: "자갈", DECK: "데크", GRASS: "잔디", SAND: "모래", SOIL: "흙", CONCRETE: "콘크리트" };
const srcOf = (fc, extra) => ({ label: fc?.source?.label, url: fc?.source?.url, at: fc?.source?.checked_at, ...extra });

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
  if (S.feeBand === "u3" && !(c.fee?.min && c.fee.min <= 30000)) return false;
  if (S.feeBand === "3to5" && !(c.fee?.min && c.fee.min <= 50000 && (c.fee.max == null || c.fee.max >= 30000))) return false;
  if (S.feeBand === "5to7" && !(c.fee?.min && c.fee.min <= 70000 && (c.fee.max == null || c.fee.max >= 50000))) return false;
  if (S.feeBand === "o7" && !(c.fee && (c.fee.min >= 70000 || (c.fee.max && c.fee.max >= 70000)))) return false;
  if (S.theme && S.theme !== "ALL") { const t = THEMES.find((x) => x[0] === S.theme); if (t && !t[2](c)) return false; }
  if (S.theme === "AVAIL" && !S.avail?.has(String(c.id))) return false;
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
    <div class="card-media review-pick-media">${carousel(c, { eager: i < 3 })}<span class="review-total">${ic("heart")}후기 ${fmt(r.total)}</span></div>
    <div class="card-body review-pick-body"><p class="review-place">${esc(region(c))}</p><h3>${esc(nameOf(c).name)}</h3><div class="review-topics">${reviewTopics(r.rv.p, "good", "heart")}${reviewTopics(r.rv.c, "watch", "down")}</div></div>
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
// 카드 사진: GitHub Pages 배포 단계에서 합쳐지는 고캠핑 공식 webp를 우선 사용한다.
// 원본 URL은 사진 브랜치에 아직 파생본이 없을 때만 보조로 쓴다.
function photosOf(c) {
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
  return tip(`<b>${esc(label)}</b><span>${GRADE_TXT[x.g] ?? ""}${s.label ? ` · ${esc(s.label)}` : ""}${d ? ` · ${esc(d)}` : ""}</span>${s.quote ? `<q>${esc(String(s.quote).slice(0, 240))}</q>` : ""}${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">원문 보기</a>` : ""}`, `${label} 근거`);
}
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

document.addEventListener("click", (e) => {
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
  toast(`${stayLabel()} 일정으로 예약처에서 확인해요`);
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
    <div class="sec-head"><h2 id="op-t">곧 <em>오픈</em></h2><a class="link" href="#/openings">전체 보기 ${ic("right")}</a></div>
    <div class="rail opens-rail">${openings.map(([c, o]) => `<a class="open-card" href="#/c/${encodeURIComponent(c.id)}">${imageTag(photosOf(c)[0] ?? "", "", { sizes: "250px" })}<span class="open-dd">${esc(o.txt)}</span><b>${esc(nameOf(c).name)}</b><i>${esc(region(c))} · ${esc(o.platform ?? "")}</i></a>`).join("")}</div>
  </section>` : "";
  const picks = reviewPicks();
  const reviewSection = picks.length ? `<section class="review-picks" aria-labelledby="review-picks-t">
    <div class="sec-head"><div><h2 id="review-picks-t"><em>긍정 후기</em></h2><p class="sec-sub">후기 수 · 긍정 언급</p></div><span class="sec-note">${tip("<b>긍정 후기</b><span>연결된 블로그·카페 후기에서 집계한 주제와 건수입니다. 별점·실시간 인기 순위가 아니며, 원문은 상세에서 바로 열 수 있어요.</span>")}</span></div>
    <div class="rail review-picks-rail">${picks.map(reviewPickCard).join("")}</div>
  </section>` : "";
  const themeSection = themeItems ? `<section class="themes-catalog" aria-labelledby="theme-t">
    <div class="sec-head"><h2 id="theme-t">테마로 <em>고르기</em></h2><a class="link" href="#/themes">전체 보기 ${ic("right")}</a></div>
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
        <button class="finder-go" type="submit">${ic("search")}<span>찾기</span></button>
      </form></div>
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
      <button type="button" class="chip fee-chip" data-fee-band="u3" aria-pressed="${S.feeBand === 'u3'}">~3만원 <i>${fmt(countOf((c) => Boolean(c.fee?.min && c.fee.min <= 30000)))}</i></button>
      <button type="button" class="chip fee-chip" data-fee-band="3to5" aria-pressed="${S.feeBand === '3to5'}">3~5만원 <i>${fmt(countOf((c) => Boolean(c.fee?.min && c.fee.min <= 50000 && (c.fee.max == null || c.fee.max >= 30000))))}</i></button>
      <button type="button" class="chip fee-chip" data-fee-band="5to7" aria-pressed="${S.feeBand === '5to7'}">5~7만원 <i>${fmt(countOf((c) => Boolean(c.fee?.min && c.fee.min <= 70000 && (c.fee.max == null || c.fee.max >= 50000))))}</i></button>
      <button type="button" class="chip fee-chip" data-fee-band="o7" aria-pressed="${S.feeBand === 'o7'}">7만원+ <i>${fmt(countOf((c) => Boolean(c.fee && (c.fee.min >= 70000 || (c.fee.max && c.fee.max >= 70000)))))}</i></button>
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
const themeName = (k) => (k === "ALL" ? "전체" : k === "AVAIL" ? "공식 접수 중" : THEMES.find((t) => t[0] === k)?.[1] ?? "");
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
function bindHome() {
  renderResults();
  const v = $("#view");
  v.addEventListener("click", homeClicks);
  v.addEventListener("submit", (e) => { const f = e.target.closest("[data-search]"); if (!f) return; e.preventDefault(); S.q = f.q.value.trim(); render(); $("#results")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
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
    if (!k.startsWith("T:")) { S.theme = k; location.hash = "#/themes"; return; }
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
function profFact(x) { return x ? { v: x.value, g: GR(x.grade), src: { label: x.source?.label, url: x.source?.url, at: x.source?.date, quote: x.source?.quote } } : null; }
function specFact(d, k) {
  const f = d?.spec?.fields?.[k];
  if (!f) return null;
  const top = f.values?.[0] ?? f.mentions?.[0];
  if (!top) return null;
  const s = top.samples?.[0] ?? top.source ?? {};
  return { v: top.value, g: f.values?.length ? GR(f.grade) || "c" : "m", src: { label: s.label, url: s.url, at: s.date, quote: s.quote } };
}
function usage(c, d) {
  const f = facts(c);
  return [
    ["입실", profFact(PF(d, "CHECKIN")) ?? specFact(d, "CHECKIN_TIME")],
    ["퇴실", profFact(PF(d, "CHECKOUT")) ?? specFact(d, "CHECKOUT_TIME")],
    ["매너타임", profFact(PF(d, "MANNER")) ?? specFact(d, "MANNER_TIME")],
    ["요금", profFact(PF(d, "PRICE")) ?? (c.fee ? { v: c.fee.text || (c.fee.min ? `${band(c.fee.min)}부터` : null), g: GR(c.fee.grade) || "c", src: { label: c.fee.basis, url: c.fee.url, at: c.fee.checked_at } } : null)],
    ["추가 요금", profFact(PF(d, "EXTRA_FEE")) ?? specFact(d, "EXTRA_PERSON_FEE")],
    ["환불", profFact(PF(d, "REFUND"))],
    ["운영", profFact(PF(d, "SEASON"))],
    ["반려동물", f.pet ?? profFact(PF(d, "PET"))],
    ["대여", (d?.field_conditions ?? c.field_conditions)?.rental_offers?.length ? { v: (d?.field_conditions ?? c.field_conditions).rental_offers.map((r) => r.item).slice(0, 5).join(" · "), g: "c", src: srcOf(c.field_conditions) } : null],
  ];
}
function sitePricingHtml(c, d) {
  const feeInfo = c.fee;
  const groups = c.field_conditions?.site_size?.groups ?? [];
  const prods = d?.products ?? [];
  if (!feeInfo && !groups.length && !prods.length) return "";
  let rows = "";
  if (prods.length) {
    rows = prods.map((p, i) => `<tr><td><b>${esc(serviceText(p.name, 26) || `사이트 ${i + 1}`)}</b></td><td>${esc(serviceText(p.size, 20) || "-")}</td><td>${esc(p.base ? `기준 ${serviceText(p.base, 16)}인` : "-")}</td><td class="text-price">${p.price ? fmt(p.price) + "원" : "예약처 확인"}</td></tr>`).join("");
  } else if (groups.length) {
    rows = groups.map((g) => `<tr><td><b>${esc(g.name || "일반 사이트")}</b></td><td>${g.width_m && g.depth_m ? `${g.width_m}×${g.depth_m}m` : "-"}</td><td>${g.count ? `${g.count}면` : "-"}</td><td class="text-price">${feeInfo?.text ? esc(feeInfo.text) : (feeInfo?.min ? `${band(feeInfo.min)}대` : "예약처 확인")}</td></tr>`).join("");
  } else if (feeInfo) {
    rows = `<tr><td><b>1박 기준 요금</b></td><td>-</td><td>-</td><td class="text-price">${feeInfo.text ? esc(feeInfo.text) : (feeInfo.min ? `${band(feeInfo.min)}부터` : "-")}</td></tr>`;
  }
  const feeFact = feeInfo ? { g: GR(feeInfo.grade) || "m", src: { label: sourceName(feeInfo.basis, "요금 근거"), url: feeInfo.url, at: feeInfo.checked_at, quote: feeInfo.quote } } : null;
  return `<section class="d-sec">
    <div class="sec-head">${iconTitle("layers", "사이트 규격 및 1박 요금")}${feeFact ? `<span class="sec-note">기준 요금 ${srcTip(feeFact, "요금 근거")}</span>` : ""}</div>
    <div class="table-wrap"><table class="site-table"><thead><tr><th>구분</th><th>규격</th><th>규모</th><th>1박 요금</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}
function specTiles(c) {
  const f = facts(c);
  const T = [["size", "size", "설치 공간", ""], ["park", "car", "텐트 옆 주차", "cobalt"], ["power", "bolt", "전기", "volt"], ["fire", "flame", "장작·숯", "flame"], ["ground", "layers", "바닥", ""], ["shelter", "tent", "텐트·타프", ""], ["sanitary", "drop", "위생", ""], ["hot", "drop", "온수", ""], ["pet", "paw", "반려동물", ""]];
  return T.map(([k, i, l, cls]) => {
    const x = f[k];
    const on = x && cls && x.ok !== false && !(k === "fire" && x.kind === "NO_FIRE");
    return `<div class="tile${x ? "" : " unk"} ${on ? `t-${cls}` : ""}"><span class="tile-ic">${ic(i)}</span><span class="tile-l">${l}</span><b class="tile-v">${x ? esc(detailValue(x)) : "확인필요"}</b>${x ? `<span class="tile-g">${dot(x.g)}${srcTip(x, l)}</span>` : ""}</div>`;
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
  };
  const entry = (type, x = {}) => {
    const name = x.name ?? x.n;
    const m = Number(x.m);
    return name && Number.isFinite(m) ? { type, name, m, lat: x.lat, lng: x.lng, url: x.u, image: x.img } : null;
  };
  const first = (type, rows) => (rows.map((x) => entry(type, x)).filter(Boolean).sort((a, b) => a.m - b.m)[0] ?? null);
  const licensedRows = Object.entries(licensed).map(([type, x]) => entry(type, x)).filter(Boolean);
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
  const rv = d?.rv ?? c.rv;
  if (!rv || (!rv.p?.length && !rv.c?.length)) return "";
  const block = (label, rows, cls, icon) => rows?.length ? `<div class="review-block ${cls}"><span>${ic(icon)}${label}</span><div>${rows.slice(0, 4).map(([topic, count]) => `<b>${esc(topic)} <i>${count}</i></b>`).join("")}</div></div>` : "";
  return `<section class="d-sec review-summary"><div class="sec-head">${iconTitle("heart", "장점 · 아쉬운 점")}<span class="sec-note">후기 ${fmt(rv.n)}건 ${tip("<b>후기 요약</b><span>연결된 블로그·카페 후기에서 반복 언급한 주제입니다. 협찬 글이 섞일 수 있어 예약 전 원문을 함께 확인하세요.</span>")}</span></div><div class="review-summary-grid">${block("좋았어요", rv.p, "pro", "heart")}${block("미리 볼 점", rv.c, "con", "down")}</div></section>`;
}
function bookingRank(channel) {
  const hay = `${channel?.platform_name ?? ""} ${channel?.url ?? ""}`.toLowerCase();
  if (/campit|캠핏/.test(hay)) return 0;
  if (/naver|네이버/.test(hay)) return 1;
  if (/thank.?camp|땡큐/.test(hay)) return 2;
  return 10;
}
function bookingChannels(c) {
  return [...(c.booking?.channels ?? [])].sort((a, b) => bookingRank(a) - bookingRank(b) || Number(b.confidence ?? 0) - Number(a.confidence ?? 0));
}
function reserveCard(c) {
  const ch = bookingChannels(c);
  const main = ch.find((x) => x.kind !== "phone") ?? null;
  const o = openingOf(c) ?? (S.openings.get(String(c.id)) ?? null);
  const short = (n) => String(n ?? "").replace(/ 예약시스템| 공공서비스예약|\(.*\)/g, "").trim();
  return `<div class="reserve">
    <div class="rs-top"><span>${esc(main ? short(main.platform_name) : "예약")}</span>${o ? `<span class="rs-dd">${esc(o.txt ?? o.kind)}</span>` : ""}</div>
    ${o ? `<p class="rs-open"><b>${esc(new Date(o.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }))}</b><span>${esc(o.label ?? "")}</span></p>` : ""}
    ${availHtml(c)}
    <div class="rs-btns">
      ${main ? `<a class="btn primary wide" href="${esc(main.url)}" target="_blank" rel="noopener">${esc(short(main.platform_name))} 예약</a>` : ""}
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
      <p class="d-eyebrow">${esc(region(c))}${c.op && OP[c.op] ? ` · ${OP[c.op]}` : tag ? ` · ${esc(tag)}` : ""}${typeLine(c) ? ` · ${esc(typeLine(c))}` : ""}</p>
      <h1 class="d-title">${titleHtml(c)}</h1>
      ${c.line ? `<p class="d-line">${esc(serviceText(c.line, 84))}${c.gc_url ? srcTip({ g: "c", src: { label: "고캠핑 소개", url: c.gc_url, quote: c.line } }, "한 줄 소개") : ""}</p>` : ""}
      <div class="d-bdgs">${badges(c, 5)}</div>
    </header>
    ${galleryHtml(c)}
    <div class="d-sum">
      <div><span>확인된 규격</span><b>${known}<i>/${spec.length}</i></b></div>
      <div><span>후기</span><b>${c.rv?.n ? fmt(c.rv.n) : "–"}</b></div>
      <div><span>다음 오픈</span><b class="${o ? "hot" : "muted"}">${o ? esc(o.txt) : "–"}</b></div>
    </div>
    <div class="d-body">
      <div class="d-main">
        ${siteTypesHtml(c, d)}
        <section class="d-sec"><div class="sec-head">${iconTitle("info", "기본 규격")}<span class="sec-note legend">${dot("v")}원문 ${dot("c")}공식 ${dot("m")}언급</span></div><div class="tiles">${specTiles(c)}</div></section>
        ${sitePricingHtml(c, d)}
        ${priceMentionsHtml(d)}
        <section class="d-sec"><div class="sec-head">${iconTitle("info", "이용 정보")}</div><dl class="uses">${us.map(([l, x]) => `<div class="use${x ? "" : " unk"}"><dt>${l}</dt><dd>${x ? `${esc(detailValue(x))}${dot(x.g)}${srcTip(x, l)}` : "확인필요"}</dd></div>`).join("")}</dl></section>
        ${operatorHtml(d)}
        ${bookingHtml(c, d)}
        ${amenityHtml(c)}
        ${introHtml(d)}
        ${programsHtml(d)}
        ${layoutHtml(d)}
        ${snsHtml(d, c)}
        ${videosHtml(d)}
        ${nearbyHubHtml(c, d)}
        ${reviewHtml(d, c)}
        ${reviewLinksHtml(d)}
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
const SRC_LABEL = { gocamping: "한국관광공사 고캠핑 등록값", gocamping_intro: "고캠핑 소개글", kakao_local: "카카오 장소 분류", naver_local: "네이버 장소 분류", operator_homepage: "운영자 홈페이지" };
function iconTitle(icon, label) { return `<div class="sec-title">${ic(icon, "line")}<h2>${esc(label)}</h2></div>`; }
// 화면에서 쓰는 문장은 데이터 원문을 그대로 반복하지 않는다. 공통 규칙으로 공백·목록기호를
// 정리하고 한 줄 길이만 남긴다. 원문과 출처는 항상 srcTip()의 작은 i에 보관한다.
function serviceText(value, limit = 44) {
  const text = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/^[\s*#·•\-–—]+/, "")
    .replace(/\s*([,.:;])\s*/g, "$1 ")
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
    return `<div class="stype"><span class="stype-ic">${ic(meta.icon)}</span><span class="stype-b"><b>${esc(t.code === "HOUSE" && t.sub ? `${meta.label} · ${t.sub}` : meta.label)}</b><i>${t.count ? `${fmt(t.count)}${unit}` : t.grade === "OPERATOR" ? "운영자 안내" : "있음"}</i></span><span class="tile-g">${dot(x.g)}${srcTip(x, meta.label)}</span></div>`;
  }).join("");
  return `<section class="d-sec"><div class="sec-head">${iconTitle("tent", "사이트 타입")}<span class="sec-note">${list.length}종</span></div><div class="stypes">${tiles}</div></section>`;
}
function introHtml(d) {
  const t = serviceText(d?.intro, 118);
  if (!t) return "";
  const fact = sourceFact({ src: "고캠핑 소개", url: d?.intro_url, date: d?.intro_at, quote: d?.intro }, "고캠핑 소개");
  return `<section class="d-sec intro-sec"><div class="sec-head">${iconTitle("spark", "업장 소개")}<span class="sec-note">한 줄 소개 ${srcTip(fact, "업장 소개")}</span></div><p class="intro-copy">${esc(t)}</p></section>`;
}
function amenityHtml(c) {
  const a = (c.amenities ?? []).map((x) => x.replace(".", "·"));
  const cnt = [["화장실", c.toilets], ["샤워실", c.showers], ["개수대", c.sinks]].filter(([, n]) => n > 0);
  const rent = c.rental ?? [];
  const pt = c.nearby_toilets?.within_2km;
  if (!a.length && !cnt.length && !rent.length) return "";
  return `<section class="d-sec"><div class="sec-head">${iconTitle("drop", "편의시설")}<span class="sec-note">고캠핑 등록</span></div>
    ${cnt.length ? `<div class="amen-n">${cnt.map(([l, n]) => `<div><b>${fmt(n)}</b><span>${l}</span></div>`).join("")}${pt ? `<div><b>${fmt(pt)}</b><span>2km 안 공중화장실 ${tip("<b>공중화장실</b><span>행정안전부 공중화장실 표준데이터 기준, 캠핑장 2km 안 개수입니다.</span>")}</span></div>` : ""}</div>` : ""}
    ${a.length ? `<div class="amen">${a.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
    ${rent.length ? `<p class="amen-rent"><b>대여</b>${rent.map((x) => `<span>${esc(x)}</span>`).join("")}</p>` : ""}
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
    return `<li><b>${fmt(p.won)}원</b><span>${esc(context)}</span>${srcTip(evidence, `요금 언급 ${i + 1}`)}</li>`;
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
  return String(value ?? "").replace(/^[*\-·\s]+/, "").replace(/\s+/g, " ").replace(/\s*([,.:])\s*/g, "$1 ").trim();
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
    const row = grouped.get(label) ?? { label, texts: [], url: x.url, src: x.src, at: x.date };
    if (row.texts.length < 3 && !row.texts.some((t) => t.includes(text) || text.includes(t))) row.texts.push(text);
    if (!row.url && x.url) row.url = x.url;
    grouped.set(label, row);
  }
  const order = new Map(OPERATOR_CATEGORIES.map(([label], i) => [label, i]));
  const rows = [...grouped.values()].filter((x) => x.texts.length).sort((a, b) => (order.get(a.label) ?? 99) - (order.get(b.label) ?? 99)).slice(0, 8);
  if (!rows.length) return "";
  return `<section class="d-sec operator-sec"><div class="sec-head">${iconTitle("info", "운영자 안내")}<span class="sec-note">${dot("c")}항목별 정리</span></div><div class="operator-grid">${rows.map((x) => {
    const source = srcTip({ g: "c", src: { label: sourceName(x.src, "운영자 홈페이지"), url: x.url, at: x.at, quote: x.texts.join("\n") } }, x.label);
    return `<article><span>${esc(x.label)}</span><p>${esc(operatorSummary(x.label, x.texts))}</p>${source}</article>`;
  }).join("")}</div></section>`;
}
// 예약 방법: 예약 채널 전부 + 채널별 안내 단계(guide).
function bookingHtml(c, d) {
  const ch = [...(c.booking?.channels ?? [])].sort((a, b) => b.confidence - a.confidence).filter((x, i, a) => a.findIndex((y) => y.url === x.url) === i);
  const g = d?.guide, steps = (g?.steps ?? []).filter((x) => x.t && !/https?:\/\//.test(x.t));
  if (!ch.length && !steps.length) return "";
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
  return `<section class="d-sec"><div class="sec-head">${iconTitle("calendar", "예약 방법")}${(c.booking?.methods ?? []).length ? `<span class="sec-note">${esc(c.booking.methods.join(" · "))}</span>` : ""}</div>
    ${ch.length ? `<div class="chans">${ch.map((x, i) => x.kind === "phone" ? `<a class="chan" href="tel:${esc(c.tel ?? "")}">${ic("phone")}<b>전화 예약</b><i>${esc(c.tel ?? "")}</i></a>` : `<a class="chan" href="${esc(x.url)}" target="_blank" rel="noopener">${ic("right")}<b>${esc(sourceName(x.platform_name, `예약처 ${i + 1}`))}</b><i>예약 페이지</i></a>`).join("")}</div>` : ""}
    ${meta.length ? `<dl class="uses">${meta.map(([l, v]) => `<div class="use"><dt>${l}</dt><dd>${esc(serviceText(v, 32))}${srcTip({ g: "c", src: { label: "예약 안내", url: g?.source?.url, at: g?.source?.date, quote: v } }, l)}</dd></div>`).join("")}</dl>` : ""}
    ${steps.length ? `<ol class="steps">${steps.slice(0, 5).map((x, i) => `<li>${esc(stepName(x.t, i))}</li>`).join("")}</ol><p class="booking-check">예약 절차 ${srcTip(guideFact, "예약 절차")}</p>` : ""}
    ${(pf.tips ?? []).length ? `<p class="booking-check">예약 조건 확인 ${srcTip(guideFact, "예약 조건")}</p>` : ""}
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
function snsHtml(d, c) {
  const im = (d?.sns_images ?? []).filter((x) => x.url).slice(0, 8);
  if (!im.length) return "";
  const previews = im.filter(canPreviewExternalMedia).filter((x) => externalImage(x));
  const references = im.filter((x) => !previews.includes(x));
  return `<section class="d-sec"><div class="sec-head">${iconTitle("camera", "캠퍼 사진")}<span class="sec-note">${c.soc?.[0] ? `후기 ${fmt(c.soc[0])} · ` : ""}${c.soc?.[1] ? `영상 ${fmt(c.soc[1])}` : "원문"}</span></div>
    ${previews.length ? `<div class="visitor-gallery">${previews.map((x, i) => `<button type="button" data-external-media="sns" data-index="${i}"><img src="${esc(externalImage(x))}" alt="방문 사진" loading="lazy" decoding="async"></button>`).join("")}</div>` : ""}
    ${references.length ? `<div class="visitor-sources">${references.map((x, i) => `<a href="${esc(x.url)}" target="_blank" rel="noopener"><span>${ic("camera")}방문 사진 ${i + 1}</span><i>원문 열기 · ${esc(sourceName(x.src, "외부 콘텐츠"))}</i>${ic("external", "line")}</a>`).join("")}</div>` : ""}
  </section>`;
}
function layoutHtml(d) {
  const imgs = (d?.layout?.images ?? []).filter((x) => x.url).filter((x, i, all) => all.findIndex((y) => y.url === x.url) === i).slice(0, 6);
  if (!imgs.length) return "";
  const previews = imgs.filter(canPreviewExternalMedia).filter((x) => externalImage(x));
  const references = imgs.filter((x) => !previews.includes(x));
  return `<section class="d-sec"><div class="sec-head">${iconTitle("layers", "시설 배치도")}<span class="sec-note">${imgs.length}개</span></div>
    ${previews.length ? `<div class="layout-viewer"><button class="layout-main" type="button" data-external-media="layout" data-index="0"><img src="${esc(externalImage(previews[0]))}" alt="시설 배치도" decoding="async"><span>${ic("search")}크게 보기</span></button><div class="layout-thumbs">${previews.map((x, i) => `<button type="button" data-layout-thumb="${i}"><img src="${esc(externalImage(x))}" alt="배치도 ${i + 1}" loading="lazy" decoding="async"></button>`).join("")}</div></div>` : ""}
    ${references.length ? `<div class="layout-links">${references.map((x, i) => `<a href="${esc(x.url)}" target="_blank" rel="noopener"><span>${ic("layers", "line")}배치도 ${i + 1}</span><i>원문 열기 · ${esc(sourceName(x.src, "외부 안내"))}</i>${ic("external", "line")}</a>`).join("")}</div>` : ""}
  </section>`;
}
function videosHtml(d) {
  const v = (d?.videos ?? []).filter((x) => x.yt).slice(0, 8);
  if (!v.length) return "";
  return `<section class="d-sec"><div class="sec-head">${iconTitle("video", "관련 영상")}<span class="sec-note">YouTube</span></div><div class="rail vids">${v.map((x, i) => {
    const fact = sourceFact({ src: "YouTube", url: x.url ?? `https://www.youtube.com/watch?v=${x.yt}`, date: x.date, title: x.title }, "YouTube");
    return `<article class="vid-wrap"><button type="button" class="vid" data-yt="${esc(x.yt)}"><img src="https://i.ytimg.com/vi/${encodeURIComponent(x.yt)}/hqdefault.jpg" alt="" loading="lazy" decoding="async"><span class="vid-play">${ic("video")}</span><b>현장 영상 ${i + 1}</b><i>${esc(x.date ? String(x.date).slice(0, 7) : "재생하기")}</i></button>${srcTip(fact, `관련 영상 ${i + 1}`)}</article>`;
  }).join("")}</div></section>`;
}
function reviewSummary(value) {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  const parts = text.split(/(?<=[.!?])\s+|\s{2,}/).map((x) => serviceText(x, 76)).filter(Boolean);
  const useful = /캠핑|사이트|시설|풍경|주차|전기|화장실|샤워|반려|텐트|잔디|숲|바다|요금|입실|대여/;
  const candidate = parts.find((x) => x.length >= 12 && useful.test(x) && !/^[^가-힣A-Za-z]*(?:\d{4}[./-]\d|\d{1,2}:\d{2})/.test(x) && !/^[^\p{L}\p{N}]{1,}/u.test(x) && !/^(못|ㅋㅋ|ㅎㅎ|ㅠㅠ|\.{2,})/.test(x) && !/[가-힣]+(?:시|군|구|읍|면|리).{0,24}(?:길|로|\d)/.test(x));
  return candidate || "방문 후기 확인";
}
function reviewLinksHtml(d) {
  const r = [...(d?.reviews ?? []), ...(d?.cafe ?? [])].filter((x) => x.url && x.title).slice(0, 6);
  if (!r.length) return "";
  return `<section class="d-sec"><div class="sec-head">${iconTitle("camera", "블로그 · 카페")}<span class="sec-note">${r.length}개</span></div><div class="review-links">${r.map((x, i) => {
    const platform = x.t === "cafe" ? "카페" : "블로그";
    const fact = sourceFact(x, platform, [x.title, x.snippet].filter(Boolean).join("\n"));
    const summary = reviewSummary(x.snippet);
    return `<article class="review-link-card"><a href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="${platform} 후기 ${i + 1} 원문 열기"><span class="review-link-media">${canPreviewExternalMedia(x) && externalImage(x) ? `<img src="${esc(externalImage(x))}" alt="" loading="lazy" decoding="async">` : ic(x.t === "cafe" ? "tent" : "camera")}</span><span><i>${platform}${x.date ? ` · ${esc(String(x.date).slice(0, 10))}` : ""}</i><b>방문 후기 ${i + 1}</b><em>${esc(summary)}</em></span>${ic("external", "line")}</a>${srcTip(fact, `${platform} 후기 ${i + 1}`)}</article>`;
  }).join("")}</div></section>`;
}
function infoHtml(c) {
  const name = encodeURIComponent(nameOf(c).name);
  const map = c.lat ? `https://map.kakao.com/link/map/${name},${c.lat},${c.lng}` : null;
  const to = c.lat ? `https://map.kakao.com/link/to/${name},${c.lat},${c.lng}` : null;
  const rv = c.lat ? `https://map.kakao.com/link/roadview/${c.lat},${c.lng}` : null;
  const addressActions = map ? `<span class="addr-actions"><a href="${map}" target="_blank" rel="noopener">${ic("map")}지도</a><a href="${to}" target="_blank" rel="noopener">${ic("pin")}길찾기</a><a href="${rv}" target="_blank" rel="noopener">${ic("search")}로드뷰</a></span>` : "";
  const rows = [
    ["주소", c.addr ? `<span class="address-value">${esc(c.addr)}${addressActions}</span>` : null],
    ["전화", c.tel ? `<a href="tel:${esc(c.tel)}">${esc(c.tel)}</a>` : null],
    ["홈페이지", c.homepage ? `<a href="${esc(c.homepage)}" target="_blank" rel="noopener">${esc(c.homepage.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 40))}</a>` : null],
    ["운영", [OP[c.op], (c.seasons ?? []).length === 4 ? "사계절" : (c.seasons ?? []).join("·"), (c.days ?? [])[0]].filter(Boolean).map(esc).join(" · ") || null],
  ].filter(([, v]) => v);
  return `<section class="d-sec"><div class="sec-head">${iconTitle("info", "업체 정보")}${c.gc_url ? `<a class="link" href="${esc(c.gc_url)}" target="_blank" rel="noopener">고캠핑 ${ic("right")}</a>` : ""}</div>
    <dl class="uses info">${rows.map(([l, v]) => `<div class="use"><dt>${l}</dt><dd>${v}</dd></div>`).join("")}</dl>
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
  const main = bookingChannels(c).find((x) => x.kind !== "phone");
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
  const picker = `<div class="rail picks">${saved.map((c) => { const on = S.pick.includes(String(c.id)); return `<button type="button" class="pick${on ? " on" : ""}" data-pick="${esc(c.id)}" aria-pressed="${on}"><img src="${esc(photoUrl(photosOf(c)[0] ?? ""))}" alt="" loading="lazy"><span>${esc(nameOf(c).name)}</span>${ic(on ? "check" : "plus")}</button>`; }).join("")}</div>`;
  const ds = await Promise.all(camps.map((c) => detailOf(c.id)));
  const rowsDef = [
    ["현장 조건", [["주차", (c) => facts(c).park], ["전기", (c) => facts(c).power], ["장작·숯", (c) => facts(c).fire], ["사이트 규격", (c) => facts(c).size], ["바닥", (c) => facts(c).ground], ["위생", (c) => facts(c).sanitary], ["반려동물", (c) => facts(c).pet]]],
    ["사이트", [["타입", (c) => (c.st?.length ? { v: typeLine2(c), g: "c" } : null)], ["사이트 수", (c, d) => profFact(PF(d, "TYPE"))]]],
    ["시간·요금", [["입실", (c, d) => usage(c, d)[0][1]], ["퇴실", (c, d) => usage(c, d)[1][1]], ["매너타임", (c, d) => usage(c, d)[2][1]], ["요금", (c, d) => usage(c, d)[3][1]]]],
    ["시설·주변", [["편의시설", (c) => ((c.amenities ?? []).length ? { v: c.amenities.slice(0, 6).join(" · "), g: "c" } : null)], ["대여", (c) => ((c.rental ?? []).length ? { v: c.rental.join(" · "), g: "c" } : null)], ["편의점", (c) => (c.nl?.c ? { v: km(c.nl.c), g: "c" } : null)], ["마트", (c) => (c.nl?.m ? { v: km(c.nl.m), g: "c" } : null)], ["후기 장점", (c) => (c.rv?.p?.length ? { v: c.rv.p.slice(0, 2).map(([t]) => t).join(" · "), g: "m" } : null)]]],
  ];
  const head = camps.map((c) => `<th scope="col"><a class="ch" href="#/c/${encodeURIComponent(c.id)}"><img src="${esc(photoUrl(photosOf(c)[0] ?? ""))}" alt="" loading="lazy"><span><b>${esc(nameOf(c).name)}</b><i>${esc(region(c))}</i></span></a><button class="icon-btn ch-x" type="button" data-pick="${esc(c.id)}" aria-label="비교에서 빼기">${ic("close")}</button></th>`).join("");
  const opens = camps.map((c) => { const o = openingOf(c); const ch = (c.booking?.channels ?? []).find((x) => x.kind !== "phone"); return `<td class="${o ? "hot" : ""}">${o ? `<b>${esc(o.txt)}</b> · ` : ""}${esc(ch?.platform_name ?? "–")}</td>`; }).join("");
  const body = rowsDef.map(([g, rows]) => `<tr class="grp"><th scope="rowgroup" colspan="${camps.length + 1}">${g}</th></tr>${rows.map(([l, get]) => {
    const vals = camps.map((c, i) => get(c, ds[i]));
    const keys = vals.map((v) => v?.v ?? "");
    const diff = new Set(keys).size > 1;
    return `<tr class="${diff ? "diff" : ""}"><th scope="row">${l}</th>${vals.map((v) => `<td>${v ? `${esc(v.v)}${dot(v.g)}` : '<span class="none">–</span>'}</td>`).join("")}</tr>`;
  }).join("")}`).join("");
  const acts = camps.map((c) => { const ch = (c.booking?.channels ?? []).find((x) => x.kind !== "phone"); return `<td>${ch ? `<a class="btn primary wide" href="${esc(ch.url)}" target="_blank" rel="noopener">예약</a>` : `<a class="btn ghost wide" href="#/c/${encodeURIComponent(c.id)}">자세히</a>`}</td>`; }).join("");
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
  const name = h.startsWith("#/c/") ? "detail" : h.startsWith("#/map") ? "map" : h.startsWith("#/compare") ? "compare" : "home";
  $$("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === (name === "detail" ? "home" : name)));
  document.body.dataset.view = name;
  if (name === "home") { v.innerHTML = homeView(); bindHome(); }
  else if (name === "detail") { v.innerHTML = `<div class="loading"></div>`; v.innerHTML = await detailView(decodeURIComponent(h.slice(4))); bindDetail(); }
  else if (name === "compare") { v.innerHTML = await compareView(); bindCompare(); }
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
