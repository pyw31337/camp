#!/usr/bin/env node
// 정보가 부족한 업장을 삭제하거나 값을 추정하지 않고, 다음 수집에서
// 어떤 허용된 원천을 먼저 확인할지 우선순위 큐로 만든다.
// 네트워크를 호출하지 않는 감사 단계이며 data-sync가 매일 갱신한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enrichmentGapScore } from "../lib/enrichment-priority.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const dataDir = join(root, "camping-atlas/public/explore/data");
const catalog = JSON.parse(readFileSync(join(dataDir, "campgrounds.json"), "utf8"));
const detailDir = join(dataDir, "camps");
const outPath = join(root, "pipeline/registry/data-enrichment-queue.json");

const readDetail = (id) => {
  const p = join(detailDir, `${id}.json`);
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return {}; }
};
const hasText = (v) => typeof v === "string" ? v.trim().length > 0 : Boolean(v);
const hasBooking = (c, d) => Boolean(c.booking?.url || c.booking?.channels?.length || c.dl?.length || d.booking?.channels?.length);
const hasPhoto = (c, d) => Boolean(c.ph || c.img || c.pt?.t || c.sn || d.photos?.length || d.photos_remote?.length);
const hasCardPhoto = (c) => Boolean(c.ph || c.img || c.pt?.t || c.sn);
const isDayUse = (c) => Boolean(c.du || c.types?.some((x) => /공원|물놀이터|캠크닉|관광농원/.test(String(x))));
const isCampLike = (c) => !isDayUse(c) && (c.types ?? []).some((x) => /야영|캠핑|글램핑|카라반|휴양림|캠프닉/.test(String(x)));

const sourceCatalog = {
  photo: ["공식 고캠핑·TourAPI 사진", "운영자 홈페이지 허용 OG/대표 이미지", "검증된 후기 후보(내용 판정 후)"],
  core: ["공공 표준·인허가 데이터", "운영자 홈페이지·공지(robots 허용 경로)", "TourAPI 공식 상세"],
  nearby: ["LOCALDATA 인허가 파일", "공공데이터포털 시설 표준데이터", "주간 OSM 추출본(보조)"],
  operator: ["운영자 홈페이지·예약 안내", "지자체 공개 안내", "이용자 제보 후 원문 확인"],
};

const queue = [];
const byGap = {};
const addGap = (g) => { byGap[g] = (byGap[g] ?? 0) + 1; };
for (const c of catalog) {
  const id = String(c.id);
  const d = readDetail(id);
  const gaps = [];
  const kinds = [];
  if (!hasCardPhoto(c)) { gaps.push("thumbnail"); kinds.push("카드 대표 썸네일"); }
  else if (!hasPhoto(c, d)) { gaps.push("photo"); kinds.push("상세 사진"); }
  if (!c.fee && !d.prices?.length && !d.profile?.fields?.PRICE) { gaps.push("price"); kinds.push("1박 요금"); }
  if (!c.ti?.i && !d.profile?.fields?.CHECKIN && !d.spec?.fields?.CHECKIN_TIME) { gaps.push("checkin"); kinds.push("입실"); }
  if (!c.ti?.o && !d.profile?.fields?.CHECKOUT && !d.spec?.fields?.CHECKOUT_TIME) { gaps.push("checkout"); kinds.push("퇴실"); }
  if (!c.ti?.m && !d.profile?.fields?.MANNER && !d.spec?.fields?.MANNER_TIME) { gaps.push("manner"); kinds.push("매너타임"); }
  if (!c.booking && !hasBooking(c, d)) { gaps.push("booking"); kinds.push("예약 경로"); }
  if (!hasText(c.homepage) && !hasText(d.homepage)) { gaps.push("operator"); kinds.push("운영자 링크"); }
  if (!c.tel && !d.tel && !d.contact?.tel) { gaps.push("contact"); kinds.push("연락처"); }
  if (!c.nl && !d.nearby_licensed && !d.nearby_public) { gaps.push("nearby"); kinds.push("주변 시설"); }
  if (!gaps.length) continue;

  // 캠핑장 본체를 먼저 채우고, 당일 공원은 고유 정보 원천이 생길 때만 보강한다.
  const campLike = isCampLike(c);
  const base = campLike ? 100 : isDayUse(c) ? 35 : 60;
  const score = Math.max(1, base + gaps.length * 7 + (c.iq != null && c.iq < 20 ? 15 : 0) + (c.sido ? 0 : 8));
  const recommended = new Set();
  for (const g of gaps) for (const s of (g === "photo" || g === "thumbnail") ? sourceCatalog.photo : g === "nearby" ? sourceCatalog.nearby : g === "operator" ? sourceCatalog.operator : sourceCatalog.core) recommended.add(s);
  for (const g of gaps) addGap(g);
  queue.push({
    id, name: c.name, sido: c.sido ?? null, sigungu: c.sigungu ?? null,
    kind: campLike ? "campground" : isDayUse(c) ? "day-use" : "other",
    priority: score, gaps, missing: kinds, sources: [...recommended],
    current: { iq: c.iq ?? null, has_photo: hasPhoto(c, d), has_card_photo: hasCardPhoto(c), has_booking: hasBooking(c, d), has_homepage: hasText(c.homepage) || hasText(d.homepage) },
    collection: {
      last_social_at: d.social_checked_at ?? null,
      last_web_at: d.web_checked_at ?? null,
      next_social_due: d.social_checked_at ? new Date(Date.parse(d.social_checked_at) + 14 * 864e5).toISOString() : null,
      next_web_due: d.web_checked_at ? new Date(Date.parse(d.web_checked_at) + 14 * 864e5).toISOString() : null,
      priority_score: enrichmentGapScore(c, d).score,
    },
  });
}
queue.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "ko"));
const summary = {
  total: catalog.length,
  queued: queue.length,
  campground: queue.filter((x) => x.kind === "campground").length,
  day_use: queue.filter((x) => x.kind === "day-use").length,
  other: queue.filter((x) => x.kind === "other").length,
  gaps: byGap,
  next_sources: [
    "공공 표준·인허가 파일: 자동차야영장업·일반야영장업·지자체 야영장 현황 대조",
    "TourAPI·포토코리아: 공식 대표 사진·상품·시설 설명 보강",
    "운영자 공개 홈페이지: robots 허용 페이지의 요금·입퇴실·예약·시설 원문",
    "LOCALDATA·공공시설 표준데이터: 편의점·약국·정육점·주유소·휴양림·수영장·실내놀이",
    "이용자 제보: 원문 URL과 확인 시각을 받은 뒤 검토 큐로 편입",
  ],
  policy: "빈칸·오래된 업장 우선. 카드 사진·상세 SNS 사진은 별도 상태로 관리하며, 실패한 원천은 다음 배치에 재시도한다.",
};
// 전체 대상을 보관한다. 화면·자동화는 앞부분을 쓰되, 뒤쪽 업장도 다음 배치에서
// 누락되지 않도록 1,000곳에서 잘라내지 않는다.
writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), summary, queue }, null, 2) + "\n");
console.log(`데이터 보강 큐: 전체 ${summary.total} · 대상 ${summary.queued} · 캠핑장 ${summary.campground} · 당일시설 ${summary.day_use} · 공백 ${Object.entries(byGap).map(([k, v]) => `${k}=${v}`).join(", ")}`);
