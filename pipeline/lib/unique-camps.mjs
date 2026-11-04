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

// t47u(2026-11-04): 이색 캠핑장 테마 카드 ‘왜 특별한지’ 블록용 근거. 분류(classifyUnique)는 그대로 두고 화면용 문장·사진만 고른다.
// 문장은 자르지 않는다(…로 끊지 않음) — 온전한 한 문장만 쓰고, 너무 길면(160자 초과) 다음 후보로 넘어간다.
// 우선순위: ① 업장 소개 문장 ② 이름이 맞는 방문 후기 본문 문장 ③ 후기 제목 ④ 업장 부대시설 목록에서 만든 문장.
// 사진: 이름이 맞고 같은 시설 낱말이 제목에 있는 후기·SNS 사진 1장(원문 링크와 함께).
const RARE_FIRST = ["hotspring", "spa", "warmpool", "horse", "animal", "treehouse", "stay", "leisure", "kidscafe", "indoorplay", "farm", "valley", "pool"];
const SENT = /(?<=[.!?。])\s+|\n+|\s{2,}|(?<=다)\s+(?=[가-힣A-Z])/;
const clean = (s) => String(s ?? "").replace(/[\u200b\u00a0]/g, " ").replace(/\s+/g, " ").trim();
const okSentence = (s, re) => {
  if (s.length < 12 || s.length > 160 || /…|\.{2,}|[ㄱ-ㅎ]{2,}/.test(s)) return false;
  return hitsIn(s.replace(SPLIT, " "), re).length > 0 && hitsIn(s, re).length > 0;
};
export function uniqueCard(c, det, res) {
  const ids = RARE_FIRST.filter((id) => res[id]);
  if (!ids.length) return null;
  const cats = Object.fromEntries(UNIQUE_CATS.map((x) => [x.id, x]));
  const core = coreName(c.name);
  const intros = [c.line, det?.intro, typeof det?.gcd?.intro === "string" ? det.gcd.intro : "", det?.profile?.fields?.EXPERIENCE?.value, det?.profile?.fields?.INTRO?.value].filter((x) => typeof x === "string").map(clean);
  const revs = core ? (det?.reviews ?? []).filter((r) => typeof r?.title === "string" && r.title.replace(/\s/g, "").includes(core)) : [];
  let t = "", src = "", cat = "";
  for (const id of ids) {
    const re = cats[id].re;
    for (const txt of intros) { const s = txt.split(SENT).map(clean).find((x) => okSentence(x, re)); if (s) { t = s; src = "업장 소개"; break; } }
    if (t) { cat = id; break; }
  }
  if (!t) for (const id of ids) {
    if (id === "valley") continue;
    const re = cats[id].re;
    for (const r of revs) {
      const parts = clean(r.snippet).split(SENT).map(clean);
      if (/…$/.test(clean(r.snippet))) parts.pop(); // 잘린 끝 문장은 쓰지 않는다
      const okR = (x) => okSentence(x, re) && x.length <= 110 && /(?:다|요|죠|네|음|[.!])$/.test(x) && !/\p{Extended_Pictographic}|\d{1,2}:\d{2}|[|｜#]/u.test(x);
      const s = parts.slice(1).find(okR) ?? (/^[가-힣A-Za-z0-9]/.test(parts[0] ?? "") && okR(parts[0]) ? parts[0] : "");
      if (s) { t = s; src = "방문 후기"; break; }
    }
    if (t) { cat = id; break; }
  }
  if (!t) for (const id of ids) {
    const m = /^후기 (\d+)건: (.+)$/.exec(res[id]);
    if (m && !/…|\.\.\.\.?$/.test(m[2]) && m[2].length < 70) { t = clean(m[2]); src = `후기 제목 ${m[1]}건`; cat = id; break; }
  }
  if (!t) {
    const fac = [...new Set(ids.map((id) => /^부대시설: (.+)$/.exec(res[id])?.[1]).filter(Boolean))];
    if (fac.length) { t = fac.join("·"); src = "업장 부대시설"; cat = ids.find((id) => /^부대시설/.test(res[id])); }
  }
  let ph = null;
  const allRe = new RegExp(ids.map((id) => cats[id].re.source).join("|"));
  if (core) for (const k of ["sns_images", "reviews"]) {
    for (const r of det?.[k] ?? []) {
      const th = r?.thumb, title = typeof r?.title === "string" ? r.title : "";
      if (!th || !/^https:\/\//.test(th) || !title.replace(/\s/g, "").includes(core) || !hitsIn(title, allRe).length) continue;
      ph = { th, u: typeof r.url === "string" ? r.url : "", s: clean(r.src ?? "") };
      break;
    }
    if (ph) break;
  }
  return { c: cat || ids[0], t, s: src, ...(ph ? { p: ph } : {}) };
}
