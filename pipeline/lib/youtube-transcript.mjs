/**
 * YouTube 영상 설명(shortDescription) 및 자막(captionTracks) 수집·사실 추출 모듈.
 * - youtube.com/robots.txt 는 /results 를 막지만 /watch 는 허용한다.
 * - 추출한 사실은 원문 URL(https://www.youtube.com/watch?v=ID), 근거 문장(evidence), 확인 시각(checked_at), MENTION 등급으로만 저장한다.
 */
import { hhmm } from "./fact-store.mjs";

const UA = "Mozilla/5.0 (compatible; MoyeoraCampBot/1.0; +https://github.com/pyw31337/camp; youtube fact check)";

export function decodeHtmlEntities(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPlayerMeta(html) {
  const s = String(html ?? "");
  let description = "";
  const descMatch = s.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (descMatch) {
    try {
      description = JSON.parse(`"${descMatch[1]}"`);
    } catch {
      description = descMatch[1];
    }
  }
  let captionUrl = null;
  const capMatch = s.match(/"captionTracks":(\[.*?\])/);
  if (capMatch) {
    try {
      const tracks = JSON.parse(capMatch[1]);
      const ko = tracks.find((t) => /^ko/i.test(t?.languageCode)) || tracks[0];
      if (ko?.baseUrl) captionUrl = ko.baseUrl;
    } catch { /* ignore malformed captionTracks */ }
  }
  return { description: String(description ?? "").trim(), captionUrl };
}

export function parseTranscriptXml(xml) {
  const texts = [];
  for (const m of String(xml ?? "").matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)) {
    const clean = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, " "));
    if (clean) texts.push(clean);
  }
  return texts.join(" ").replace(/\s+/g, " ").trim();
}

export async function fetchYoutubeVideoContent(videoId, { fetchImpl = fetch } = {}) {
  const id = String(videoId ?? "").trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  const r = await fetchImpl(watchUrl, {
    headers: { "user-agent": UA, "accept-language": "ko-KR,ko;q=0.9" },
    signal: AbortSignal.timeout(12000),
  });
  if (r.status === 429 || r.status === 403) {
    const err = new Error(`YouTube ${r.status}`);
    err.code = "RATE_LIMIT";
    throw err;
  }
  if (!r.ok) return null;
  const html = await r.text();
  const { description, captionUrl } = extractPlayerMeta(html);
  let transcript = "";
  if (captionUrl) {
    try {
      const cr = await fetchImpl(captionUrl, {
        headers: { "user-agent": UA, "accept-language": "ko-KR,ko;q=0.9" },
        signal: AbortSignal.timeout(10000),
      });
      if (cr.ok) {
        transcript = parseTranscriptXml(await cr.text());
      }
    } catch { /* transcript optional */ }
  }
  return {
    id,
    url: watchUrl,
    description: description.slice(0, 4000),
    transcript: transcript.slice(0, 12000),
  };
}

