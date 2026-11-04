// 이색 캠핑장 분류(소유자 t44u 2026-11-04): 노천탕·온수풀·승마 같은 ‘특별한 시설·체험’을 가진 캠핑장을 하위 분류로 고른다.
// 판정 근거(엄격):
//  ① 업장 자신의 글 — 고캠핑 부대시설(amenities)·한 줄 소개(line)·소개글(intro, gcd.intro)·체험 항목.
//  ② 후기·영상 제목 — 제목에 캠핑장 이름이 함께 있고, 서로 다른 제목 2건 이상이 같은 시설을 말할 때만.
// 문장 안 키워드 앞뒤 12자에 부정(없음·불가·운영 안 함)·바깥 시설(인근·근처·차로·체육센터·할인 제휴) 표현이 있으면 세지 않는다.
// ‘계곡 바로 옆’은 후기 제목으로는 판정하지 않는다(주변 계곡 나들이 글이 많음) — 업장 글만.
// 데이터는 지우지 않는다. 화면용 파생 필드(c.uq)만 덧붙인다.

// t45u(2026-11-04): 소유자 요청으로 9개 묶음 → 12개 낱개 분류로 나눔(+계곡은 칩 없이 테마 포함만 유지).
export const UNIQUE_CATS = [
  { id: "hotspring", label: "노천탕", re: /노천탕|노천 ?욕조|노천 ?온천|히노끼|족욕|온천탕|야외 ?욕조/ },
  { id: "spa", label: "스파", re: /자쿠지|월풀|온천수|(?<![가-힣])스파(?!게티|클)|사우나|찜질/ },
  { id: "warmpool", label: "사계절온수풀", re: /온수 ?풀|온수 ?수영장|미온수|사계절 ?(?:수영장|풀)|4계절 ?(?:수영장|풀)|실내 ?수영장|온수 ?물놀이/ },
  { id: "pool", label: "수영장", re: /수영장|풀장|풀빌라|인피니티 ?풀|개별 ?풀|전용 ?풀/ },
  { id: "horse", label: "승마", re: /승마|말타기|포니/ },
  { id: "animal", label: "동물체험", re: /동물 ?농장|동물 ?체험|먹이 ?주기|양떼|알파카|미니 ?동물원|토끼 ?먹이|염소 ?먹이/ },
  { id: "kidscafe", label: "키즈카페", re: /키즈 ?카페/ },
  { id: "indoorplay", label: "실내놀이", re: /키즈 ?룸|실내 ?놀이터|실내 ?놀이방|플레이 ?룸|볼풀|(?<!노 ?)키즈 ?존/ },
  { id: "treehouse", label: "트리하우스", re: /트리 ?하우스/ },
  { id: "stay", label: "이색숙소", re: /이글루|버블 ?텐트|호빗|(?<![가-힣])티피(?![가-힣])|인디언 ?텐트|기차 ?(?:캠핑|객실|펜션|숙소)|열차 ?(?:캠핑|객실)|캡슐 ?(?:하우스|호텔)|우주선|선박 ?(?:캠핑|객실)|버스 ?캠핑|돔 ?하우스|지오데식/ },
  { id: "leisure", label: "레포츠", re: /짚 ?라인|집 ?라인|서바이벌|ATV|사륜 ?바이크|카트(?:장| ?체험)|카약|카누|패들 ?보드|SUP|레일 ?바이크|패러 ?글라이딩|눈 ?썰매|썰매장|수상 ?스키|웨이크|암벽/ },
  { id: "farm", label: "체험", re: /(?:딸기|블루베리|감자|고구마|옥수수|사과|밤) ?(?:따기|캐기|줍기|수확)|체험 ?농장|농촌 ?체험|목공 ?체험|도예 ?체험|천연 ?염색|만들기 ?체험|천체 ?관측|별 ?관측 ?(?:체험|프로그램)|천체 ?망원경/ },
  { id: "valley", label: "계곡 바로 옆", ownOnly: true, re: /계곡 ?(?:바로|앞|옆|과 ?접|을 ?끼|이 ?흐르|물이 ?흐르)|계곡형|계곡 ?뷰/ },
];
const NEG = /없|불가|미운영|운영 ?안|중단|폐쇄|공사|아니|인근|근처|주변|가까|차로|도보|분 ?거리|km|킬로|떨어|이웃|옆 ?마을|국민체육|체육센터|시립|군립|구립|공공|할인|제휴/;
const SPLIT = /[.!?\n·,/]|\s{2,}/;

