// 캠핑장 실체 검사(소유자 2026-10-22: “‘서울 구로구 스마트락(주)’은 캠핑장이 아니라 다른 민간업체”).
// 고캠핑에는 지자체 야영장업 인허가가 그대로 실린다. 회사가 본사(도심 사무실) 주소로 등록만 해 둔 곳은
// 실제로 텐트를 칠 땅이 아니라서, 아래 조건이 모두 맞으면 ‘캠핑장 아님(서류상 등록)’으로 본다.
//  1) 이름에 캠핑장다운 낱말이 없고(‘(주)’·회사명만)
//  2) 업장 자체 근거가 하나도 없고(전화·사진·소개글·사이트 종류·규격·편의시설 없음)
//  3) 카카오맵·네이버에 전화·홈페이지가 있는 장소로 잡히지 않고
//  4) 도심 한복판(5km 안 편의점 1,000곳 이상)이거나 주소가 건물 호실(빌딩·타워·○층·○호)이다.
// ‘(주)’만으로는 거르지 않는다 — (주)신어산 자연숲캠핑장처럼 법인이 운영하는 진짜 캠핑장이 많다.
export const CAMP_WORD = /캠핑|캠프|camp|야영|글램|카라반|캐라반|오토|휴양림|펜션|농원|농장|리조트|빌리지|힐링|숲|해수욕장|해변|유원지|수련|체험|마을|계곡|공원|파크|스테이|하우스|쉼터|가든|풀빌라|산장|포레|밸리|랜드|목장|휴양|피크닉|크닉|바베큐|비비큐|팜|섬|별|달|강|호수|골|뜰|정원|오두막|베이스/i;
const OFFICE = /타워|빌딩|오피스텔|지식산업센터|벤처|\d+\s*층|\d+\s*호(\s|,|\)|$)/;
const OWN = ["tel", "img", "line", "kinds", "sizes", "amenities", "ph"];
export const ownEvidence = (c) => OWN.filter((f) => c[f] != null && c[f] !== "" && !(Array.isArray(c[f]) && !c[f].length));

/** 서류상 등록(캠핑장 아님)이면 이유 문자열, 아니면 null. kakao·naver는 registry 항목, n5는 5km 안 편의점 수. */
export function paperRegistration(c, { kakao = null, naver = null, n5 = null } = {}) {
  if (c.du || /^rf-/.test(String(c.id))) return null;
  if (CAMP_WORD.test(c.name ?? "")) return null;
  if (ownEvidence(c).length) return null;
  if (kakao?.place || naver?.place?.phone || naver?.place?.link) return null;
  const urban = (n5 ?? 0) >= 1000, office = OFFICE.test(c.addr ?? "");
  if (!urban && !office) return null;
  return `캠핑장 이름이 아니고(${c.name}) 전화·사진·소개·시설 근거가 없으며 지도 장소로도 잡히지 않는 ${urban ? `도심(5km 안 편의점 ${n5}곳)` : "건물 호실"} 주소 — 야영장업 서류상 등록`;
}
