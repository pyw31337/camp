import { readFile } from "node:fs/promises";
import { validateRegistry } from "../lib/booking-windows.mjs";

const registry = JSON.parse(await readFile(new URL("../registry/booking-rules.json", import.meta.url), "utf8"));
const errors = validateRegistry(registry);
if (errors.length) {
  console.error(`예약 규칙 검증 실패 ${errors.length}건\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`예약 규칙 검증 통과: 제공자 ${registry.providers.length}곳, 규칙 ${registry.rules.length}개`);
