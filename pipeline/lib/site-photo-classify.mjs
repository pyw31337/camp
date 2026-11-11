// 사이트 유형(상품)별 사진 분류(2026-11-11 소유자 t55: “업장 사진뿐 아니라 업장별 상품들의 사진도 충분히 수집”).
// 캠핑장 공식 사진 한 장이 어느 사이트 유형(글램핑·카라반·데크·파쇄석/잔디 오토·방갈로/펜션 등)을 보여 주는지 판정한다.
// - 그림: CLIP(Xenova/clip-vit-base-patch32, 무료·로컬 CPU) 제로샷. 유형 문장(SITE)과 ‘상품 사진이 아님’ 문장(OTHER)을 함께 겨룬다.
// - 글: 사진이 붙은 자리의 제목·alt·쪽 제목(caption)에 유형 말이 있으면 그 유형을 먼저 본다(그림 판정이 반대면 버린다).
// - 캠핑장에 실제로 있는 유형(c.st, 사이트 구역 이름)에만 붙인다. 지도·글·음식·인물·매점·화장실·풍경만 있는 사진은 쓰지 않는다.
// 규칙을 바꾸면 RULE_VERSION을 올린다(registry/site-photo-judgments.json의 옛 판정은 다시 한다).

export const MODEL = "Xenova/clip-vit-base-patch32";
export const RULE_VERSION = 3;

/** 그림 부류 → 문장. 부류 이름은 판정 캐시에 그대로 남는다. */
export const SITE = {
  glamping: ["a photo of a glamping tent at a campsite", "a photo of a white bell tent or safari tent on a wooden deck", "a photo of a dome glamping tent"],
  glamping_in: ["a photo of the inside of a glamping tent with beds"],
  caravan: ["a photo of a caravan trailer parked at a campsite", "a photo of a row of camping trailers"],
  caravan_in: ["a photo of the inside of a caravan trailer with a bed and kitchen"],
  cabin: ["a photo of a small wooden cabin or bungalow", "a photo of a wooden hut on a campground"],
  pension: ["a photo of a pension house or small lodge building exterior"],
  room: ["a photo of a pension or hotel room with a bed"],
  deck: ["a photo of an empty wooden deck platform at a campsite", "a photo of a camping tent pitched on a wooden deck"],
  gravel: ["a photo of an empty gravel campsite pitch", "a photo of a tent pitched on gravel with a car parked beside it"],
  lawn: ["a photo of tents pitched on a grass lawn campsite", "a photo of an empty grass campsite"],
  rv: ["a photo of a motorhome camper van parked at a campsite"],
  carcamp: ["a photo of a car with a tent attached to its trunk", "a photo of car camping with an SUV"],
};
export const OTHER = {
  landscape: ["a photo of a forest, river, lake or mountain landscape", "a photo of a beach or the sea"],
  aerial: ["an aerial drone photo of a campground"],
  facility: ["a photo of a toilet or shower building", "a photo of a washing sink area", "a photo of a reception building or management office with a sign", "a photo of a building entrance with a signboard"],
  sport: ["a photo of a golf putting green or a sports net", "a photo of a ping pong table or a game room", "a photo of a sports court or a basketball court"],
  town: ["a photo of a village or town with houses in the distance", "a photo of a rooftop terrace or a balcony with a view"],
  store: ["a photo of a convenience store shelf with snacks", "a photo of a cafe or restaurant interior"],
  play: ["a photo of a children's playground", "a photo of a swimming pool or water playground", "a photo of a trampoline"],
  food: ["a photo of food or barbecue on a grill", "a photo of drinks or coffee"],
  people: ["a selfie or portrait photo of a person", "a photo of a group of people"],
  animal: ["a close-up photo of a dog or cat"],
  text: ["a screenshot of text, a document, a poster or a price table", "a map or a campground layout drawing", "a signboard with text"],
  night: ["a photo of string lights at night"],
  car: ["a photo of a parking lot with cars"],
};
export const LABELS = [];
export const LABEL_CLASS = new Map();
for (const [k, list] of [...Object.entries(SITE), ...Object.entries(OTHER)]) for (const s of list) { LABELS.push(s); LABEL_CLASS.set(s, k); }

