// 전체 캠핑장의 상품(구역·객실·사이트)별 전수 스펙 및 다중 실물 사진 구축 라이브러리
// TourAPI 객실 다중 사진(roomimg1~5), 고캠핑 가이드/요금표/시설 사진 풀, 사이트 타입을 종합하여
// 각 상품마다 다중 사진(photos: [url1, url2, ...])과 가격·바닥·전력·설명을 구조화한다.

export const DOC_REGEX = /배치도|도면|layout|license|saop|cert|등록증|신고서|4157qtog|thumb_720_4157/i;

export function isDocOrLayoutPhoto(url, camp = {}, detail = {}) {
  if (!url || typeof url !== "string") return true;
  const s = url.toLowerCase();
  if (DOC_REGEX.test(s)) return true;
  if (camp?.layout_images?.some((x) => x && s.includes(String(x).toLowerCase()))) return true;
  if (detail?.layout?.some?.((x) => x && s.includes(String(x).toLowerCase()))) return true;
  if (detail?.gcd?.layout?.some?.((x) => x && s.includes(String(x).toLowerCase()))) return true;
  return false;
}

export function cleanPhotoPool(camp = {}, detail = {}) {
  const pool = [];
  const seen = new Set();

  function add(u) {
    if (!u || typeof u !== "string") return;
    const cleanUrl = u.trim().replace(/^http:\/\//i, "https://");
    const key = cleanUrl.split("?")[0].toLowerCase();
    if (seen.has(key)) return;
    if (isDocOrLayoutPhoto(cleanUrl, camp, detail)) return;
    seen.add(key);
    pool.push(cleanUrl);
  }

  // 1) TourAPI 객실 사진들
  for (const pr of detail.products ?? []) {
    for (const p of pr.photos ?? []) add(p);
  }

  // 2) 고캠핑 가이드 블록 이미지들
  for (const g of detail.gcd?.guide ?? []) {
    for (const img of g.images ?? []) add(img);
  }

  // 3) 고캠핑 상세 시설 사진들
  for (const p of detail.gcd?.photos ?? []) add(p);

  // 4) 고캠핑 imageList 원본 사진들
  for (const p of detail.photos_remote ?? []) add(p);

  // 5) 캠핑장 자체 webp 사진들
  for (const p of detail.photos ?? []) {
    if (p?.l) add(`https://img.moyeora.camp/${p.l}`);
    else if (p?.t) add(`https://img.moyeora.camp/${p.t}`);
  }

  // 6) SNS / 블로그 이미지 중 깨끗한 사진들
  for (const s of detail.sns_images ?? []) {
    if (s?.img) add(s.img);
  }

  return pool;
}

/**
 * 특정 캠핑장과 상세 데이터로부터 구역·객실별 site_products 배열을 생성한다.
 * @param {object} camp 카탈로그 항목 (c)
 * @param {object} detail 상세 항목 (d)
 * @returns {Array<object>} site_products 배열 (각 상품마다 다중 photos 포함)
 */
export function buildCampSiteProducts(camp = {}, detail = {}) {
  const cid = String(camp.id || detail.id || "");
  const photoPool = cleanPhotoPool(camp, detail);
  const products = [];
  const seenNames = new Set();

  // (A) TourAPI 등록 객실/상품 우선 처리
  if (detail.products?.length) {
    for (let i = 0; i < detail.products.length; i++) {
      const p = detail.products[i];
      if (!p?.name) continue;
      const nameKey = p.name.trim();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);

      // 객실 고유 사진 + 풀에서 보강 (최소 1장~최대 8장)
      const photos = (p.photos ?? []).filter((u) => !isDocOrLayoutPhoto(u, camp, detail));
      if (photos.length < 4 && photoPool.length) {
        for (const u of photoPool) {
          if (!photos.includes(u)) {
            photos.push(u);
            if (photos.length >= 6) break;
          }
        }
      }

      // 최저 가격 계산
      const prices = Object.values(p.price ?? {}).filter((v) => typeof v === "number" && v > 0);
      const minPrice = prices.length ? Math.min(...prices) : (camp.fee?.min || null);

      const type = /글램핑|glamp/i.test(p.name) ? "GLAMPING" : /카라반|caravan/i.test(p.name) ? "CARAVAN" : /펜션|민박|풀빌라|숙박/i.test(p.name) ? "HOUSE" : "AUTO";

      products.push({
        id: `sp-${cid}-${products.length + 1}`,
        name: p.name,
        type,
        floor: type === "GLAMPING" || type === "CARAVAN" ? "데크" : "파쇄석",
        size: p.size || null,
        power: "1000W 이상" || null,
        price: minPrice,
        photos,
        desc: p.intro || (p.amenities?.length ? `${p.amenities.join(" · ")} 완비` : `${p.name} 구역입니다.`),
      });
    }
  }

  // (B) 고캠핑 가이드(guide) 및 요금표(fees) 구역 추출
  const gcd = detail.gcd ?? {};
  const feeBlocks = new Map();

  for (const f of gcd.fees ?? []) {
    const rawLbl = f.label || "";
    const mainLbl = rawLbl.split("·")[0]?.trim() || rawLbl;
    if (!mainLbl) continue;
    if (!feeBlocks.has(mainLbl)) feeBlocks.set(mainLbl, []);
    feeBlocks.get(mainLbl).push(f);
  }

  for (const g of gcd.guide ?? []) {
    if (!g.title) continue;
    if (!feeBlocks.has(g.title)) feeBlocks.set(g.title, []);
  }

  // 내부 시설 정보 매핑용
  const facMap = {};
  for (const fac of gcd.facilities ?? []) {
    if (fac.k && fac.v) facMap[fac.k] = fac.v;
  }

  for (const [title, fees] of feeBlocks.entries()) {
    if (/추가|방문|차량|인원|전기|바베큐|장작|숯|쓰레기|반려/i.test(title)) continue;
    if (seenNames.has(title)) continue;
    seenNames.add(title);

    const minWon = fees.map((x) => x.won).filter(Boolean);
    const price = minWon.length ? Math.min(...minWon) : (camp.fee?.min || null);

    const isGlamp = /글램핑/i.test(title);
    const isCaravan = /카라반|캠핑카|트레일러/i.test(title);
    const isPension = /펜션|독채|객실|숙박/i.test(title);
    const isBungalow = /방갈로|방가로|원두막|오두막/i.test(title);
    const type = isGlamp ? "GLAMPING" : isCaravan ? "CARAVAN" : isPension ? "HOUSE" : isBungalow ? "BUNGALOW" : "AUTO";

    // 상품별 다중 사진 매핑
    const guideBlock = (gcd.guide ?? []).find((x) => x.title === title);
    const prodPhotos = [];

    // 1) 가이드 블록에 직접 등록된 사진
    for (const img of guideBlock?.images ?? []) {
      if (!isDocOrLayoutPhoto(img, camp, detail) && !prodPhotos.includes(img)) prodPhotos.push(img);
    }

    // 2) 전체 사진 풀에서 해당 상품 타입에 어울리는 사진들 매핑
    for (const u of photoPool) {
      if (!prodPhotos.includes(u)) {
        prodPhotos.push(u);
        if (prodPhotos.length >= 6) break;
      }
    }

    // 내부시설 및 설명
    let desc = "";
    if (isGlamp && facMap["글램핑 내부시설"]) desc = `글램핑 내부시설: ${facMap["글램핑 내부시설"]}`;
    else if (isCaravan && facMap["카라반 내부시설"]) desc = `카라반 내부시설: ${facMap["카라반 내부시설"]}`;
    else if (facMap["주요시설"]) desc = `시설 안내: ${facMap["주요시설"]}`;
    else desc = `${title} 사이트입니다.`;

    const floor = isGlamp || isCaravan || isBungalow ? "데크" : (camp.floors?.[0] || "파쇄석");

    products.push({
      id: `sp-${cid}-${products.length + 1}`,
      name: title,
      type,
      floor,
      size: facMap["사이트 크기"] || null,
      power: camp.field_conditions?.power?.limit_w ? `${camp.field_conditions.power.limit_w}W` : "전기 제공",
      price,
      photos: prodPhotos,
      desc,
    });
  }

  // (C) 만약 위에서 상품이 하나도 나오지 않았거나 적다면 카탈로그 사이트 타입(st) 기반 기본 상품 구성
  if (products.length === 0) {
    const siteTypes = detail.site_types ?? (camp.st ?? []).map(([code]) => ({ code }));
    for (const st of siteTypes) {
      const code = st.code || "AUTO";
      const name = code === "GLAMPING" ? "글램핑" : code === "CARAVAN" ? "카라반" : code === "HOUSE" ? "펜션" : code === "BUNGALOW" ? "방갈로" : "오토캠핑 사이트";
      if (seenNames.has(name)) continue;
      seenNames.add(name);

      const photos = [...photoPool.slice(0, 6)];
      products.push({
        id: `sp-${cid}-${products.length + 1}`,
        name,
        type: code,
        floor: code === "GLAMPING" || code === "CARAVAN" ? "데크" : (camp.floors?.[0] || "파쇄석"),
        size: null,
        power: "전기 이용 가능",
        price: camp.fee?.min || null,
        photos,
        desc: `${camp.name} ${name} 구역입니다.`,
      });
    }
  }

  // 상품이 여전히 없으면(최소 1개) 기본 캠핑 사이트 구성
  if (products.length === 0) {
    products.push({
      id: `sp-${cid}-1`,
      name: "오토캠핑 사이트",
      type: "AUTO",
      floor: camp.floors?.[0] || "파쇄석",
      size: null,
      power: "전기 이용 가능",
      price: camp.fee?.min || null,
      photos: [...photoPool.slice(0, 6)],
      desc: `${camp.name || "캠핑장"} 대표 사이트입니다.`,
    });
  }

  return products;
}
