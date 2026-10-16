// 후기 요약(블로그·카페 검색 결과의 제목·요약문)에서 장점·단점을 주제별로 센다.
// 원칙(docs/CAMPGROUND_SPEC_INTEGRATION.md 5절):
// - 후기는 ‘언급’이다. 사실 확정값이 아니라 “몇 건이 무엇을 좋다/아쉽다고 했는지”만 보인다.
// - 이 캠핑장 이야기로 확인된 글(attributable)만, 묶음 글(“가볼 만한 곳 5곳”)은 뺀다.
// - 한 글에서 같은 주제는 한 번만 센다. 많이 나온 순으로 2개까지, 건수와 함께 보인다(1건도 건수로 드러낸다).
// - 블로그 후기는 협찬·긍정 편향이 있으므로 화면에 ‘후기 n건 요약’이라고 밝힌다.
import { attributable } from "./spec-extractor.mjs";

const NEAR = String.raw`[^.!?\n]{0,10}`;
const rx = (subject, cue) => new RegExp(`(${subject})${NEAR}(${cue})`);

// [라벨, 정규식]. 라벨은 카드 한 줄에 들어가도록 짧게.
export const PROS = [
  ["화장실·샤워장 깨끗", rx("화장실|샤워장|샤워실|개수대|세면장|관리동", "깨끗|깔끔|청결|쾌적")],
  ["사이트 넓음", rx("사이트|자리|데크", "넓|널찍|여유|광활")],
  ["뷰·경치 좋음", rx("뷰|경치|풍경|전망|노을|일몰|일출|오션", "좋|예쁘|이쁘|멋|최고|환상|대박|끝내|감동")],
  ["별 보기 좋음", /별(이|을|보기|멍)[^.!?\n]{0,10}(쏟아|많|좋|최고|예쁘)/],
  ["사장님 친절", rx("사장님|관리자|직원|주인|사모님", "친절|친철|세심|따뜻")],
  ["아이들 놀기 좋음", rx("아이|애들|아이들|키즈|꼬마", "좋아|신나|재밌|재미있|놀기\\s*좋|천국")],
  ["조용·한적", /조용|한적|프라이빗/],
  ["계곡·물놀이 좋음", rx("계곡|물놀이|수영장", "좋|최고|시원|깨끗|맑")],
  ["그늘 많음", rx("그늘", "좋|많|시원")],
  ["관리 잘됨", /관리(가)?\s*(잘|깔끔|훌륭)/],
];
export const CONS = [
  ["벌레 많음", rx("벌레|모기|날파리|깔따구|개미", "많|엄청|심하|주의")],
  ["경사 있음", /경사(가|진|져|도)?[^.!?\n]{0,6}(있|심|져|가파)|기울어/],
  ["소음·매너", /시끄|소음|매너\s*타임[^.!?\n]{0,8}(안\s*지|무시)/],
  ["화장실 멀거나 불편", rx("화장실|샤워장|개수대", "멀|불편|좁|더럽|지저분|부족|냄새")],
  ["그늘 부족", /그늘[^.!?\n]{0,4}(이\s*)?(없|부족|적)/],
  ["사이트 좁음", rx("사이트|자리|데크", "좁|협소|다닥|빽빽")],
  ["가격 부담", rx("가격|요금|이용료", "비싸|사악|부담")],
  ["진입로 험함", rx("진입로|오르막|비포장|길이", "좁|험|가파|비포장|무섭")],
  ["온수 약함", rx("온수|뜨거운\\s*물", "안\\s*나|약|미지근|부족|끊")],
  ["바람 셈", /바람[^.!?\n]{0,6}(세|강|많)/],
];
// “안 좋다”“별로”처럼 장점 단어 근처의 부정은 장점으로 세지 않는다.
const NEGATED = /안\s*좋|별로|아쉽|않|없었|못\s*했/;

/** 한 글에서 나온 장점·단점 주제(중복 없음) */
export function topicsOf(text) {
  const s = String(text ?? "").replace(/<[^>]+>/g, " ");
  const pros = PROS.filter(([, re]) => { const m = s.match(re); return m && !NEGATED.test(s.slice(m.index, m.index + m[0].length + 6)); }).map(([l]) => l);
  // “시끄럽지 않았어요”“벌레도 하나도 없고”처럼 단점 단어를 부정하면 세지 않는다.
  const cons = CONS.filter(([, re]) => { const m = s.match(re); return m && !/않|전혀|하나도|걱정\s*없/.test(s.slice(Math.max(0, m.index - 4), m.index + m[0].length + 8)); }).map(([l]) => l);
  return { pros, cons };
}

/**
 * 캠핑장 하나의 후기 장단점 요약.
 * @returns {{n:number, pros:Array<[string,number]>, cons:Array<[string,number]>} | null}
 */
export function digestReviews(name, reviews = [], { min = 1, top = 2 } = {}) {
  const own = reviews.filter((r) => attributable(r, name));
  if (!own.length) return null;
  const pro = new Map(), con = new Map();
  for (const r of own) {
    // 캠핑장 이름 속 단어(“솔바람”의 바람 등)를 후기 표현으로 세지 않게 이름을 지운다.
    const text = `${r.title ?? ""}. ${r.snippet ?? ""}`.split(String(name ?? "").trim()).join(" ");
    const { pros, cons } = topicsOf(text.replace(new RegExp(String(name ?? "").replace(/[^가-힣A-Za-z0-9]+/g, "|").replace(/^\||\|$/g, "").split("|").filter((t) => t.length >= 2).join("|") || "$^", "g"), " "));
    for (const p of pros) pro.set(p, (pro.get(p) ?? 0) + 1);
    for (const c of cons) con.set(c, (con.get(c) ?? 0) + 1);
  }
  const pick = (m) => [...m.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, top);
  const out = { n: own.length, pros: pick(pro), cons: pick(con) };
  return out.pros.length || out.cons.length ? out : { n: own.length, pros: [], cons: [] };
}
