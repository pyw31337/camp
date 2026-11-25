// 캠핑톡(campingtalk.me) 공개 예약 플랫폼 수집기 라이브러리
// 323개 예약 제휴 캠핑장의 JSON-LD 구조화 데이터, img-cdn 고화질 사진, 운영자 안내 문구, 연락처.

export const CAMPINGTALK_SITEMAP = "https://info.campingtalk.me/sitemap/campSitemap.xml";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch all campground URLs from CampingTalk sitemap
 */
export async function fetchCampingTalkSitemap() {
  const res = await fetch(CAMPINGTALK_SITEMAP, {
    headers: {
      "User-Agent": "moyeora-camping-bot/0.1 (+https://pyw31337.github.io/camp/; free non-commercial public-info service)",
      "Accept": "application/xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>(https:\/\/[^<]+)<\/loc>/g)].map((m) => m[1]);
  return locs;
}

/**
 * Fetch single camp page and extract structured JSON-LD data
 */
export async function fetchCampingTalkDetail(url, { retries = 3, timeout = 8000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "moyeora-camping-bot/0.1 (+https://pyw31337.github.io/camp/; free non-commercial public-info service)",
          "Accept": "text/html",
        },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      // Extract JSON-LD
      const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
        (m) => m[1]
      );
      let info = null;
      for (const s of scripts) {
        try {
          const json = JSON.parse(s.trim());
          const graph = json["@graph"] || [json];
          for (const item of graph) {
            if (item["@type"] === "LocalBusiness" || item["@type"] === "LodgingBusiness") {
              const streetAddress =
                typeof item.address === "object"
                  ? item.address?.streetAddress || item.address?.name
                  : item.address;
              info = {
                name: item.name?.trim(),
                phone: item.telephone?.trim() || null,
                image: item.image || null,
                address: streetAddress || null,
                description: item.description?.trim() || null,
                url,
              };
            }
          }
        } catch {}
      }

      // If JSON-LD not found, fallback to og tags
      if (!info) {
        const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1]?.replace(/\s*\|\s*캠핑톡.*/, "")?.trim();
        const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
        const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1]?.trim();
        if (ogTitle) {
          info = {
            name: ogTitle,
            phone: null,
            image: ogImage || null,
            address: null,
            description: ogDesc || null,
            url,
          };
        }
      }

      return info;
    } catch (err) {
      if (attempt === retries) return null;
      await sleep(500 * attempt);
    }
  }
}
