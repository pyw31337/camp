// 고캠핑 원본 응답에서 ‘무료 운영’ 후보를 찾는다. 결과는 후보일 뿐이며,
// 레지스트리(free-sites.json)에 올리려면 운영 기관 공식 안내로 무료·취사·화장실을 확인해야 한다.

// ‘무료 와이파이/주차/샤워’ 같은 부대 혜택은 제외하고 이용료 자체가 무료인 표현만 잡는다.
const FREE_PATTERNS = [
  /(이용료|사용료|입장료|야영료|캠핑료|요금)\s*(는|은|이|가)?\s*(전액\s*)?무료/,
  /무료\s*(로\s*)?(운영|개방|이용|야영|캠핑)(되|하|할|합|가능|중|장)/,
  /무료\s*(야영장|캠핑장|오토캠핑장|노지)/,
];
const EXCLUDE = /무료\s*(와이파이|wifi|와이 ?파이|주차|샤워|대여|체험|셔틀|입장 ?시|음료|커피|족욕)/i;
const COOKING_HINTS = /(취사장|취사 ?가능|바비큐|바베큐|그릴|화로)/;

const int = (v) => { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return Number.isFinite(n) ? n : 0; };

export function findFreeCandidates(items) {
  const out = [];
  for (const it of items) {
    const text = [it.lineIntro, it.intro, it.featureNm, it.tooltip].filter(Boolean).join(" ");
    const hit = FREE_PATTERNS.map((re) => re.exec(text)).find(Boolean);
    if (!hit) continue;
    const at = hit.index;
    const snippet = text.slice(Math.max(0, at - 30), at + hit[0].length + 30).replace(/\s+/g, " ").trim();
    if (EXCLUDE.test(snippet) && !/(이용료|사용료|야영료|캠핑료)/.test(snippet)) continue;
    const facilities = `${it.sbrsCl ?? ""} ${it.sbrsEtc ?? ""} ${it.posblFcltyCl ?? ""} ${it.brazierCl ?? ""}`;
    out.push({
      gocamping_id: String(it.contentId),
      name: it.facltNm,
      region: [it.doNm, it.sigunguNm].filter(Boolean).join(" "),
      operator: it.facltDivNm || null,
      snippet,
      toilets: int(it.toiletCo),
      sinks: int(it.wtrplCo),
      brazier: it.brazierCl || null,
      cooking_hint: COOKING_HINTS.test(`${text} ${facilities}`) || int(it.wtrplCo) > 0,
      homepage: it.homepage || null,
      tel: it.tel || null,
      // 화장실이 있고 취사 단서가 있는 후보를 먼저 확인한다.
      priority: (int(it.toiletCo) > 0 ? 2 : 0) + (COOKING_HINTS.test(`${text} ${facilities}`) || int(it.wtrplCo) > 0 ? 1 : 0) + (/지자체|국민여가/.test(it.facltDivNm ?? "") ? 1 : 0),
    });
  }
  return out.sort((a, b) => b.priority - a.priority || a.region.localeCompare(b.region, "ko"));
}