function snippetAround(text, idx, len = 90) {
  const start = Math.max(0, idx - 25);
  const end = Math.min(text.length, idx + len);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

/**
 * 유튜브 영상 설명 + 자막 본문에서 캠핑장 실전 스펙 및 현장 단서를 추출한다.
 */
export function extractFactsFromYoutubeText(text, url, checkedAt) {
  const src = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!src) return [];
  const facts = [];
  const seen = new Set();
  const push = (attr, value, idx) => {
    const key = `${attr}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({
      attr,
      value,
      grade: "MENTION",
      source: "youtube_mention",
      url,
      checked_at: checkedAt,
      evidence: snippetAround(src, idx),
    });
  };

  // 1) 전력(W / kW / A)
  const wm = src.match(/(?<![a-zA-Z\d,.])(\d{1,2},\d{3}|\d{3,4})\s*(?:[wW]|와트)(?![a-zA-Z])|(?<![a-zA-Z\d.])(1|2|3)\s*(?:[kK][wW]|킬로와트)/);
  if (wm) {
    const w = wm[1] ? Number(wm[1].replace(/,/g, "")) : Number(wm[2]) * 1000;
    if (w >= 300 && w <= 5000) push("POWER_MAX_W", w, wm.index ?? 0);
  }
  const am = src.match(/(?<![\d.])(\d{1,2})\s*(?:A|암페어)\b/i);
  if (am) {
    const a = Number(am[1]);
    if (a >= 3 && a <= 30) push("POWER_MAX_A", a, am.index ?? 0);
  }

  // 2) 입실·퇴실 시각
  const cin = src.match(/(?:입실|체크인)[^0-9오]{0,12}((?:오전|오후)?\s*\d{1,2}\s*(?::\s*\d{2}|시(?:\s*\d{1,2}\s*분|\s*반)?))/);
  if (cin) {
    const t = hhmm(cin[1]);
    if (t && t >= "11:00" && t <= "18:00") push("CHECKIN_TIME", t, cin.index ?? 0);
  }
  const cout = src.match(/(?:퇴실|체크아웃)[^0-9오]{0,12}((?:오전|오후)?\s*\d{1,2}\s*(?::\s*\d{2}|시(?:\s*\d{1,2}\s*분|\s*반)?))/);
  if (cout) {
    const t = hhmm(cout[1]);
    if (t && t >= "09:00" && t <= "15:00") push("CHECKOUT_TIME", t, cout.index ?? 0);
  }

  // 3) 반려견 동반
  if (/반려견\s*(?:동반\s*)?(?:불가|금지)|애견\s*(?:동반\s*)?(?:불가|금지)/.test(src)) {
    const m = src.match(/반려견\s*(?:동반\s*)?(?:불가|금지)|애견\s*(?:동반\s*)?(?:불가|금지)/);
    push("PET_POLICY", "NOT_ALLOWED", m?.index ?? 0);
  } else if (/소형견만|소형견\s*가능/.test(src)) {
    const m = src.match(/소형견만|소형견\s*가능/);
    push("PET_POLICY", "SMALL_ONLY", m?.index ?? 0);
  } else if (/반려견\s*동반|애견\s*동반|강아지\s*동반|애견\s*캠핑/.test(src)) {
    const m = src.match(/반려견\s*동반|애견\s*동반|강아지\s*동반|애견\s*캠핑/);
    push("PET_POLICY", "ALLOWED", m?.index ?? 0);
  }

  // 4) 사이트 규격 (예: 6x8m, 7*9m)
  const sm = src.match(/(\d{1,2}(?:\.\d)?)\s*[xX×*]\s*(\d{1,2}(?:\.\d)?)\s*(?:m|미터)?/);
  if (sm) {
    const w = Number(sm[1]), l = Number(sm[2]);
    if (w >= 2 && w <= 30 && l >= 2 && l <= 30) {
      push("SITE_SIZE", `${w}×${l}m`, sm.index ?? 0);
    }
  }

  // 5) 바닥 재질
  const surfMap = [
    ["DECK", /데크\s*사이트|나무\s*데크|우드\s*데크/],
    ["GRAVEL", /파쇄석\s*(?:사이트|바닥)?/],
    ["GRASS", /잔디\s*(?:사이트|바닥)/],
    ["SAND", /모래\s*(?:사이트|바닥)|마사토/],
  ];
  for (const [code, re] of surfMap) {
    const m = src.match(re);
    if (m) push("SITE_SURFACE", code, m.index ?? 0);
  }

  // 6) 주차 동선
  if (/텐트\s*옆\s*주차|사이트\s*옆\s*주차|차량\s*진입\s*가능/.test(src)) {
    const m = src.match(/텐트\s*옆\s*주차|사이트\s*옆\s*주차|차량\s*진입\s*가능/);
    push("PARKING_MODE", "SITE_ADJACENT", m?.index ?? 0);
  } else if (/손수레|짐수레|카트로\s*짐|리어카/.test(src)) {
    const m = src.match(/손수레|짐수레|카트로\s*짐|리어카/);
    push("PARKING_MODE", "CART_REQUIRED", m?.index ?? 0);
  }

  // 7) 1박 요금 언급
  const pm = src.match(/(?:1박|이용료|요금|평일|주말)[^0-9]{0,10}(\d{1,2})\s*만\s*원|(\d{2,3},\d{3})\s*원/);
  if (pm) {
    const won = pm[1] ? Number(pm[1]) * 10000 : Number(pm[2].replace(/,/g, ""));
    if (won >= 15000 && won <= 500000) push("PRICE_MENTION", won, pm.index ?? 0);
  }

  return facts;
}
