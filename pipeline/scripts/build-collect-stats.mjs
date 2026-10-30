#!/usr/bin/env node
// 수집 현황판 데이터(소유자 2026-10-30: “수집처별·카테고리별 누적·일별 수집량, 속도, 목표 대비, 정합성·가치를 한눈에”).
// 발행 데이터(목록 카탈로그·상세 파일)와 수집 기록(registry)·품질 장부(data/quality)를 읽어
//   camping-atlas/public/data/collect-stats.json   — 오늘 스냅샷(지표·수집처 신선도·지역·품질·검토 대기)
//   camping-atlas/public/data/collect-history.json — 날짜별 지표(누적 추이 → 일별 증가·속도·목표 도달 예상일)
// 을 만든다. 화면은 camping-atlas/public/admin/collect/. 목표치는 pipeline/registry/collect-targets.json.
// 지우거나 줄이지 않는다: 이력은 날짜별로 덧붙이고(같은 날은 새 값으로), 지난 날짜는 그대로 둔다.
// 사용: node pipeline/scripts/build-collect-stats.mjs            (오늘 스냅샷 + 이력 갱신)
//       node pipeline/scripts/build-collect-stats.mjs --backfill (git 이력의 날짜별 마지막 카탈로그로 과거 이력 채우기)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const P = (...x) => join(root, ...x);
const DATA = P("camping-atlas/public/explore/data");
const OUT_STATS = P("camping-atlas/public/data/collect-stats.json");
const OUT_HIST = P("camping-atlas/public/data/collect-history.json");
const read = (p, d = null) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const day = (s) => (s ? String(s).slice(0, 10) : null);
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const has = (v) => v != null && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);

/** 캠핑장(숙박)과 당일 나들이(공원·물놀이 등)를 나눈다 — 목표·커버리지는 캠핑장 기준 */
export const isStay = (c) => !c.du;

/** 카탈로그만으로 셀 수 있는 지표(과거 백필도 같은 함수) */
export function catalogMetrics(cat) {
  const stay = cat.filter(isStay), dayuse = cat.filter((c) => !isStay(c));
  const n = stay.length;
  const cov = (f) => { const k = stay.filter(f).length; return { value: k, camps: k, base: n, pct: pct(k, n) }; };
  const sum = (f) => stay.reduce((a, c) => a + (Number(f(c)) || 0), 0);
  const m = {};
  m["catalog.all"] = { value: cat.length };
  m["catalog.camps"] = { value: n };
  m["catalog.dayuse"] = { value: dayuse.length };
  m["catalog.gocamping"] = { value: stay.filter((c) => c.gc_url).length };
  m["catalog.discovered"] = { value: stay.filter((c) => !c.gc_url).length };
  m["field.addr"] = cov((c) => has(c.addr));
  m["field.geo"] = cov((c) => c.lat && c.lng);
  m["field.tel"] = cov((c) => has(c.tel));
  m["field.homepage"] = cov((c) => has(c.homepage));
  m["field.booking"] = cov((c) => has(c.booking?.url) || has(c.booking?.channels));
  m["field.fee"] = cov((c) => has(c.fee));
  m["field.pets"] = cov((c) => has(c.pets));
  m["field.amenities"] = cov((c) => has(c.amenities));
  m["field.kinds"] = cov((c) => has(c.kinds) || has(c.st));
  m["field.sizes"] = cov((c) => has(c.sizes));
  m["field.floors"] = cov((c) => has(c.floors));
  m["field.layout"] = cov((c) => has(c.layout_images));
  m["field.checkin"] = cov((c) => has(c.ti?.i));
  m["field.themes"] = cov((c) => has(c.th) || has(c.themes));
  m["photo.official"] = cov((c) => has(c.ph) || has(c.img));
  m["photo.any"] = cov((c) => has(c.ph) || has(c.img) || has(c.sn) || has(c.pt));
  m["review.camps"] = cov((c) => (c.soc?.[0] ?? 0) > 0);
  m["review.items"] = { value: sum((c) => c.soc?.[0]) };
  m["review.digest"] = cov((c) => (c.rv?.n ?? 0) > 0);
  m["video.camps"] = cov((c) => (c.soc?.[1] ?? 0) > 0);
  m["video.items"] = { value: sum((c) => c.soc?.[1]) };
  m["snsimg.items"] = { value: sum((c) => c.soc?.[2]) };
  m["booking.thankq"] = cov((c) => has(c.tq));
  m["booking.hidden_links"] = { value: stay.reduce((a, c) => a + (c.dl?.length ?? 0), 0) };
  m["nearby.camps"] = cov((c) => has(c.nl));
  m["quality.iq"] = { value: n ? Math.round((sum((c) => c.iq) / n) * 10) / 10 : 0 };
  return m;
}


