// 한국관광공사 고캠핑 ‘분야별 공공 우수야영장’(문화체육관광부·한국관광공사 선정) 공개 목록 파서.
// 원천: https://gocamping.or.kr/camp/best/list.do?searchYear=YYYY (robots.txt 허용 경로, 연 1회 갱신)
// 각 항목의 링크가 고캠핑 상세(c_no=contentId)라 기준 모수와 그대로 연결된다(이름 매칭 불필요).
// 순수 함수만 둔다(네트워크·파일 입출력은 scripts/sync-best-campgrounds.mjs).

export const BEST_URL = (year) => `https://gocamping.or.kr/camp/best/list.do?searchYear=${year}`;
// 섹션 클래스 → 분야 코드
export const BEST_FIELDS = { eco: "ECO", family: "FAMILY", disabled: "ACCESSIBLE", pet: "PET" };
export const BEST_FIELD_LABEL = { ECO: "친환경", FAMILY: "가족친화", ACCESSIBLE: "교통약자 배려", PET: "반려동물 친화" };

const decode = (s) => String(s ?? "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, " ").trim();

/** 목록 HTML 1쪽 → [{year, field, contentId, name, summary, address}] */
export function parseBestList(html, year) {
  const out = [];
  const text = String(html ?? "");
  const secRe = /<section class="map-swiper-item ([a-z]+)[^"]*">([\s\S]*?)<\/section>/g;
  let m;
  while ((m = secRe.exec(text))) {
    const field = BEST_FIELDS[m[1]];
    if (!field) continue;
    const itemRe = /<a href="[^"]*read\.do\?c_no=(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
    let it;
    while ((it = itemRe.exec(m[2]))) {
      const body = it[2];
      const pick = (cls) => decode(body.match(new RegExp(`<[a-z0-9]+ class="${cls}[^"]*"[^>]*>([\\s\\S]*?)</[a-z0-9]+>`))?.[1]) || null;
      const name = pick("subject");
      if (!name) continue;
      out.push({ year: Number(year), field, contentId: it[1], name, summary: pick("summary"), address: pick("address") });
    }
  }
  // 같은 해·분야·캠핑장 중복(슬라이드 복제) 제거
  const seen = new Set();
  return out.filter((r) => { const k = `${r.year}:${r.field}:${r.contentId}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** 연도별 목록 → contentId별 수상 이력 {contentId: [{year, field, label, summary, url}]} (최근 연도 먼저) */
export function indexBest(rows) {
  const by = {};
  for (const r of rows) (by[r.contentId] ??= []).push({ year: r.year, field: r.field, label: BEST_FIELD_LABEL[r.field], summary: r.summary, url: BEST_URL(r.year) });
  for (const v of Object.values(by)) v.sort((a, b) => b.year - a.year || a.field.localeCompare(b.field));
  return by;
}
