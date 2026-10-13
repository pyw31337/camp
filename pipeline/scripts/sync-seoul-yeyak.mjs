// 서울시 공공서비스예약 → 캠핑 관련 예약 상품만 추려 out/seoul-yeyak.json
// 키: SEOUL_OPEN_API_KEY (서울 열린데이터광장 일반 인증키). 없으면 건너뛴다.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SEOUL_SERVICES, fetchSeoulService, isCampingService, normalizeSeoulService } from "../lib/seoul-yeyak.mjs";

const key = process.env.SEOUL_OPEN_API_KEY;
if (!key) { console.log("::notice title=서울 공공예약 건너뜀::SEOUL_OPEN_API_KEY가 없습니다."); process.exit(0); }
const checkedAt = new Date().toISOString();
const errors = [];
let used = null, raw = [];
for (const service of SEOUL_SERVICES) {
  try {
    const { rows, total } = await fetchSeoulService(key, service);
    console.log(`${service}: ${rows.length}/${total}건 수신`);
    raw.push(...rows); used ??= service;
    if (service === "tvYeyakCOllect" && rows.length) break; // 종합이 되면 분야별은 필요 없다.
  } catch (error) {
    errors.push(`${service}: ${error.message}`);
    console.log(`::warning title=서울 공공예약 ${service}::${error.message}`);
  }
}
const seen = new Set();
const services = raw.filter(isCampingService).map((row) => normalizeSeoulService(row, checkedAt)).filter((s) => s.id && !seen.has(s.id) && seen.add(s.id));
const byStatus = services.reduce((acc, s) => ({ ...acc, [s.status ?? "?"]: (acc[s.status ?? "?"] ?? 0) + 1 }), {});
console.log(`캠핑 관련 예약 상품 ${services.length}건 · 상태 ${JSON.stringify(byStatus)} · 좌표 ${services.filter((s) => s.lat != null).length}건`);
for (const s of services.slice(0, 5)) console.log(`  예: ${s.status} | ${s.place} | ${s.name} | 접수 ${s.receipt.from ?? "-"} ~ ${s.receipt.to ?? "-"}`);
if (!used) { console.log("::error title=서울 공공예약 실패::모든 서비스 호출 실패(키 승인 대기·오타 확인)"); process.exit(errors.length ? 1 : 0); }
const outDir = fileURLToPath(new URL("../out/", import.meta.url));
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}seoul-yeyak.json`, JSON.stringify({ generated_at: checkedAt, service: used, total_rows: raw.length, errors, services }, null, 1));
