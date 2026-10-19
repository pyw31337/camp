// 실시간 인기 수집원. 공식 무료 검색 API만 쓴다. 각 수집원은 같은 모양({key,label,via,needs,enabled,collect})이라
// 나중에 공식 API 키가 생기면(유튜브 Data API, Meta Graph API 등) 이 목록에 하나를 더하면 된다. docs/TRENDING.md
import { kakaoSearch, stripHtml } from "./social-search.mjs";
import { naverGet, NAVER_HUB_BASE } from "./naver-discovery.mjs";

const day = (v) => { const t = Date.parse(v ?? ""); return Number.isFinite(t) ? new Date(t + 9 * 3600e3).toISOString().slice(0, 10) : null; };
const ymd = (s) => (/^\d{8}$/.test(String(s ?? "")) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
const http = (v) => { const s = String(v ?? "").trim(); return /^https?:\/\//i.test(s) ? s.replace(/^http:\/\//i, "https://") : null; };
const clip = (s, n) => { const a = Array.from(String(s ?? "")); return a.length > n ? `${a.slice(0, n - 1).join("")}…` : a.join(""); };

/** 작업 목록을 n개씩 동시에 돌린다(순서 무관). */
async function pool(tasks, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, tasks.length)) }, async () => { while (i < tasks.length) await fn(tasks[i++]); }));
}

