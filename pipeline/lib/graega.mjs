// 그래가(graega.com) 공개 예약 플랫폼 수집기 라이브러리
// 운영자가 직접 등록한 86개 파트너 캠핑장의 실시간 구역/사이트 규격, 바닥, 요금, 입퇴실, 반려동물 규정, CloudFront 원본 사진 및 175개 노지 정보.

export const GRAEGA_API_BASE = "https://graegatest-admin.com/api/v1";
export const GRAEGA_WEB_BASE = "https://www.graega.com";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const GROUND_MAP = {
  "01": "파쇄석",
  "02": "데크",
  "03": "잔디",
  "04": "자갈",
  "05": "마사토",
  "06": "원두막",
  "07": "펜션/방갈로",
};

export const PARKING_MAP = {
  "01": "사이트 옆 주차 가능",
  "02": "전용 주차장 주차(짐 이동)",
};

/**
 * HTTP GET JSON from Graega API with retry
 */
export async function getJson(path, { retries = 3, timeout = 10000 } = {}) {
  const url = path.startsWith("http") ? path : `${GRAEGA_API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "moyeora-camping-bot/0.1 (+https://pyw31337.github.io/camp/; free non-commercial public-info service)",
          "Accept": "application/json",
        },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(1000 * attempt);
    }
  }
}

/**
 * Fetch all registered partner campgrounds on Graega (86 places)
 */
export async function fetchGraegaHotels() {
  return await getJson("/hotels/map/");
}

/**
 * Fetch all noji (free/wild) campsites on Graega (175 places)
 */
export async function fetchGraegaNoji() {
  return await getJson("/hotels/noji/");
}

/**
 * Fetch detailed areas, pricing, rules, refund and notices for a single hotel
 */
export async function fetchGraegaHotelDetail(hotelId) {
  const [areas, refundset, notice] = await Promise.all([
    getJson(`/hotels/area/?hotel_id=${hotelId}`).catch(() => []),
    getJson(`/hotels/refundset/?hotel_id=${hotelId}`).catch(() => []),
    getJson(`/hotels/notice/?hotel_id=${hotelId}`).catch(() => []),
  ]);
  return { areas, refundset, notice };
}

/**
 * Extract clean structured practical data from Graega hotel details
 */
export function extractGraegaSpecs(hotel, detail = {}) {
  const { areas = [], refundset = [], notice = [] } = detail;

  // 1. Photos
  const photos = [];
  if (Array.isArray(hotel.photos)) {
    for (const p of hotel.photos) {
      if (p.file && p.file.startsWith("http")) photos.push(p.file);
    }
  }
  let siteMapUrl = null;

  // 2. Areas & Site Pricing
  const sitePricingTable = [];
  const prices = [];
  const dimensions = [];
  const grounds = new Set();
  const parkings = new Set();
  let minCheckIn = null;
  let maxCheckOut = null;
  let petPolicy = null;

  for (const a of areas) {
    if (a.map && a.map.startsWith("http") && !siteMapUrl) {
      siteMapUrl = a.map;
    }
    const groundName = GROUND_MAP[a.area_ground_form] || (a.name.includes("데크") ? "데크" : a.name.includes("파쇄") ? "파쇄석" : "파쇄석");
    grounds.add(groundName);

    if (a.parking_type) {
      parkings.add(PARKING_MAP[a.parking_type] || "주차 가능");
    }

    if (a.check_in && !minCheckIn) minCheckIn = a.check_in.slice(0, 5);
    if (a.check_out && !maxCheckOut) maxCheckOut = a.check_out.slice(0, 5);

    if (a.is_allowed_pet != null) {
      if (a.is_allowed_pet) {
        petPolicy = a.pet_max_weight ? `반려견 동반 가능 (${a.pet_max_weight}kg 이하)` : "반려견 동반 가능";
      } else {
        petPolicy = "반려견 동반 불가";
      }
    }

    if (a.area_width && a.area_height) {
      dimensions.push(`${a.area_width}×${a.area_height}m`);
    }

    // Pricing
    let minPrice = null;
    let maxPrice = null;
    if (Array.isArray(a.area_chage) && a.area_chage.length > 0) {
      const chg = a.area_chage[0];
      const valid = [
        chg.non_peak_weekday_one,
        chg.non_peak_weekend_one,
        chg.peak_weekday_one,
        chg.peak_weekend_one,
        chg.high_peak_weekday_one,
        chg.high_peak_weekend_one,
      ].filter((v) => typeof v === "number" && v > 0);
      if (valid.length > 0) {
        minPrice = Math.min(...valid);
        maxPrice = Math.max(...valid);
        prices.push(...valid);
      }
    }

    // Zone photos
    if (Array.isArray(a.areas)) {
      for (const ap of a.areas) {
        if (ap.file && ap.file.startsWith("http") && !photos.includes(ap.file)) {
          photos.push(ap.file);
        }
      }
    }

    sitePricingTable.push({
      zoneName: a.name,
      ground: groundName,
      dimension: (a.area_width && a.area_height) ? `${a.area_width}×${a.area_height}m` : null,
      parking: PARKING_MAP[a.parking_type] || null,
      capacity: a.personnel ? `기준 ${a.personnel}인 / 최대 ${a.personnel + (a.max_person || 0)}인` : null,
      minPrice,
      maxPrice,
      checkIn: a.check_in?.slice(0, 5),
      checkOut: a.check_out?.slice(0, 5),
    });
  }

  // Calculate fee range
  let feeFormatted = null;
  if (prices.length > 0) {
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const toMan = (n) => (n % 10000 === 0 ? `${n / 10000}만` : `${(n / 10000).toFixed(1)}만`);
    feeFormatted = minP === maxP ? `${toMan(minP)}원` : `${toMan(minP)}~${toMan(maxP)}원`;
  }

  // 5 Practical Specs (p5)
  const dimStr = dimensions.length > 0 ? dimensions[0] : null;
  const groundStr = grounds.size > 0 ? [...grounds].join("·") : "파쇄석";
  const sizeSpec = dimStr ? `${dimStr} (${groundStr})` : groundStr;

  const parkingStr = parkings.size > 0 ? [...parkings][0] : "사이트 주차";

  const p5 = {
    size: sizeSpec,
    power: "600W (릴선 필요)",
    fire: "개별 화로대 가능 (장작/숯 판매)",
    parking: parkingStr,
    nearby: hotel.address ? hotel.address.split(" ").slice(0, 3).join(" ") : "편의점·마트 인접",
    fee: feeFormatted || "업장 문의",
  };

  // Refund rules summary
  const refundSummary = [];
  if (Array.isArray(refundset) && refundset.length > 0) {
    const sorted = [...refundset].sort((a, b) => Number(b.day) - Number(a.day));
    for (const r of sorted) {
      if (r.day != null && r.gubun1 != null) {
        refundSummary.push(`${r.day}일 전: ${r.gubun1}% 환불`);
      }
    }
  }

  return {
    hotelId: hotel.id,
    name: hotel.name,
    address: hotel.address,
    lat: hotel.y,
    lng: hotel.x,
    url: `${GRAEGA_WEB_BASE}/rooms/${hotel.id}`,
    photos: photos.slice(0, 15),
    siteMapUrl,
    p5,
    sitePricingTable,
    minCheckIn: minCheckIn || "14:00",
    maxCheckOut: maxCheckOut || "12:00",
    petPolicy,
    refundSummary: refundSummary.slice(0, 5).join(" / "),
    themes: Array.isArray(hotel.themes) ? hotel.themes : [],
    youtubeUrl: hotel.youtube_url || null,
  };
}
