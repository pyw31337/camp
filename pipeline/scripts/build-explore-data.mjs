// 웹 탐색 화면 데이터 → out/explore/{campgrounds.json, meta.json}
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildCampDetails, buildExploreRecords, buildProviders } from "../lib/explore-data.mjs";
import { themeCatalog } from "../lib/themes.mjs";
import { buildBookingGuide } from "../lib/booking-intel.mjs";
import { buildOpenings } from "../lib/openings.mjs";
import { nameCore, refilterSocial } from "../lib/social-search.mjs";
import { fillShorts, refilterShorts } from "../lib/shorts-search.mjs";
import { nameCore as shortsNameCore } from "../lib/social-search.mjs";
import { allocateUnique, dhashFile, photoKey, uniqueBy, uniqueByHash } from "../lib/photo-dedupe.mjs";
import { SEOUL_DATASET_URL, matchSeoulToCampgrounds } from "../lib/seoul-yeyak.mjs";
import { commonOperatorTexts, mergeLogs, nameCoreOf, reviewDetailTexts } from "../lib/detail-text-review.mjs";

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = async (rel) => (existsSync(p(rel)) ? JSON.parse(await readFile(p(rel), "utf8")) : null);
const camps = await read("../out/campgrounds.json");
if (!camps) { console.log("::warning title=탐색 데이터 건너뜀::out/campgrounds.json이 없습니다(고캠핑 동기화 먼저)."); process.exit(0); }
const toilets = await read("../out/campground-toilets.json");
const fees = await read("../out/tour-fees.json");
const nearby = await read("../out/campground-nearby.json");
const products = await read("../out/campground-products.json");
const social = await read("../out/campground-social.json");
// YouTube 숏츠 능동 수집(scripts/sync-shorts.mjs): 영상 칸에 ‘채우기만’ 한다.
const shortsOut = (await read("../out/campground-shorts.json")) ?? (await read("../registry/shorts-search.json"));
// 네이버 검색 API(블로그·카페·웹문서·지식iN) 언급 + robots 허용 블로그 본문 문장(scripts/sync-web-mentions.mjs)
const web = await read("../out/campground-web.json");
// 방문후기 썸네일(블로그 대표 이미지, scripts/fill-review-thumbs.mjs): 썸네일이 비어 있을 때만 채운다.
const reviewThumbs = (await read("../registry/review-thumbs.json"))?.thumbs ?? {};
// 제휴·운영자 제공으로 확인한 공지만 읽는다. 플랫폼 공지 페이지를 자동 수집하지 않는다.
const notices = await read("../registry/campground-notices.json");
// 자체 저장 공식 사진(webp, media 브랜치). 없으면 고캠핑 원본 주소를 그대로 쓴다.
const mediaDir = process.env.MEDIA_DIR;
const media = mediaDir && existsSync(`${mediaDir}/manifest.json`) ? JSON.parse(await readFile(`${mediaDir}/manifest.json`, "utf8")) : null;
// 중복 사진 거르기(자체 저장 공식 사진): 같은 파일(이름 키)·같은 장면(dHash ≤ 6)은 하나만, 3곳 이상에 똑같이 붙은 사진(준비중·공통 이미지)은 뺀다.
const hostedById = new Map();
if (media) {
  const hashOf = new Map();
  for (const entries of Object.values(media.camps ?? {})) for (const e of entries) {
    if (!e.thumb || hashOf.has(e.thumb) || !existsSync(`${mediaDir}/${e.thumb}`)) continue;
    try { hashOf.set(e.thumb, await dhashFile(`${mediaDir}/${e.thumb}`)); } catch { /* 깨진 파일은 해시 없이 둔다 */ }
  }
  const campsByHash = new Map();
  for (const [id, entries] of Object.entries(media.camps ?? {})) for (const e of entries) { const h = hashOf.get(e.thumb); if (h) campsByHash.set(h, (campsByHash.get(h) ?? new Set()).add(id)); }
  const generic = new Set([...campsByHash].filter(([, ids]) => ids.size >= 3).map(([h]) => h));
  let dropped = 0;
  for (const [id, entries] of Object.entries(media.camps ?? {})) {
    const kept = uniqueByHash(uniqueBy(entries, (e) => photoKey(e.src_url)), (e) => hashOf.get(e.thumb)).filter((e) => !generic.has(hashOf.get(e.thumb)));
    dropped += entries.length - kept.length;
    hostedById.set(id, kept);
  }
  console.log(`공식 사진 중복 정리: 해시 ${hashOf.size}장 · 공통 이미지 ${generic.size}종 · 제외 ${dropped}장`);
}
const hostedOf = (id) => hostedById.get(id) ?? media?.camps?.[id] ?? [];
const registry = await read("../registry/booking-rules.json");
const platforms = await read("../registry/booking-platforms.json");
const calendar = await read("../out/open-calendar.json");

