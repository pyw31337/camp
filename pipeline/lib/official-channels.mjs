// 캠핑장 공식 채널(자체 홈페이지·공식 블로그·공식 카페·공식 SNS) 식별·소유 확인(2026-11-11 t60).
// 고캠핑·TourAPI·카탈로그에 업장이 직접 등록한 주소만 모은다. 후기 블로그·VR 업체 글·검색 결과는 넣지 않는다.
// 채널 이름·전화·주소가 캠핑장과 맞거나, 고캠핑 홈페이지로 등록된 채널 뿌리 주소이면 소유로 본다.
import { isOperatorHost, isClosedHost } from "./operator-site.mjs";
import { nameKey, nameSimilarity } from "./kakao-discovery.mjs";

export const CHANNEL_TYPES = {
  homepage: { key: "homepage", label: "공식 홈페이지", plat: "home" },
  naver_blog: { key: "blog", label: "공식 블로그", plat: "naver" },
  tistory: { key: "blog", label: "공식 블로그", plat: "kakao" },
  daum_blog: { key: "blog", label: "공식 블로그", plat: "kakao" },
  naver_cafe: { key: "cafe", label: "공식 카페", plat: "naver" },
  daum_cafe: { key: "cafe", label: "공식 카페", plat: "kakao" },
  instagram: { key: "instagram", label: "인스타그램", plat: "instagram" },
  facebook: { key: "facebook", label: "페이스북", plat: "facebook" },
  youtube: { key: "youtube", label: "유튜브", plat: "youtube" },
  band: { key: "band", label: "네이버 밴드", plat: "naver" },
  kakao: { key: "kakao", label: "카카오 채널", plat: "kakao" },
};

// 예약·지도·포털은 공식 채널 배지가 아니다(예약 칸에 이미 있다).
const NOT_CHANNEL_HOST = [
  "gocamping.or.kr", "camfit.co.kr", "camfit.kr", "thankqcamping.com", "booking.naver.com",
  "map.naver.com", "place.map.kakao.com", "map.kakao.com", "foresttrip.go.kr",
  "reservation.knps.or.kr", "res.knps.or.kr", "huyang.go.kr", "camping.junggu.ulsan.kr",
  "yanolja.com", "yeogi.com", "goodchoice.kr", "airbnb.com", "airbnb.co.kr", "booking.com",
  "agoda.com", "onda.me", "site.onda.me", "campingt.me", "campingtalk.me", "linktr.ee",
  "ticketplay.zone", "letsnowgo.com", "data.go.kr", "openstreetmap.org", "camperstory.com",
  "ddnayo.com", "interpark.com", "xticket.kr", "camplink.co.kr",
];

const REVIEW_HINT = /후기|리뷰|다녀왔|방문기|내돈내산|솔직후기|캠핑일기|여행기/i;

