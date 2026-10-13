// 한국관광공사 TourAPI(KorService2)의 야영장(레포츠 28 · A03021700) 소개 정보에서 공식 안내 요금·예약 안내를 가져와
// 고캠핑 시설과 이름·좌표로 연결한다. 값은 운영자가 관광공사에 등록한 안내 문구 그대로이며(정형 가격 아님),
// 화면에는 “공식 안내 요금(문구) · 관광공사 · 확인일”로만 표시하고 실시간 판매가로 쓰지 않는다.

import { haversineM } from "./geo.mjs";
import { nameSimilarity } from "./localdata-campgrounds.mjs";

export const TOUR_BASE = "https://apis.data.go.kr/B551011/KorService2";
export const CAMPSITE_CAT = { contentTypeId: "28", cat1: "A03", cat2: "A0302", cat3: "A03021700" };

const clean = (v) => {
  const t = String(v ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
  return t || null;
};

/** 목록 항목 → {contentid, title, lat, lng, addr} */
export function normalizeTourItem(it) {
  const lat = Number(it.mapy), lng = Number(it.mapx);
  return { contentid: String(it.contentid), title: clean(it.title), addr: clean(it.addr1), lat: Number.isFinite(lat) && lat ? lat : null, lng: Number.isFinite(lng) && lng ? lng : null };
}

/** 소개 정보(detailIntro2) → 요금·예약·이용시간 문구. 필드명이 바뀌어도 이름 패턴으로 찾는다. */
export function normalizeTourIntro(it) {
  const get = (re) => { const k = Object.keys(it ?? {}).find((key) => re.test(key)); return k ? clean(it[k]) : null; };
  const fee = get(/^usefee/i);
  return {
    fee_text: fee && !/^(없음|-|문의)$/.test(fee) ? fee : fee,
    reservation_text: get(/^reservation/i),
    hours_text: get(/^usetime/i),
    parking_fee_text: get(/^parkingfee/i),
    rest_days_text: get(/^restdate/i),
    open_period_text: get(/^openperiod/i),
  };
}

/** 정형 숫자 힌트: 문구에서 원 단위 금액을 뽑아 최저·최고를 만든다(표시는 항상 원문 문구와 함께). */
export function feeRange(text) {
  if (!text) return null;
  const nums = [...String(text).matchAll(/(\d{1,3}(?:,\d{3})+|\d{4,6})\s*원/g)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => n >= 5000 && n <= 1000000);
  if (/(\d+(?:\.\d+)?)\s*만\s*원/.test(text)) for (const m of String(text).matchAll(/(\d+(?:\.\d+)?)\s*만\s*원/g)) { const n = Math.round(Number(m[1]) * 10000); if (n >= 5000 && n <= 1000000) nums.push(n); }
  if (!nums.length) return null;
  return { min_krw: Math.min(...nums), max_krw: Math.max(...nums) };
}

/** 고캠핑 시설 ↔ TourAPI 야영장 매칭(이름 0.8 이상이고 1km 이내, 또는 이름 1.0이고 3km 이내). 1:1 유지. */
export function matchTour(gocamping, tourItems) {
  const best = new Map();
  for (const t of tourItems) {
    if (t.lat == null) continue;
    let top = null;
    for (const g of gocamping) {
      if (g.lat == null || Math.abs(g.lat - t.lat) > 0.05 || Math.abs(g.lng - t.lng) > 0.06) continue;
      const d = haversineM(g.lat, g.lng, t.lat, t.lng);
      const s = nameSimilarity(g.name, t.title);
      if (!((s >= 0.8 && d <= 1000) || (s >= 1 && d <= 3000))) continue;
      const score = s - d / 10000;
      if (!top || score > top.score) top = { gocamping_id: g.id, contentid: t.contentid, score, distance_m: Math.round(d), name_similarity: Math.round(s * 100) / 100 };
    }
    if (top && (!best.has(top.gocamping_id) || best.get(top.gocamping_id).score < top.score)) best.set(top.gocamping_id, top);
  }
  return best;
}