// 한 줄에 하루(커밋 차이를 작게, 여러 발행이 겹쳐도 줄 단위로 합쳐지게)
const dumpHist = (h) => `{"updated_at":${JSON.stringify(h.updated_at ?? null)},"days":{\n${Object.entries(h.days ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => `${JSON.stringify(d)}:${JSON.stringify(v)}`).join(",\n")}\n}}\n`;
function saveHistory(date, metrics) {
  const h = read(OUT_HIST, { updated_at: null, days: {} });
  h.days ??= {};
  const prev = h.days[date] ?? {};
  h.days[date] = { ...prev, ...metrics }; // 같은 날은 새 값으로, 지난 날짜는 그대로
  h.updated_at = new Date().toISOString();
  h.days = Object.fromEntries(Object.entries(h.days).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUT_HIST, dumpHist(h));
  return h;
}
const flat = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.pct != null ? [v.value, v.pct] : v.value]));

function backfill() {
  const rel = "camping-atlas/public/explore/data/campgrounds.json";
  const log = execFileSync("git", ["log", "--format=%H %cd", "--date=format-local:%Y-%m-%d", "--", rel], { cwd: root, encoding: "utf8", env: { ...process.env, TZ: "Asia/Seoul" } }).trim().split("\n");
  const lastByDay = new Map();
  for (const line of log) { const [h, d] = line.split(" "); if (!lastByDay.has(d)) lastByDay.set(d, h); } // git log는 최신순 → 그날 마지막 커밋
  const hist = read(OUT_HIST, { days: {} });
  for (const [d, h] of [...lastByDay].sort()) {
    if (hist.days?.[d]?._full) continue; // 그날 전체 스냅샷이 있으면 두기
    let cat;
    try { cat = JSON.parse(execFileSync("git", ["show", `${h}:${rel}`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 })); } catch { continue; }
    if (!Array.isArray(cat)) cat = cat.campgrounds ?? [];
    saveHistory(d, { ...flat(catalogMetrics(cat)), _src: "backfill" });
    console.log(`백필 ${d} (${h.slice(0, 8)}) · ${cat.length}곳`);
  }
}

/** 날짜 목록 → { total, d1, d7, d30, byDay(전체 날짜) } — AI 분석·에이전트 작업량용 */
function volume(dates, today) {
  const t = Date.parse(today), byDay = {};
  let d1 = 0, d7 = 0, d30 = 0, total = 0;
  for (const s of dates) {
    const d = day(s); if (!d) continue;
    total++; byDay[d] = (byDay[d] ?? 0) + 1;
    const age = (t - Date.parse(d)) / 864e5;
    if (age <= 1) d1++; if (age <= 7) d7++; if (age <= 30) d30++;
  }
  return { total, d1, d7, d30, byDay: Object.fromEntries(Object.entries(byDay).sort()) };
}
/**
 * 사람이 아닌 일꾼(로컬 맥미니·CI 자동 수집·Claude·Codex)이 main에 남긴 커밋을 날짜별로 센다.
 * CI의 얕은 체크아웃이면 최근 35일만 더 받아 온다(실패하면 있는 만큼).
 */
