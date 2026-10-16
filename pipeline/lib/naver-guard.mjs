// 네이버 검색 API(NAVER API HUB)가 절대 유료로 쓰이지 않게 막는 안전장치(소유자 지시 2026-10-16).
// 1) 무료 확인: 호출 전마다 NCP 공식 상품 페이지 요금표에서 ‘검색 API 무료 구간 0원’을 확인하고, 금액·유료 구간이 보이면 멈춘다.
//    요금표를 읽지 못해도 멈춘다(확인 못 하면 쓰지 않는다 — fail-closed). 가이드를 읽을 수 있으면 유료 전환 문구도 함께 본다.
// 2) 월 예산: 무료 한도(월 775,000건)의 일부(기본 20,000건)만 쓰도록 월별 사용량을 registry/naver-usage.json에 남기고 넘으면 멈춘다.
// 3) 응답 감시: 402·결제/요금 관련 오류가 오면 즉시 멈춘다.
// 4) 소유자 스위치: 저장소 변수 NAVER_API_ENABLED=false면 아무 호출도 하지 않는다.

// 1차 근거: NCP 공식 상품 페이지의 요금표(자동 접근 가능). 2차: 사용 가이드(봇 접근은 403이라 참고만).
export const PRICING_URL = "https://www.ncloud.com/product/applicationService/naverApiHub";
export const FREE_TIER_URL = "https://guide.ncloud-docs.com/docs/apihub-overview";
export const FREE_QUOTA_MONTHLY = 775000;
export const DEFAULT_MONTHLY_CAP = 20000; // 무료 한도의 약 2.6%
export const DAILY_LIMIT = 25000; // 요금표의 일 최대 호출 제한 — 한 실행 호출 상한은 이보다 훨씬 낮게(기본 4,000)
// 지금 가이드 문장: “NAVER API HUB 서비스는 한시적으로 무료로 제공되며, 유료 전환 시 사전에 별도 공지로 안내될 예정입니다.”
export const FREE_SENTENCE = /한시적으로\s*무료/;
// 전환이 확정·시행됐다는 표현(“유료 전환 시 사전에 공지”처럼 예정 표현은 해당 없음)
export const PAID_SIGNS = /유료\s*(로\s*)?전환(되었|됐|됩니다|합니다|일\s*[:：]?\s*\d|\s*시행|\s*안내\s*[:：])|과금(이|을)?\s*(시작|개시|적용)|요금(이)?\s*(부과|청구)(가)?\s*(시작|됩니다)|무료\s*(제공\s*)?(기간\s*)?(이|은|가)?\s*(종료|만료|끝)|유료\s*요금제/;
const BILLING_ERROR = /payment|billing|charge|결제|요금|과금|유료|credit/i;

const strip = (html) => String(html ?? "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ");

/** 가이드 본문 → 판정. free=true일 때만 호출해도 된다. */
export function judgeFreeTier(text) {
  const t = strip(text);
  if (/access denied|error page/i.test(t) && !FREE_SENTENCE.test(t)) return { free: false, reason: "가이드 페이지 접근 거부(확인 불가)" };
  const paid = t.match(PAID_SIGNS);
  if (paid) return { free: false, reason: `유료 전환 표현 발견: “${paid[0]}”` };
  if (!FREE_SENTENCE.test(t)) return { free: false, reason: "‘한시적으로 무료’ 문장이 사라짐(요금 정책 변경 가능성)" };
  const m = t.match(/[^.。]*한시적으로\s*무료[^.。]*[.。]?/);
  return { free: true, reason: "무료 문장 확인", quote: m ? m[0].trim().slice(0, 200) : null };
}

/**
 * 공식 요금표에서 ‘검색 API’ 행 판정. 2026-10-16 요금표: “검색 API | 무료 | 0 ~ 775,000건 | 0원 | 일 최대 25,000건 호출 제한”.
 * 무료 구간 0원 행이 있고, 검색 API 칸에 0원이 아닌 금액이 하나도 없을 때만 free=true.
 */
