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
  camps: [], byId: new Map(), photos: {}, cards: {}, openings: new Map(),
  q: "", area: "all", quick: new Set(), theme: null, feeBand: store.get("mc-feeband", ""), sort: "rich", shown: 24, mode: "keyword",
  saved: store.get("mc-saved", store.get("mc-compare", [])), pick: store.get("mc-pick", []), compare: store.get("mc-compare", []), gear: store.get("mc-gear", { size: "5.5x8", needs: ["park", "fire"] }),
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

// ── 내 장비 판정 ─────────────────────────────────────────────
const SIZES = [["4x4", "돔 4×4m", 4, 4], ["5x5", "거실형 5×5m", 5, 5], ["5.5x8", "리빙쉘 5.5×8m", 5.5, 8], ["6x9", "대형 6×9m", 6, 9]];
const NEEDS = [["park", "텐트 옆 주차"], ["fire", "장작"], ["power", "전기"]];
function judge(c) {
  const f = facts(c), sz = SIZES.find((s) => s[0] === S.gear.size), res = [];
  if (sz) {
    const g = f.size?.groups;
    if (!g?.length) res.push(["size", null]);
    else {
      const fit = g.filter(([a, b]) => (a >= sz[2] && b >= sz[3]) || (a >= sz[3] && b >= sz[2]));
      res.push(["size", fit.length === g.length ? true : fit.length ? "part" : false, fit.length && fit.length < g.length ? `${fit.map(([a, b]) => `${a}×${b}m`).join("·")}만` : null]);
    }
  }
  for (const n of S.gear.needs) {
    const x = f[n];
    res.push([n, x && filled(x) ? x.ok : null]);
  }
  const known = res.filter((r) => r[1] !== null);
  const ok = res.filter((r) => r[1] === true).length;
  const verdict = res.some((r) => r[1] === false) ? "no" : res.some((r) => r[1] === "part") ? "part" : known.length === res.length ? "ok" : null;
  return { res, ok, total: res.length, verdict };
}
const VERDICT = { ok: ["맞음", "vd-ok"], part: ["조건부", "vd-part"], no: ["안 맞음", "vd-no"] };
function verdictChip(c) {
  const j = judge(c);
  // 목록에서는 맞는 곳만 알려 준다(‘안 맞음’은 상세의 내 장비 칸에서만).
  if (j.verdict !== "ok") return "";
  return `<span class="vd ${VERDICT[j.verdict][1]}">${VERDICT[j.verdict][0]} ${j.ok}/${j.total}</span>`;
}
function gearLabel() {
  const sz = SIZES.find((s) => s[0] === S.gear.size);
  return sz ? sz[1].split(" ")[0] : "내 장비";
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
  if (S.q) {
    const hay = c._hay ??= `${c.name} ${c.addr} ${c.sido} ${c.sigungu} ${(c.env ?? []).join(" ")} ${(c.types ?? []).join(" ")} ${c.pf?.s ?? ""}`.toLowerCase();
    if (!S.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}
const rich = (c) => (c.pf?.k ?? 0) * 10 + (S.photos[c.id]?.length ?? 0) + (Object.values(facts(c)).filter(filled).length);
function results() {
  const list = S.camps.filter((c) => matches(c));
  if (S.sort === "name") list.sort((a, b) => nameOf(a).name.localeCompare(nameOf(b).name, "ko"));
  else if (S.sort === "gear") { const o = { ok: 0, part: 1, null: 2, no: 3 }; list.sort((a, b) => o[judge(a).verdict ?? "null"] - o[judge(b).verdict ?? "null"] || rich(b) - rich(a)); }
  else list.sort((a, b) => rich(b) - rich(a));
  return list;
}

// ── 사진 ─────────────────────────────────────────────────────
const photoUrl = (u) => (u.startsWith("media/") ? `../${u}` : u);
// 카드 사진: 첫 장은 자체 호스팅 대표 사진, 나머지는 카드용 webp(media/cards, sync-card-photos.mjs)가 있으면 그것을,
// 아직 없으면 고캠핑 원본 URL(photos.json)을 쓴다.
function photosOf(c) {
  const p = S.photos[c.id];
  const own = S.cards[c.id];
  if (own?.length) return [...(p?.length ? [p[0]] : c.ph ? [`media/${c.ph}`] : []), ...own.map((x) => `media/${x}`)].slice(0, 5);
  if (p?.length) return p;
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
    ? `<img src="${esc(photoUrl(u))}" alt="${alt}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" draggable="false">`
    : `<img data-src="${esc(photoUrl(u))}" alt="" decoding="async" draggable="false">`).join("");
  const dots = ph.length > 1 ? `<span class="car-dots" aria-hidden="true">${ph.map((_, i) => `<i${i ? "" : ' class="on"'}></i>`).join("")}</span>` : "";
  const nav = ph.length > 1 ? `<button class="car-nav prev" type="button" aria-label="이전 사진" tabindex="-1">${ic("left")}</button><button class="car-nav next" type="button" aria-label="다음 사진" tabindex="-1">${ic("right")}</button>` : "";
  return `<div class="car ${cls}" data-n="${ph.length}"><div class="car-track">${slides}</div>${dots}${nav}</div>`;
}
function hydrate(car) {
  if (car.dataset.h) return;
  car.dataset.h = 1;
  $$("img[data-src]", car).forEach((im) => { im.src = im.dataset.src; im.removeAttribute("data-src"); });
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
      if (!left) (car.closest(".card, .mi") ?? car).remove();
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
    tr.addEventListener("click", () => { const hit = car.closest(".card, .mi")?.querySelector(".card-hit"); if (hit) location.hash = hit.getAttribute("href"); });
  }
}

