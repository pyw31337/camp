// 텍스트 내용 검토(소유자 2026-10-22: “데이터의 텍스트 내용과 사진 내용을 후기사진 검증처럼 내용 검토하는 인공지능 기능”).
// 후기·카페·웹문서·영상 제목이 캠핑장과 관계없는 글(식당·맛집, 광고·판매, 부동산·분양, 주식·연예·게임 등)인지 판정한다.
// 방법: 무료 로컬 다국어 문장 임베딩(Xenova/multilingual-e5-small, transformers.js, CPU)과 분류별 예시 문장의 코사인 유사도.
//   - 2026-10-22 시험: 다국어 NLI(mDeBERTa xnli) 제로샷은 한국어에서 거의 무작위였고, 임베딩+예시 문장은 표본 8개를 모두 맞혔다.
//   - 캠핑장 이름이 글에 있으면 관련 글로 본다(이름은 가장 강한 근거). 판정은 숨김 표시(ng)만 하고 원문은 지우지 않는다.

export const MODEL = "Xenova/multilingual-e5-small";
/** 규칙이 바뀌면 올린다 → 캐시(registry/text-judgments.json)의 옛 판정은 다시 한다 */
export const RULE_VERSION = 1; // 이름 일치(nameHit)는 반영 단계(apply-text-judgments)에서도 다시 본다

// 관련(캠핑·야외 숙박·여행) 예시와 무관 예시. 무관 분류만 숨김 대상이다.
export const PROTOS = {
  camp: [
    "캠핑장 다녀온 후기 사이트 넓고 화장실 개수대 깨끗해요", "아이들과 오토캠핑 1박2일 텐트 피칭 후기", "글램핑 카라반 숙박 후기 불멍 했어요",
    "계곡 옆 캠핑장 데크 사이트 이용 후기", "차박 노지 캠핑 다녀왔습니다", "캠핑장 매너타임 관리 잘되고 조용했어요", "캠핑장 예약 방법과 요금 사이트 배치도",
    "반려견 동반 캠핑 애견 캠핑장", "동계 캠핑 난방 전기 사용 후기", "캠핑 브이로그 우중캠핑", "야영장 시설 안내 샤워장 매점",
  ],
  travel: ["가족 여행 펜션 숙소 바베큐 계곡 물놀이", "주말 나들이 공원 산책 아이와 갈만한 곳", "자연휴양림 숲속의 집 숙박", "바다 해수욕장 여행 코스"],
  food: ["맛집 다녀왔어요 음식 가격 대비 맛있어요", "대게 회 해산물 식당 후기", "카페 디저트 커피 맛집 방문", "고기집 메뉴 추천 웨이팅", "배달 음식 리뷰 치킨 피자"],
  ad: ["최대 70% 할인 이벤트 지금 바로 구매하세요", "쇼핑몰 신상품 특가 쿠폰 증정", "협찬 받아 작성한 광고 포스팅입니다 구매 링크", "대출 보험 상담 문의 무료 견적", "공구 진행 판매 오픈 주문 받습니다"],
  estate: ["아파트 분양 모델하우스 청약 정보", "토지 매매 부동산 시세 급매", "전원주택 부지 분양 상담", "상가 임대 매물 안내"],
  other: ["주식 투자 경제 뉴스 정리", "연예인 드라마 리뷰", "게임 공략 업데이트", "학원 수업 공부 일기", "정치 선거 뉴스", "병원 진료 후기 성형 피부과"],
};
const BAD = new Set(["food", "ad", "estate", "other"]);
const SHORT = { food: "식당·음식 글", ad: "광고·판매 글", estate: "부동산 글", other: "캠핑과 무관한 글" };

