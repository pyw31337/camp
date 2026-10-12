// 예약처별·전체 iCalendar 구독 피드를 pipeline/out/ics/에 쓴다.
// 사용: node scripts/build-ics.mjs [일수=120] [기준일 YYYY-MM-DD]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildCalendar, validateRegistry } from "../lib/booking-windows.mjs";
import { buildIcs } from "../lib/ics.mjs";
import { addDays, kstDate, nowInKst } from "../lib/kst.mjs";

const days = Number(process.argv[2] ?? 120);
const base = process.argv[3];
const registry = JSON.parse(await readFile(new URL("../registry/booking-rules.json", import.meta.url), "utf8"));
const errors = validateRegistry(registry);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const now = nowInKst();
const from = base ? kstDate(...base.split("-").map(Number)) : kstDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
const { events } = buildCalendar(registry, from, addDays(from, days));
const outDir = fileURLToPath(new URL("../out/ics/", import.meta.url));
await mkdir(outDir, { recursive: true });

const feeds = [{ file: "all.ics", name: "모여라 캠핑 · 전체 예약 오픈", events }];
for (const p of registry.providers) {
  const evs = events.filter((e) => e.provider_id === p.id);
  if (evs.length) feeds.push({ file: `provider-${p.id}.ics`, name: `모여라 캠핑 · ${p.name}`, events: evs });
}
for (const f of feeds) {
  await writeFile(`${outDir}${f.file}`, buildIcs(f.events, { name: f.name, description: "예약 오픈 일정. 각 일정의 출처와 확인 필요 여부를 설명에서 확인하세요." }));
  console.log(`${f.file}: ${f.events.length}건`);
}
