#!/usr/bin/env node
// registry/link-health.json(check-links.mjs)에서 DEAD로 확인된 링크를 캠핑장별 c.dl(목록)로 붙인다. 화면은 이 링크를 예약·홈페이지 버튼에서 뺀다.
// 원래 주소는 지우지 않는다(사이트가 살아나면 다음 확인에서 OK가 되어 다시 보인다). 멱등. 목록 빌드 맨 끝에 실행한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeUrl } from "../lib/booking-intel.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const path = join(root, "camping-atlas/public/explore/data/campgrounds.json");
const regPath = join(root, "pipeline/registry/link-health.json");
const health = existsSync(regPath) ? JSON.parse(readFileSync(regPath, "utf8")).urls ?? {} : {};
const camps = JSON.parse(readFileSync(path, "utf8"));
let n = 0, links = 0, fixed = 0;
for (const c of camps) {
  // 깨진 형식의 홈페이지 주소(“http://https////host”)는 바로잡고, 주소가 아닌 값(한글 키워드 주소 등)은 화면에 링크로 쓰지 않는다
  if (c.homepage && !/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(c.homepage)) { const u = normalizeUrl(c.homepage); if (u !== c.homepage) { fixed++; if (u) c.homepage = u; else { c.homepage_raw = c.homepage; delete c.homepage; } } }
  // 예약 채널 주소도 같은 방식으로(다음 전체 빌드 전까지 이미 발행된 깨진 형식을 고친다)
  for (const ch of c.booking?.channels ?? []) {
    if (!ch.url || /^tel:/i.test(ch.url) || /^https?:\/\/[^/\s]+\.[^/\s]+/i.test(ch.url)) continue;
    const u = normalizeUrl(ch.url); fixed++;
    if (u) ch.url = u; else ch.url = null;
  }
  if (c.booking?.channels) c.booking.channels = c.booking.channels.filter((ch) => ch.url);
  const mine = new Set([c.homepage, c.booking?.url, ...(c.booking?.channels ?? []).map((x) => x.url)].filter(Boolean));
  const dead = [...mine].filter((u) => health[u]?.s === "DEAD");
  if (dead.length) { c.dl = dead; n++; links += dead.length; } else delete c.dl;
}
writeFileSync(path, JSON.stringify(camps));
console.log(`깨진 링크 표시: ${n}곳 · ${links}개 · 홈페이지 주소 형식 바로잡음 ${fixed}곳`);