/** 검색어: 일반 캠핑 낱말 + 시도별 변형. 일반어만으로는 최신 글 상위가 몇 시간치뿐이라 지역으로 나눠 넓힌다. */
export const SIDO = ["서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "대구", "부산", "울산", "제주"];
export const BASE_QUERIES = ["캠핑장", "캠핑", "오토캠핑", "글램핑", "카라반", "차박", "캠핑장 후기", "캠핑 후기", "노지캠핑", "캠핑장 추천"];
export function queryPlan() {
  return [...BASE_QUERIES, ...SIDO.map((s) => `${s} 캠핑장`), ...SIDO.map((s) => `${s} 글램핑`)];
}

/** 카카오(Daum) 검색: blog·cafe·vclip, sort=recency. 한 검색어당 기간(since)보다 오래된 글이 나오면 다음 쪽을 그만 부른다. */
export function kakaoSource({ key, caps = { blog: 3000, cafe: 3000, vclip: 800 }, maxPages = { blog: 30, cafe: 30, vclip: 15 }, concurrency = 4, deadline = Infinity, fetchImpl, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const PAGE = { blog: { size: 50, max: Math.min(50, maxPages.blog ?? 30) }, cafe: { size: 50, max: Math.min(50, maxPages.cafe ?? 30) }, vclip: { size: 30, max: Math.min(15, maxPages.vclip ?? 15) } };
  return {
    key: "kakao", label: "Daum 검색(블로그·카페·동영상)", via: "daum", needs: ["KAKAO_REST_API_KEY"], enabled: Boolean(key),
    calls: { blog: 0, cafe: 0, vclip: 0 }, stopped: null,
    async collect(queries, since, log = () => {}) {
      const out = [];
      const tasks = ["blog", "cafe", "vclip"].flatMap((type) => queries.map((q) => [type, q]));
      await pool(tasks, concurrency, async ([type, q]) => {
        for (let page = 1; page <= PAGE[type].max; page++) {
          if (this.stopped || this.calls[type] >= caps[type]) return;
          if (Date.now() > deadline) { this.stopped = "deadline"; log("카카오: 시간 상한 — 모은 글로 마무리"); return; }
          this.calls[type]++;
          let docs;
          try { docs = await kakaoSearch(type, q, { sort: "recency", size: PAGE[type].size, page }, { key, fetchImpl }); }
          catch (e) { log(`카카오 ${type} "${q}" p${page}: ${e.message.slice(0, 120)}`); if (e.code === "RATE_LIMIT" || e.code === "AUTH") this.stopped = e.code; return; }
          let older = 0;
          for (const d of docs) {
            const date = day(d.datetime);
            if (date && date < since) { older++; continue; }
            const url = http(d.url);
            if (!url) continue;
            out.push({
              via: "daum", kind: type, url, date,
              title: clip(stripHtml(d.title), 120), snippet: clip(stripHtml(d.contents ?? ""), 220),
              src: stripHtml(type === "cafe" ? d.cafename : type === "blog" ? d.blogname : d.author) || null,
              thumb: http(d.thumbnail),
            });
          }
          if (docs.length < PAGE[type].size || older > docs.length / 2) return;
          await sleep(40);
        }
      });
      return out;
    },
  };
}

/** 네이버 검색(API HUB): blog·cafearticle·news, sort=date, display 100, start 1~901. */
export function naverSource({ id, secret, maxCalls = 1500, pages = 10, concurrency = 3, deadline = Infinity, fetchImpl, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const TYPES = { blog: { date: (it) => ymd(it.postdate), src: (it) => it.bloggername }, cafearticle: { date: () => null, src: (it) => it.cafename }, news: { date: (it) => day(it.pubDate), src: () => null } };
  const paths = (t) => [`/search/v1/${t}`, `/search/v1/${t}.json`, `/v1/search/${t}.json`];
  return {
    key: "naver", label: "네이버 검색(블로그·카페·뉴스)", via: "naver", needs: ["NAVER_API_HUB_CLIENT_ID", "NAVER_API_HUB_CLIENT_SECRET"], enabled: Boolean(id && secret),
    calls: 0, billing: false,
    async collect(queries, since, log = () => {}) {
      const out = [];
      const get = async (path, q, start) => {
        this.calls++;
        const u = `${NAVER_HUB_BASE}${path}?${new URLSearchParams({ query: q, display: "100", start: String(start), sort: "date" })}`;
        return naverGet(u, { id, secret, fetchImpl });
      };
      for (const type of Object.keys(TYPES)) {
        let path = null;
        for (const p of paths(type)) {
          if (this.calls >= maxCalls) return out;
          try { await get(p, queries[0], 1); path = p; break; }
          catch (e) { if (e.code === "BILLING") { this.billing = true; log(`네이버 결제 응답 — 즉시 중단: ${e.message.slice(0, 120)}`); return out; } }
        }
        log(`네이버 ${type} 경로: ${path ?? "없음(이 Application에 없는 API)"}`);
        if (!path) continue;
        let stop = false;
        await pool(queries, concurrency, async (q) => {
          for (let i = 0; i < pages; i++) {
            if (stop || this.billing || this.calls >= maxCalls) return;
            if (Date.now() > deadline) { stop = true; log("네이버: 시간 상한 — 모은 글로 마무리"); return; }
            let items;
            try { items = await get(path, q, 1 + i * 100); }
            catch (e) { log(`네이버 ${type} "${q}": ${e.message.slice(0, 120)}`); if (e.code === "BILLING") this.billing = true; if (e.code === "RATE_LIMIT" || e.code === "AUTH") stop = true; return; }
            let older = 0;
            for (const it of items) {
              const date = TYPES[type].date(it);
              if (date && date < since) { older++; continue; }
              const url = http(type === "news" ? it.originallink || it.link : it.link);
              if (!url) continue;
              out.push({ via: "naver", kind: type, url, date, title: clip(stripHtml(it.title), 120), snippet: clip(stripHtml(it.description), 220), src: stripHtml(TYPES[type].src(it) ?? "") || null, thumb: null });
            }
            if (items.length < 100 || older > items.length / 2) return;
            await sleep(60);
          }
        });
        if (this.billing || stop || this.calls >= maxCalls) return out;
      }
      return out;
    },
  };
}

/**
 * 공식 무료 검색 경로가 없거나 키가 없어 지금은 쓰지 않는 플랫폼. 화면·문서에 그대로 보인다.
 * needs: 소유자가 마련해야 할 것(키 이름·계정·심사).
 */
export const EXCLUDED = [
  { key: "youtube", label: "YouTube Data API", needs: "Google Cloud 프로젝트의 YouTube Data API v3 키(YOUTUBE_API_KEY). search.list 1회 100단위·일 10,000단위 무료 → 하루 최대 약 90회(검색어 30개 × 3쪽). 지금은 Daum 동영상 검색에 잡히는 YouTube 영상만 셉니다.", status: "키 없음" },
  { key: "instagram", label: "Instagram", needs: "Meta 개발자 앱 + Instagram 비즈니스(또는 크리에이터) 계정 연결 + ‘Instagram Public Content Access’ 앱 심사. 승인 후 Hashtag Search API(계정당 7일에 해시태그 30개)만 쓸 수 있습니다. 로그인 세션·스크래핑은 약관 위반이라 쓰지 않습니다.", status: "공식 무료 검색 없음" },
  { key: "facebook", label: "Facebook", needs: "공개 게시물 검색 API가 없습니다(Graph API 검색은 2018년 종료). Meta Content Library는 연구 기관 승인용이라 서비스에 못 씁니다.", status: "공식 검색 없음" },
  { key: "tiktok", label: "TikTok", needs: "Research API는 비영리 연구자 승인용이라 서비스에 못 씁니다. 상업용 공식 검색 API가 없습니다(oEmbed는 주소를 알 때 삽입만 가능). Daum 동영상 검색에 잡히는 TikTok 영상은 셉니다.", status: "공식 무료 검색 없음" },
];
