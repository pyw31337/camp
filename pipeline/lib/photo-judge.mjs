// 후기 사진 내용 검증(소유자 2026-10-22: “공식 사진이 없어 후기 사진을 쓰는 건 좋은데, 사진 내용이 업체와 맞는지 검증 — 음식·인물 사진은 걸러내기”).
// 사례: 여우하우야영장(100419) 카드에 식당에서 먹은 대게 사진이 대표로 나옴.
// 방법: CLIP(Xenova/clip-vit-base-patch32, 무료·로컬 CPU) 제로샷 분류. 캠핑장다운 장면(POS)과 아닌 장면(NEG) 문장으로 확률을 내고,
//       NEG 합이 0.5 이상이거나 1위가 NEG이면서 NEG 합 0.4 이상이면 거른다. 이미지는 잠깐 받아 판정만 하고 저장하지 않는다.
// 2026-10-22 표본 42장 보정: 국·과자·주전자·자동차 시트·축사 연설은 걸러지고, 야간 입구 간판·글램핑·잔디 사이트·배치 그림은 남는다.

export const MODEL = "Xenova/clip-vit-base-patch32";
export const POS = [
  "a photo of a campsite with tents",
  "a photo of a glamping tent or caravan",
  "a photo of a forest, river, beach or mountain landscape",
  "a photo of a camping deck, lawn or gravel site",
  "a photo of a building, cabin or toilet facility",
  "a photo of a campground entrance sign or signboard",
  "a photo inside a glamping tent or cabin room",
  "a photo of a swimming pool or water playground",
  "an aerial drone photo of a campground",
  "a photo of a campfire or barbecue grill at a campsite",
  "a photo of a resort, pension or hotel building exterior",
  "a photo of a pension or hotel room with a bed",
  "a photo of a wooden pavilion, pergola or outdoor barbecue area",
  "a collage of several photos of a campground",
];
export const NEG = [
  "a photo of food on a plate or a table of dishes",
  "a photo of seafood like crab or shrimp",
  "a photo of drinks, coffee or alcohol",
  "a photo of snacks or products on a table",
  "a selfie or portrait photo of a person",
  "a photo of people at an event or a speech",
  "a close-up photo of a child",
  "a close-up photo of a dog or cat",
  "a photo of a restaurant or cafe interior",
  "a screenshot of text, a document or a web page",
  "a photo of a car interior",
];
const WEAK_NEG = new Set(["a photo of a restaurant or cafe interior"]);
/** 규칙이 바뀌면 올린다 → 캐시(photo-judgments.json)의 옛 판정은 다시 한다 */
export const RULE_VERSION = 3;
const SHORT = {
  "a photo of food on a plate or a table of dishes": "음식", "a photo of seafood like crab or shrimp": "해산물", "a photo of drinks, coffee or alcohol": "음료·술",
  "a photo of snacks or products on a table": "과자·물건", "a selfie or portrait photo of a person": "인물", "a photo of people at an event or a speech": "행사·인물",
  "a close-up photo of a child": "아이 클로즈업", "a close-up photo of a dog or cat": "반려동물 클로즈업", "a photo of a restaurant or cafe interior": "식당·카페 실내",
  "a screenshot of text, a document or a web page": "글·화면 캡처", "a photo of a car interior": "차 안",
};

/** 분류 결과([{label, score}]) → 판정 { ok, neg, top, why } */
export function decide(result) {
  const r = [...(result ?? [])].sort((a, b) => b.score - a.score);
  if (!r.length) return { ok: true, neg: 0, top: null, why: null };
  // ‘식당·카페 실내’는 펜션·글램핑 실내·관리동과 자주 헷갈려 절반만 센다(2026-10-22 표본 12장 중 5장 오판)
  const neg = r.filter((x) => NEG.includes(x.label)).reduce((s, x) => s + x.score * (WEAK_NEG.has(x.label) ? 0.5 : 1), 0);
  const top = r[0];
  const maxPos = Math.max(0, ...r.filter((x) => POS.includes(x.label)).map((x) => x.score));
  const strongNeg = Math.max(0, ...r.filter((x) => NEG.includes(x.label) && !WEAK_NEG.has(x.label)).map((x) => x.score));
  const weakRaw = Math.max(0, ...r.filter((x) => WEAK_NEG.has(x.label)).map((x) => x.score));
  const bad = neg >= 0.5
    || (NEG.includes(top.label) && !WEAK_NEG.has(top.label) && neg >= 0.4)
    || weakRaw >= 0.8 // 확실한 식당·카페 실내
    || (strongNeg >= 0.25 && maxPos < 0.35); // 캠핑장다운 장면이 뚜렷하지 않은데 인물·음식 등이 보임
  // 판정 근거(가장 큰 NEG)
  const worst = r.find((x) => NEG.includes(x.label));
  return { ok: !bad, neg: Math.round(neg * 100) / 100, top: top.label, v: RULE_VERSION, ...(bad ? { why: SHORT[worst.label] ?? worst.label } : {}) };
}

/** 판정기 만들기. @huggingface/transformers가 없으면 null(픽셀 규칙만 쓰고 기존 선택은 그대로 둔다). */
export async function photoJudge({ cacheDir } = {}) {
  let tf;
  try { tf = await import("@huggingface/transformers"); } catch { return null; }
  if (cacheDir) tf.env.cacheDir = cacheDir;
  const clf = await tf.pipeline("zero-shot-image-classification", MODEL, { dtype: "fp32" });
  const labels = [...POS, ...NEG];
  return async (url) => decide(await clf(url, labels));
}
