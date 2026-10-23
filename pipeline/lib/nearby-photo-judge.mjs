// 주변시설 검색 사진 판독(소유자 2026-10-23: “검색 사진을 이미지 판독으로 걸러서 다시 켜줘”).
// 2026-10-19 표본 24장 중 실제 가게 모습은 5장뿐이라 꺼 두었다(안내문·배너·음식·풍경이 대부분).
// CLIP(lib/photo-judge와 같은 모델) 제로샷으로 ‘가게·건물 겉모습/매장 안’만 통과시킨다. 애매하면 붙이지 않는다(엉뚱한 사진 금지).
export const NEARBY_RULE_VERSION = 3;
export const NPOS = [
  "a photo of a storefront with a shop sign",
  "a photo of a building exterior on a street",
  "a photo of the inside of a store or supermarket aisle",
  "a photo of a convenience store",
  "a photo of a gas station",
  "a photo of a hospital, clinic or pharmacy building",
  "a photo of a butcher shop counter",
  "a photo of a highway rest area",
  "a photo of a museum or gallery building",
  "a photo of a swimming pool",
  "a photo of a public toilet building",
];
export const NNEG = [
  "a photo of food on a plate or a table of dishes",
  "a selfie or portrait photo of a person",
  "a photo of people at an event",
  "a group of people or riders outdoors",
  "a screenshot of text, a document, a menu or a web page",
  "an advertisement banner or poster with text",
  "a map",
  "a logo on a plain background",
  "a photo of a car interior",
  "a photo of a product close-up",
  "a nature landscape without buildings",
  "a hand holding an object",
  "a microscope image or abstract texture",
  "a bathroom or toilet interior",
  "a menu board or price list",
  "a stock photo of a doctor or a pet",
];
/** 분류 결과 → { ok, top, why, v }. 가게·건물 문장이 1위이고 합이 0.55 이상, 아닌 문장 최댓값 0.2 미만일 때만 통과 */
export function decideNearby(result) {
  const r = [...(result ?? [])].sort((a, b) => b.score - a.score);
  if (!r.length) return { ok: false, top: null, why: "판독 없음", v: NEARBY_RULE_VERSION };
  const pos = r.filter((x) => NPOS.includes(x.label)).reduce((s, x) => s + x.score, 0);
  const negMax = Math.max(0, ...r.filter((x) => NNEG.includes(x.label)).map((x) => x.score));
  // 2026-10-23 표본 120장: 0.55/0.2 기준은 통과 21장 중 12장만 맞음 → 1위 점수·합을 올리고 ‘아님’ 문장을 늘렸다
  const ok = NPOS.includes(r[0].label) && r[0].score >= 0.3 && pos >= 0.65 && negMax < 0.12;
  return { ok, top: r[0].label, pos: Math.round(pos * 100) / 100, v: NEARBY_RULE_VERSION, ...(ok ? {} : { why: NNEG.includes(r[0].label) ? r[0].label : "가게 모습 아님" }) };
}
export async function nearbyPhotoJudge({ cacheDir } = {}) {
  let tf;
  try { tf = await import("@huggingface/transformers"); } catch { return null; }
  if (cacheDir) tf.env.cacheDir = cacheDir;
  const clf = await tf.pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", { dtype: "fp32" });
  const labels = [...NPOS, ...NNEG];
  return async (url) => decideNearby(await clf(url, labels));
}

/** 시설 종류에 맞는 장면인가(주유소에 화장실 건물 사진 같은 엇갈림 막기). kind: 상세 주변 칸 이름(conv·mart·medical·vet·fuel·rest·gear·food 등) */
const FIT = {
  store: ["a photo of a storefront with a shop sign", "a photo of a building exterior on a street", "a photo of the inside of a store or supermarket aisle", "a photo of a convenience store", "a photo of a butcher shop counter"],
  medical: ["a photo of a storefront with a shop sign", "a photo of a building exterior on a street", "a photo of a hospital, clinic or pharmacy building", "a photo of the inside of a store or supermarket aisle"],
  fuel: ["a photo of a gas station", "a photo of a storefront with a shop sign"],
  rest: ["a photo of a highway rest area", "a photo of a building exterior on a street", "a photo of a storefront with a shop sign"],
};
const KIND_FIT = { conv: "store", mart: "store", gear: "store", food: "store", butcher: "store", medical: "medical", vet: "medical", pharmacy: "medical", fuel: "fuel", rest: "rest" };
export const fitsKind = (kind, top) => { const g = FIT[KIND_FIT[kind]]; return !g || g.includes(top); };
