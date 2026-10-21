// 벤치마크(t39 #39): 후기에서 ‘추천 사이트 번호’ 모으기 — 상세 화면에서만 계산(데이터는 바꾸지 않음).
// 후기·카페·웹 글(제목·요약·허용 본문 문장)에서 “30번 사이트 명당”, “1번과 2번데크가 명당”, “A-12 뷰 최고”처럼
// 사이트 번호 + 좋은 점이 같은 문장에 나온 것만 센다. ‘29번째 캠핑’ 같은 순서 말, ‘비추·별로·시끄’ 문장은 뺀다.
// 보여 줄 조건: 서로 다른 글 2개 이상, 또는 ‘명당’·‘사이트 추천’이라고 쓴 글 1개 이상(‘캠핑장 추천’은 사이트 추천이 아님). 많이 언급된 순 3곳.

const SITE_WORD = "(?:사이트|데크|자리|구역|번지)";
// 번호: 영문/한글 한 글자 구역 + 숫자(A12, A-12, B동 3) 또는 숫자만. ‘번째’는 제외.
const NUM = "((?:[A-Za-z]|[가-힣](?=-?\\d))?-?\\d{1,3})";
// “30번 사이트”, “데크 8번”, “A-12 사이트”(번 없이 바로 사이트 말), “1번과 2번데크”(앞 번호도 같은 말에 묶임)
const RE_SITE = new RegExp(`(?:${SITE_WORD}\\s?)?${NUM}\\s?(?:번(?!째)\\s?(${SITE_WORD})?|(${SITE_WORD}))`, "g");
const RE_PREV = new RegExp(`${NUM}\\s?번?\\s?(?:과|와|,|및|·|랑)\\s?$`);
const GOOD = [
  ["명당", /명당/], ["추천", /(?:사이트|자리|데크)\s?추천|추천\s?(?:사이트|자리|데크)|강추/], ["뷰", /뷰|전망|경치|내려다/], ["그늘", /그늘|나무/], ["넓음", /넓/],
  ["조용함", /조용|프라이빗|독립/], ["물가", /계곡|강가|강이|강 |바다|호수|물가|냇가/], ["좋음", /좋았|좋아요|좋습니다|좋더|최고|만족/],
];
const BAD = /비추|별로|나쁘|시끄|불편|최악|좁았|좁아|아쉬/;

const sentences = (t) => String(t ?? "").replace(/<[^>]+>/g, " ").split(/(?<=[.!?。…])\s+|\n+|\s{2,}|#/).map((s) => s.trim()).filter(Boolean);
const textOf = (x) => [x?.title, x?.snippet, ...(Array.isArray(x?.body) ? x.body : [x?.body])].filter(Boolean).join("  ");

/** @returns {{site:string, posts:number, tags:string[], src:{url:string,title:string}[]}[]} */
export function sitePicks(d, max = 3) {
  const by = new Map();
  const posts = [...(d?.reviews ?? []), ...(d?.cafe ?? []), ...(d?.web ?? [])].filter((x) => x?.url);
  const seenPost = new Set();
  for (const x of posts) {
    if (seenPost.has(x.url)) continue;
    seenPost.add(x.url);
    const hits = new Map();
    for (const s of sentences(textOf(x))) {
      if (BAD.test(s)) continue;
      const tags = GOOD.filter(([, re]) => re.test(s)).map(([k]) => k);
      if (!tags.length) continue;
      RE_SITE.lastIndex = 0;
      for (const m of s.matchAll(RE_SITE)) {
        const before = s.slice(Math.max(0, m.index - 8), m.index);
        const hasWord = Boolean(m[2] || m[3]) || new RegExp(`${SITE_WORD}\\s?$`).test(before) || /^(?:사이트|데크|자리|구역)/.test(m[0]);
        if (!hasWord) continue;
        const nums = [m[1]];
        // “1번과 2번데크”: 바로 앞에 이어진 번호들도 같은 사이트 말로 본다.
        let head = s.slice(0, m.index);
        for (let k = 0, p; k < 4 && (p = head.match(RE_PREV)); k++) { nums.unshift(p[1]); head = head.slice(0, p.index); }
        for (const raw of nums) {
          const n = Number(String(raw).replace(/\D/g, ""));
          if (!n || n > 400) continue;
          const site = String(raw).replace(/-/g, "").toUpperCase();
          const h = hits.get(site) ?? new Set();
          tags.forEach((t) => h.add(t));
          hits.set(site, h);
        }
      }
    }
    for (const [site, tags] of hits) {
      const r = by.get(site) ?? { site, posts: 0, strong: 0, tags: new Map(), src: [] };
      r.posts++;
      if (tags.has("명당") || tags.has("추천")) r.strong++;
      tags.forEach((t) => r.tags.set(t, (r.tags.get(t) ?? 0) + 1));
      if (r.src.length < 3) r.src.push({ url: x.url, title: String(x.title ?? "").replace(/<[^>]+>/g, "").slice(0, 60) });
      by.set(site, r);
    }
  }
  return [...by.values()]
    .filter((r) => r.posts >= 2 || r.strong >= 1)
    .sort((a, b) => b.strong - a.strong || b.posts - a.posts || a.site.localeCompare(b.site, "ko", { numeric: true }))
    .slice(0, max)
    .map((r) => ({ site: r.site, posts: r.posts, tags: [...r.tags].sort((a, b) => b[1] - a[1]).map(([t]) => t).filter((t) => t !== "좋음" || r.tags.size === 1).slice(0, 3), src: r.src }));
}