// ── 카드 ─────────────────────────────────────────────────────
function rowsHtml(c) {
  const f = facts(c);
  const row = (n, label, x) => `<li><span class="rn">${n}</span><span class="rl">${label}</span><span class="rv${x ? "" : " none"}">${x ? esc(x.v) : "–"}</span>${x ? dot(x.g) : ""}</li>`;
  return `<ol class="rows">${row("01", "주차", f.park)}${row("02", "전기", f.power)}${row("03", "장작", f.fire)}</ol>`;
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
      ${o ? `<span class="sig">${ic("clock")}${esc(o.txt)}</span>` : ""}
      <span class="bdgs">${badges(c, 3)}</span>
    </div>
    <div class="card-body">
      <div class="name-row"><h3 class="card-name">${esc(nameOf(c).name)}</h3>${heartBtn(c)}</div>
      <p class="card-meta">${esc(region(c))}${tag ? ` · ${esc(tag)}` : ""}${typeLine(c) ? ` · ${esc(typeLine(c))}` : ""}${verdictChip(c)}</p>
      ${rowsHtml(c)}
      ${c.fee?.text ? `<p class="card-price"><span>1박</span><b>${esc(c.fee.text)}</b>${dot(GR(c.fee.grade))}</p>` : c.fee?.min ? `<p class="card-price"><span>1박</span><b>${band(c.fee.min)}부터</b>${dot(GR(c.fee.grade))}</p>` : ""}
    </div>
  </article>`;
}

// ── 공통 UI: 토스트·(i) 말풍선 ───────────────────────────────
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 1800); }
const TIPS = new Map();
let tipN = 0;
function tip(html) { const k = `t${++tipN}`; TIPS.set(k, html); return `<button class="ib" type="button" data-tip="${k}" aria-label="출처">${ic("info")}</button>`; }
function srcTip(x, label) {
  if (!x) return "";
  const s = x.src ?? {};
  const d = s.at ? String(s.at).slice(0, 10) : "";
  return tip(`<b>${esc(label)}</b><span>${GRADE_TXT[x.g] ?? ""}${s.label ? ` · ${esc(s.label)}` : ""}${d ? ` · ${esc(d)}` : ""}</span>${s.quote ? `<q>${esc(String(s.quote).slice(0, 140))}</q>` : ""}${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">원문 보기</a>` : ""}`);
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

// ── 내 장비 시트 ─────────────────────────────────────────────
function renderGear() {
  $('[data-gear="size"]').innerHTML = SIZES.map(([k, l]) => `<button type="button" data-size="${k}" aria-pressed="${S.gear.size === k}">${l}</button>`).join("");
  $('[data-gear="needs"]').innerHTML = NEEDS.map(([k, l]) => `<button type="button" data-need="${k}" aria-pressed="${S.gear.needs.includes(k)}">${ic(k === "park" ? "car" : k === "fire" ? "flame" : "bolt")}${l}</button>`).join("");
  $$("[data-gear-label]").forEach((x) => (x.textContent = gearLabel()));
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open=gear]")) { renderGear(); $("#gear-dialog").showModal(); return; }
  const s = e.target.closest("[data-size]"), n = e.target.closest("[data-need]");
  if (s) { S.gear.size = s.dataset.size; renderGear(); }
  if (n) { const k = n.dataset.need; S.gear.needs = S.gear.needs.includes(k) ? S.gear.needs.filter((x) => x !== k) : [...S.gear.needs, k]; renderGear(); }
});
$("#gear-dialog").addEventListener("close", () => { store.set("mc-gear", S.gear); renderGear(); for (const c of S.camps) delete c._j; route(); });