function agentCommits(today) {
  const since = new Date(Date.parse(today) - 35 * 864e5).toISOString().slice(0, 10);
  try { if (execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: root, encoding: "utf8" }).trim() === "true") execFileSync("git", ["fetch", "-q", `--shallow-since=${since}`, "origin", "main"], { cwd: root, stdio: "ignore", timeout: 120000 }); } catch {}
  let raw = "";
  try { raw = execFileSync("git", ["log", "HEAD", `--since=${since}`, "--format=%x1e%cd%x1f%an%x1f%s%x1f%b", "--date=format-local:%Y-%m-%d"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, TZ: "Asia/Seoul" } }); } catch { return null; }
  const who = (an, sub, body) => {
    if (/macmini/i.test(sub)) return "macmini";
    if (/claude\//i.test(sub) || /Claude-Session|Co-Authored-By: Claude/i.test(body) || /^Claude$/i.test(an)) return "claude";
    if (/codex\//i.test(sub) || /^codex$/i.test(an) || /Co-Authored-By: Codex|codex@openai/i.test(body)) return "codex";
    if (/bot|github-actions/i.test(an) || /^chore\(data\)|bot\/data-/i.test(sub)) return "ci";
    return "human";
  };
  const out = { macmini: [], claude: [], codex: [], ci: [], human: [] };
  for (const rec of raw.split("\x1e").filter(Boolean)) {
    const [d, an, sub, body = ""] = rec.split("\x1f");
    if (/^Merge (pull request|branch|remote)/.test(sub) && !/(claude|codex|macmini)/i.test(sub)) continue; // 병합 커밋은 실제 작업이 아님
    out[who(an, sub, body)].push(d);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, volume(v, today)]));
}

function freshness(dates, today) {
  // 마지막 수집일 분포: 최근 30일 일별 개수 + 7일 이내·30일 이내·그보다 오래·기록 없음
  const t = Date.parse(today);
  const byDay = {};
  let d1 = 0, d7 = 0, d30 = 0, old = 0, never = 0;
  for (const s of dates) {
    const d = day(s);
    if (!d) { never++; continue; }
    const age = (t - Date.parse(d)) / 864e5;
    if (age <= 1) d1++;
    if (age <= 7) d7++; else if (age <= 30) d30++; else old++;
    if (age <= 30) byDay[d] = (byDay[d] ?? 0) + 1;
  }
  return { total: dates.length, d1, d7, d30, old, never, byDay: Object.fromEntries(Object.entries(byDay).sort()) };
}
const countBy = (arr, f) => arr.reduce((a, x) => { const k = f(x); if (k != null) a[k] = (a[k] ?? 0) + 1; return a; }, {});

