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
        if (res.ok) {
          const j = await res.json();
          // 시간 초과·메모리 초과면 200과 함께 빈 elements + remark를 준다 → 실패로 보고 다음 서버로.
          if (!j.elements?.length) { errors.push(`${new URL(url).host} ${j.remark ? String(j.remark).slice(0, 80) : "빈 결과"}`); continue; }
          return { elements: j.elements ?? [], server: url };
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

/**
 * 성공한 응답을 파일로 남기고, 모든 서버가 실패하면 직전 성공 응답을 쓴다(공개 서버 504가 잦다).
 * GitHub Actions 캐시에 `.cache/osm-*.json`이 들어 있어 실행 사이에 유지된다.
 */
export async function overpassCached(query, cachePath, opts = {}) {
  const { readFile, writeFile } = await import("node:fs/promises");
  try {
    const r = await overpass(query, opts);
    await writeFile(cachePath, JSON.stringify({ fetched_at: new Date().toISOString(), elements: r.elements }));
    return { ...r, stale: false };
  } catch (e) {
    let cached = null;
    try { cached = JSON.parse(await readFile(cachePath, "utf8")); } catch { /* 캐시 없음 */ }
    if (!cached?.elements?.length) throw e;
    return { elements: cached.elements, server: `cache(${cached.fetched_at})`, stale: true, error: e.message };
  }
}
