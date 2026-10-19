#!/usr/bin/env node
// 땡큐캠핑(캠퍼스토리 엔진) 공개 예약 화면에서 업장 사이트 사실을 읽는다 — docs/PRIVATE_AVAILABILITY_RESEARCH.md.
// 1) 매칭: 카탈로그 링크의 cseq/캠퍼스토리 번호, 없으면 공개 자동완성(/resv/ax_camp_name.hbb)으로 이름·시군구가 같은 업장 하나.
// 2) 사이트: 다음 토요일 1박 사이트 목록(/resv/axResCampSite.hbb, 캠핑장 화면이 로그인 없이 부르는 응답)에서
//    업장이 올린 사실(규격·바닥·요금·입퇴실·주차·반려동물·타입)을 registry/thankq.json에 남긴다.
// 3) 빈자리: 같은 응답의 사이트 상태는 out/thankq-vacancy.json에만 둔다. 화면 발행(explore/data/vacancy.json)은
//    원천 승인 카드가 APPROVED_OBSERVATION일 때(THANKQ_VACANCY_PUBLISH=on)만 한다(docs/PILOT_INTAKE_CONTRACT.md 2절).
// 봇 이름을 밝히고 호스트 간격 2초↑, 실행당 요청 상한(THANKQ_MAX_REQUESTS)을 지킨다. 차단·오류가 이어지면 멈춘다.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { THANKQ, linkedCseq, nextSaturdays, parseSiteList, pickMatch, queryOf, summarizeSites } from "../lib/thankq.mjs";

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const CATALOG = p("../../camping-atlas/public/explore/data/campgrounds.json");
const REG = p("../registry/thankq.json");
const RAW = p("../out/thankq-vacancy.json");
const PUBLIC = p("../../camping-atlas/public/explore/data/vacancy.json");
const UA = "moyeora-camping-bot/0.1 (+https://pyw31337.github.io/camp/; free non-commercial public-info service)";
const MAX_REQ = Number(process.env.THANKQ_MAX_REQUESTS ?? 1200);
const MATCH_MAX = Number(process.env.THANKQ_MATCH_MAX ?? 500);
const GAP_MS = Math.max(2000, Number(process.env.THANKQ_GAP_MS ?? 2000));
const RECHECK_MISS_DAYS = 30;
const PUBLISH = process.env.THANKQ_VACANCY_PUBLISH === "on";
const DEADLINE = Date.now() + Number(process.env.THANKQ_MINUTES ?? 80) * 60e3;

if (process.env.THANKQ_ENABLED === "off") { console.log("THANKQ_ENABLED=off — 건너뜁니다."); process.exit(0); }

let requests = 0, failures = 0, last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 로컬 프록시 환경에서도 같게 동작하도록 curl을 쓴다(Node fetch는 HTTPS_PROXY를 읽지 않는다).
async function post(path, form, referer) {
  if (requests >= MAX_REQ || Date.now() > DEADLINE) return null;
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now(); requests++;
  const args = ["-sS", "--max-time", "30", "-A", UA, "-X", "POST", `${THANKQ.host}${path}`, "-w", "\n%{http_code}"];
  if (referer) args.push("-e", referer);
  for (const [k, v] of Object.entries(form)) args.push("--data-urlencode", `${k}=${v}`);
  const out = await new Promise((ok) => execFile("curl", args, { maxBuffer: 8e6 }, (e, so) => ok(e ? null : String(so))));
  const code = out ? Number(out.slice(out.lastIndexOf("\n") + 1)) : 0;
  if (!out || code !== 200) { failures++; return null; }
  failures = 0;
  return out.slice(0, out.lastIndexOf("\n"));
}

const camps = JSON.parse(await readFile(CATALOG, "utf8")).filter((c) => c.status !== "폐업");
const reg = existsSync(REG) ? JSON.parse(await readFile(REG, "utf8")) : {};
reg.matches ??= {}; reg.sites ??= {};
const now = new Date();
const save = async () => { reg.updated_at = new Date().toISOString(); await writeFile(REG, `${JSON.stringify(reg, null, 1)}\n`); };

// 1) 매칭 — 링크로 알려진 곳 먼저, 그다음 민간 업장, 그다음 나머지.
let linked = 0, searched = 0, found = 0;
for (const c of camps) {
  const n = linkedCseq(JSON.stringify([c.booking, c.homepage]));
  if (n && reg.matches[c.id]?.cseq !== n) { reg.matches[c.id] = { cseq: n, via: "link", checked_at: now.toISOString() }; linked++; }
}
const due = (m) => !m || (m.cseq == null && Date.parse(m.checked_at) < now - RECHECK_MISS_DAYS * 864e5);
const order = (c) => (c.op === "PRIVATE" ? 0 : c.op === "UNKNOWN" ? 1 : 2);
for (const c of camps.filter((x) => due(reg.matches[x.id])).sort((a, b) => order(a) - order(b))) {
  if (searched >= MATCH_MAX || failures >= 5) break;
  const text = await post("/resv/ax_camp_name.hbb", { ser_camp_name: queryOf(c.name) });
  if (text == null) { if (requests >= MAX_REQ || Date.now() > DEADLINE) break; continue; }
  searched++;
  let results = [];
  try { results = JSON.parse(text); } catch { continue; }
  const m = pickMatch(c, results);
  reg.matches[c.id] = m ? { ...m, via: "name", checked_at: now.toISOString() } : { cseq: null, checked_at: now.toISOString() };
  if (m) found++;
  if (searched % 50 === 0) await save();
}
await save();
console.log(`매칭: 링크 ${linked}곳 갱신 · 이름 조회 ${searched}건 → ${found}곳 찾음 · 누적 ${Object.values(reg.matches).filter((m) => m.cseq).length}곳`);