function build() {
  const today = kstToday();
  const cat = read(join(DATA, "campgrounds.json"), []);
  const stay = cat.filter(isStay), stayIds = new Set(stay.map((c) => String(c.id)));
  const nStay = stay.length;
  const metrics = catalogMetrics(cat);
  const targets = read(P("pipeline/registry/collect-targets.json"), { targets: {} }).targets ?? {};

  // ── 상세 파일(후기·영상·사진·요금 언급 등) ──
  const platformOf = (u) => {
    const h = (() => { try { return new URL(u).hostname.replace(/^(www|m)\./, ""); } catch { return ""; } })();
    if (/blog\.naver\.com$/.test(h)) return "네이버 블로그";
    if (/cafe\.naver\.com$/.test(h)) return "네이버 카페";
    if (/kin\.naver\.com$/.test(h)) return "네이버 지식iN";
    if (/naver\.(com|me)$/.test(h)) return "네이버 기타";
    if (/cafe\.daum\.net$/.test(h)) return "다음 카페";
    if (/tistory\.com$/.test(h)) return "티스토리";
    if (/brunch\.co\.kr$/.test(h)) return "브런치";
    if (/daum\.net$|kakao\.com$/.test(h)) return "다음·카카오 기타";
    if (/youtube\.com$|youtu\.be$/.test(h)) return "YouTube";
    return "기타 웹";
  };
  const reviewSrc = {}, reviewSrcThumb = {}, videoKind = { 일반: 0, 숏츠: 0 }, videoHost = {};
  let reviewItems = 0, reviewThumb = 0, priceCamps = 0, priceItems = 0, layoutCamps = 0, rulesCamps = 0, checkinCamps = 0;
  let videoCampsPlayable = 0, videoPlayable = 0, shortCamps = 0, snsCamps = 0, snsImgs = 0, opCamps = 0, opSnips = 0;
  const videoPerCamp = [], reviewPerCamp = [];
  const socialDates = [], webDates = [], reviewYear = {}, videoYear = {};
  const files = existsSync(join(DATA, "camps")) ? readdirSync(join(DATA, "camps")).filter((f) => f.endsWith(".json")) : [];
  for (const f of files) {
    const id = f.slice(0, -5);
    if (!stayIds.has(id)) continue;
    const d = read(join(DATA, "camps", f), {});
    socialDates.push(d.social_checked_at ?? null);
    webDates.push(d.web_checked_at ?? null);
    let rc = 0;
    for (const k of ["reviews", "cafe", "web"]) for (const x of d[k] ?? []) {
      if (!x?.url) continue;
      rc++; reviewItems++;
      const s = platformOf(x.url);
      reviewSrc[s] = (reviewSrc[s] ?? 0) + 1;
      if (x.thumb) { reviewThumb++; reviewSrcThumb[s] = (reviewSrcThumb[s] ?? 0) + 1; }
      const y = String(x.date ?? "").slice(0, 4); if (/^20\d\d$/.test(y)) reviewYear[y] = (reviewYear[y] ?? 0) + 1;
    }
    reviewPerCamp.push(rc);
    let vc = 0, sc = 0;
    for (const v of d.videos ?? []) {
      const host = platformOf(v.url ?? (v.yt ? "https://youtube.com" : ""));
      videoHost[host] = (videoHost[host] ?? 0) + 1;
      const yt = v.yt || /youtube\.com|youtu\.be/.test(v.url ?? "");
      const ntv = /tv\.naver\.com\/(v|embed)\/\d+/.test(v.url ?? "");
      if (yt || ntv) {
        vc++; videoPlayable++;
        const short = v.kind === "short" || /\/shorts\//.test(v.url ?? "");
        if (short) { sc++; videoKind.숏츠++; } else videoKind.일반++;
        const y = String(v.date ?? "").slice(0, 4); if (/^20\d\d$/.test(y)) videoYear[y] = (videoYear[y] ?? 0) + 1;
      }
    }
    videoPerCamp.push(vc);
    if (vc) videoCampsPlayable++;
    if (sc) shortCamps++;
    if (d.sns_images?.length) { snsCamps++; snsImgs += d.sns_images.length; }
    if (d.prices?.length) { priceCamps++; priceItems += d.prices.length; }
    if (d.layout?.images?.length || d.layout?.posts?.length) layoutCamps++;
    if (d.house_rules?.length || (d.house_rules && Object.keys(d.house_rules).length)) rulesCamps++;
    if (d.operator_snippets?.length) { opCamps++; opSnips += d.operator_snippets.length; }
  }
  const dist = (arr, edges) => edges.map(([lo, hi, label]) => ({ label, n: arr.filter((x) => x >= lo && x <= hi).length }));
  // 상세 파일 기준 지표는 카탈로그 지표(review.items = 목록 soc 합)와 이름을 나눠 이력 비교가 섞이지 않게 한다.
  metrics["review.posts"] = { value: reviewItems };
  metrics["review.per_camp"] = { value: Math.round((reviewItems / Math.max(1, nStay)) * 10) / 10 };
  metrics["review.thumb"] = { value: reviewThumb, base: reviewItems, pct: pct(reviewThumb, reviewItems) };
  metrics["video.playable_camps"] = { value: videoCampsPlayable, base: nStay, pct: pct(videoCampsPlayable, nStay) };
  metrics["video.playable"] = { value: videoPlayable };
  metrics["video.per_camp"] = { value: Math.round((videoPlayable / Math.max(1, nStay)) * 10) / 10 };
  metrics["video.shorts"] = { value: videoKind.숏츠 };
  metrics["video.short_camps"] = { value: shortCamps, base: nStay, pct: pct(shortCamps, nStay) };
  metrics["snsimg.camps"] = { value: snsCamps, base: nStay, pct: pct(snsCamps, nStay) };
  metrics["snsimg.detail"] = { value: snsImgs };
  metrics["price.mentions"] = { value: priceCamps, base: nStay, pct: pct(priceCamps, nStay) };
  metrics["price.items"] = { value: priceItems };
  metrics["field.house_rules"] = { value: rulesCamps, base: nStay, pct: pct(rulesCamps, nStay) };
  metrics["operator.snippet_camps"] = { value: opCamps, base: nStay, pct: pct(opCamps, nStay) };
  metrics["operator.snippets"] = { value: opSnips };

  // ── 수집 기록(registry) ──
  const reg = (f) => read(P("pipeline/registry", f), {});
  const kp = reg("kakao-places.json").campgrounds ?? {}, np = reg("naver-places.json").campgrounds ?? {};
  const kpStay = Object.entries(kp).filter(([id]) => stayIds.has(id)), npStay = Object.entries(np).filter(([id]) => stayIds.has(id));
  metrics["place.kakao"] = { value: kpStay.filter(([, x]) => x?.place).length, base: nStay, pct: pct(kpStay.filter(([, x]) => x?.place).length, nStay) };
  metrics["place.naver"] = { value: npStay.filter(([, x]) => x?.place).length, base: nStay, pct: pct(npStay.filter(([, x]) => x?.place).length, nStay) };
  const ops = reg("operator-site-snippets.json").campgrounds ?? {};
  const opsStatus = countBy(Object.values(ops), (x) => x?.status ?? "UNKNOWN");
  const opsOk = Object.entries(ops).filter(([id, x]) => stayIds.has(id) && x?.status === "OK").length;
  const opsTried = Object.keys(ops).filter((id) => stayIds.has(id)).length;
  metrics["operator.ok"] = { value: opsOk, base: opsTried, pct: pct(opsOk, opsTried) };
  const lh = reg("link-health.json").urls ?? {};
  const lhStatus = countBy(Object.values(lh), (x) => x?.s ?? "UNKNOWN");
  const bv = reg("booking-verify.json").pairs ?? {};
  const bvStatus = countBy(Object.values(bv), (x) => x?.v ?? "UNKNOWN");
  const bvOk = (bvStatus.MATCH ?? 0) + (bvStatus.PORTAL ?? 0) + (bvStatus.MOVED ?? 0);
  const bvChecked = Object.values(bv).filter((x) => x?.v && x.v !== "UNVERIFIED").length;
  metrics["booking.verified"] = { value: bvOk, base: bvChecked, pct: pct(bvOk, bvChecked) };
  const shorts = reg("shorts-search.json").campgrounds ?? {};
  const shortsV2 = Object.entries(shorts).filter(([id, x]) => stayIds.has(id) && (x?.v ?? 1) >= 2);
  metrics["video.search_v2"] = { value: shortsV2.length, base: nStay, pct: pct(shortsV2.length, nStay) };
  const rt = reg("review-thumbs.json");
  const tq = reg("thankq.json");
  const tj = reg("text-judgments.json").texts ?? {}, pj = reg("photo-judgments.json").photos ?? {};
  const tjHidden = Object.values(tj).filter((x) => x && x.ok === false).length, pjHidden = Object.values(pj).filter((x) => x && x.ok === false).length;
  const trending = reg("trending-posts.json").posts ?? {};
  const nphotos = reg("nearby-photos.json").places ?? {};

  // 수집처(소스)별 신선도·일별 처리량
  const sources = [
    { id: "kakao-search", name: "카카오 Daum 검색(후기·카페·사진·영상)", how: "data-sync 매일 · 캠핑장당 7회 · 14일 순환", dates: socialDates },
    { id: "naver-search", name: "네이버 검색 API(블로그·카페·웹·지식iN)", how: "data-sync 매일 · 캠핑장당 7회 · 14일 순환", dates: webDates },
    { id: "youtube-v2", name: "YouTube 영상·숏츠(카카오 동영상 검색 v2)", how: "shorts-sync 매일 · 캠핑장당 3회 · 30일 순환", dates: [...stayIds].map((id) => shorts[id]?.fetched_at ?? null) },
    { id: "kakao-places", name: "카카오 로컬(플레이스 매칭)", how: "플레이스 매칭", dates: [...stayIds].map((id) => kp[id]?.checked_at ?? null) },
    { id: "naver-places", name: "네이버 지역 검색(플레이스 매칭)", how: "플레이스 매칭", dates: [...stayIds].map((id) => np[id]?.checked_at ?? null) },
    { id: "operator-site", name: "운영자 홈페이지 크롤(robots 준수)", how: "운영자 사이트 문장·사진", dates: [...stayIds].map((id) => ops[id]?.checked_at ?? null) },
    { id: "link-health", name: "링크 점검(404·DNS)", how: "link-check 주간", dates: Object.values(lh).map((x) => x?.at ?? null) },
    { id: "booking-verify", name: "예약 링크 정밀 검수(업장 일치)", how: "link-check 주간", dates: Object.values(bv).map((x) => x?.at ?? null) },
    { id: "thankq", name: "땡큐캠핑 사이트·요금", how: "thankq 동기화", dates: Object.values(tq.sites ?? {}).map((x) => x?.checked_at ?? null) },
    { id: "text-judge", name: "글 내용 판정(AI)", how: "content-judge", dates: Object.values(tj).map((x) => x?.at ?? null) },
    { id: "photo-judge", name: "사진 내용 판정(AI, CLIP)", how: "content-judge", dates: Object.values(pj).map((x) => x?.at ?? null) },
    { id: "nearby-photos", name: "주변 시설 사진", how: "nearby-photos", dates: Object.values(nphotos).map((x) => x?.at ?? null) },
    { id: "trending", name: "트렌드 글(인기 캠핑 글)", how: "trending 수집", dates: Object.values(trending).map((x) => x?.seen ?? null) },
  ].map((s) => ({ id: s.id, name: s.name, how: s.how, ...freshness(s.dates, today) }));

  // ── 품질·정합성 ──
  const q = read(P("data/quality/latest.json"), {});
  const ledger = (() => { try { return readFileSync(P("data/quality/ledger.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l)); } catch { return []; } })();
  const info = read(P("data/quality/info-score.json"), {});
  const rq = read(P("data/quality/review-queue.json"), {});
  const rqItems = Array.isArray(rq) ? rq : rq.items ?? rq.queue ?? [];
  metrics["quality.confidence"] = { value: q.totals?.mean_confidence ?? null };
  metrics["quality.confirmed_pct"] = { value: q.totals?.confirmed_pct ?? null };
  metrics["quality.conflicts"] = { value: q.totals?.conflicts ?? null };
  metrics["quality.facts"] = { value: q.totals?.facts ?? null };
  metrics["quality.corroborated"] = { value: q.totals?.corroborated ?? null };
  const iqs = stay.map((c) => Number(c.iq) || 0);
  const attrs = Object.entries(q.attrs ?? {}).map(([code, a]) => ({ code, label: a.label ?? null, coverage: a.coverage, coverage_pct: a.coverage_pct, confidence: a.mean_confidence, confirmed_pct: a.confirmed_pct, corroborated: a.corroborated, conflicts: a.conflicts, weak: a.weak }))
    .sort((a, b) => (a.confidence ?? 1) - (b.confidence ?? 1));
  const dictLabels = (() => { const dct = read(P("pipeline/registry/attribute-dictionary.json"), {}); const m = {}; for (const a of dct.attributes ?? dct.attrs ?? []) if (a?.code) m[a.code] = a.label ?? a.name_ko ?? a.name ?? null; return m; })();
  for (const a of attrs) a.label ??= dictLabels[a.code] ?? null;

  // ── 지역별(시도) 커버리지 ──
  const regions = {};
  for (const c of stay) {
    const r = regions[c.sido ?? "기타"] ??= { camps: 0, review: 0, video: 0, photo: 0, booking: 0, fee: 0, iq: 0 };
    r.camps++; if ((c.soc?.[0] ?? 0) > 0) r.review++; if ((c.soc?.[1] ?? 0) > 0) r.video++; if (c.ph || c.img) r.photo++;
    if (c.booking?.url || c.booking?.channels?.length) r.booking++; if (c.fee) r.fee++; r.iq += Number(c.iq) || 0;
  }
  for (const r of Object.values(regions)) r.iq = Math.round((r.iq / r.camps) * 10) / 10;

  // ── 이력·속도·목표 ──
  // 품질 장부(data/quality/ledger.ndjson)의 지난 날짜도 이력에 넣는다(비어 있을 때만).
  {
    const h0 = read(OUT_HIST, { days: {} }); h0.days ??= {};
    let changed = false;
    for (const l of ledger) {
      if (!l?.date || l.date === today || !l.totals) continue;
      const d = (h0.days[l.date] ??= {});
      for (const [k, v] of [["quality.confidence", l.totals.mean_confidence], ["quality.confirmed_pct", l.totals.confirmed_pct], ["quality.conflicts", l.totals.conflicts], ["quality.facts", l.totals.facts], ["quality.corroborated", l.totals.corroborated]]) if (d[k] == null && v != null) { d[k] = v; changed = true; }
    }
    if (changed) writeFileSync(OUT_HIST, dumpHist(h0));
  }
  const hist = saveHistory(today, { ...flat(metrics), _full: true });
  const dates = Object.keys(hist.days).sort();
  const valOf = (d, k) => { const v = hist.days[d]?.[k]; return Array.isArray(v) ? v[0] : v; };
  const pctOf = (d, k) => { const v = hist.days[d]?.[k]; return Array.isArray(v) ? v[1] : null; };
  const ago = (n) => { const t = Date.parse(today) - n * 864e5; return [...dates].reverse().find((d) => Date.parse(d) <= t) ?? null; };
  for (const [k, m] of Object.entries(metrics)) {
    const y = ago(1), w = ago(7);
    m.d1 = y && valOf(y, k) != null ? Math.round((m.value - valOf(y, k)) * 10) / 10 : null;
    m.d7 = w && valOf(w, k) != null ? Math.round((m.value - valOf(w, k)) * 10) / 10 : null;
    const span = w ? (Date.parse(today) - Date.parse(w)) / 864e5 : 0;
    m.rate = m.d7 != null && span ? Math.round((m.d7 / span) * 10) / 10 : null; // 하루 평균 증가(최근 7일)
    if (m.pct != null && w && pctOf(w, k) != null) m.pct_d7 = Math.round((m.pct - pctOf(w, k)) * 10) / 10;
    const t = targets[k];
    if (t) {
      m.target = t;
      const goal = t.pct ?? t.count ?? t.per_camp ?? t.value ?? null;
      const cur = t.pct != null ? m.pct : m.value;
      if (goal != null && cur != null) {
        m.progress = t.max != null ? null : Math.min(100, Math.round((cur / goal) * 1000) / 10);
        // 목표까지 남은 양 ÷ 하루 증가 → 예상 일수
        if (t.pct != null && m.base && m.rate > 0) m.eta_days = Math.max(0, Math.ceil(((goal / 100) * m.base - m.value) / m.rate));
        else if ((t.count != null || t.value != null || t.per_camp != null) && m.rate > 0) m.eta_days = Math.max(0, Math.ceil((goal - m.value) / m.rate));
      }
      if (t.max != null && m.value != null) m.progress = m.value <= t.max ? 100 : Math.round((t.max / m.value) * 1000) / 10;
    }
  }

  // ── AI 분석량(로컬 모델·CI) · 에이전트 작업량 ──
  const decisions = (() => { try { return readFileSync(P("data/quality/decisions.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l)); } catch { return []; } })();
  const board = (() => { try { return readFileSync(P("data/board/board.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l)); } catch { return []; } })();
  const nearbyAll = Object.values(nphotos);
  const ai = {
    analyses: [
      { id: "text-judge", name: "글 내용 판정", engine: `로컬·CI 언어 모델(${reg("text-judgments.json").model ?? "e5"})`, what: "후기·카페·웹문서 글이 이 캠핑장 이야기인지(식당·광고·무관 주제 숨김)", ...volume(Object.values(tj).map((x) => x?.at), today), hidden: tjHidden },
      { id: "photo-judge", name: "사진 내용 판정", engine: `로컬·CI 비전 모델(${reg("photo-judgments.json").model ?? "CLIP"})`, what: "검색 사진이 캠핑장 사진인지(음식·인물·글 캡처 제외)", ...volume(Object.values(pj).map((x) => x?.at), today), hidden: pjHidden },
      { id: "nearby-vision", name: "주변시설 사진 판독", engine: "로컬 맥미니(Apple Vision 간판 글자 + 비전 모델)", what: "주변 시설 사진이 그 가게·시설이 맞는지", ...volume(nearbyAll.map((x) => x?.at), today), found: nearbyAll.filter((x) => !x?.none).length },
      { id: "quality-decide", name: "충돌 판정(원문 대조)", engine: "에이전트(Claude·Codex)", what: "원천끼리 엇갈린 값을 원문과 대조해 판정", ...volume(decisions.map((x) => x?.at), today) },
    ],
    agents: agentCommits(today),
    board: Object.fromEntries(Object.entries(countBy(board, (x) => String(x.agent ?? "?").toLowerCase().replace(/^codex.*/, "codex"))).map(([k]) => [k, volume(board.filter((x) => String(x.agent ?? "?").toLowerCase().replace(/^codex.*/, "codex") === k).map((x) => x.at), today)])),
  };

  const out = {
    generated_at: new Date().toISOString(),
    date: today,
    universe: { all: cat.length, camps: nStay, dayuse: cat.length - nStay, detail_files: files.length },
    metrics,
    reviews: { by_source: reviewSrc, thumb_by_source: reviewSrcThumb, by_year: reviewYear, per_camp: dist(reviewPerCamp, [[0, 0, "0"], [1, 4, "1~4"], [5, 9, "5~9"], [10, 19, "10~19"], [20, 49, "20~49"], [50, 1e9, "50+"]]), thumbs_registry: Object.keys(rt.thumbs ?? {}).length, thumbs_miss: Object.keys(rt.miss ?? {}).length },
    videos: { kind: videoKind, by_host: videoHost, by_year: videoYear, per_camp: dist(videoPerCamp, [[0, 0, "0"], [1, 2, "1~2"], [3, 5, "3~5"], [6, 9, "6~9"], [10, 19, "10~19"], [20, 1e9, "20+"]]) },
    sources,
    status: { operator_site: opsStatus, link_health: lhStatus, booking_verify: bvStatus },
    judgments: { texts: Object.keys(tj).length, texts_hidden: tjHidden, photos: Object.keys(pj).length, photos_hidden: pjHidden },
    quality: { totals: q.totals ?? null, attrs, ledger: ledger.map((l) => ({ date: l.date, ...l.totals })), review_queue: rqItems.length, review_queue_by_attr: countBy(rqItems, (x) => x.label ?? x.attr), review_queue_top: rqItems.slice(0, 20).map((x) => ({ id: x.cid, name: x.name ?? null, attr: x.label ?? x.attr ?? null, values: [x.top, x.rival].filter(Boolean).map((v) => ({ v: v.value, c: v.confidence, n: v.sources })) })) },
    info_score: { mean: metrics["quality.iq"].value, dist: dist(iqs, [[0, 19, "0~19"], [20, 39, "20~39"], [40, 59, "40~59"], [60, 79, "60~79"], [80, 100, "80~100"]]), next_priorities: (info.next_priorities ?? []).slice(0, 15) },
    regions,
    ai,
    targets_updated_at: read(P("pipeline/registry/collect-targets.json"), {}).updated_at ?? null,
  };
  writeFileSync(OUT_STATS, `${JSON.stringify(out)}\n`);
  console.log(`수집 현황: 캠핑장 ${nStay} · 지표 ${Object.keys(metrics).length} · 수집처 ${sources.length} · 이력 ${dates.length}일 → ${OUT_STATS}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--backfill")) backfill();
  else build();
}