export function judgePricingTable(html) {
  const t = strip(html).replace(/\s*\|\s*/g, " ");
  // 요금표 머리(“호출량 구간”) 뒤의 ‘검색 API’ 행만 본다(앞쪽 상품 소개 문단에도 같은 말이 있다).
  const head = t.search(/호출량\s*구간/);
  if (head < 0) return { free: false, reason: "공식 요금표(호출량 구간)를 찾지 못함(확인 불가)" };
  const rel = t.slice(head).indexOf("검색 API");
  if (rel < 0) return { free: false, reason: "요금표에서 ‘검색 API’ 행을 찾지 못함(확인 불가)" };
  const i = head + rel;
  // 검색 API 칸: 다음 상품 칸·이용 안내 전까지
  const rest = t.slice(i, i + 600);
  const end = rest.search(/이용 안내|NAVER API HUB 리소스|\(\s*VAT/);
  const seg = end > 0 ? rest.slice(0, end) : rest.slice(0, 300);
  const freeRow = seg.match(/무료\s*0\s*~\s*([\d,]+)\s*건\s*0\s*원/);
  const paidAmount = seg.match(/(?<![\d,])([1-9][\d,]*(\.\d+)?)\s*원/);
  if (paidAmount) return { free: false, reason: `검색 API 요금표에 금액 발견: “${paidAmount[0]}”`, quote: seg.slice(0, 160) };
  if (/유료/.test(seg)) return { free: false, reason: "검색 API 요금표에 ‘유료’ 구간이 생김", quote: seg.slice(0, 160) };
  if (!freeRow) return { free: false, reason: "검색 API 무료 구간(0원) 행이 사라짐", quote: seg.slice(0, 160) };
  const daily = seg.match(/일\s*최대\s*([\d,]+)\s*건/);
  return { free: true, reason: "공식 요금표: 검색 API 무료 구간 0원", quote: seg.trim().slice(0, 160), monthly_free: Number(freeRow[1].replace(/,/g, "")), daily_limit: daily ? Number(daily[1].replace(/,/g, "")) : null };
}

/** 호출 전 무료 확인(공식 요금표). 읽기 실패·판정 실패면 free=false. */
export async function checkFreeTier({ fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const checked_at = new Date().toISOString();
  try {
    const pr = await fetchImpl(PRICING_URL, { headers: { "User-Agent": "moyeora-camp-monitor (+https://github.com/pyw31337/camp)", "Accept-Language": "ko" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!pr.ok) return { free: false, reason: `공식 요금표 HTTP ${pr.status}(확인 불가)`, checked_at, url: PRICING_URL };
    const table = judgePricingTable(await pr.text());
    if (!table.free) return { ...table, checked_at, url: PRICING_URL };
    // 보조: 가이드를 읽을 수 있으면 유료 전환 표현이 없는지도 본다(403 등으로 못 읽으면 요금표만으로 판단).
    const guide = await fetchImpl(FREE_TIER_URL, { headers: { "User-Agent": "moyeora-camp-monitor (+https://github.com/pyw31337/camp)", "Accept-Language": "ko" }, signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    if (guide?.ok) {
      const g = judgeFreeTier(await guide.text());
      if (!g.free) return { ...g, checked_at, url: FREE_TIER_URL };
    }
    return { ...table, checked_at, url: PRICING_URL, guide_checked: Boolean(guide?.ok) };
  } catch (e) {
    return { free: false, reason: `요금표 읽기 실패: ${e.message.slice(0, 120)}`, checked_at, url: PRICING_URL };
  }
}

/** (이전 방식, 보조용) 가이드 본문만으로 확인 */
export async function checkGuideOnly({ fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const checked_at = new Date().toISOString();
  try {
    const res = await fetchImpl(FREE_TIER_URL, { headers: { "User-Agent": "Mozilla/5.0 (compatible; moyeora-camp-monitor; +https://github.com/pyw31337/camp)", "Accept-Language": "ko" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { free: false, reason: `가이드 HTTP ${res.status}(확인 불가)`, checked_at, url: FREE_TIER_URL };
    return { ...judgeFreeTier(await res.text()), checked_at, url: FREE_TIER_URL };
  } catch (e) {
    return { free: false, reason: `가이드 읽기 실패: ${e.message.slice(0, 120)}`, checked_at, url: FREE_TIER_URL };
  }
}

/** KST 기준 월 키(YYYY-MM) */
export const monthKey = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 7);

/** 이번 달 남은 호출 수 */
export function remainingBudget(usage, cap = DEFAULT_MONTHLY_CAP, now = new Date()) {
  const used = usage?.months?.[monthKey(now)]?.calls ?? 0;
  return Math.max(0, Math.min(cap, FREE_QUOTA_MONTHLY) - used);
}

/** 사용량 기록(같은 달이면 누적) */
export function recordUsage(usage, calls, { now = new Date(), check = null } = {}) {
  const out = { version: 1, free_quota_monthly: FREE_QUOTA_MONTHLY, ...(usage ?? {}), months: { ...(usage?.months ?? {}) } };
  const k = monthKey(now);
  const cur = out.months[k] ?? { calls: 0, runs: 0 };
  out.months[k] = { calls: cur.calls + calls, runs: cur.runs + 1, last_run_at: now.toISOString() };
  if (check) out.last_free_check = check;
  return out;
}

/** 응답이 결제·요금 문제로 보이면 true(즉시 중단 신호) */
export const isBillingError = (status, body) => status === 402 || (status >= 400 && BILLING_ERROR.test(String(body ?? "")));
