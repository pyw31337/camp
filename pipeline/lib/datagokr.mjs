// data.go.kr 호출 공통 처리. 해외 망(GitHub 호스팅 러너 등)에서 HTTPS 연결이 막히는 경우가 있어
// 연결 단계 오류일 때만 HTTP로 한 번 더 시도한다. 인증키는 로그에 남기지 않는다.

export function serviceKeyParam(key) {
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

const isConnectError = (e) => /fetch failed|ECONNREFUSED|ETIMEDOUT|UND_ERR_CONNECT|ENOTFOUND|EAI_AGAIN/i.test(`${e?.message} ${e?.cause?.code ?? ""} ${e?.cause?.message ?? ""}`);

/**
 * @param {string} url https://apis.data.go.kr/... (serviceKey 제외)
 * @returns {Promise<{res: Response, protocol: "https"|"http"}>}
 */
export async function fetchDataGoKr(url, serviceKey, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const withKey = (u) => `${u}${u.includes("?") ? "&" : "?"}serviceKey=${serviceKeyParam(serviceKey)}`;
  try {
    return { res: await fetchImpl(withKey(url), { signal: AbortSignal.timeout(timeoutMs) }), protocol: "https" };
  } catch (e) {
    if (!isConnectError(e) || !url.startsWith("https://")) throw e;
    const httpUrl = url.replace(/^https:/, "http:");
    try {
      return { res: await fetchImpl(withKey(httpUrl), { signal: AbortSignal.timeout(timeoutMs) }), protocol: "http" };
    } catch (e2) {
      const err = new Error(`data.go.kr 연결 실패(HTTPS·HTTP 모두): ${e2?.cause?.code ?? e2.message}. 해외 IP 차단일 수 있음 — docs/ARCHITECTURE.md ‘공공데이터 호출 위치’ 참고`);
      err.code = "DATA_GO_KR_UNREACHABLE";
      throw err;
    }
  }
}