const seoulRaw = await read("../out/seoul-yeyak.json");
const seoul = seoulRaw ? matchSeoulToCampgrounds(seoulRaw.services ?? [], camps.campgrounds ?? []) : new Map();
const pilotFacts = await read("../registry/pilot-condition-facts.json");
const stdCampgrounds = await read("../out/standard-campgrounds.json");
const records = buildExploreRecords(camps, toilets, fees, seoul, notices, pilotFacts);
// 카탈로그에 없는 당일 캠크닉(펀앤펀 등)은 레지스트리에서 붙인다. 다음 전체 빌드에서도 유지.
const campnicExtra = await read("../registry/private-campnic.json");
if (campnicExtra?.sites) {
  const have = new Set(records.map((r) => r.name));
  for (const s of campnicExtra.sites) {
    if (s.in_catalog || have.has(s.name)) continue;
    records.push({
      id: s.id || `c-${s.name}`,
      name: s.name,
      sido: (s.region || "").split(" ")[0] || "경기도",
      sigungu: (s.region || "").split(" ")[1] || null,
      area: "서울·경기",
      addr: s.addr || s.region || "",
      op: "PRIVATE",
      status: "운영",
      types: ["캠크닉"],
      amenities: [],
      fee: s.fee ? { text: s.fee, grade: "MENTION" } : null,
      booking: s.source ? { url: s.source, channels: [{ platform_id: "web", platform_name: "안내", url: s.source, kind: "online", confidence: 0.7, evidence: ["campnic_registry"] }] } : null,
    });
    have.add(s.name);
  }
}

