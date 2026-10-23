#!/usr/bin/env node
// registry/link-health.json(check-links.mjs)에서 DEAD로 확인된 링크를 캠핑장별 c.dl(목록)로 붙인다. 화면은 이 링크를 예약·홈페이지 버튼에서 뺀다.
// 원래 주소는 지우지 않는다(사이트가 살아나면 다음 확인에서 OK가 되어 다시 보인다). 멱등. 목록 빌드 맨 끝에 실행한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeUrl } from "../lib/booking-intel.mjs";
import { HIDE_VERDICTS } from "../lib/booking-verify.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const path = join(root, "camping-atlas/public/explore/data/campgrounds.json");
const regPath = join(root, "pipeline/registry/link-health.json");
const health = existsSync(regPath) ? JSON.parse(readFileSync(regPath, "utf8")).urls ?? {} : {};
// 예약 링크 정밀 검수(verify-booking-links.mjs): 업장별 (id|주소) 판정 — 다른 업장·도메인 판매·서비스 종료·도박 사이트 등은 숨긴다
const verifyPath = join(root, "pipeline/registry/booking-verify.json");
const verify = existsSync(verifyPath) ? JSON.parse(readFileSync(verifyPath, "utf8")).pairs ?? {} : {};
let wrong = 0, moved = 0;
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
  // 옛 예약 엔진 주소(주소 변경 안내) → 안내된 새 주소. 원래 주소는 registered_url로 남긴다(지우지 않음).
  for (const ch of c.booking?.channels ?? []) {
    const src = ch.registered_url ?? ch.url, r = verify[`${c.id}|${src}`];
    if (r?.v === "MOVED" && r.to && !HIDE_VERDICTS.has(r.then)) { if (ch.url !== r.to) moved++; ch.registered_url = src; ch.url = r.to; }
  }
  const mine = new Set([c.homepage, c.booking?.url, ...(c.booking?.channels ?? []).map((x) => x.url)].filter(Boolean));
  const bad = (u) => HIDE_VERDICTS.has(verify[`${c.id}|${u}`]?.v);
  const dead = [...mine].filter((u) => health[u]?.s === "DEAD" || bad(u));
  wrong += [...mine].filter((u) => health[u]?.s !== "DEAD" && bad(u)).length;
  if (dead.length) { c.dl = dead; n++; links += dead.length; } else delete c.dl;
}
writeFileSync(path, JSON.stringify(camps));
console.log(`깨진 링크 표시: ${n}곳 · ${links}개(그중 업장 불일치·종료·판매 등 ${wrong}개) · 새 예약 주소로 바꿈 ${moved}개 · 홈페이지 주소 형식 바로잡음 ${fixed}곳`);
