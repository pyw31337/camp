// 행정안전부 전국공공시설개방정보표준데이터에서 ‘유료사용여부=N’인 야영·캠핑 시설 후보를 찾는다.
// 결과는 후보이며, 취사 허용·화장실은 운영 기관 공지로 확인한 뒤 registry/free-sites.json에 올린다.
// 사용: DATA_GO_KR_SERVICE_KEY=... node scripts/discover-public-free.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchDataGoKr } from "../lib/datagokr.mjs";

const key = process.env.DATA_GO_KR_SERVICE_KEY;
if (!key) { console.log("DATA_GO_KR_SERVICE_KEY가 없어 건너뜁니다."); process.exit(0); }

// 표준데이터 API 경로. 응답이 404·미등록이면 data.go.kr 데이터셋 15013117의 ‘오픈 API’ 탭에서 경로와 활용신청 상태를 확인한다.
const ENDPOINT = process.env.PBLFCLT_ENDPOINT ?? "https://api.data.go.kr/openapi/tn_pubr_public_pblfclt_opn_info_api";
const CAMP = /(야영|캠핑|캠프|오토캠|글램핑|노지)/;

const all = [];
let total = Infinity;
for (let page = 1; page <= 60 && all.length < total; page++) {
  let res;
  try {
    ({ res } = await fetchDataGoKr(`${ENDPOINT}?pageNo=${page}&numOfRows=1000&type=json`, key, { timeoutMs: 30000 }));
  } catch (e) {
    console.log(`::warning title=공공시설개방정보 호출 실패::${e.message}`);
    process.exit(0);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text)?.response?.body; } catch { body = null; }
  if (!body) {
    console.log(`::warning title=공공시설개방정보 응답 확인 필요::HTTP ${res.status} ${text.slice(0, 160).replace(/\s+/g, " ")}`);
    process.exit(0);
  }
  const items = Array.isArray(body.items) ? body.items : body.items?.item ? [].concat(body.items.item) : [];
  total = Number(body.totalCount ?? items.length);
  if (!items.length) break;
  all.push(...items);
}
console.log(`공공시설개방정보 ${all.length}/${total}건 수신`);
if (all[0]) console.log(`필드: ${Object.keys(all[0]).join(", ")}`);

// 응답 키 이름이 확정되기 전이라 값 기준으로 찾는다: 유료 여부 키는 이름에 'chrg'·'fee'·'Yn'이 들어가고 값이 Y/N인 키.
const feeKey = all[0] && Object.keys(all[0]).find((k) => /chrg|chrge|fee|pay/i.test(k) && /^[YN]$/.test(String(all[0][k] ?? "")))
  || (all[0] && Object.keys(all[0]).find((k) => /yn$/i.test(k) && all.some((r) => /^[YN]$/.test(String(r[k] ?? "")))));
const candidates = all.filter((r) => CAMP.test(Object.values(r).join(" ")) && (!feeKey || String(r[feeKey]).toUpperCase() === "N"));
console.log(`야영·캠핑 관련 ${all.filter((r) => CAMP.test(Object.values(r).join(" "))).length}건 중 무료(${feeKey ?? "유료 여부 키 미확인"}=N) ${candidates.length}건`);
for (const r of candidates.slice(0, 50)) console.log(`- ${Object.values(r).filter((v) => typeof v === "string" && v.trim()).slice(0, 6).join(" | ")}`);

const outDir = fileURLToPath(new URL("../out/", import.meta.url));
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}public-free-candidates.json`, JSON.stringify({ source: ENDPOINT, fee_key: feeKey ?? null, count: candidates.length, candidates }, null, 2));