/** 그림 부류 → 맞는 사이트 유형 코드(앞이 더 정확). 코드는 catalog c.st / 카드 미니 레일 타일 키와 같다. */
export const CLASS_TYPES = {
  glamping: ["GLAMPING"], glamping_in: ["GLAMPING"],
  caravan: ["CARAVAN"], caravan_in: ["CARAVAN"],
  cabin: ["BUNGALOW", "HOUSE", "PENSION"], pension: ["HOUSE", "PENSION", "BUNGALOW"], room: ["HOUSE", "PENSION", "BUNGALOW"],
  deck: ["DECK", "DUPLEX_DECK", "TARP_ZONE", "PITCH", "AUTO"],
  gravel: ["AUTO", "PITCH", "RV", "CAR_CAMP", "PET_SITE", "TARP_ZONE", "SOLO"],
  lawn: ["PITCH", "AUTO", "PET_SITE", "TARP_ZONE", "SOLO", "RV"],
  rv: ["RV", "CARAVAN"],
  carcamp: ["CAR_CAMP", "AUTO"],
};
/** 바닥 부류(미니 레일 타일의 바닥 표기와 맞춰 고를 때) */
export const CLASS_FLOOR = { deck: "데크", gravel: "파쇄석", lawn: "잔디" };

/** 글(제목·alt·쪽 이름) → 유형 코드 후보. 없으면 []. */
export function typesFromText(text) {
  const s = String(text ?? "");
  if (!s.trim()) return [];
  const out = [];
  const add = (c) => { if (!out.includes(c)) out.push(c); };
  if (/글램핑|glamp|티피|벨텐트|사파리\s*텐트|돔\s*텐트/i.test(s)) add("GLAMPING");
  if (/카라반|caravan|트레일러/i.test(s)) add("CARAVAN");
  if (/캠핑카|모터홈|\bRV\b|개인\s*카라반/i.test(s)) add("RV");
  if (/방갈로|방가로|원두막|오두막|캐빈|cabin|bungalow|통나무/i.test(s)) add("BUNGALOW");
  if (/펜션|독채|객실|숙박동|pension|room/i.test(s)) add("HOUSE");
  if (/차박/.test(s)) add("CAR_CAMP");
  if (/반려|애견|펫/.test(s)) add("PET_SITE");
  if (/타프/.test(s)) add("TARP_ZONE");
  if (/데크|deck/i.test(s)) add("DECK");
  if (/오토|파쇄석|잔디|사이트|구역|auto/i.test(s)) add("AUTO");
  return out;
}
/** 글에 바닥 말이 있으면 */
export function floorFromText(text) {
  const s = String(text ?? "");
  return /파쇄석|자갈|gravel/i.test(s) ? "파쇄석" : /잔디|lawn|grass/i.test(s) ? "잔디" : /데크|deck/i.test(s) ? "데크" : /마사토|흙/.test(s) ? "마사토" : "";
}
/** 글이 상품이 아닌 사진(지도·요금표·매점·화장실 등)을 말하면 true */
export function nonProductText(text) {
  return /배치도|안내도|지도|약도|오시는\s*길|요금|가격|매점|편의점|화장실|샤워|개수대|관리동|주차장|수영장|놀이터|체험|이벤트|공지|로고|logo|banner|배너|icon|아이콘|btn|button|등록증|허가|보험/i.test(String(text ?? ""));
}
/** 쪽·블록 글(ctx)용. 요금·가격·공지는 상품 사진과 같은 쪽에 자주 있어 이것만으로 버리지는 않는다(t58 표본). */
export function nonProductContext(text) {
  return /배치도|안내도|지도|약도|오시는\s*길|매점|편의점|화장실|샤워|개수대|관리동|주차장|수영장|놀이터|로고|logo|banner|배너|icon|아이콘|btn|button|등록증|허가|보험/i.test(String(text ?? ""));
}

/** CLIP 결과([{label, score}]) → 부류별 확률 합 상위 6개 [[부류, 확률]]와 사이트 부류 합(판정 캐시에 남기는 모양) */
export function summarize(result) {
  const by = {};
  for (const r of result ?? []) { const k = LABEL_CLASS.get(r.label); if (k) by[k] = (by[k] ?? 0) + r.score; }
  const r2 = (x) => Math.round(x * 1000) / 1000;
  const site = Object.entries(by).filter(([k]) => SITE[k]).reduce((a, [, v]) => a + v, 0);
  return { t: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, r2(v)]), site: r2(site) };
}

