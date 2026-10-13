// 테마 분류: 고캠핑 원천 필드(입지 lctCl, 테마 themaEnvrnCl, 부대시설 sbrsCl/sbrsEtc, 주변 즐길거리 posblFcltyCl,
// 반려동물, 사이트 형태, 운영 주체, 예약 방법)만으로 판정한다. 소개 문구의 광고성 표현은 판정에 쓰지 않는다.
// 화면은 이 id 목록(th)만 받아 테마 공간·필터를 그린다.

const has = (list, re) => (list ?? []).some((v) => re.test(v));
const kinds = (c) => new Set((c.products ?? []).map((p) => p.kind));

/** @type {{id:string,label:string,group:string,icon:string,desc:string,test:(c:object)=>boolean}[]} */
export const THEMES = [
  // 자연 입지
  { id: "valley", group: "자연", label: "계곡 옆", icon: "#l-waves", desc: "계곡을 끼고 있는 캠핑장", test: (c) => has(c.environment, /계곡/) || has(c.nearby_facilities, /계곡/) },
  { id: "sea", group: "자연", label: "바다·섬", icon: "#l-sailboat", desc: "해변·섬 입지, 해수욕 가능", test: (c) => has(c.environment, /해변|바다|섬/) || has(c.nearby_facilities, /해수욕|갯벌/) },
  { id: "forest", group: "자연", label: "숲속", icon: "#l-trees", desc: "숲 입지, 그늘 많은 사이트", test: (c) => has(c.environment, /숲/) || ["NATURAL_RECREATION_FOREST"].includes(c.operator_type) },
  { id: "lake", group: "자연", label: "호수·강변", icon: "#l-droplets", desc: "호수·강 입지, 물멍", test: (c) => has(c.environment, /호수|강/) || has(c.nearby_facilities, /강|호수/) },
  { id: "mountain", group: "자연", label: "산 속", icon: "#l-mountain", desc: "산 입지, 별 보기 좋은 곳", test: (c) => has(c.environment, /산/) },
  { id: "city", group: "자연", label: "도심 근교", icon: "#l-building-2", desc: "도심 입지, 가볍게 1박", test: (c) => has(c.environment, /도심/) },
  // 계절·풍경
  { id: "summer", group: "계절", label: "여름 물놀이", icon: "#l-sun", desc: "물놀이장·계곡·수상레저", test: (c) => has(c.themes, /여름물놀이|수상레저/) || has(c.amenities, /물놀이장/) },
  { id: "autumn", group: "계절", label: "가을 단풍", icon: "#l-leaf", desc: "단풍 명소", test: (c) => has(c.themes, /단풍/) },
  { id: "winter", group: "계절", label: "겨울 눈꽃", icon: "#l-snowflake", desc: "눈꽃·스키, 동계 운영", test: (c) => has(c.themes, /눈꽃|스키/) },
  { id: "spring", group: "계절", label: "봄꽃", icon: "#l-flower-2", desc: "봄꽃 여행지", test: (c) => has(c.themes, /봄꽃/) },
  { id: "sunrise", group: "계절", label: "일출·일몰", icon: "#l-sunrise", desc: "해돋이·노을 명소", test: (c) => has(c.themes, /일출|일몰/) },
  // 함께 가는 사람
  { id: "kids", group: "함께", label: "아이와 함께", icon: "#l-baby", desc: "놀이터·트램펄린·물놀이장", test: (c) => has(c.amenities, /트렘폴린|트램폴린|놀이터|물놀이장/) || has(c.nearby_facilities, /어린이|체험/) },
  { id: "pet", group: "함께", label: "반려견 동반", icon: "#l-dog", desc: "반려동물 출입 가능", test: (c) => /가능/.test(c.pets ?? "") && !/불가/.test(c.pets ?? "") },
  // 캠핑 방식
  { id: "glamping", group: "방식", label: "글램핑", icon: "#l-bed-double", desc: "장비 없이 몸만", test: (c) => kinds(c).has("GLAMPING") },
  { id: "caravan", group: "방식", label: "카라반", icon: "#t-caravan", desc: "카라반 숙박", test: (c) => kinds(c).has("CARAVAN_RENTAL") },
  { id: "auto", group: "방식", label: "오토캠핑", icon: "#l-car", desc: "차를 사이트 옆에", test: (c) => kinds(c).has("AUTO_PITCH") },
  { id: "trailer", group: "방식", label: "트레일러 동반", icon: "#t-caravan", desc: "개인 트레일러·카라반 입장 가능", test: (c) => c.trailer_allowed === true || c.caravan_allowed === true },
  { id: "fishing", group: "방식", label: "낚시", icon: "#l-fish", desc: "낚시 가능", test: (c) => has(c.themes, /낚시/) || has(c.nearby_facilities, /낚시/) },
  { id: "walk", group: "방식", label: "걷기·산책", icon: "#l-footprints", desc: "산책로·걷기길", test: (c) => has(c.themes, /걷기길/) || has(c.amenities, /산책로/) || has(c.nearby_facilities, /산책로/) },
  // 편의·예약
  { id: "comfort", group: "편의", label: "편의시설 완비", icon: "#l-plug-zap", desc: "전기·온수·장작·마트", test: (c) => has(c.amenities, /전기/) && has(c.amenities, /온수/) && has(c.amenities, /장작/) && has(c.amenities, /마트|편의점/) },
  { id: "wifi", group: "편의", label: "와이파이", icon: "#l-wifi", desc: "무선인터넷", test: (c) => has(c.amenities, /무선인터넷|와이파이/i) },
  { id: "public", group: "편의", label: "공영·국립", icon: "#l-landmark", desc: "지자체·국립공원·휴양림 운영", test: (c) => ["LOCAL_GOVERNMENT", "NATIONAL_PARK", "NATURAL_RECREATION_FOREST", "PUBLIC_LEISURE"].includes(c.operator_type) },
  { id: "realtime", group: "편의", label: "온라인 실시간 예약", icon: "#l-zap", desc: "바로 예약 가능", test: (c) => has(c.reservation?.methods, /실시간/) },
];

/** 캠핑장(정규화 레코드) → 해당 테마 id 목록 */
export const themesOf = (c) => THEMES.filter((t) => t.test(c)).map((t) => t.id);
/** 화면용 테마 정의(함수 제외) */
export const themeCatalog = () => THEMES.map(({ test, ...t }) => t);
