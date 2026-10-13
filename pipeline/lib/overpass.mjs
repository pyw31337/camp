// Overpass API 호출: 여러 공개 서버를 차례로, 서버마다 한 번 재시도한다(504·429는 과부하).
export const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

export async function overpass(query, { fetchImpl = fetch, timeoutMs = 300000, servers = OVERPASS_SERVERS, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const errors = [];
  for (const url of servers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchImpl(url, { method: "POST", body: new URLSearchParams({ data: query }), headers: { "User-Agent": "moyeora-camping-pipeline (github.com/pyw31337/camp)" }, signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) return { elements: (await res.json()).elements ?? [], server: url };
        errors.push(`${new URL(url).host} HTTP ${res.status}`);
        if (![429, 502, 503, 504].includes(res.status)) break;
      } catch (e) {
        errors.push(`${new URL(url).host} ${e.message}`);
      }
      await wait(5000 * (attempt + 1));
    }
  }
  throw new Error(`Overpass 실패: ${errors.join(", ")}`);
}