/**
 * 요약({t, site}) 또는 CLIP 결과 → 판정.
 * @returns {{cls:string, s:number, site:number, other:string|null, os:number, ok:boolean}}
 *   cls: 1위 부류, s: 그 부류 확률 합, site: 사이트 부류 확률 합, other/os: 가장 높은 ‘상품 아님’ 부류와 확률, ok: 상품 사진으로 쓸 만한지
 */
export function decideSite(input) {
  const sum = Array.isArray(input) ? summarize(input) : input;
  const t = sum?.t ?? [];
  if (!t.length) return { cls: null, s: 0, site: 0, other: null, os: 0, ok: false };
  const [cls, s] = t[0];
  const second = t[1]?.[1] ?? 0;
  const o = t.find(([k]) => OTHER[k]);
  // 1위가 사이트 부류이고, 확률이 뚜렷하고(≥0.35), 사이트 부류 합이 반을 넘고, 2위와 차이가 있을 때만 쓴다.
  const ok = Boolean(SITE[cls]) && s >= 0.35 && sum.site >= 0.5 && s - second >= 0.08;
  return { cls, s, site: sum.site, other: o?.[0] ?? null, os: o?.[1] ?? 0, ok };
}

/**
 * 판정 + 캠핑장 유형 목록 → 붙일 유형 코드(없으면 null).
 * 글 단서(captionTypes)가 있으면 그 유형이 그림 부류와 맞을 때 그 유형을, 아니면 그림 부류의 첫 번째 맞는 유형을 쓴다.
 */
export function assignType(verdict, campTypes, captionTypes = []) {
  if (!verdict?.ok) return null;
  const have = new Set(campTypes ?? []);
  const fits = CLASS_TYPES[verdict.cls] ?? [];
  for (const t of captionTypes) if (fits.includes(t) && have.has(t)) return t;
  for (const t of fits) if (have.has(t)) return t;
  return null;
}

/** 판정기(transformers.js 없으면 null). 이미지 입력은 URL·Blob·RawImage 모두 된다. */
export async function siteJudge({ cacheDir } = {}) {
  let tf;
  try { tf = await import("@huggingface/transformers"); } catch { return null; }
  if (cacheDir) tf.env.cacheDir = cacheDir;
  const clf = await tf.pipeline("zero-shot-image-classification", MODEL, { dtype: "fp32" });
  const judge = async (input) => decideSite(await clf(input, LABELS));
  judge.raw = async (input) => clf(input, LABELS);
  judge.RawImage = tf.RawImage;
  return judge;
}

// ---------- 선정 규칙(판정 캐시 → 쓸지 말지). 규칙만 바꿀 때는 다시 판정하지 않아도 된다. ----------
export const FAMILY = { glamping: "G", glamping_in: "G", caravan: "C", caravan_in: "C", rv: "C", cabin: "H", pension: "H", room: "H", deck: "P", gravel: "P", lawn: "P", carcamp: "P" };
export const INTERIOR = new Set(["glamping_in", "caravan_in", "room"]);
export const TYPE_FAMILY = { GLAMPING: "G", CARAVAN: "C", RV: "C", HOUSE: "H", BUNGALOW: "H", PENSION: "H", DECK: "P", AUTO: "P", PITCH: "P", CAR_CAMP: "P", PET_SITE: "P", TARP_ZONE: "P", SOLO: "P", DUPLEX_DECK: "P" };

/**
 * 후보 사진 하나({src, cap, ctx}) + 판정 캐시 항목({b, l, skip, lskip, err}) + 캠핑장 유형 목록 → 붙일 유형 또는 {no: 이유}.
 * 2026-11-11 표본 대조(77장 → 60장 → 60장) 뒤 t58 검증 표본 297장으로 문턱을 다시 맞췄다(갈래 정밀도 ≥ 90%). 두 모델이 같은 갈래일 때만, 건물·실내·데크·운영자 사진은 더 높은 문턱.
 */