/** 문장 단위로 키워드를 찾고, 부정·바깥 시설 표현이 붙은 것은 뺀다. 맞은 문장(최대 80자) 목록. */
export function hitsIn(text, re) {
  const out = [];
  for (const s of String(text ?? "").split(SPLIT)) {
    const g = new RegExp(re.source, "g");
    let m;
    while ((m = g.exec(s))) {
      const win = s.slice(Math.max(0, m.index - 12), m.index + m[0].length + 12);
      if (NEG.test(win)) continue;
      out.push(s.trim().slice(0, 80));
      break;
    }
  }
  return out;
}

const ownTexts = (c, det) => {
  const t = (c.amenities ?? []).map((a) => ["부대시설", a]);
  if (c.line) t.push(["소개", c.line]);
  if (det?.intro) t.push(["소개", det.intro]);
  if (typeof det?.gcd?.intro === "string") t.push(["소개", det.gcd.intro]);
  for (const k of ["EXPERIENCE", "INTRO"]) { const v = det?.profile?.fields?.[k]?.value; if (typeof v === "string") t.push(["소개", v]); }
  return t;
};
const reviewTitles = (det) => {
  const out = [];
  for (const k of ["reviews", "web", "sns_images", "videos"]) for (const r of det?.[k] ?? []) if (r && typeof r.title === "string") out.push(r.title);
  return [...new Set(out)];
};
const coreName = (name) => String(name ?? "").replace(/\s|캠핑장|오토|글램핑|야영장|카라반/g, "").slice(0, 4);

/** 캠핑장 요약 행(c) + 상세(det) → { 분류id: 근거 문자열 } */
export function classifyUnique(c, det) {
  const own = ownTexts(c, det);
  const core = coreName(c.name);
  const titles = core ? reviewTitles(det).filter((t) => t.replace(/\s/g, "").includes(core)) : [];
  const res = {};
  for (const cat of UNIQUE_CATS) {
    const h = own.flatMap(([src, t]) => hitsIn(t, cat.re).map((x) => `${src}: ${x}`));
    if (h.length) { res[cat.id] = h[0]; continue; }
    if (cat.ownOnly) continue;
    const rh = [...new Set(titles.filter((t) => hitsIn(t, cat.re).length))];
    if (rh.length >= 2) res[cat.id] = `후기 ${rh.length}건: ${rh[0].slice(0, 70)}`;
  }
  return res;
}

