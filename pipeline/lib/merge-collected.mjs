// 수집 결과를 이미 발행된 상세 데이터(camps/{id}.json)에 “덧붙이는” 병합. 지우지 않는다.
// 왜: 전체 재빌드(build:explore)는 실행 시점의 캐시·코드로 모든 것을 다시 만들기 때문에, 캐시가 일부만 복원되면
// 다른 에이전트가 넣은 최신 데이터까지 줄어든다(2026-10-19 데이터 동기화: 후기 2,686→1,272곳). 증분 발행은
// 최신 main 데이터 위에 새로 모은 글만 더한다.

const dateOf = (x) => String(x?.date ?? "");

/**
 * 네이버 검색 언급(sync-web-mentions 출력 한 캠핑장분)을 상세에 덧붙인다.
 * @param {object} d 상세 JSON(제자리 변경)
 * @param {{docs?:object[], prices?:object[], fetched_at?:string}} w 캠핑장 1곳의 웹 언급
 * @param {Record<string,string[]>} bodies 원문 URL → 허용 본문 사실 문장
 * @returns {{docs:number, prices:number, bodies:number}} 새로 더한 수
 */
export function mergeWebMentions(d, w, bodies = {}) {
  const added = { docs: 0, prices: 0, bodies: 0 };
  if (!d || !w) return added;
  const known = new Set([...(d.reviews ?? []), ...(d.cafe ?? [])].map((x) => x.url));
  const byUrl = new Map((d.web ?? []).map((x) => [x.url, x]));
  for (const doc of w.docs ?? []) {
    if (!doc?.url || known.has(doc.url)) continue;
    if (!byUrl.has(doc.url)) added.docs++;
    byUrl.set(doc.url, { ...byUrl.get(doc.url), ...doc });
  }
  if (byUrl.size) d.web = [...byUrl.values()].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  if (w.prices?.length) {
    const seen = new Set((d.prices ?? []).map((p) => `${p.url}|${p.won}`));
    const fresh = w.prices.filter((p) => !seen.has(`${p.url}|${p.won}`));
    added.prices = fresh.length;
    if (fresh.length) d.prices = [...(d.prices ?? []), ...fresh].sort((a, b) => dateOf(b).localeCompare(dateOf(a))).slice(0, 16);
  }
  for (const x of [...(d.reviews ?? []), ...(d.cafe ?? []), ...(d.web ?? [])]) {
    const b = bodies[x.url];
    if (b?.length && !x.body?.length) { x.body = b; added.bodies++; }
  }
  if (w.fetched_at && (!d.web_checked_at || w.fetched_at > d.web_checked_at)) d.web_checked_at = w.fetched_at;
  return added;
}

/**
 * 커버리지 회귀 검사: 항목마다 값이 있는 캠핑장 수가 기준보다 많이 줄었으면 실패 목록을 돌려준다.
 * 허용 감소 폭은 max(20곳, 2%) — 폐업 정리·중복 제거 같은 정상 감소는 지나가게.
 */
export function coverageDrops(base, next) {
  const drops = [];
  for (const [k, b] of Object.entries(base?.fields ?? {})) {
    const n = next?.fields?.[k]?.any ?? 0;
    const allow = Math.max(20, Math.round(b.any * 0.02));
    if (b.any - n > allow) drops.push({ field: k, before: b.any, after: n });
  }
  return drops;
}
