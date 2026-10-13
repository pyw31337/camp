// Overpass API 호출: 여러 공개 서버를 차례로, 서버마다 한 번 재시도한다(504·429는 과부하).
export const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

export async function overpass(query, { fetchImpl = fetch, timeoutMs = 300000, servers = OVERPASS_SERVERS, attempts = 2, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const errors = [];
  for (const url of servers) {
    for (let attempt = 0; attempt < Math.max(1, attempts); attempt++) {
      try {
        const res = await fetchImpl(url, { method: "POST", body: new URLSearchParams({ data: query }), headers: { "User-Agent": "moyeora-camping-pipeline (github.com/pyw31337/camp)" }, signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) {
          const body = await res.json();
          // 시간·메모리 초과는 HTTP 200 + 빈 elements + remark로 돌아올 수 있다.
          if (!body.elements?.length) { errors.push(`${new URL(url).host} ${body.remark ? String(body.remark).slice(0, 80) : "빈 결과"}`); continue; }
          return { elements: body.elements, server: url };
        }
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

/** 성공 결과를 캐시하고, 공개 Overpass 서버가 모두 실패하면 직전 결과를 쓴다. */
export async function overpassCached(query, cachePath, options = {}) {
  const { readFile, writeFile } = await import("node:fs/promises");
  try {
    const result = await overpass(query, options);
    await writeFile(cachePath, JSON.stringify({ fetched_at: new Date().toISOString(), elements: result.elements }));
    return { ...result, stale: false };
  } catch (error) {
    let cached = null;
    try { cached = JSON.parse(await readFile(cachePath, "utf8")); } catch { /* no cache */ }
    if (!cached?.elements?.length) throw error;
    return { elements: cached.elements, server: `cache(${cached.fetched_at})`, stale: true, error: error.message };
  }
}