export function verdictFor(cand, ent, types) {
  if (!ent || ent.err) return { no: "unjudged" };
  if (ent.skip) return { no: ent.skip };
  if (ent.b && ent.lskip) return { no: "not-product" };
  if (!ent.b || !ent.l) return { no: "unjudged" };
  const B = decideSite(ent.b), L = decideSite(ent.l);
  const fb = FAMILY[B.cls], fl = FAMILY[L.cls];
  // 글 단서: 사진 바로 곁의 글(블록 제목·객실 이름·alt·바로 앞 글)만 유형 근거로 쓴다. 쪽 제목·메뉴 이름은 사이트 전체에 같아 근거가 약하다.
  const capTypes = typesFromText(cand.cap).filter((t) => types.includes(t));
  if (cand.cap && nonProductText(cand.cap) && !capTypes.length) return { no: "caption-nonproduct" };
  if (cand.ctx && nonProductContext(cand.ctx) && !capTypes.length && !typesFromText(cand.ctx).length) return { no: "caption-nonproduct" };
  const both = fb && fb === fl;
  // 어느 모델이든 ‘상품 아님’(관리동·간판·운동 시설·풍경 등) 확률이 꽤 높으면 쓰지 않는다.
  const otherMax = Math.max(B.os, L.os);
  const strong = (V, min) => V.ok && V.s >= min;
  let cls = null, by = "image";
  if (both) {
    const fam = fb;
    const interior = INTERIOR.has(B.cls) || INTERIOR.has(L.cls);
    // 문턱은 t58 검증 표본 297장에서 갈래(글램핑·카라반·객실·노지) 정밀도 90% 이상이 되게 맞췄다. RULE_VERSION은 그대로(캐시된 b/l 점수를 다시 쓴다).
    if (otherMax >= 0.25) cls = null;
    else if (interior) { if (strong(B, 0.6) && strong(L, 0.6)) cls = L.cls; }
    else if (fam === "H") { if (otherMax < 0.15 && strong(B, 0.62) && strong(L, 0.62) && (B.cls === "cabin" || L.cls === "cabin")) cls = L.cls; }
    else if (L.cls === "deck" || B.cls === "deck") { if (strong(B, 0.45) && strong(L, 0.45)) cls = L.cls; }
    else if ((B.ok || L.ok) && Math.max(B.s, L.s) >= 0.5 && Math.min(B.s, L.s) >= 0.36) cls = L.ok ? L.cls : B.cls;
    // 운영자 홈페이지 사진은 수영장·조경·조감도 그림이 많아 두 모델 모두 뚜렷할 때만 그림만으로 쓴다.
    if (cls && cand.src === "operator" && !(B.ok && L.ok && Math.min(B.s, L.s) >= 0.5 && otherMax < 0.16)) cls = null;
    // 잔디·파쇄석·차박으로 봤지만 글램핑 점수가 뚜렷하면(벨텐트·티피가 잔디 위에 있는 경우) 글램핑으로 돌린다.
    if (cls && (cls === "lawn" || cls === "gravel" || cls === "carcamp")) {
      const gB = (ent.b.t ?? []).find((x) => String(x[0]).startsWith("glamping"))?.[1] ?? 0;
      const gL = (ent.l.t ?? []).find((x) => String(x[0]).startsWith("glamping"))?.[1] ?? 0;
      if (Math.max(gB, gL) >= 0.2 && types.includes("GLAMPING")) cls = "glamping";
    }
  }
  if (capTypes.length) {
    const fam = new Set(capTypes.map((t) => TYPE_FAMILY[t]));
    if (cls && !fam.has(FAMILY[cls])) return { no: "caption-conflict" };
    // 글이 유형을 말하면 두 모델이 같은 부류로 보고 한쪽이라도 뚜렷하면 쓴다.
    if (!cls && both && otherMax < 0.3 && fam.has(fb) && (B.ok || L.ok) && Math.max(B.s, L.s) >= 0.4) cls = L.ok ? L.cls : B.cls;
    if (cls) by = "caption+image";
  }
  if (!cls) return { no: "not-product" };
  const fits = CLASS_TYPES[cls] ?? [];
  // 유형 고르기: 곁의 글 → 쪽·블록 이름(약한 단서) → 그림 부류 순서.
  const ctxTypes = typesFromText(cand.ctx).filter((t) => types.includes(t));
  const type = capTypes.find((t) => fits.includes(t)) ?? ctxTypes.find((t) => fits.includes(t)) ?? fits.find((t) => types.includes(t));
  if (!type) return { no: "type-not-in-camp" };
  const s = Math.round(((B.s + L.s) / 2) * 100) / 100;
  return { type, cls, s, floor: floorFromText(cand.cap) || floorFromText(cand.ctx) || CLASS_FLOOR[cls] || "", in: INTERIOR.has(cls), by };
}

