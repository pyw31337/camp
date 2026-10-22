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
 * 카카오 다음 소셜 검색(sync-social 출력 한 캠핑장분)을 상세에 덧붙인다 — 채우기만(기존 항목·순서 그대로, 새 URL만 뒤에).
 * build-explore-data는 고캠핑 원본이 있는 곳만 소셜을 붙이므로, 휴양림·지자체·OSM 장소는 이 병합으로 영상·후기가 들어간다(2026-10-23).
 * @param {object} d 상세 JSON(제자리 변경)
 * @param {{blog?:object[], cafe?:object[], image?:object[], vclip?:object[], fetched_at?:string}} so
 * @param {{sharedThumb?: (thumb:string)=>boolean}} [opt] 여러 캠핑장에 똑같이 붙은 검색 사진(매칭 의심)을 거르는 함수
 * @returns {{videos:number, posts:number, images:number}} 새로 더한 수
 */
export function mergeSocial(d, so, { sharedThumb = () => false } = {}) {
  const added = { videos: 0, posts: 0, images: 0 };
  if (!d || !so) return added;
  // 고캠핑 업장은 build-explore-data가 재검사(refilterSocial)·사진 중복 제거를 거쳐 붙인다 — 그 결과를 우회하지 않는다.
  // 소셜이 한 번도 붙지 않은 곳과, 이 병합으로 붙인 곳(social_merged)만 채운다.
  if (d.social_checked_at && !d.social_merged) return added;
  const ytId = (x) => x?.yt || String(x?.url ?? "").match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/)?.[1] || null;
  const fill = (field, items, keyOf, count) => {
    const cur = d[field] ?? [];
    const seen = new Set(cur.map(keyOf).filter(Boolean));
    const fresh = (items ?? []).filter((x) => { const k = keyOf(x); if (!k || seen.has(k)) return false; seen.add(k); return true; });
    if (!fresh.length) return;
    d[field] = [...cur, ...fresh];
    added[count] += fresh.length;
  };
  fill("videos", so.vclip, (x) => ytId(x) ?? x?.url, "videos");
  const postKnown = new Set([...(d.reviews ?? []), ...(d.cafe ?? []), ...(d.web ?? [])].map((x) => x.url));
  fill("reviews", (so.blog ?? []).filter((x) => !postKnown.has(x.url)), (x) => x?.url, "posts");
  fill("cafe", (so.cafe ?? []).filter((x) => !postKnown.has(x.url)), (x) => x?.url, "posts");
  fill("sns_images", (so.image ?? []).filter((x) => x?.thumb && !sharedThumb(x.thumb)), (x) => x?.img ?? x?.thumb, "images");
  if (so.fetched_at && (!d.social_checked_at || so.fetched_at > d.social_checked_at)) { d.social_checked_at = so.fetched_at; d.social_merged = true; }
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