// t47u-2(2026-11-04, 소유자 피드백): 후기 문장을 그대로 오려 붙이지 않는다.
// 업장 글·후기 제목/본문·부대시설을 캠핑장마다 모두 훑어 ‘진짜 특색 시설·체험’을 뽑고, 같은 시설은 하나로 합쳐
// 짧은 이름(수식어: 개별·온수·실내·대형…) + 세부(수온·운영시간·요금·무료·대상·계절)로 정리한다.
// 세부 값은 같은 시설 낱말 앞뒤 40자 안에서만, 상식 범위(수온 25~45℃, 요금 3천~20만원, 시간 0~24시)만 쓴다.
// 화면 방식: 세부가 있거나 특색이 2개 이상이면 목록(m:"list"), 하나뿐이고 세부가 없으면 다시 쓴 짧은 문장(m:"text").
const FEAT = [
  { k: "hotspring", n: "노천탕", re: /노천 ?탕|노천 ?욕조|노천 ?온천|히노끼 ?(?:탕|욕조)|야외 ?욕조|온천탕|족욕/, mods: ["개별", "히노끼"] },
  { k: "spa", n: "스파", re: /자쿠지|월풀|온천수|사우나|찜질방|(?<![가-힣])스파(?!게티|클)/, names: [[/자쿠지|월풀/, "자쿠지"], [/온천수/, "온천수"], [/사우나/, "사우나"], [/찜질방/, "찜질방"]], mods: ["개별"] },
  { k: "warmpool", n: "온수풀", re: /온수 ?풀|온수 ?수영장|미온수|사계절 ?(?:수영장|풀)|4계절 ?(?:수영장|풀)|실내 ?수영장/, mods: ["개별", "실내", "사계절"] },
  { k: "pool", n: "수영장", re: /수영장|풀장|인피니티 ?풀|개별 ?풀|전용 ?풀/, mods: ["개별", "대형", "인피니티"], extra: [[/워터 ?슬라이드|미끄럼틀/, "워터슬라이드"]] },
  { k: "horse", n: "승마 체험", re: /승마|말타기|포니/ },
  { k: "animal", n: "동물 체험", re: /동물 ?농장|동물 ?체험|먹이 ?주기|양떼|알파카|미니 ?동물원|토끼 ?먹이|염소 ?먹이/, names: [[/미니 ?동물원/, "미니동물원"], [/알파카/, "알파카 체험"], [/양떼/, "양떼 체험"], [/먹이 ?주기|토끼 ?먹이|염소 ?먹이/, "동물 먹이주기"]] },
  { k: "kidscafe", n: "키즈카페", re: /키즈 ?카페/, mods: ["대형", "실내"] },
  { k: "indoorplay", n: "실내 놀이터", re: /키즈 ?룸|실내 ?놀이터|실내 ?놀이방|플레이 ?룸|볼풀|(?<!노 ?)키즈 ?존/, names: [[/키즈 ?룸/, "키즈룸"], [/볼풀/, "볼풀장"], [/플레이 ?룸/, "플레이룸"]] },
  { k: "treehouse", n: "트리하우스", re: /트리 ?하우스/ },
  { k: "stay", n: "이색 숙소", re: /이글루|버블 ?텐트|호빗|(?<![가-힣])티피(?![가-힣])|인디언 ?텐트|기차 ?(?:캠핑|객실|펜션|숙소)|열차 ?(?:캠핑|객실)|캡슐 ?(?:하우스|호텔)|우주선|선박 ?(?:캠핑|객실)|버스 ?캠핑|돔 ?하우스|지오데식/, names: [[/이글루/, "이글루 숙소"], [/버블 ?텐트/, "버블텐트"], [/호빗/, "호빗하우스"], [/티피|인디언 ?텐트/, "인디언 티피"], [/기차|열차/, "기차 객실"], [/캡슐/, "캡슐하우스"], [/우주선/, "우주선 숙소"], [/선박/, "선박 객실"], [/버스/, "버스 캠핑"], [/돔 ?하우스|지오데식/, "돔하우스"]] },
  { k: "leisure", n: "레포츠", re: /짚 ?라인|집 ?라인|서바이벌|ATV|사륜 ?바이크|카트(?:장| ?체험)|카약|카누|패들 ?보드|SUP|레일 ?바이크|패러 ?글라이딩|눈 ?썰매|썰매장|수상 ?스키|웨이크|암벽/, names: [[/짚 ?라인|집 ?라인/, "짚라인"], [/서바이벌/, "서바이벌"], [/ATV|사륜 ?바이크/, "ATV"], [/카트/, "카트"], [/카약|카누/, "카약·카누"], [/패들 ?보드|SUP/, "패들보드"], [/레일 ?바이크/, "레일바이크"], [/패러/, "패러글라이딩"], [/썰매/, "눈썰매장"], [/수상 ?스키|웨이크/, "수상레저"], [/암벽/, "암벽등반"]] },
  { k: "farm", n: "체험 프로그램", re: /(?:딸기|블루베리|감자|고구마|옥수수|사과|밤) ?(?:따기|캐기|줍기|수확)|체험 ?농장|농촌 ?체험|목공 ?체험|도예 ?체험|천연 ?염색|만들기 ?체험|천체 ?관측|별 ?관측 ?(?:체험|프로그램)|천체 ?망원경/, names: [[/(딸기|블루베리|감자|고구마|옥수수|사과|밤) ?(따기|캐기|줍기|수확)/, (m) => `${m[1]} ${m[2]} 체험`], [/목공/, "목공 체험"], [/도예/, "도예 체험"], [/염색/, "천연염색 체험"], [/피자 ?만들기/, "피자 만들기"], [/만들기/, "만들기 체험"], [/천체|별 ?관측/, "별 관측"], [/체험 ?농장|농촌/, "농촌 체험"]] },
  { k: "valley", n: "계곡 바로 옆", ownOnly: true, re: /계곡 ?(?:바로|앞|옆|과 ?접|을 ?끼|이 ?흐르|물이 ?흐르)|계곡형|계곡 ?뷰/ },
];
// 흔한 시설은 빼되, 캠핑장에서 드문 ‘개별 화장실·샤워실’은 특색으로 본다.
const EXTRA = [{ k: "privbath", n: "개별 화장실·샤워실", ic: "toilet", re: /개별 ?(?:화장실|샤워실|욕실)|전용 ?(?:화장실|욕실)|단독 ?화장실/ }];
const PRIV = /개별|단독|전용|프라이빗|사이트마다|사이트별/;
const near = (t, i, len, r = 40) => t.slice(Math.max(0, i - r), i + len + r);
function detailsOf(win, k) {
  const d = {};
  if (["hotspring", "spa", "warmpool", "pool"].includes(k)) { const m = /(\d{2}(?:\.\d)?)\s*(?:도|℃|°)/.exec(win); if (m && +m[1] >= 25 && +m[1] <= 45) d.temp = `${+m[1]}℃`; }
  const h = /(\d{1,2})(?::(\d{2}))?\s*시?\s*[~\-–]\s*(\d{1,2})(?::(\d{2}))?\s*시/.exec(win);
  if (h && ["hotspring", "spa", "warmpool", "pool", "kidscafe", "indoorplay"].includes(k) && !/매너|입실|퇴실|체크|조용|소등|정숙/.test(win) && +h[1] >= 5 && +h[1] <= 24 && +h[3] <= 24 && +h[3] > +h[1]) d.hour = `${+h[1]}~${+h[3]}시`;
  if (["horse", "animal", "farm", "leisure", "kidscafe", "spa"].includes(k)) {
    const pm = /(\d{1,2}(?:,\d{3})+|\d{1,3}(?:\.\d)?\s*만)\s*원/.exec(win);
    if (pm) { const v = /만/.test(pm[1]) ? parseFloat(pm[1]) * 10000 : +pm[1].replace(/,/g, ""); if (v >= 3000 && v <= 200000) d.price = `${v.toLocaleString("ko-KR")}원`; }
  }
  if (/무료|무제한/.test(win) && !/유료/.test(win)) d.free = "무료";
  if (/유료/.test(win)) d.paid = "유료";
  if (k === "pool" || k === "valley") { if (/여름|하절기|7\s*~\s*8월/.test(win)) d.season = "여름 운영"; }
  if (/(?:어린이|아이|초등|키즈)\s*(?:전용|대상|만)/.test(win)) d.who = "어린이 대상";
  return d;
}

