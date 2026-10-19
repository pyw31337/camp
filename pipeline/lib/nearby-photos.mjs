// 주변시설(편의점·마트·정육점·약국·병원·동물병원·주유소·휴게소·관광지·맛집) 실제 모습 사진.
// 카카오 Daum 검색 API의 블로그 결과(제목·요약·대표 썸네일 URL)에서, 제목이나 요약에 그 가게 이름이 들어간 글의 썸네일만 쓴다.
// 원칙(AGENTS.md 4번, social-search.mjs SOURCE): 썸네일 URL과 원문 링크만 저장한다(내려받기·재호스팅 금지). 화면은 원문으로 이어 준다.
// 이름이 안 맞으면 사진을 붙이지 않는다(엉뚱한 사진보다 지도 썸네일이 낫다).

const squash = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/gi, " ").replace(/[\s·.,()[\]{}'"!?~\-_/|]/g, "").toLowerCase();

// 가맹점 상표(이름만으로는 어느 지점인지 알 수 없는 앞부분)
const BRANDS = /^(cu|gs25|gs|세븐일레븐|이마트24|이마트|미니스톱|홈플러스익스프레스|홈플러스|롯데마트|하나로마트|농협하나로마트|씨유|emart24|7eleven|sk|gs칼텍스|s-oil|에쓰오일|현대오일뱅크|알뜰주유소|nh|nh농협)/i;

/** 이름 → 대조용 조각: 전체(공백 제거)와, 가맹점이면 지점명(‘…점’) */
export function nameKeys(name) {
  const full = squash(name);
  const words = String(name ?? "").trim().split(/\s+/);
  const branch = words.length > 1 && /점$/.test(words.at(-1)) ? squash(words.at(-1)) : null;
  const brand = BRANDS.test(full) ? (full.match(BRANDS)?.[0] ?? null) : null;
  return { full, branch, brand };
}

/** 블로그 글이 이 가게 이야기인지: 제목·요약(공백 제거)에 전체 이름, 또는 (가맹점이면) 상표 + 지점명이 함께 있어야 한다. */
export function mentionsPlace(doc, name) {
  const { full, branch, brand } = nameKeys(name);
  if (!full || full.length < 2) return false;
  const text = squash(`${doc?.title ?? ""} ${doc?.contents ?? ""}`);
  if (text.includes(full)) return true;
  if (brand && branch && branch.length >= 3) return text.includes(branch) && text.includes(brand.toLowerCase());
  return false;
}

const httpsUrl = (u) => { const s = String(u ?? "").trim().replace(/^http:\/\//i, "https://"); return /^https:\/\//i.test(s) ? s : null; };

/** 블로그 결과 → 이름이 맞는 첫 글의 대표 썸네일 { t: 썸네일, u: 원문, s: 블로그 이름, d: 작성일 } 또는 null */
export function pickBlogPhoto(docs, name) {
  for (const d of docs ?? []) {
    const t = httpsUrl(d?.thumbnail), u = httpsUrl(d?.url);
    if (!t || !u || !mentionsPlace(d, name)) continue;
    return { t, u, s: String(d.blogname ?? "").slice(0, 40) || null, d: String(d.datetime ?? "").slice(0, 10) || null, via: "blog" };
  }
  return null;
}

/** 이미지 결과(관광지·맛집·휴게소처럼 이름이 고유한 곳만) → 첫 장의 썸네일. 이미지 결과에는 제목이 없어 가맹점에는 쓰지 않는다. */
export function pickImagePhoto(docs) {
  for (const d of docs ?? []) {
    const t = httpsUrl(d?.thumbnail_url), u = httpsUrl(d?.doc_url);
    const w = Number(d?.width), h = Number(d?.height);
    if (!t || !u || (w && h && (w / h > 2.2 || h / w > 2.2))) continue;
    return { t, u, s: String(d.display_sitename ?? "").slice(0, 40) || null, d: String(d.datetime ?? "").slice(0, 10) || null, via: "image" };
  }
  return null;
}

// 이미지 검색까지 써도 되는 종류(이름이 고유한 장소)
export const UNIQUE_KINDS = new Set(["tour", "food", "rest", "TOUR", "FOOD", "REST_AREA", "DROWSY_SHELTER"]);

/** 같은 장소를 여러 캠핑장이 공유한다: 이름 + 좌표(소수 4자리, 약 10m) */
export const placeKey = (name, lat, lng) => `${String(name ?? "").trim()}|${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