const norm = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
// 캠핑장 이름 일치: 대소문자·띄어쓰기·법인 표기·지점명을 무시하고, 이름 전체 또는 가장 긴 낱말(3자 이상)이 글에 있으면 일치
// 2026-10-22: “(주)드윌레저캠프 양촌지점”, “강촌IC 힐링캠프”의 예약 판매 페이지를 이름 불일치로 광고로 판정했다.
const squash = (s) => String(s ?? "").toLowerCase().replace(/\(주\)|㈜|주식회사|\[.*?\]/g, "").replace(/[^0-9a-z가-힣]/g, "");
const GENERIC = /^(오토|가족|글램핑|카라반|캠핑장|야영장|캠핑|캠프|camp|camping|휴양림|자연휴양림|펜션|리조트|\S{1,3}지점|\S{1,3}점)$/i;
export function nameHit(name, text) {
  const t = squash(text);
  if (!t) return false;
  const full = squash(String(name ?? "").replace(/(지점|점)$/g, "")).replace(/(오토|가족)?(캠핑장|야영장|캠핑|글램핑|카라반|휴양림)$/g, "");
  if (full.length >= 2 && t.includes(full)) return true;
  const words = String(name ?? "").replace(/\(주\)|㈜|주식회사/g, " ").split(/[\s()·,/]+/).map(squash).filter((w) => w.length >= 3 && !GENERIC.test(w));
  return words.some((w) => t.includes(w));
}

/** 점수({분류: 유사도}) → 판정 { ok, top, margin, why } */
export function decide(scores, { nameHit = false, campWords = false, sponsored = false } = {}) {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, s1] = ranked[0];
  const good = Math.max(scores.camp ?? 0, scores.travel ?? 0);
  const margin = Math.round((s1 - good) * 1000) / 1000;
  // 캠핑장 이름이 있으면 관련 글. 이름도 캠핑 낱말도 없으면 무관 분류가 1위이기만 해도 숨기고,
  // 캠핑 낱말만 있으면 무관 분류가 0.03 이상 앞설 때만 숨긴다(임베딩 유사도는 0.8~0.9에 몰려 있어 차이가 작다).
  let bad = false, why = SHORT[top];
  if (!nameHit) {
    if (sponsored && !campWords) { bad = true; why = SHORT.ad; }
    else if (BAD.has(top)) bad = campWords ? margin >= 0.03 : margin >= 0;
  }
  return { ok: !bad, top, margin, v: RULE_VERSION, ...(bad ? { why } : {}) };
}
// 협찬·제휴 고지(판매 수수료·원고료)는 광고 글의 강한 단서
const SPONSORED = /수수료를\s*제공|파트너스\s*활동|원고료|소정의|협찬|제품을\s*제공받|광고\s*포함|유료\s*광고/;

const CAMP_WORDS = /캠핑|야영|글램핑|카라반|텐트|차박|오토캠|사이트|데크|파쇄석|불멍|타프|캠퍼|캠크닉|노지/;

/** 판정기. @huggingface/transformers가 없으면 null. judge([{text, camp}]) → 판정 배열 */
export async function textJudge({ cacheDir } = {}) {
  let tf;
  try { tf = await import("@huggingface/transformers"); } catch { return null; }
  if (cacheDir) tf.env.cacheDir = cacheDir;
  const emb = await tf.pipeline("feature-extraction", MODEL, { dtype: "q8" });
  const E = async (xs, p) => (await emb(xs.map((x) => `${p}: ${x}`), { pooling: "mean", normalize: true })).tolist();
  const protos = {};
  for (const [k, xs] of Object.entries(PROTOS)) protos[k] = await E(xs, "passage");
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  return async (items) => {
    const texts = items.map((x) => norm(x.text).slice(0, 400) || " ");
    const qs = await E(texts, "query");
    return items.map((x, i) => {
      const scores = Object.fromEntries(Object.entries(protos).map(([k, vs]) => [k, Math.max(...vs.map((v) => dot(qs[i], v)))]));
      return decide(scores, { nameHit: nameHit(x.camp, texts[i]), campWords: CAMP_WORDS.test(texts[i]), sponsored: SPONSORED.test(texts[i]) });
    });
  };
}

export const textOf = (x) => norm([x.title ?? x.t, x.snippet ?? x.q, x.body].filter(Boolean).join(" · "));