// t49u: 태그 오른쪽 설명 — 그 캠핑장 글·후기에서 시설 바로 곁(±25자)에 나온 특징을 표로 뽑아 투표한다.
const ANIMALS = [["토끼", /토끼/], ["염소", /염소/], ["양", /양 ?떼|(?<![가-힣])양(?:들|이랑|에게|한테|과|와)/], ["알파카", /알파카/], ["오리", /(?<![가-힣])오리(?!지|엔|온|털)/], ["거위", /거위/], ["미니피그", /미니 ?피그/], ["사슴", /사슴/], ["당나귀", /당나귀/], ["공작", /공작(?:새)?(?![가-힣]*(?:소|실|체험))/], ["조랑말", /조랑말/], ["앵무새", /앵무/], ["닭", /(?<![가-힣])닭(?!갈비|강정|볶음|백숙)/]];
const QUAL = [
  [/(산|숲|계곡|바다|호수|강|노을|별|논밭|들판)\s*(?:뷰|전망|이 ?보이|이 ?한눈|을 ?바라|를 ?바라|풍경|을 ?보며|를 ?보며)/, (m) => `${m[1]} 전망`, ["hotspring", "spa", "warmpool", "pool", "treehouse", "stay"]],
  [/사이트(?:마다|별)|객실(?:마다|별)|동(?:마다|별)|프라이빗|단독 ?(?:사용|이용)/, "사이트별 전용", ["hotspring", "spa", "warmpool", "pool"]],
  [/히노끼|편백/, "편백 욕조", ["hotspring", "spa"]],
  [/족욕/, "족욕 가능", ["hotspring"]],
  [/천연 ?온천|온천수/, "천연 온천수", ["hotspring", "spa", "warmpool"]],
  [/건식|습식/, "건·습식 사우나", ["spa"]],
  [/(?<![가-힣])실내/, "실내", ["pool", "kidscafe", "indoorplay", "spa", "leisure"]],
  [/야외|루프 ?탑|옥상/, "야외", ["warmpool", "spa", "kidscafe"]],
  [/2층|복층|층 ?규모/, "2층 규모", ["kidscafe", "indoorplay", "treehouse"]],
  [/넓|대형|규모가 ?크|큰 ?규모/, "넓은 규모", ["pool", "warmpool", "kidscafe", "indoorplay", "animal", "valley"]],
  [/미온수|온수|따뜻|따듯/, "온수", ["pool"]],
  [/사계절|4계절|연중|겨울에도/, "사계절 이용", ["warmpool", "pool", "kidscafe", "leisure", "hotspring"]],
  [/유아 ?풀|어린이 ?풀|키즈 ?풀|유아용|얕은|수심이 ?얕/, "유아풀 따로", ["pool", "warmpool"]],
  [/깊은|성인 ?풀|수심 ?1\.\d|수심이 ?깊/, "성인풀 따로", ["pool", "warmpool"]],
  [/그늘|파라솔|선베드|썬베드|썬 ?베드/, "그늘막·선베드", ["pool", "warmpool"]],
  [/깨끗|청결|수질|소독/, "깨끗한 수질 관리", ["pool", "warmpool", "hotspring", "spa"]],
  [/트램펄린|방방|에어 ?바운스|트램폴린/, "트램펄린", ["kidscafe", "indoorplay"]],
  [/편백 ?놀이|편백 ?풀|볼 ?풀/, "볼풀·편백놀이", ["kidscafe", "indoorplay"]],
  [/보드 ?게임|책|도서/, "책·보드게임", ["kidscafe", "indoorplay"]],
  [/(?:부모|어른|보호자)[^.]{0,8}(?:쉬|휴식|카페|커피)|커피/, "보호자 카페 공간", ["kidscafe"]],
  [/예약제|사전 ?예약|대관/, "예약제", ["hotspring", "spa", "warmpool", "pool", "horse", "farm", "leisure"]],
  [/시간제|(?:1|한) ?시간 ?(?:이용|씩)|타임제/, "시간제 이용", ["hotspring", "spa", "warmpool", "pool", "kidscafe"]],
  [/24 ?시간/, "24시간 이용", ["spa", "privbath", "kidscafe", "indoorplay"]],
  [/트랙|승마장|마장/, "전용 승마 트랙", ["horse"]],
  [/조랑말|포니/, "포니 승마", ["horse"]],
  [/아이|어린이|초등|유아/, "아이도 탈 수 있음", ["horse"]],
  [/아이|어린이|초등|유아/, "아이와 함께 즐기기", ["leisure"]],
  [/교관|강사|코치|안전 ?요원/, "강사 동행", ["horse", "leisure"]],
  [/(?:캠핑장|단지|부지) ?(?:안|내)|도보|걸어서/, "캠핑장 안에서", ["leisure", "horse", "farm", "animal"]],
  [/(봄|여름|가을|겨울) ?(?:철|시즌|에만|한정)/, (m) => `${m[1]} 한정`, ["farm", "leisure"]],
  [/주말/, "주말 운영", ["farm", "animal", "horse", "kidscafe"]],
  [/수확|직접 ?(?:따|캐|만들)/, "직접 수확·제작", ["farm"]],
  [/가져|챙겨|포장/, "결과물 가져가기", ["farm"]],
  [/냉난방|에어컨|난방|보일러/, "냉난방 완비", ["stay", "treehouse"]],
  [/침대|침구|매트리스/, "침구 완비", ["stay", "treehouse"]],
  [/숙박|1박|객실/, "숙박 가능", ["treehouse"]],
  [/얕|수심/, "얕은 물놀이", ["valley"]],
  [/맑|깨끗|1급수/, "맑은 물", ["valley"]],
  [/물소리|계곡 ?소리/, "물소리 들리는 사이트", ["valley"]],
  [/깨끗|청결|새 ?건물|신축/, "깨끗하게 관리", ["privbath"]],
  [/온수|따뜻/, "온수 잘 나옴", ["privbath"]],
];
const GEN = { hotspring: "따뜻한 탕에서 쉬어가기", spa: "캠핑 피로 풀기 좋음", warmpool: "선선한 날에도 물놀이", pool: "캠핑장 안 물놀이", horse: "캠핑장에서 말 타기 체험", animal: "아이와 동물 교감", kidscafe: "날씨 상관없이 놀 수 있음", indoorplay: "비 와도 실내에서 놀기", treehouse: "나무 위 이색 공간", stay: "색다른 숙소에서 하룻밤", leisure: "캠핑장에서 바로 즐기는 액티비티", farm: "가족 체험 프로그램", valley: "사이트 옆 계곡 물놀이", privbath: "공용 대신 사이트별 사용" };
function qualsOf(all, k, name) {
  const v = new Map();
  for (const { w, hit } of all) {
    const ww = near(w, w.indexOf(hit), hit.length, 25), seen = new Set();
    for (const [re, ph, ks] of QUAL) { if (!ks.includes(k)) continue; const m = re.exec(ww); if (!m) continue; const t = typeof ph === "function" ? ph(m) : ph; if (seen.has(t)) continue; seen.add(t); v.set(t, (v.get(t) ?? 0) + 1); }
    if (k === "animal") for (const [a, are] of ANIMALS) if (are.test(ww) && !seen.has(a)) { seen.add(a); v.set(`@${a}`, (v.get(`@${a}`) ?? 0) + 1); }
  }
  const out = [], an = [...v].filter(([t]) => t[0] === "@").sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t.slice(1));
  if (an.length) out.push(`${an.join("·")} 만나기`);
  const rest = [...v].filter(([t]) => t[0] !== "@").sort((a, b) => b[1] - a[1]).map(([t]) => t)
    .filter((t) => !(t === "실내" && /실내/.test(name)) && !(t === "사이트별 전용" && /개별/.test(name)) && !(t === "넓은 규모" && /대형/.test(name)) && !(t === "온수" && /온수/.test(name)) && !(t === "사계절 이용" && /사계절/.test(name)) && !(t === "편백 욕조" && /히노끼/.test(name)) && !(t === "포니 승마" && /포니/.test(name)));
  if (rest.includes("실내") && rest.includes("야외")) rest.splice(rest.indexOf("야외"), 1);
  return [...out, ...rest].slice(0, 2);
}
export function uniqueCard(c, det, res) {
  const ids = RARE_FIRST.filter((id) => res[id]);
  if (!ids.length) return null;
  const core = coreName(c.name);
  const own = [c.line, det?.intro, typeof det?.gcd?.intro === "string" ? det.gcd.intro : "", det?.profile?.fields?.EXPERIENCE?.value, det?.profile?.fields?.INTRO?.value, ...(c.amenities ?? [])].filter((x) => typeof x === "string").map(clean);
  const rv = [];
  if (core) for (const k of ["reviews", "web", "sns_images", "videos"]) for (const r of det?.[k] ?? []) {
    const ti = typeof r?.title === "string" ? r.title : "";
    if (!ti.replace(/\s/g, "").includes(core)) continue;
    rv.push(clean(`${ti} ${typeof r.snippet === "string" ? r.snippet : ""}`));
  }
  for (const f of Object.values(det?.profile?.fields ?? {})) { const q = f?.source?.quote; if (typeof q === "string" && q.length > 6) rv.push(clean(q)); }
  for (const t of [det?.facilities, det?.spec?.note].flat()) if (typeof t === "string") own.push(clean(t));
  const rvU = [...new Set(rv)];
  const items = [];
  const scan = (f, texts) => {
    const wins = [];
    for (const t of texts) { const g = new RegExp(f.re.source, "g"); let m; while ((m = g.exec(t))) { const w12 = near(t, m.index, m[0].length, 12); if (NEG.test(w12.replace(f.re, ""))) continue; wins.push({ w: near(t, m.index, m[0].length), hit: m[0] }); } }
    return wins;
  };
  for (const f of [...FEAT.filter((x) => ids.includes(x.k)), ...EXTRA]) {
    const ow = scan(f, own), rw = f.ownOnly ? [] : scan(f, rvU);
    const nRv = new Set(rw.map((x) => x.w)).size;
    if (!ow.length && !(f.k in res) && nRv < 2) continue; // EXTRA: 업장 글 또는 후기 2건 이상
    if (!ow.length && !rw.length) continue;
    const all = [...ow, ...rw];
    // 이름: 구체 이름(자쿠지·짚라인…) 중 가장 많이 나온 것, 없으면 기본 이름 + 수식어
    let name = f.n;
    if (f.names) { const cnt = new Map(); for (const { w } of all) for (const [re, nm] of f.names) { const m = re.exec(w); if (m) { const v = typeof nm === "function" ? nm(m) : nm; cnt.set(v, (cnt.get(v) ?? 0) + 1); break; } } let best = [...cnt].sort((a, b) => b[1] - a[1]).map((x) => x[0]); best = best.filter((v) => !best.some((o) => o !== v && o.length > v.length && o.endsWith(v.replace(/ 체험$/, "")))).filter((v, i, a) => !(/^(만들기 체험|동물 체험|농촌 체험)$/.test(v) && a.length > 1)); if (best.length) name = best.slice(0, 2).join("·"); }
    const priv = all.filter(({ w, hit }) => PRIV.test(near(w, w.indexOf(hit), hit.length, 6))).length;
    if (f.mods?.includes("개별") && priv >= Math.max(1, all.length * 0.3) && !/개별/.test(name)) name = `개별 ${name}`;
    if (f.mods?.includes("실내") && all.filter(({ w }) => /실내/.test(w)).length >= 2 && !/실내/.test(name)) name = `실내 ${name}`;
    if (f.mods?.includes("대형") && all.some(({ w }) => /대형/.test(w)) && !/개별/.test(name)) name = `대형 ${name}`;
    if (f.mods?.includes("인피니티") && all.some(({ hit }) => /인피니티/.test(hit))) name = "인피니티풀";
    // 세부: 값별 최다
    const vote = {};
    for (const { w } of all) for (const [dk, dv] of Object.entries(detailsOf(w, f.k))) (vote[dk] ??= new Map()).set(dv, ((vote[dk].get(dv)) ?? 0) + 1);
    const pick = (dk) => [...(vote[dk] ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
    const dParts = [pick("temp"), pick("hour"), pick("price"), pick("paid") && !pick("free") ? "" : pick("free"), pick("season"), pick("who")].filter(Boolean);
    const extra = (f.extra ?? []).filter(([re]) => all.some(({ w }) => re.test(w))).map((x) => x[1]);
    const q = qualsOf(all, f.k, name).filter((x) => !extra.includes(x) && !(x === "온수" && dParts.some((p) => /℃/.test(p))));
    let parts = [...extra, ...q, ...dParts].filter((x, i, a) => a.indexOf(x) === i).slice(0, 3);
    const spec = parts.length > 0;
    if (!spec) parts = [/개별/.test(name) ? "다른 손님과 섞이지 않는 프라이빗 이용" : (GEN[f.k] ?? "캠핑장 안에서 이용")];
    items.push({ k: f.k, n: name, d: parts.join(" · "), ...(spec ? {} : { g: 1 }), w: ow.length * 3 + nRv, ...(f.ic ? { ic: f.ic } : {}) });
  }
  if (!items.length) return null;
  // 수영장은 온수풀이 있으면 합친다(같은 시설 중복 방지)
  const wp = items.find((x) => x.k === "warmpool"), pl = items.find((x) => x.k === "pool");
  if (wp && pl) items.splice(items.indexOf(pl), 1);
  const kc = items.find((x) => x.k === "kidscafe"), ip = items.find((x) => x.k === "indoorplay");
  if (kc && ip) items.splice(items.indexOf(ip), 1);
  for (const x of items) if (["kidscafe", "indoorplay", "farm"].includes(x.k)) x.d = x.d.replace(/ · 어린이 대상|^어린이 대상( · )?/, "");
  items.sort((a, b) => RARE_FIRST.indexOf(a.k) - RARE_FIRST.indexOf(b.k) || b.w - a.w);
  const nOwn = own.length ? 1 : 0;
  const s = [own.some((t) => FEAT.some((f) => ids.includes(f.k) && f.re.test(t))) ? "업장 소개" : "", rvU.length ? `후기 ${rvU.length}건` : ""].filter(Boolean).join(" · ");
  const real = items.filter((x) => x.k !== "privbath");
  const listMode = true; // t49u: 모든 카드를 태그+설명 목록으로
  let t = "";
  if (!listMode) {
    const x = items[0];
    const jn = (w, a, b) => { const ch = w.charCodeAt(w.length - 1); return w + ((ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28) ? a : b); };
    const SENT_T = { valley: "계곡이 사이트 바로 옆을 흘러 물놀이하기 좋아요", treehouse: "나무 위 트리하우스에서 묵어볼 수 있어요", horse: "캠핑장 안에서 승마를 체험할 수 있어요", kidscafe: `${jn(x.n, "이", "가")} 있어 아이와 날씨 걱정 없이 놀 수 있어요`, indoorplay: `${jn(x.n, "이", "가")} 있어 아이들이 실내에서도 놀 수 있어요`, farm: `${jn(x.n, "을", "를")} 캠핑과 함께 즐길 수 있어요`, leisure: `${jn(x.n, "을", "를")} 캠핑장에서 바로 즐길 수 있어요`, stay: `${x.n}처럼 색다른 숙소에서 하룻밤을 보낼 수 있어요`, animal: `${jn(x.n, "으로", "로")} 아이와 동물을 가까이 만날 수 있어요`, pool: `${jn(x.n, "이", "가")} 있어 물놀이 캠핑하기 좋아요`, warmpool: `${jn(x.n, "이", "가")} 있어 선선한 날에도 물놀이할 수 있어요`, hotspring: `${x.n}에서 몸을 녹이며 쉴 수 있어요`, spa: `${x.n}에서 캠핑 피로를 풀 수 있어요` };
    t = SENT_T[x.k] ?? `${jn(x.n, "이", "가")} 있어요`;
  }
  let ph = null;
  const allRe = new RegExp(FEAT.filter((x) => ids.includes(x.k)).map((x) => x.re.source).join("|"));
  if (core) for (const k of ["sns_images", "reviews"]) {
    for (const r of det?.[k] ?? []) {
      const th = r?.thumb, title = typeof r?.title === "string" ? r.title : "";
      if (!th || !/^https:\/\//.test(th) || !title.replace(/\s/g, "").includes(core) || !hitsIn(title, allRe).length) continue;
      ph = { th, u: typeof r.url === "string" ? r.url : "" }; break;
    }
    if (ph) break;
  }
  return { c: (real[0] ?? items[0]).k, m: listMode ? "list" : "text", it: items.slice(0, 4).map(({ w, ...x }) => x), ...(t ? { t } : {}), s, ...(ph ? { p: ph } : {}) };
}
const RARE_FIRST = ["hotspring", "spa", "warmpool", "horse", "animal", "treehouse", "stay", "leisure", "kidscafe", "indoorplay", "farm", "valley", "pool", "privbath"];
const clean = (s) => String(s ?? "").replace(/[\u200b\u00a0]/g, " ").replace(/\s+/g, " ").trim();