export function hostOf(url) {
  try { return new URL(normalizeUrl(url)).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function normalizeUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    u.hash = "";
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch { return ""; }
}

export function classifyUrl(raw) {
  const url = normalizeUrl(raw);
  if (!url) return null;
  const host = hostOf(url);
  const path = (() => { try { return new URL(url).pathname; } catch { return ""; } })();
  if (!host) return null;
  if (NOT_CHANNEL_HOST.some((p) => host === p || host.endsWith(`.${p}`))) return null;
  if (host === "blog.naver.com" || host === "m.blog.naver.com" || host.endsWith(".blog.me")) {
    const id = naverBlogId(url);
    return id ? { type: "naver_blog", url: `https://blog.naver.com/${id}`, id, raw: url } : null;
  }
  if (host === "cafe.naver.com" || host === "m.cafe.naver.com") {
    const id = path.split("/").filter(Boolean)[0];
    if (!id || /^(f-e|Login|login|Search|search)/.test(id)) return null;
    return { type: "naver_cafe", url: `https://cafe.naver.com/${id}`, id, raw: url };
  }
  if (host === "cafe.daum.net" || host === "m.cafe.daum.net") {
    const id = path.split("/").filter(Boolean)[0];
    if (!id) return null;
    return { type: "daum_cafe", url: `https://cafe.daum.net/${id}`, id, raw: url };
  }
  if (host === "instagram.com") {
    const id = instagramId(path);
    if (!id) return null;
    return { type: "instagram", url: `https://www.instagram.com/${id}`, id, raw: url };
  }
  if (host === "facebook.com" || host === "fb.com" || host === "m.facebook.com") {
    const id = path.split("/").filter(Boolean)[0];
    if (!id || /^(watch|reel|share|groups|login|sharer)$/i.test(id)) return null;
    return { type: "facebook", url: `https://www.facebook.com/${id}`, id, raw: url };
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    const id = youtubeId(url);
    if (!id) return null;
    return { type: "youtube", url: id.startsWith("UC") || id.startsWith("@") ? `https://www.youtube.com/${id.startsWith("@") ? id : `channel/${id}`}` : `https://www.youtube.com/${id}`, id, raw: url };
  }
  if (host === "band.us") {
    const id = path.match(/band\/(\d+)/)?.[1];
    if (!id) return null;
    return { type: "band", url: `https://band.us/band/${id}`, id, raw: url };
  }
  if (host === "pf.kakao.com" || host === "plus.kakao.com") {
    const id = path.split("/").filter(Boolean).join("/") ;
    if (!id) return null;
    return { type: "kakao", url: `https://pf.kakao.com/${id.replace(/^\/+/, "/")}`, id, raw: url };
  }
  if (host.endsWith(".tistory.com")) {
    const id = host.replace(/\.tistory\.com$/, "");
    return { type: "tistory", url: `https://${id}.tistory.com/`, id, raw: url };
  }
  if (host === "blog.daum.net" || host === "blog.kakao.com") {
    const id = path.split("/").filter(Boolean)[0];
    if (!id) return null;
    return { type: "daum_blog", url: `https://blog.daum.net/${id}`, id, raw: url };
  }
  if (host === "naver.me") return { type: "short", url, id: path.replace(/^\//, ""), raw: url, resolve: "naver.me" };
  // 업장 자체 홈페이지
  if (isClosedHost(url)) return null;
  if (isOperatorHost(url)) return { type: "homepage", url: url.replace(/\/$/, "") || url, id: host, raw: url };
  return null;
}

export function naverBlogId(url) {
  try {
    const u = new URL(normalizeUrl(url));
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host.endsWith(".blog.me")) return host.split(".")[0];
    if (host !== "blog.naver.com") return "";
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts[0] || /^(PostView|PostList|Search|section)/i.test(parts[0])) {
      return u.searchParams.get("blogId") || "";
    }
    return parts[0];
  } catch { return ""; }
}

function instagramId(path) {
  const p = path.split("/").filter(Boolean)[0];
  if (!p || /^(p|reel|reels|stories|explore|accounts|legal|about|directory|tv)$/i.test(p)) return "";
  return p.replace(/^@/, "");
}
function youtubeId(url) {
  try {
    const u = new URL(normalizeUrl(url));
    const parts = u.pathname.split("/").filter(Boolean);
    if (u.hostname.replace(/^www\./, "") === "youtu.be") return ""; // 영상 단축 주소는 채널이 아님
    if (parts[0] === "channel" && parts[1]) return parts[1];
    if (parts[0] === "c" && parts[1]) return parts[1];
    if (parts[0] === "user" && parts[1]) return parts[1];
    if (parts[0]?.startsWith("@")) return parts[0];
    return "";
  } catch { return ""; }
}

const digits = (s) => String(s ?? "").replace(/\D/g, "");
const addrKey = (s) => String(s ?? "").replace(/[\s-]/g, "").replace(/특별자치|광역|남도|북도/g, "");

export function telMatch(campTel, text) {
  const a = digits(campTel);
  const b = digits(text);
  if (!a || a.length < 8 || !b) return false;
  return b.includes(a) || a.includes(b);
}

export function addrMatch(campAddr, text) {
  const a = addrKey(campAddr);
  const b = addrKey(text);
  if (!a || a.length < 8 || !b) return false;
  // 도로명+번호처럼 주소의 뒷부분(10자 이상)이 글에 있으면 같은 곳으로 본다.
  const tail = a.slice(-12);
  return tail.length >= 8 && b.includes(tail);
}

export function nameMatch(campName, channelName, sigungu) {
  if (!campName || !channelName) return 0;
  const s = nameSimilarity(campName, channelName);
  if (s >= 0.72) return s;
  const ck = nameKey(campName);
  const tk = nameKey(channelName);
  if (ck.length >= 4 && tk.includes(ck)) return 1;
  if (tk.length >= 4 && ck.includes(tk)) return 1;
  // 시설명 핵심이 채널 이름에 그대로 있으면(예: '선장포노을캠핑장님의블로그')
  const core = nameKey(String(campName).replace(/(오토)?캠핑장$|글램핑장$|야영장$/g, ""));
  if (core.length >= 3 && tk.includes(core)) return 1;
  if (sigungu && nameKey(channelName).includes(nameKey(sigungu)) && s >= 0.4) return s;
  return s;
}

export function isReviewLike({ url, title, source } = {}) {
  if (REVIEW_HINT.test(title ?? "") || REVIEW_HINT.test(url ?? "")) return true;
  // VR 업체 등 제3자 글 주소(블로그 아이디/글번호)는 채널이 아니다. 고캠핑 홈페이지로 등록된 경우는 따로 본다.
  if (source === "vr.blog") return true;
  return false;
}

/** 같은 채널(블로그 아이디·카페·인스타 핸들)을 여러 캠핑장이 쓰면 소유가 아닐 수 있다. */
export function sharedChannelIds(entries, limit = 4) {
  const by = new Map();
  for (const e of entries) {
    if (!e?.type || e.type === "homepage" || !e.id) continue;
    const k = `${e.type}:${e.id.toLowerCase()}`;
    if (!by.has(k)) by.set(k, new Set());
    by.get(k).add(String(e.campId));
  }
  const shared = new Set();
  for (const [k, ids] of by) if (ids.size >= limit) shared.add(k);
  return shared;
}

/**
 * 소유 확인. reasons는 맞은 근거.
 * - catalog_homepage: 고캠핑·카탈로그 홈페이지로 업장이 직접 등록한 채널 뿌리 주소
 * - name / tel / addr: 채널 이름·소개 글이 캠핑장과 맞음
 */
export function verifyOwnership(camp, channel, { title, description, shared } = {}) {
  const reasons = [];
  if (isClosedHost(channel.url) || isClosedHost(channel.raw)) {
    return { verified: false, reasons: ["closed_host"] };
  }
  if (isReviewLike({ url: channel.raw || channel.url, title, source: channel.source })) {
    return { verified: false, reasons: ["review_like"] };
  }
  const key = `${channel.type}:${String(channel.id ?? "").toLowerCase()}`;
  if (shared?.has(key)) return { verified: false, reasons: ["shared_channel"] };
  if (channel.source === "homepage" || channel.source === "homepage_raw") reasons.push("catalog_homepage");
  const blob = [title, description].filter(Boolean).join("\n");
  if (blob && nameMatch(camp.name, blob, camp.sigungu) >= 0.72) reasons.push("name");
  if (blob && telMatch(camp.tel, blob)) reasons.push("tel");
  if (blob && addrMatch(camp.addr, blob)) reasons.push("addr");
  if (title && nameMatch(camp.name, title, camp.sigungu) >= 0.72 && !reasons.includes("name")) reasons.push("name");
  // 고캠핑 홈페이지로 등록된 채널은 업장이 공식 주소로 제출한 것이라 소유로 본다.
  // 이름·전화·주소 단서가 더 있으면 보강한다. 후기성·공유 채널은 위에서 걸렀다.
  const verified = reasons.includes("catalog_homepage") || reasons.includes("name") || reasons.includes("tel") || reasons.includes("addr");
  return { verified, reasons };
}

const SOURCE_FIELDS = [
  ["homepage", (c) => c.homepage],
  ["homepage_raw", (c) => c.homepage_raw],
  ["booking.url", (c) => c.booking?.url],
  ["booking.channel", (c) => (c.booking?.channels ?? []).map((x) => x.registered_url ?? x.url)],
  ["dl", (c) => c.dl ?? []],
];

/** 한 캠핑장의 공식 채널 후보(아직 소유 확인 전). 후기·요금 근거 글 주소는 넣지 않는다. */
export function candidatesFromCamp(camp) {
  const out = [];
  const seen = new Set();
  const add = (raw, source) => {
    const hit = classifyUrl(raw);
    if (!hit) return;
    const key = `${hit.type}:${String(hit.id ?? hit.url).toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...hit, source, campId: String(camp.id) });
  };
  for (const [source, get] of SOURCE_FIELDS) {
    const v = get(camp);
    for (const raw of Array.isArray(v) ? v : [v]) add(raw, source);
  }
  return out;
}

export function parseRss(xml) {
  const text = String(xml ?? "");
  const tag = (s, name) => {
    const m = s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
    return m ? decodeCdata(m[1]) : "";
  };
  const channel = text.match(/<channel\b[\s\S]*?<\/channel>/i)?.[0] ?? text;
  const title = tag(channel.replace(/<item\b[\s\S]*$/i, ""), "title");
  const description = tag(channel.replace(/<item\b[\s\S]*$/i, ""), "description");
  const items = [];
  for (const m of text.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const images = [...block.matchAll(/https?:\/\/[^"'<>\s]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\s]*)?/gi)].map((x) => x[0]);
    // 네이버 본문 이미지(포스트파일)도 잡는다.
    for (const im of block.matchAll(/https?:\/\/(?:postfiles|blogfiles|blogpfthumb)[^"'<>\s]+/gi)) {
      if (!images.includes(im[0])) images.push(im[0]);
    }
    items.push({
      title: tag(block, "title"),
      link: tag(block, "link").replace(/\?fromRss=true&trackingCode=rss$/, ""),
      images: unique(images),
    });
  }
  return { title, description, items };
}

function decodeCdata(s) {
  return String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const unique = (xs) => [...new Set(xs)];

/** 기존 레지스트리에 채널을 쌓기만 한다. 이미 있는 항목은 지우지 않고, 더 좋은 근거만 보강한다. */
export function mergeRegistry(prev, nextCamps) {
  const camps = { ...(prev?.camps ?? {}) };
  for (const [id, entry] of Object.entries(nextCamps ?? {})) {
    const cur = camps[id];
    if (!cur) { camps[id] = entry; continue; }
    const byKey = new Map((cur.channels ?? []).map((ch) => [`${ch.type}:${String(ch.id ?? ch.url).toLowerCase()}`, { ...ch }]));
    for (const ch of entry.channels ?? []) {
      const k = `${ch.type}:${String(ch.id ?? ch.url).toLowerCase()}`;
      const old = byKey.get(k);
      if (!old) { byKey.set(k, ch); continue; }
      // 더 권위 있는 근거만 보강(등록 홈페이지 > 이름·전화 확인 > 기존). 기존 URL·확인 결과는 유지.
      const reasons = unique([...(old.by ?? []), ...(ch.by ?? [])]);
      byKey.set(k, {
        ...old,
        ...(!old.verified && ch.verified ? { verified: true } : {}),
        ...(ch.label && !old.label ? { label: ch.label } : {}),
        ...(ch.title && !old.title ? { title: ch.title } : {}),
        by: reasons,
        source: old.source === "homepage" || old.source === "homepage_raw" ? old.source : (ch.source ?? old.source),
      });
    }
    camps[id] = { ...cur, name: cur.name || entry.name, channels: [...byKey.values()] };
  }
  return camps;
}

export function publicRecord(entry) {
  const channels = (entry?.channels ?? []).filter((ch) => ch.verified && CHANNEL_TYPES[ch.type]);
  return channels.map((ch) => {
    const meta = CHANNEL_TYPES[ch.type];
    return { k: meta.key, u: ch.url, l: meta.label, p: meta.plat };
  });
}

export const LEGAL = {
  official_blog: {
    use: "link_only",
    robots: "rss.blog.naver.com robots.txt 가 User-agent: * Disallow: / 이다. 공개 RSS 주소를 알아도 로봇으로는 받지 않는다. blog.naver.com 은 글 목록·정보 API 경로를 막고, 약관은 게시물 무단 복제를 금지한다.",
    display: "소유 확인된 공식 블로그는 원문 링크와 출처만 보여 준다. 사진은 R2에 다시 올리지 않고, 로봇 수집도 하지 않는다. RSS가 허용되면 그때 글 제목·주소를 캡션·출처로 단 핫링크만 검토한다.",
  },
  instagram: {
    use: "profile_link_only",
    robots: "instagram.com robots.txt 가 자동 수집을 명시적으로 금지한다. 로그인 벽 뒤는 읽지 않는다.",
    oembed: "2026-06-15부터 공개 게시물 oEmbed 는 토큰 없이 GET https://graph.facebook.com/v25.0/instagram_oembed?url={게시물주소} 로 호출할 수 있다(Meta 블로그). 다만 프로필 전체 사진을 나열하는 API가 아니고, 2025-11 이후 응답에 thumbnail_url 이 없다(embed HTML만). 사이트 유형 사진을 모으려면 업장이 Instagram 전문 계정 권한을 주는 Graph API 연동이 필요하다.",
    display: "고캠핑에 등록된 공식 프로필 링크만 배지로 보여 준다. 게시물 임베드는 소유자 결정(토큰리스 oEmbed 또는 Meta 앱) 뒤에.",
  },
  official_cafe: {
    use: "link_only",
    robots: "cafe.naver.com robots.txt 가 User-agent: * Disallow: / 이다. 로그인 없이 읽을 수 있는 글도 로봇으로는 받지 않는다. cafe.daum.net 은 일부 공개 경로를 허용하지만, 2026-11-11 표본(구름포 cafe.daum.net/gurumpo)은 빈 응답(HTTP 500)이라 안정적으로 글을 열 수 없었다.",
    display: "고캠핑에 등록된 공식 카페 주소만 링크로 보여 준다. 카페 사진은 수집하지 않는다.",
  },
};
