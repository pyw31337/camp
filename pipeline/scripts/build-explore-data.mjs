// 웹 탐색 화면 데이터 → out/explore/{campgrounds.json, meta.json}
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildCampDetails, buildExploreRecords, buildProviders } from "../lib/explore-data.mjs";
import { themeCatalog } from "../lib/themes.mjs";
import { buildBookingGuide } from "../lib/booking-intel.mjs";
import { SEOUL_DATASET_URL, matchSeoulToCampgrounds } from "../lib/seoul-yeyak.mjs";

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = async (rel) => (existsSync(p(rel)) ? JSON.parse(await readFile(p(rel), "utf8")) : null);
const camps = await read("../out/campgrounds.json");
if (!camps) { console.log("::warning title=탐색 데이터 건너뜀::out/campgrounds.json이 없습니다(고캠핑 동기화 먼저)."); process.exit(0); }
const toilets = await read("../out/campground-toilets.json");
const fees = await read("../out/tour-fees.json");
const nearby = await read("../out/campground-nearby.json");
// 자체 저장 공식 사진(webp, media 브랜치). 없으면 고캠핑 원본 주소를 그대로 쓴다.
const mediaDir = process.env.MEDIA_DIR;
const media = mediaDir && existsSync(`${mediaDir}/manifest.json`) ? JSON.parse(await readFile(`${mediaDir}/manifest.json`, "utf8")) : null;
const registry = await read("../registry/booking-rules.json");
const platforms = await read("../registry/booking-platforms.json");
const calendar = await read("../out/open-calendar.json");

const seoulRaw = await read("../out/seoul-yeyak.json");
const seoul = seoulRaw ? matchSeoulToCampgrounds(seoulRaw.services ?? [], camps.campgrounds ?? []) : new Map();
const records = buildExploreRecords(camps, toilets, fees, seoul);
for (const r of records) { const hero = media?.camps?.[r.id]?.[0]; if (hero?.thumb) r.ph = hero.thumb; }
const meta = {
  generated_at: new Date().toISOString(),
  count: records.length,
  sources: [
    { id: "gocamping", name: "한국관광공사 고캠핑", url: "https://www.data.go.kr/data/15101933/openapi.do", tier: "A", fetched_at: camps.fetched_at ?? null },
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
    with_self_hosted_photo: records.filter((r) => r.ph).length,
    with_nearby: nearby ? Object.values(nearby.campgrounds ?? {}).filter((x) => Object.values(x).some((v) => v?.length)).length : 0,
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
for (const [id, d] of Object.entries(details)) {
  const c = byId.get(id), fee = fees?.records?.[id], rec = recById.get(id);
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
    const confirmed = g.next_openings.find((n) => !n.needs_verification && n.applies !== "IF_NATIONAL" && n.applies !== "VARIANT") ?? null;
    if (rec && confirmed) { rec.booking.next = { at: confirmed.at, label: confirmed.label, time_known: confirmed.time_known }; withOpen++; }
  } catch (error) { console.log(`::warning title=예약 안내 실패::${id} ${error.message}`); }
}
console.log(`예약 안내 ${guided}곳 · 확정 오픈 일정 ${withOpen}곳`);
for (const [id, d] of Object.entries(details)) {
  const photos = (media?.camps?.[id] ?? []).filter((x) => x.thumb && x.large).map((x) => ({ t: x.thumb, l: x.large, w: x.w, h: x.h }));
  if (photos.length) d.photos = photos;
}
for (const [id, d] of Object.entries(details)) await writeFile(p(`../out/explore/camps/${id}.json`), JSON.stringify(d));
console.log(`탐색 데이터 ${records.length}곳 ${JSON.stringify(meta.stats)}`);
console.log(`테마 ${meta.themes.map((t) => `${t.label} ${t.count}`).join(" · ")}`);
// 목록 파일은 예약 안내(다음 오픈)까지 붙인 뒤에 쓴다.
await writeFile(p("../out/explore/campgrounds.json"), JSON.stringify(records.map(compact)));
