// 공식 사진(고캠핑·관광공사·운영자)이 없는 캠핑장의 카드 대표 사진 고르기(2026-10-20 소유자: “썸네일이 안 나오는 곳이 너무 많다”).
// 후보: 그 캠핑장 이름으로 찾은 카카오 이미지·블로그 검색 결과(d.sns_images — 썸네일·원문 링크만, 내려받아 저장하지 않음).
// 표본 24장 점검: 캠핑장 모습 55% · 배치도·안내판·간판·화면 캡처·야간 사진·인물이 나머지 → 썸네일 픽셀로 거른다(남은 정확도 약 80%).

/**
 * 64×64 RGB 픽셀 → 통계. data: Uint8Array(64*64*3)
 * white: 거의 흰 픽셀 비율(도면·캡처·안내문), dark: 어두운 비율(야간), edge: 급한 밝기 변화(글자·도면), top3: 가장 많은 3색 비율(단색 그래픽)
 */
export function pixelStats(data, w = 64, h = 64) {
  const n = w * h;
  let white = 0, dark = 0, edge = 0;
  const q = new Map();
  for (let p = 0; p < n; p++) {
    const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    if (r > 225 && g > 225 && b > 225) white++;
    if ((r + g + b) / 3 < 45) dark++;
    const k = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    q.set(k, (q.get(k) ?? 0) + 1);
  }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const p = (y * w + x) * 3, l0 = data[p] + data[p + 1] + data[p + 2];
    const l1 = data[p + 3] + data[p + 4] + data[p + 5], l2 = data[p + w * 3] + data[p + w * 3 + 1] + data[p + w * 3 + 2];
    if (Math.abs(l0 - l1) > 150 || Math.abs(l0 - l2) > 150) edge++;
  }
  const top3 = [...q.values()].sort((a, b) => b - a).slice(0, 3).reduce((a, x) => a + x, 0) / n;
  return { white: white / n, dark: dark / n, edge: edge / n, top3 };
}

/** 카드 대표로 쓸 만한 사진인지: 도면·캡처·안내판·야간·단색 그래픽을 거른다 */
export function looksLikePlace(st) {
  if (!st) return false;
  if (st.white > 0.25) return false; // 배치도·화면 캡처·안내문
  if (st.dark > 0.45) return false; // 야간 사진
  if (st.edge > 0.16) return false; // 글자 많은 안내판·간판
  if (st.top3 > 0.6) return false; // 단색 그래픽
  return true;
}

/** 후보 순서: 가로 사진 먼저(세로 사진은 캡처·인물이 많다), 같은 비율이면 검색 순서 */
export function orderCandidates(list) {
  return [...(list ?? [])]
    .filter((x) => x?.thumb && x?.url)
    .map((x, i) => ({ x, i, land: Number(x.w) >= Number(x.h) ? 0 : 1 }))
    .sort((a, b) => a.land - b.land || a.i - b.i)
    .map((o) => o.x);
}
