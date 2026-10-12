// 예약 규칙에서 오늘(KST)부터 N일 동안의 예약 오픈 이벤트를 계산해 pipeline/out/open-calendar.json에 쓴다.
// 사용: node scripts/build-open-calendar.mjs [일수=90] [기준일 YYYY-MM-DD]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildCalendar, validateRegistry } from "../lib/booking-windows.mjs";
import { addDays, kstDate, nowInKst } from "../lib/kst.mjs";

const days = Number(process.argv[2] ?? 90);
const base = process.argv[3];
const registry = JSON.parse(await readFile(new URL("../registry/booking-rules.json", import.meta.url), "utf8"));
const errors = validateRegistry(registry);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const now = nowInKst();
const from = base ? kstDate(...base.split("-").map(Number)) : kstDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
const to = addDays(from, days);
const calendar = buildCalendar(registry, from, addDays(to, -1 / 1440));
const outDir = fileURLToPath(new URL("../out/", import.meta.url));
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}open-calendar.json`, JSON.stringify({ generated_at: new Date().toISOString(), registry_version: registry.version, ...calendar }, null, 2));
console.log(`이벤트 ${calendar.events.length}건 (${calendar.range.from} ~ ${calendar.range.to}), 확인 필요 ${calendar.events.filter((e) => e.needs_verification).length}건`);