// 분야별 공공 우수야영장(고캠핑 공개 목록, registry/gocamping-best.json): [[연도, 분야]] 최근 연도 먼저
const best = await read("../registry/gocamping-best.json");
for (const r of records) {
  const awards = best?.by_campground?.[r.id];
  if (awards?.length) { r.best = awards.map((a) => [a.year, a.field]); r.best_at = best.generated_at; }
  const hero = hostedOf(r.id)[0];
  if (hero?.thumb) r.ph = hero.thumb;
  const std = stdCampgrounds?.records?.[r.id];
  if (std?.specs) r.specs = std.specs;
}
const meta = {
  generated_at: new Date().toISOString(),
  count: records.length,
  sources: [
    { id: "gocamping", name: "한국관광공사 고캠핑", url: "https://www.data.go.kr/data/15101933/openapi.do", tier: "A", fetched_at: camps.fetched_at ?? null },
    stdCampgrounds && { id: "standard-campgrounds", name: "행정안전부 전국야영(캠핑)장표준데이터 · 산림빅데이터", url: "https://www.data.go.kr/data/15101914/openapi.do", tier: "A", fetched_at: stdCampgrounds.fetched_at ?? null },
    pilotFacts && { id: "pilot-condition-facts", name: "모여라캠핑 파일럿 조건표 (공식 원문 대조)", url: "https://github.com/pyw31337/camp/blob/main/pipeline/registry/pilot-condition-facts.json", tier: "A", fetched_at: pilotFacts.updated_at ?? null },
    toilets && { id: "toilets", name: "행정안전부 공중화장실정보 · OpenStreetMap", url: "https://file.localdata.go.kr/file/public_restroom_info/info", tier: "A", fetched_at: toilets.generated_at ?? null },
    fees && { id: "tour-fees", name: "한국관광공사 TourAPI 소개정보(안내 요금 문구)", url: "https://www.data.go.kr/data/15101578/openapi.do", tier: "B", fetched_at: fees.generated_at ?? null },
    seoulRaw && { id: "seoul-yeyak", name: "서울시 공공서비스예약 정보(접수 상태)", url: SEOUL_DATASET_URL, tier: "A", fetched_at: seoulRaw.generated_at ?? null },
    nearby && { id: "nearby", name: "주변 정보: 한국관광공사 TourAPI · OpenStreetMap(ODbL) · 도로공사/졸음쉼터", url: "https://www.openstreetmap.org/copyright", tier: "B", fetched_at: nearby.generated_at ?? null },
    calendar && { id: "calendar", name: "모여라 캠핑 예약 규칙 레지스트리", url: "https://github.com/pyw31337/camp/blob/main/pipeline/registry/booking-rules.json", tier: "B", fetched_at: calendar.generated_at ?? null },
  ].filter(Boolean),
  providers: buildProviders(registry, calendar),
  themes: themeCatalog().map((t) => ({ ...t, count: records.filter((r) => r.th.includes(t.id)).length })),
  stats: {
    with_booking_url: records.filter((r) => r.booking.url).length,
    online_realtime: records.filter((r) => r.booking.methods.some((m) => /실시간/.test(m))).length,
    with_fee_text: records.filter((r) => r.fee).length,
    with_nearby_toilet: records.filter((r) => r.nearby_toilets?.within_2km).length,
    with_image: records.filter((r) => r.img).length,
    with_intro: records.filter((r) => r.line).length,
    with_seoul_status: records.filter((r) => r.seoul.length).length,
    seoul_services: seoulRaw?.services?.length ?? 0,
    with_products: Object.keys(products?.campgrounds ?? {}).filter((k) => products.campgrounds[k].products?.length).length,
    with_social: Object.keys(social?.campgrounds ?? {}).length,
    with_self_hosted_photo: records.filter((r) => r.ph).length,
    with_nearby: nearby ? Object.values(nearby.campgrounds ?? {}).filter((x) => Object.values(x).some((v) => v?.length)).length : 0,
    // ‘확인 필요’를 포함한 전수 조건 모델. 전력 W·텐트 옆 주차·숯/장작 사용
    // 허용은 고캠핑 표준값이 아니므로 확정 수치로 세지 않는다.
    field_conditions: records.length,
    electricity_registered: records.filter((r) => r.field_conditions?.power?.available === true).length,
    shelter_setup_registered: records.filter((r) => r.field_conditions?.shelter_setup?.state === "CONFIRMED").length,
    site_size_registered: records.filter((r) => r.field_conditions?.site_size?.groups?.length).length,
    ground_registered: records.filter((r) => r.field_conditions?.ground?.types?.length).length,
    naver_booking_channel: records.filter((r) => r.booking.channels.some((channel) => channel.platform_id === "naver")).length,
    camfit_booking_channel: records.filter((r) => r.booking.channels.some((channel) => channel.platform_id === "camfit")).length,
    official_notice_camps: records.filter((r) => r.important_info?.items?.length).length,
    official_notice_items: records.reduce((sum, r) => sum + (r.important_info?.items?.length ?? 0), 0),
    verified_condition_facts: records.filter((r) => r.field_conditions?.status === "VERIFIED").length,
  },
};
await mkdir(p("../out/explore/"), { recursive: true });
// 빈 값(null·빈 배열·빈 문자열)은 빼서 전송량을 줄인다. 화면이 기본값을 채운다.
const compact = (v) => {
  if (Array.isArray(v)) return v.map(compact);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, compact(x)]).filter(([, x]) => !(x == null || x === "" || (Array.isArray(x) && !x.length))));
  return v;
};
await writeFile(p("../out/explore/meta.json"), JSON.stringify(meta));
// 캠핑장별 상세 파일(data/camps/{id}.json). 목록은 가볍게, 상세는 필요할 때만.
await rm(p("../out/explore/camps/"), { recursive: true, force: true });
await mkdir(p("../out/explore/camps/"), { recursive: true });
const details = buildCampDetails(camps, nearby);
// 캠핑장별 예약 안내: 예약 채널 판별 + 예약처 절차 + 이 캠핑장의 오픈 규칙(운영자 문구·TourAPI 예약 안내·예약처 규칙) + 다음 오픈
const now = new Date();
const byId = new Map((camps.campgrounds ?? []).map((c) => [String(c.external_id.id), c]));
const recById = new Map(records.map((r) => [r.id, r]));
let guided = 0, withOpen = 0;
const guides = new Map();
for (const [id, d] of Object.entries(details)) {
  const c = byId.get(id), fee = fees?.records?.[id], rec = recById.get(id);
  const std = stdCampgrounds?.records?.[id];
  if (std) {
    if (std.specs) d.std_specs = std.specs;
    if (std.nature && Object.values(std.nature).some(Boolean)) d.nature = std.nature;
  }
  if (fee) for (const [k, f] of [["hours", "hours_text"], ["rest_days", "rest_days_text"], ["parking", "parking_fee_text"], ["open_period", "open_period_text"], ["reservation_note", "reservation_text"]]) if (fee[f]) d[k] = fee[f];
  if (!platforms || !c) continue;
  const extra = fee?.reservation_text ? [{ text: fee.reservation_text, field: "tourapi.reservation", source: { url: fee.source_url, checked_at: fee.checked_at, tier: "C", label: "한국관광공사 TourAPI 예약안내" } }] : [];
  try {
    const g = buildBookingGuide(c, platforms, extra, { now });
    const p = g.platform;
    d.guide = {
      platform: p ? { id: p.id, name: p.name, url: p.official_url, help: p.help_urls ?? [], opening: p.opening_summary ?? null, payment: p.payment_deadline?.text ?? null, cancel: p.cancel_policy_location ?? null, waitlist: p.waitlist?.text ?? null, account: p.account?.notes ?? null, tips: (p.tips ?? []).map((t) => t.text ?? t), unverified: Boolean(p.needs_verification) } : null,
      steps: g.steps.map((s) => ({ t: s.text, v: s.verified })),
      open_rules: g.open_rules.map((r) => ({ label: r.label, applies: r.applies ?? null, applies_to: r.applies_to ?? null, snippet: r.snippet ?? null, tier: r.source?.tier ?? null, src: r.source?.label ?? null, url: r.source?.url ?? null, checked_at: r.source?.checked_at ?? null, unverified: Boolean(r.needs_verification) })),
      next: g.next_openings.map((n) => ({ at: n.at, label: n.label, time_known: n.time_known, stay: n.stay ?? null, applies: n.applies ?? null, unverified: Boolean(n.needs_verification) })),
      warnings: g.warnings.map((w) => w.message),
    };
    guided++;
    guides.set(id, { platform: p ? { name: p.name, url: p.official_url } : null, next: g.next_openings });
    const confirmed = g.next_openings.find((n) => !n.needs_verification && n.applies !== "IF_NATIONAL" && n.applies !== "VARIANT") ?? null;
    if (rec && confirmed) { rec.booking.next = { at: confirmed.at, label: confirmed.label, time_known: confirmed.time_known }; withOpen++; }
  } catch (error) { console.log(`::warning title=예약 안내 실패::${id} ${error.message}`); }
}
console.log(`예약 안내 ${guided}곳 · 확정 오픈 일정 ${withOpen}곳`);
// 고캠핑 imageList(공식 사진) 중 아직 자체 저장하지 않은 것은 원본 주소로 바로 보여 준다(고캠핑 공식 이미지 서버).
const imageListCache = await read("../.cache/gocamping-images.json") ?? {};
// 관광공사 객실·사이트 상품(공식 등록 기준가·상품 사진)과 공식 사진
// 같은 시군구의 다른 캠핑장 핵심어(후기 제목이 다른 캠핑장을 가리키는지 판정용)
const coresBySigungu = new Map();
for (const c of camps.campgrounds ?? []) { const k = `${c.address?.sido ?? ""} ${c.address?.sigungu ?? ""}`; if (!coresBySigungu.has(k)) coresBySigungu.set(k, []); coresBySigungu.get(k).push(nameCore(c.name, c.address?.sigungu)); }
// 검색 사진 썸네일이 몇 곳에 붙었는지(같은 썸네일이 여러 캠핑장에 붙으면 공통·오매칭 사진)
const snapCamps = new Map(), usedSnaps = new Set();
for (const [cid, so] of Object.entries(social?.campgrounds ?? {})) for (const x of so.image ?? []) if (x.thumb) snapCamps.set(x.thumb, (snapCamps.get(x.thumb) ?? new Set()).add(cid));
for (const [id, d] of Object.entries(details)) {
  const pr = products?.campgrounds?.[id];
  if (pr) {
    if (pr.products?.length) d.products = pr.products.map((x) => ({ name: x.name, size: x.size ?? null, count: x.count ?? null, base: x.base ?? null, max: x.max ?? null, price: x.price ?? null, intro: x.intro ?? null, amenities: x.amenities ?? [], photos: x.photos ?? [] }));
    if (pr.info?.length) d.tour_info = pr.info;
    if (pr.photos?.length) d.tour_photos = pr.photos.map((x) => x.url);
    d.products_src = { url: pr.source_url, checked_at: pr.checked_at, basis: "한국관광공사 TourAPI 공식 등록 기준가(최소 요금)" };
  }
  // 캐시된 후기에도 최신 관련성 규칙을 다시 적용하고(지명만 겹친 버스·산행 글 제거) 정보량 점수(q)를 붙인다.
  const soRaw = social?.campgrounds?.[id], gc = byId.get(id);
  const so = soRaw && gc ? refilterSocial(gc, soRaw, { others: coresBySigungu.get(`${gc.address?.sido ?? ""} ${gc.address?.sigungu ?? ""}`) ?? [] }) : soRaw;
  if (so) {
    if (so.blog?.length) d.reviews = so.blog;
    if (so.cafe?.length) d.cafe = so.cafe;
    // 검색 사진: 같은 원본(이름 키)은 한 장만, 배치도로 이미 보인 사진과 여러 캠핑장(3곳 이상)에 똑같이 붙은 사진은 뺀다.
    const layoutKeys = new Set((so.layout?.images ?? []).map((x) => photoKey(x.img ?? x.thumb)));
    const images = uniqueBy((so.image ?? []).filter((x) => (snapCamps.get(x.thumb)?.size ?? 0) < 3), (x) => photoKey(x.img ?? x.thumb), layoutKeys);
    const titleByUrl = new Map();
    const wr = web?.campgrounds?.[id]; // 아래 w(231행)는 이 블록 밖에서 선언돼 여기서 쓸 수 없다
    for (const r of [...(so.blog ?? []), ...(so.cafe ?? []), ...(wr?.blog ?? []), ...(wr?.cafe ?? []), ...(wr?.web ?? [])]) {
      if (r.url && r.title) titleByUrl.set(r.url, r.title);
    }
    for (const img of images) {
      if (!img.title && titleByUrl.has(img.url)) img.title = titleByUrl.get(img.url);
    }
    if (images.length) d.sns_images = images;
    if (so.vclip?.length) d.videos = so.vclip;
    if (so.layout) d.layout = so.layout;
    if (so.prices?.length) d.prices = so.prices;
    d.social_checked_at = so.fetched_at ?? null;
    // 카카오 후기·카페 글에 본문 사실 문장이 있으면 붙인다(추출기가 요약보다 긴 근거를 읽게).
    for (const x of [...(d.reviews ?? []), ...(d.cafe ?? [])]) { const b = web?.bodies?.[x.url]; if (b?.length) x.body = b; }
    const rec = records.find((r) => r.id === id);
    if (rec) rec.soc = [(so.blog?.length ?? 0) + (so.cafe?.length ?? 0), so.vclip?.length ?? 0, so.image?.length ?? 0];
    // 공식 사진이 없는 곳은 목록 썸네일로 Daum 검색 이미지 썸네일 주소를 쓴다(저장·재호스팅 없음, 화면에 “검색 사진” 표기).
    // 목록 썸네일은 다른 캠핑장과 겹치지 않는 검색 사진만(같은 사진이 두 곳 이상에 붙으면 매칭이 의심스럽다).
    const snap = images.find((x) => x.thumb && snapCamps.get(x.thumb)?.size === 1 && !usedSnaps.has(x.thumb));
    if (snap) usedSnaps.add(snap.thumb);
    if (rec && !rec.ph && !rec.img && snap) rec.sn = snap.thumb;
  }
}
// 웹 언급: 카카오 후기와 겹치지 않는 네이버 블로그·카페·웹문서·지식iN 글(요약 + 허용 본문 문장)과 요금 언급
for (const [id, d] of Object.entries(details)) {
  const w = web?.campgrounds?.[id];
  if (!w) continue;
  const known = new Set([...(d.reviews ?? []), ...(d.cafe ?? [])].map((x) => x.url));
  const docs = (w.docs ?? []).filter((x) => !known.has(x.url));
  if (docs.length) d.web = docs;
  for (const x of [...(d.web ?? []), ...(d.reviews ?? []), ...(d.cafe ?? [])]) if (!x.thumb && reviewThumbs[x.url]) x.thumb = reviewThumbs[x.url];
  if (w.prices?.length) {
    const seen = new Set((d.prices ?? []).map((p) => `${p.url}|${p.won}`));
    d.prices = [...(d.prices ?? []), ...w.prices.filter((p) => !seen.has(`${p.url}|${p.won}`))]
      .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))).slice(0, 16);
  }
  d.web_checked_at = w.fetched_at ?? null;
}
// 이번 실행의 캐시(소셜·웹 언급)에 없는 캠핑장은 직전 발행본의 글·사진·영상·요금 언급을 그대로 잇는다.
// 캐시가 일부만 복원된 날 전체 재빌드가 후기 2,686→1,156곳처럼 줄어 회귀 가드에 막히던 문제(2026-10-19) — 줄이지 않고 덧붙이기만.
const prevDir = p("../../camping-atlas/public/explore/data/camps/");
let carried = 0;
if (existsSync(prevDir)) for (const [id, d] of Object.entries(details)) {
  const needSo = !social?.campgrounds?.[id], needWeb = !web?.campgrounds?.[id];
  if (!needSo && !needWeb) continue;
  const f = `${prevDir}${id}.json`;
  if (!existsSync(f)) continue;
  let prev;
  try { prev = JSON.parse(await readFile(f, "utf8")); } catch { continue; }
  let any = false;
  const keys = [...(needSo ? ["reviews", "cafe", "sns_images", "videos", "layout", "social_checked_at"] : []), ...(needWeb ? ["web", "web_checked_at"] : [])];
  for (const k of keys) if (prev[k] != null && d[k] == null) { d[k] = prev[k]; any = true; }
  if (prev.prices?.length) {
    const seen = new Set((d.prices ?? []).map((x) => `${x.url}|${x.won}`));
    const add = prev.prices.filter((x) => !seen.has(`${x.url}|${x.won}`));
    if (add.length) { d.prices = [...(d.prices ?? []), ...add].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))).slice(0, 16); any = true; }
  }
  const rec = needSo ? records.find((r) => r.id === id) : null;
  if (rec && (d.reviews || d.cafe || d.videos || d.sns_images)) rec.soc = [(d.reviews?.length ?? 0) + (d.cafe?.length ?? 0), d.videos?.length ?? 0, d.sns_images?.length ?? 0];
  if (any) carried++;
}
if (carried) console.log(`직전 발행본에서 이어 받은 글·사진(이번 캐시에 없던 곳): ${carried}곳`);
// 숏츠 채우기(병합 정책 ①): 이미 있는 영상은 그대로 두고, 같은 YouTube id가 없는 숏츠만 뒤에 붙인다. 줄이거나 바꾸지 않는다.
{
  let campsGained = 0, fromZero = 0, added = 0;
  // 레지스트리 캐시로 대신 읽을 때도 엄격 판정(shortsMatch)으로 다시 거른다.
  const recById = new Map(records.map((x) => [String(x.id), x]));
  const campOf = (x) => ({ name: x?.name, address: { sigungu: x?.sigungu ?? x?.address?.sigungu } });
  const coreN = new Map();
  for (const x of records) { const k = shortsNameCore(x.name, campOf(x).address.sigungu).toLowerCase(); coreN.set(k, (coreN.get(k) ?? 0) + 1); }
  for (const [id, r] of Object.entries(shortsOut?.campgrounds ?? {})) {
    const d = details[id], rec0 = recById.get(String(id));
    if (!d || !rec0 || !r?.shorts?.length) continue;
    const c = campOf(rec0);
    const sh = refilterShorts(c, r.shorts, { dup: (coreN.get(shortsNameCore(c.name, c.address.sigungu).toLowerCase()) ?? 0) > 1 });
    if (!sh.length) continue;
    const before = d.videos?.length ?? 0;
    const f = fillShorts(d.videos ?? [], sh);
    if (!f.added.length) continue;
    d.videos = f.videos; campsGained++; added += f.added.length; if (!before) fromZero++;
    const rec = records.find((x) => x.id === id);
    if (rec) rec.soc = [rec.soc?.[0] ?? 0, d.videos.length, rec.soc?.[2] ?? 0];
  }
  if (campsGained) console.log(`숏츠 채우기: ${campsGained}곳(영상 없던 곳 ${fromZero}곳) · ${added}개`);
}
for (const [id, d] of Object.entries(details)) {
  // 이미 저장한 사진(중복으로 뺀 것 포함)과 이름 키가 같은 원본 주소는 다시 보여 주지 않는다.
  const seenKeys = new Set((media?.camps?.[id] ?? []).map((x) => photoKey(x.src_url)));
  const remote = uniqueBy((imageListCache[id]?.images ?? []).map((x) => x.imageUrl).filter(Boolean), photoKey, seenKeys).slice(0, 40);
  if (remote.length) d.photos_remote = remote;
  // 고캠핑 대표 사진(thumb_720_파일)이 위 사진과 같은 파일이면 화면에서 한 번 더 붙이지 않는다.
  const img = recById.get(id)?.img;
  if (img && seenKeys.has(photoKey(img))) d.img_dup = 1;
}
for (const [id, d] of Object.entries(details)) {
  const photos = hostedOf(id).filter((x) => x.thumb && x.large).map((x) => ({ t: x.thumb, l: x.large, w: x.w, h: x.h }));
  if (photos.length) d.photos = photos;
}
// 상세 글 점검(lib/detail-text-review.mjs): 이 캠핑장 이야기가 아니거나 칸에 맞지 않는 글을 빼고, 운영 안내는 항목을 다시 정한다.
const gcById = new Map((camps.campgrounds ?? []).map((c) => [String(c.external_id?.id ?? c.id), c]));
const reviewCores = new Map();
for (const c of camps.campgrounds ?? []) { const k = `${c.address?.sido ?? ""} ${c.address?.sigungu ?? ""}`; (reviewCores.get(k) ?? reviewCores.set(k, []).get(k)).push(nameCoreOf(c.name, c.address?.sigungu)); }
const reviewRegions = new Set((camps.campgrounds ?? []).map((c) => String(c.address?.sigungu ?? "").split(/\s+/)[0].replace(/(시|군|구)$/, "")).filter((x) => x.length >= 2));
const reviewCommon = new Set(commonOperatorTexts(Object.entries(details).map(([id, d]) => ({ sido: gcById.get(String(id))?.address?.sido, d }))));
await writeFile(p("../out/explore/text-common.json"), `${JSON.stringify([...reviewCommon])}\n`);
const reviewLogs = [];
for (const [id, d] of Object.entries(details)) {
  const gc = gcById.get(String(id));
  if (!gc) continue;
  const r = reviewDetailTexts(d, { name: gc.name, sigungu: gc.address?.sigungu }, { others: reviewCores.get(`${gc.address?.sido ?? ""} ${gc.address?.sigungu ?? ""}`) ?? [], regions: reviewRegions, common: reviewCommon });
  details[id] = r.d;
  reviewLogs.push(r.log);
}
const reviewSum = mergeLogs(reviewLogs);
console.log(`상세 글 점검: 바뀐 곳 ${reviewSum.camps_changed} · 뺀 글 ${Object.values(reviewSum.removed).reduce((a, b) => a + b, 0)} · 표기 다듬음 ${reviewSum.normalized} ${JSON.stringify(reviewSum.removed)}`);
for (const [id, d] of Object.entries(details)) await writeFile(p(`../out/explore/camps/${id}.json`), JSON.stringify(d));
console.log(`탐색 데이터 ${records.length}곳 ${JSON.stringify(meta.stats)}`);
console.log(`테마 ${meta.themes.map((t) => `${t.label} ${t.count}`).join(" · ")}`);
// 홈 화면용 추천(테마별 사진 있는 캠핑장): 자체 저장 사진이 있고 예약 정보가 풍부한 곳 우선
const score = (r) => (r.booking.methods.some((m) => /실시간/.test(m)) ? 4 : 0) + (r.booking.url ? 3 : 0) + (r.line ? 2 : 0) + (r.kinds.length ? 1 : 0);
const withPhoto = records.filter((r) => r.ph).sort((a, b) => score(b) - score(a));
const FEATURED_ORDER = ["valley", "sea", "forest", "kids", "pet", "glamping", "caravan", "autumn", "winter", "lake", "mountain", "public"];
// 테마 줄마다 다른 캠핑장(같은 사진)이 반복되지 않게 번갈아 나눠 담는다. 같은 사진 파일을 쓰는 곳도 한 번만.
const featuredThemes = FEATURED_ORDER.map((id) => meta.themes.find((t) => t.id === id)).filter(Boolean);
const photoOnce = uniqueBy(withPhoto, (r) => r.ph);
const picked = allocateUnique(featuredThemes.map((t) => ({ id: t.id, candidates: photoOnce.filter((r) => r.th.includes(t.id)) })), 12);
const featured = {
  generated_at: meta.generated_at, total: records.length, photo_count: records.filter((r) => r.ph || r.img).length,
  themes: featuredThemes.map((t) => ({
    id: t.id, label: t.label, desc: t.desc, count: t.count,
    camps: (picked.get(t.id) ?? []).map((r) => ({ id: r.id, name: r.name, where: [r.sido, r.sigungu].filter(Boolean).join(" "), line: r.line ?? null, ph: r.ph, rt: r.booking.methods.some((m) => /실시간/.test(m)) })),
  })).filter((t) => t.camps.length),
};
await writeFile(p("../out/explore/featured.json"), JSON.stringify(featured));
// 예약 오픈 목록(캠핑장별, 45일 이내): 예약오픈 메뉴·홈의 “이번 주 예약 오픈” 숫자가 이 파일을 쓴다.
const openings = buildOpenings({ records, guides, now });
await writeFile(p("../out/explore/openings.json"), JSON.stringify({ generated_at: meta.generated_at, days: 45, items: openings }));
console.log(`예약 오픈 목록 ${openings.length}건 · 캠핑장 ${new Set(openings.map((o) => o.id)).size}곳`);
// 목록 파일은 예약 안내(다음 오픈)까지 붙인 뒤에 쓴다.
await writeFile(p("../out/explore/campgrounds.json"), JSON.stringify(records.map(compact)));