// ── 화면: 찾기(메인) ─────────────────────────────────────────
function countOf(test) { return S.camps.reduce((n, c) => n + (test(c) ? 1 : 0), 0); }
function homeView() {
  const openings = S.camps.map((c) => [c, openingOf(c)]).filter(([c, o]) => o && hasPhoto(c)).sort((a, b) => a[1].dd - b[1].dd);
  const themeItems = THEMES.map(([key, label, test]) => {
    const cover = S.camps.filter((c) => test(c) && hasPhoto(c)).sort((a, b) => rich(b) - rich(a))[0];
    if (!cover) return "";
    return `<button class="theme-card" type="button" data-theme-all="${key}"><img src="${esc(photoUrl(photosOf(cover)[0]))}" alt="" loading="lazy" decoding="async"><span><b>${esc(label)}</b><i>${fmt(countOf(test))}곳</i></span></button>`;
  }).join("");
  return `
  <section class="hero" aria-labelledby="hero-t">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="hero-in">
      <h1 id="hero-t"><span class="h1-a">이번 주말,</span> <span class="h1-b"><em>빈자리부터.</em></span></h1>
      <p class="hero-summary">전국 <b>${fmt(S.camps.length)}개</b> 캠핑장 소식 · 현재 오픈 <b>${fmt(openings.length)}개</b></p>
      <div class="finder">
        <form class="finder-form" role="search" data-search>
          <label class="finder-field finder-destination"><small>어디로</small><input type="search" name="q" value="${esc(S.q)}" placeholder="전국 또는 캠핑장명" aria-label="지역 또는 캠핑장명" autocomplete="off" enterkeyhint="search"></label>
          <button class="finder-field finder-static" type="button" data-open="date"><small>언제</small><b>날짜 선택</b></button>
          <button class="finder-field finder-static" type="button" data-open="gear"><small>누구와</small><b>성인 2 · 차 1</b></button>
          <button class="finder-field finder-static" type="button" data-open="gear"><small>내 장비</small><b>${esc(gearLabel())}</b></button>
          <button class="finder-go" type="submit">${ic("search")}<span>찾기</span></button>
        </form>
        <div class="rail chips finder-regions" aria-label="지역">${AREAS.map(([k, l]) => `<button type="button" class="chip" data-area="${k}" aria-pressed="${S.area === k}">${l}</button>`).join("")}</div>
      </div>
    </div>
  </section>

  <section class="quick" aria-label="빠른 조건">
    ${Object.entries(QUICK).map(([k, q]) => `<button type="button" class="qk qk-${q.cls}" data-quick="${k}" aria-pressed="${S.quick.has(k)}"><span class="qk-ic">${ic(q.icon)}</span><b>${q.label}</b><i>${fmt(countOf(q.test))}곳</i></button>`).join("")}
  </section>

  <section class="fee-filter" aria-label="1박 요금대">
    <div class="rail fee-bands">
      <span class="fee-band-lbl">1박 요금</span>
      <button type="button" class="chip fee-chip" data-fee-band="" aria-pressed="${!S.feeBand}">전체</button>
      <button type="button" class="chip fee-chip" data-fee-band="u3" aria-pressed="${S.feeBand === 'u3'}">~3만원 <i>${fmt(countOf((c) => Boolean(c.fee?.min && c.fee.min <= 30000)))}</i></button>
      <button type="button" class="chip fee-chip" data-fee-band="3to5" aria-pressed="${S.feeBand === '3to5'}">3~5만원 <i>${fmt(countOf((c) => Boolean(c.fee?.min && c.fee.min <= 50000 && (c.fee.max == null || c.fee.max >= 30000))))}</i></button>
      <button type="button" class="chip fee-chip" data-fee-band="5to7" aria-pressed="${S.feeBand === '5to7'}">5~7만원 <i>${fmt(countOf((c) => Boolean(c.fee?.min && c.fee.min <= 70000 && (c.fee.max == null || c.fee.max >= 50000))))}</i></button>
      <button type="button" class="chip fee-chip" data-fee-band="o7" aria-pressed="${S.feeBand === 'o7'}">7만원+ <i>${fmt(countOf((c) => Boolean(c.fee && (c.fee.min >= 70000 || (c.fee.max && c.fee.max >= 70000)))))}</i></button>
    </div>
  </section>

  <section class="results" id="results" aria-labelledby="res-t">
    <div class="res-head">
      <h2 id="res-t" data-res-title></h2>
      <div class="res-tools">
        <div class="rail active-chips" data-active></div>
        <label class="sort">${ic("list")}<select data-sort aria-label="정렬">
          <option value="rich"${S.sort === "rich" ? " selected" : ""}>정보 많은 순</option>
          <option value="gear"${S.sort === "gear" ? " selected" : ""}>내 장비 맞는 순</option>
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

  ${openings.length ? `<section class="opens" aria-labelledby="op-t">
    <div class="sec-head"><h2 id="op-t">곧 <em>오픈</em></h2><a class="link" href="#/map">지도에서 보기 ${ic("right")}</a></div>
    <div class="rail opens-rail">${openings.map(([c, o]) => `<a class="open-card" href="#/c/${encodeURIComponent(c.id)}"><img src="${esc(photoUrl(photosOf(c)[0] ?? ""))}" alt="" loading="lazy" decoding="async"><span class="open-dd">${esc(o.txt)}</span><b>${esc(nameOf(c).name)}</b><i>${esc(region(c))} · ${esc(o.platform ?? "")}</i></a>`).join("")}</div>
  </section>` : ""}
  ${themeItems ? `<section class="themes-catalog" aria-labelledby="theme-t">
    <div class="sec-head"><h2 id="theme-t">테마로 <em>고르기</em></h2></div>
    <div class="rail theme-catalog-rail">${themeItems}</div>
  </section>` : ""}`;
}
// 사진이 없는 곳은 카드로 보이지 않는다(소유자: 사진 없는 썸네일 금지). 이름 검색일 때만 아래 글 목록으로 남긴다.
const hasPhoto = (c) => photosOf(c).length > 0;
const themeName = (k) => (k === "ALL" ? "전체" : THEMES.find((t) => t[0] === k)?.[1] ?? "");
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
  const rows = $("[data-rows]"), noph = $("[data-nophoto]");
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
  v.addEventListener("submit", (e) => { const f = e.target.closest("[data-search]"); if (!f) return; e.preventDefault(); S.q = f.q.value.trim(); renderResults(); $("#results").scrollIntoView({ behavior: "smooth", block: "start" }); });
  v.addEventListener("change", (e) => { if (e.target.matches("[data-sort]")) { S.sort = e.target.value; renderResults(); } });
  const sentinel = $(".more-wrap");
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting && !$("[data-more]").hidden) moreResults(); }, { rootMargin: "800px" });
  io.observe(sentinel);
  cleanup.push(() => { io.disconnect(); v.removeEventListener("click", homeClicks); });
}
function homeClicks(e) {
  const m = e.target.closest("[data-mode]");
  if (m) {
    if (m.dataset.mode === "map") { location.hash = "#/map"; return; }
    S.mode = m.dataset.mode;
    $$("[data-mode]").forEach((x) => x.setAttribute("aria-selected", String(x === m)));
    $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== S.mode));
    return;
  }
  const a = e.target.closest("[data-area]");
  if (a) { S.area = a.dataset.area; $$("[data-area]").forEach((x) => x.setAttribute("aria-pressed", String(x === a))); renderResults(); return; }
  const t = e.target.closest("[data-theme]");
  if (t) { S.theme = S.theme === t.dataset.theme ? null : t.dataset.theme; $$("[data-theme]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.theme === S.theme))); renderResults(); return; }
  const all = e.target.closest("[data-theme-all]");
  if (all) { S.theme = all.dataset.themeAll; render(); $("#results").scrollIntoView({ block: "start" }); return; }
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
    if (k === "q") S.q = ""; else if (k === "area") S.area = "all"; else if (k === "theme") S.theme = null;
    else if (k === "feeBand") { S.feeBand = ""; store.set("mc-feeband", ""); $$("[data-fee-band]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.feeBand === ""))); }
    else if (k.startsWith("quick:")) S.quick.delete(k.slice(6));
    else { S.q = ""; S.area = "all"; S.theme = null; S.quick.clear(); S.feeBand = ""; store.set("mc-feeband", ""); $$("[data-fee-band]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.feeBand === ""))); }
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
    rows = prods.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.size || "-")}</td><td>${esc(p.base ? `기준 ${p.base}인` : "-")}</td><td class="text-price">${p.price ? fmt(p.price) + "원" : "예약처 확인"}</td></tr>`).join("");
  } else if (groups.length) {
    rows = groups.map((g) => `<tr><td><b>${esc(g.name || "일반 사이트")}</b></td><td>${g.width_m && g.depth_m ? `${g.width_m}×${g.depth_m}m` : "-"}</td><td>${g.count ? `${g.count}면` : "-"}</td><td class="text-price">${feeInfo?.text ? esc(feeInfo.text) : (feeInfo?.min ? `${band(feeInfo.min)}대` : "예약처 확인")}</td></tr>`).join("");
  } else if (feeInfo) {
    rows = `<tr><td><b>1박 기준 요금</b></td><td>-</td><td>-</td><td class="text-price">${feeInfo.text ? esc(feeInfo.text) : (feeInfo.min ? `${band(feeInfo.min)}부터` : "-")}</td></tr>`;
  }
  return `<section class="d-sec">
    <div class="sec-head"><h2>사이트 규격 및 1박 요금</h2>${feeInfo?.basis ? `<span class="sec-note">${esc(feeInfo.basis)}</span>` : ""}</div>
    <div class="table-wrap"><table class="site-table"><thead><tr><th>구분</th><th>규격</th><th>규모</th><th>1박 요금</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}
function specTiles(c) {
  const f = facts(c);
  const T = [["size", "size", "설치 공간", ""], ["park", "car", "텐트 옆 주차", "cobalt"], ["power", "bolt", "전기", "volt"], ["fire", "flame", "장작·숯", "flame"], ["ground", "layers", "바닥", ""], ["shelter", "tent", "텐트·타프", ""], ["sanitary", "drop", "위생", ""], ["hot", "drop", "온수", ""], ["pet", "paw", "반려동물", ""]];
  return T.map(([k, i, l, cls]) => {
    const x = f[k];
    const on = x && cls && x.ok !== false && !(k === "fire" && x.kind === "NO_FIRE");
    return `<div class="tile${x ? "" : " unk"} ${on ? `t-${cls}` : ""}"><span class="tile-ic">${ic(i)}</span><span class="tile-l">${l}</span><b class="tile-v">${x ? esc(x.v) : "확인필요"}</b>${x ? `<span class="tile-g">${dot(x.g)}${srcTip(x, l)}</span>` : ""}</div>`;
  }).join("");
}
function gearTiles(c) {
  const j = judge(c), L = { size: "설치 공간", park: "텐트 옆 주차", fire: "장작", power: "전기" };
  const V = (r) => (r[1] === true ? ["맞음", "ok"] : r[1] === "part" ? [r[2] ?? "일부만", "part"] : r[1] === false ? ["안 맞음", "no"] : ["–", "unk"]);
  return `<div class="gear-tiles">${j.res.map((r) => { const [t, cls] = V(r); return `<div class="gt gt-${cls}"><span>${L[r[0]]}</span><b>${esc(t)}</b></div>`; }).join("")}</div>`;
}
const NL = [["c", "store", "편의점"], ["m", "cart", "마트"], ["b", "meat", "정육점"], ["f", "fuel", "주유소"], ["p", "cross", "약국"], ["v", "paw", "동물병원"]];
const km = (m) => (m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`);
function nearbyHtml(c) {
  const nl = c.nl ?? {};
  const items = NL.filter(([k]) => nl[k] && nl[k] < 20000).map(([k, i, l]) => `<div class="near"><span class="near-ic">${ic(i)}</span><span><b>${l}</b><i>${km(nl[k])}</i></span></div>`);
  return items.length ? `<div class="rail nears">${items.join("")}</div>` : "";
}
function reviewHtml(d, c) {
  const rv = d?.rv ?? c.rv;
  if (!rv || (!rv.p?.length && !rv.c?.length)) return "";
  const li = (arr, cls, icn) => arr.slice(0, 4).map(([t, n]) => `<span class="rvp ${cls}">${ic(icn)}${esc(t)} <i>${n}</i></span>`).join("");
  return `<section class="d-sec"><div class="sec-head"><h2>후기</h2><span class="sec-note">${fmt(rv.n)}건 요약 ${tip("<b>후기 요약</b><span>이 캠핑장 글로 확인된 블로그·카페 후기에서 주제를 센 값입니다. 협찬 글이 섞일 수 있어요.</span>")}</span></div><div class="rvs">${li(rv.p ?? [], "pro", "heart")}${li(rv.c ?? [], "con", "down")}</div></section>`;
}
function reserveCard(c, d) {
  const ch = [...(c.booking?.channels ?? [])].sort((a, b) => b.confidence - a.confidence);
  const main = ch.find((x) => x.kind !== "phone") ?? null;
  const o = openingOf(c) ?? (S.openings.get(String(c.id)) ?? null);
  const price = profFact(PF(d, "PRICE")) ?? (c.fee ? { v: c.fee.text || (c.fee.min ? `${band(c.fee.min)}부터` : null), g: GR(c.fee.grade) || "c", src: { label: c.fee.basis, url: c.fee.url, at: c.fee.checked_at } } : null);
  const short = (n) => String(n ?? "").replace(/ 예약시스템| 공공서비스예약|\(.*\)/g, "").trim();
  return `<div class="reserve">
    <div class="rs-top"><span>${esc(main ? short(main.platform_name) : "예약")}</span>${o ? `<span class="rs-dd">${esc(o.txt ?? o.kind)}</span>` : ""}</div>
    ${o ? `<p class="rs-open"><b>${esc(new Date(o.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }))}</b><span>${esc(o.label ?? "")}</span></p>` : ""}
    ${price ? `<p class="rs-price"><b>${esc(price.v)}</b>${dot(price.g)}${srcTip(price, "요금")}</p>` : ""}
    <div class="rs-btns">
      ${main ? `<a class="btn primary wide" href="${esc(main.url)}" target="_blank" rel="noopener">${esc(short(main.platform_name))} 예약</a>` : ""}
      ${c.tel ? `<a class="btn ghost" href="tel:${esc(c.tel)}">${ic("phone")}전화</a>` : ""}
      ${heartBtn(c, { label: true })}
    </div>
  </div>`;
}
function galleryHtml(c) {
  const ph = photosOf(c).map(photoUrl);
  if (!ph.length) return "";
  const alt = esc(nameOf(c).name);
  const grid = `<div class="gal-grid n${Math.min(ph.length, 5)}">${ph.slice(0, 5).map((u, i) => `<button type="button" class="gal-cell" data-gal="${i}"><img src="${esc(u)}" alt="${i ? "" : alt}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"></button>`).join("")}</div>`;
  const rail = `<div class="gal-rail">${carousel(c, { eager: true, cls: "car-gal" })}</div>`;
  return `<div class="gallery">${grid}${rail}</div>`;
}
async function detailView(id) {
  const c = S.byId.get(id);
  if (!c) return `<div class="empty">${ic("search")}<b>캠핑장을 찾지 못했어요</b><a class="btn ghost" href="#/">찾기로</a></div>`;
  const d = await detailOf(id);
  const f = facts(c), { tag } = nameOf(c), j = judge(c);
  const spec = ["size", "park", "power", "fire", "ground", "shelter", "sanitary", "hot", "pet"];
  const known = spec.filter((k) => f[k]).length;
  const o = openingOf(c);
  const us = usage(c, d);
  return `<article class="detail" data-id="${esc(c.id)}">
    <div class="d-bar"><a class="icon-btn" href="#/" data-back aria-label="뒤로">${ic("left")}</a><span class="d-crumb">${esc(region(c))}</span>${heartBtn(c, { label: true })}</div>
    <header class="d-head">
      <p class="d-eyebrow">${esc(region(c))}${c.op && OP[c.op] ? ` · ${OP[c.op]}` : tag ? ` · ${esc(tag)}` : ""}${typeLine(c) ? ` · ${esc(typeLine(c))}` : ""}</p>
      <h1 class="d-title">${titleHtml(c)}</h1>
      <div class="d-bdgs">${badges(c, 5)}</div>
    </header>
    ${galleryHtml(c)}
    <div class="d-sum">
      <div><span>확인된 규격</span><b>${known}<i>/${spec.length}</i></b></div>
      <div><span>내 장비</span><b>${j.ok}<i>/${j.total}</i></b>${j.verdict ? `<em class="${VERDICT[j.verdict][1]}">${VERDICT[j.verdict][0]}</em>` : ""}</div>
      <div><span>다음 오픈</span><b class="${o ? "hot" : "muted"}">${o ? esc(o.txt) : "–"}</b></div>
    </div>
    <div class="d-body">
      <div class="d-main">
        <section class="d-sec"><div class="sec-head"><h2>기본 규격</h2><span class="sec-note legend">${dot("v")}원문 ${dot("c")}공식 ${dot("m")}언급</span></div><div class="tiles">${specTiles(c)}</div></section>
        <section class="d-sec"><div class="sec-head"><h2>내 장비</h2><button class="link" type="button" data-open="gear">${esc(gearLabel())} ${ic("right")}</button></div>${gearTiles(c)}</section>
        ${sitePricingHtml(c, d)}
        <section class="d-sec"><div class="sec-head"><h2>이용 정보</h2></div><dl class="uses">${us.map(([l, x]) => `<div class="use${x ? "" : " unk"}"><dt>${l}</dt><dd>${x ? `${esc(x.v)}${dot(x.g)}${srcTip(x, l)}` : "확인필요"}</dd></div>`).join("")}</dl></section>
        ${nearbyHtml(c) ? `<section class="d-sec"><div class="sec-head"><h2>가는 길에</h2><span class="sec-note">직선거리 ${tip("<b>주변 생활 인프라</b><span>행정안전부 지방행정 인허가(LOCALDATA) 영업 중 업소까지의 직선거리입니다.</span>")}</span></div>${nearbyHtml(c)}</section>` : ""}
        ${reviewHtml(d, c)}
      </div>
      <aside class="d-side">${reserveCard(c, d)}</aside>
    </div>
    <div class="d-dock">${reserveDock(c)}</div>
  </article>`;
}
function reserveDock(c) {
  const main = [...(c.booking?.channels ?? [])].sort((a, b) => b.confidence - a.confidence).find((x) => x.kind !== "phone");
  return `${heartBtn(c)}${c.tel ? `<a class="btn ghost" href="tel:${esc(c.tel)}" aria-label="전화">${ic("phone")}</a>` : ""}${main ? `<a class="btn primary wide" href="${esc(main.url)}" target="_blank" rel="noopener">예약하기</a>` : ""}`;
}
function bindDetail() {
  initCarousels($("#view"));
  const back = $("[data-back]");
  back?.addEventListener("click", (e) => { if (history.length > 1 && S.cameFromApp) { e.preventDefault(); history.back(); } });
  $$(".gal-cell").forEach((b) => b.addEventListener("click", () => openLightbox(S.byId.get($(".detail").dataset.id), Number(b.dataset.gal))));
}
function openLightbox(c, start) {
  const ph = photosOf(c).map(photoUrl);
  const dlg = document.createElement("dialog");
  dlg.className = "lightbox";
  dlg.innerHTML = `<button class="icon-btn lb-x" aria-label="닫기">${ic("close")}</button><div class="lb-track">${ph.map((u) => `<img src="${esc(u)}" alt="" decoding="async">`).join("")}</div><p class="lb-cap">사진: 한국관광공사 고캠핑</p>`;
  document.body.append(dlg);
  dlg.showModal();
  const tr = $(".lb-track", dlg);
  requestAnimationFrame(() => (tr.scrollLeft = start * tr.clientWidth));
  $(".lb-x", dlg).onclick = () => dlg.close();
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
    ["시간·요금", [["입실", (c, d) => usage(c, d)[0][1]], ["퇴실", (c, d) => usage(c, d)[1][1]], ["매너타임", (c, d) => usage(c, d)[2][1]], ["요금", (c, d) => usage(c, d)[3][1]]]],
  ];
  const head = camps.map((c) => `<th scope="col"><a class="ch" href="#/c/${encodeURIComponent(c.id)}"><img src="${esc(photoUrl(photosOf(c)[0] ?? ""))}" alt="" loading="lazy"><span><b>${esc(nameOf(c).name)}</b><i>${esc(region(c))}</i>${verdictChip(c)}</span></a><button class="icon-btn ch-x" type="button" data-pick="${esc(c.id)}" aria-label="비교에서 빼기">${ic("close")}</button></th>`).join("");
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
  const v = judge(c).verdict;
  if (v === "ok") return ["맞음", "pin-ok"];
  if (v === "part") return ["조건부", "pin-part"];
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
    <div class="mi-b"><p class="card-meta">${esc(region(c))}${typeLine(c) ? ` · ${esc(typeLine(c))}` : ""}</p><h3>${esc(nameOf(c).name)}</h3><span class="bdgs inline">${badges(c, 3)}${verdictChip(c)}</span></div>
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
  const [camps, photos, openings, cards] = await Promise.all([
    fetch(`${DATA}campgrounds.json`).then((r) => r.json()),
    fetch("./data/photos.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch(`${DATA}openings.json`).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    fetch("../media/cards/index.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  S.camps = camps.filter((c) => c.status !== "폐업");
  S.byId = new Map(S.camps.map((c) => [String(c.id), c]));
  S.photos = photos;
  S.cards = cards?.camps ?? {};
  for (const o of openings.items ?? []) if (!S.openings.has(String(o.id)) || o.kind !== "접수 마감") S.openings.set(String(o.id), o);
  S.saved = S.saved.filter((id) => S.byId.has(id));
  // 이전 주소(#c=1554)도 새 상세 주소로 보정해 공유 링크를 깨지 않는다.
  const legacy = location.hash.match(/^#c=(.+)$/);
  if (legacy) history.replaceState(null, "", `#/c/${legacy[1]}`);
  syncCompare(); renderGear(); updateHeaderGlass();
  route();
})();