// 2) 사이트 사실 + 3) 빈자리 관측
const dates = nextSaturdays(now, Number(process.env.THANKQ_WEEKENDS ?? 2));
const ymd = (d) => d.replaceAll("-", "");
const nextDay = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
const raw = existsSync(RAW) ? JSON.parse(await readFile(RAW, "utf8")) : { camps: {} };
const vac = { schema_version: 1, generated_at: now.toISOString(), dates, camps: {} };
const ids = Object.entries(reg.matches).filter(([, m]) => m.cseq).map(([id]) => id);
// 오래 확인하지 않은 곳부터(실행마다 상한까지만 읽고 다음 실행이 이어 간다).
ids.sort((a, b) => (Date.parse(reg.sites[a]?.checked_at ?? 0) || 0) - (Date.parse(reg.sites[b]?.checked_at ?? 0) || 0));
let read = 0, withSites = 0;
outer: for (const id of ids) {
  const { cseq } = reg.matches[id];
  for (const [i, d] of dates.entries()) {
    if (failures >= 5) { console.warn("연속 실패 5회 — 멈춥니다."); break outer; }
    const html = await post("/resv/axResCampSite.hbb", { campseq: cseq, res_dt: ymd(d), res_edt: ymd(nextDay(d)), res_days: 1, site_tp: "", only_able_yn: "" }, THANKQ.view(cseq));
    if (html == null) { if (requests >= MAX_REQ || Date.now() > DEADLINE) break outer; continue; }
    read++;
    const sites = parseSiteList(html);
    const at = new Date().toISOString();
    if (i === 0) {
      // 사실은 업장이 올린 그대로(상태 제외). 사이트가 없으면(예약 미개설) 기존 사실을 지우지 않는다.
      if (sites.length) {
        reg.sites[id] = { cseq, checked_at: at, date: d, url: THANKQ.view(cseq, ymd(d)), sites: sites.map(({ status, units, ...f }) => f) };
        withSites++;
      } else if (reg.sites[id]) reg.sites[id].checked_at = at;
      else reg.sites[id] = { cseq, checked_at: at, date: d, sites: [] };
    }
    const s = summarizeSites(sites);
    if (s.known) (vac.camps[id] ??= { cseq, d: {} }).d[d] = [s.open, s.total, at];
  }
  if (read % 40 === 0) await save();
}
await save();
// 관측 원본은 날짜가 지난 것을 버리고 이번 실행 결과를 덧씌운다(읽지 못한 곳은 직전 관측을 유지하되 만료는 화면이 판단).
for (const [id, v] of Object.entries(raw.camps ?? {})) for (const [d, x] of Object.entries(v.d ?? {})) if (dates.includes(d) && !vac.camps[id]?.d?.[d]) (vac.camps[id] ??= { cseq: v.cseq, d: {} }).d[d] = x;
await mkdir(p("../out/"), { recursive: true });
await writeFile(RAW, JSON.stringify(vac));
const open = Object.values(vac.camps).filter((v) => Object.values(v.d).some(([o]) => o > 0)).length;
console.log(`사이트 목록 ${read}건 읽음 · 사이트 사실 ${withSites}곳 · 관측 ${Object.keys(vac.camps).length}곳(빈자리 있는 곳 ${open}) · 요청 ${requests}건`);

if (PUBLISH) {
  const expires = new Date(now.getTime() + Number(process.env.THANKQ_VACANCY_TTL_HOURS ?? 14) * 3600e3).toISOString();
  await writeFile(PUBLIC, JSON.stringify({
    ...vac,
    expires_at: expires,
    scope: "OBSERVED",
    source: { id: "thankq", name: "땡큐캠핑 공개 예약 화면", url: THANKQ.host },
    disclaimer: "땡큐캠핑 공개 예약 화면에서 확인 시각에 본 사이트 상태입니다. 전화·다른 예약처로 바뀔 수 있으니 예약처에서 최종 확인하세요.",
  }));
  console.log(`빈자리 관측 발행: ${PUBLIC} (만료 ${expires})`);
} else console.log("빈자리 관측은 발행하지 않습니다(THANKQ_VACANCY_PUBLISH≠on, 원천 승인 대기).");
