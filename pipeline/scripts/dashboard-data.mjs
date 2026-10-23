#!/usr/bin/env node
// ‘모여라캠핑 수집 현황’ 대시보드(claude.ai 아티팩트)의 데이터 파일 3개를 만든다. 매일 예약 작업(Claude 세션)이 실행해 대시보드에 올린다.
//   node pipeline/scripts/dashboard-data.mjs <출력 폴더>
// 출력: coverage.json(항목별 정보 보유 캠핑장 수·하루 전 대비), counters.json(네이버 호출량·사진/글 판정·정보량 점수),
//       steps.json(매일 데이터 동기화·운영자 홈페이지 읽기의 최근 실행 단계, GitHub 공개 API)
// 2026-10-23: 대시보드가 10월 19일 값에서 멈춤 — 수집 세션이 손으로 올리던 파일이라 세션이 끝나자 갱신이 끊겼다. 이 스크립트 + 예약 작업으로 대체.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const out = resolve(process.argv[2] ?? join(root, "pipeline/out/dashboard"));
mkdirSync(out, { recursive: true });
const readJson = (p, d = null) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 }).trim();

// 1) 항목별 커버리지: 지금(report-coverage.mjs 규칙) vs 하루 전 main
const metaPath = join(root, "camping-atlas/public/explore/data/meta.json");
const metaBefore = readFileSync(metaPath, "utf8");
execFileSync(process.execPath, [join(root, "pipeline/scripts/report-coverage.mjs")], { cwd: root, stdio: "ignore" });
const cur = JSON.parse(readFileSync(metaPath, "utf8")).coverage;
writeFileSync(metaPath, metaBefore); // 저장소 파일은 그대로 둔다
let prev = null;
try {
  const c = git("rev-list", "-1", `--before=${new Date(Date.now() - 24 * 3600e3).toISOString()}`, "HEAD");
  prev = JSON.parse(git("show", `${c}:camping-atlas/public/explore/data/meta.json`)).coverage;
} catch { /* 얕은 클론이면 하루 전 값 없음 */ }
const LABEL = { price: "1박 요금", checkin: "입실", checkout: "퇴실", manner: "매너타임", extra_fee: "추가 요금", refund: "환불", parking: "주차", power_w: "전기 W", site_types: "사이트 타입", reviews: "후기·게시글", rich5: "9개 중 5개 이상" };
const coverage = Object.entries(cur.fields).map(([field, v]) => {
  const b = prev?.fields?.[field]?.any ?? null;
  return { field, label: LABEL[field] ?? field, camps: v.any, confirmed: v.confirmed, baseline: b, change: b == null ? null : v.any - b, goal: cur.goal, to_goal: Math.max(0, cur.goal - v.any), total: cur.total };
});

// 2) 카운터
const nu = readJson(join(root, "pipeline/registry/naver-usage.json"), {});
const month = new Date().toISOString().slice(0, 7), m = nu.months?.[month] ?? { calls: 0, runs: 0 };
const free = nu.free_quota_monthly ?? 775000, daily = nu.last_free_check?.daily_limit ?? 25000;
const pj = Object.values(readJson(join(root, "pipeline/registry/photo-judgments.json"), {}).photos ?? {});
const tj = Object.values(readJson(join(root, "pipeline/registry/text-judgments.json"), {}).texts ?? {});
const iq = readJson(join(root, "data/quality/info-score.json"), null);
const counters = [
  { key: "naver_month", label: "네이버 검색 API 이번 달", value: m.calls, max: Math.floor(free / 2), unit: "건", note: `무료 한도 ${free.toLocaleString()}건의 절반까지만 씁니다. 이번 달 ${m.runs}회 실행${m.last_run_at ? `, 마지막 ${String(m.last_run_at).slice(0, 10)}` : ""}.` },
  { key: "naver_daily_cap", label: "웹 언급 1회 평균 호출", value: m.runs ? Math.round(m.calls / m.runs) : 0, max: Math.floor(daily / 2), unit: "건/회", note: `하루 한도 ${daily.toLocaleString()}건의 절반이 상한입니다.` },
  { key: "ocr_sample", label: "후기 사진·글 내용 판정", value: pj.length + tj.length, max: pj.length + Math.max(tj.length, 49000), unit: "건", note: `사진 ${pj.length.toLocaleString()}장(숨김 ${pj.filter((x) => !x.ok).length}) · 글 ${tj.length.toLocaleString()}건(숨김 후보 ${tj.filter((x) => !x.ok).length}). 남은 글은 매주 2만 건씩 판정합니다.${iq ? ` 정보량 점수 중앙값 ${iq.distribution.median} · 상위 10% ${iq.distribution.p90}.` : ""}` },
];

// 3) 워크플로 단계(GitHub 공개 API, 인증 없음)
const KO = { "Sync GoCamping (skips when the key secret is not set)": "고캠핑 동기화", "Sync official campground images (webp)": "공식 사진(webp) 동기화", "Build OSM extract from Geofabrik (weekly)": "OSM 추출(주간)", "Sync public toilets and link to campgrounds": "공중화장실 연결", "Sync campground social search (Kakao Daum blog/cafe/image/video)": "카카오 블로그·카페·이미지·영상", "Sync web mentions (NAVER search blog·cafe·web·kin + robots-allowed blog text)": "네이버 웹 언급·허용 본문", "Publish collected web mentions to the site now (incremental)": "웹 언급 즉시 발행", "Sync rest areas and drowsy shelters": "휴게소·졸음쉼터", "Collect nearby context (TourAPI tourism/food, OSM marts/fuel/medical, rest stops)": "주변 관광·음식·편의", "Collect official fee notes (TourAPI) and match to GoCamping": "관광공사 요금 안내", "Collect official products & photos (TourAPI stay/campsite) and match to GoCamping": "관광공사 상품·사진", "Collect Seoul public reservation status (camping)": "서울 공공 예약 현황", "Collect campground licences (LOCALDATA) and match to GoCamping": "LOCALDATA 인허가", "Migrate PostgreSQL and import the full source snapshot": "PostgreSQL 적재", "Build and publish the refreshed public catalog and explorer": "카탈로그·탐색 데이터 발행", "Load the fact store into the throwaway PostgreSQL (twice)": "사실 저장소 적재 검증", "Discover places and homepages (Kakao official API)": "카카오로 장소·홈페이지 찾기", "Match Naver local places (NAVER API HUB)": "네이버 지역 검색 매칭", "Read operator homepages": "운영자 홈페이지 읽기", "Commit refreshed snippets": "문장 커밋", "Publish operator facts to the site now (incremental)": "즉시 발행" };
const SKIP = /^(Set up job|Initialize containers|Run actions\/|Post |Stop containers|Complete job|Run npm|Run node --test|Run npx|Check |Plan |Restore |Week key|Check out|Save collected|Discover free|Load today|Install |Commit place|Publish the media)/;
// curl을 쓴다: node fetch는 HTTPS_PROXY를 따르지 않아 클라우드 세션에서 403이 난다(2026-10-23). GITHUB_TOKEN이 있으면 붙인다(호출 한도).
const api = async (p) => {
  const args = ["-sS", "-m", "30", "-H", "accept: application/vnd.github+json", "-H", "user-agent: moyeora-dashboard", ...(process.env.GITHUB_TOKEN ? ["-H", `authorization: Bearer ${process.env.GITHUB_TOKEN}`] : []), `https://api.github.com/repos/pyw31337/camp${p}`];
  const j = JSON.parse(execFileSync("curl", args, { encoding: "utf8", maxBuffer: 32 << 20 }));
  if (j.message && !j.workflow_runs && !j.jobs) throw new Error(`GitHub API: ${j.message}`);
  return j;
};
const S = (st, c) => (st === "in_progress" ? "진행 중" : st !== "completed" ? "대기" : c === "success" ? "완료" : c === "skipped" ? "건너뜀" : "실패");
const now = new Date();
const steps = [];
for (const [wf, file] of [["매일 데이터 동기화", "data-sync.yml"], ["운영자 홈페이지 읽기", "operator-sites.yml"]]) {
  try {
    const run = (await api(`/actions/workflows/${file}/runs?branch=main&per_page=1`)).workflow_runs?.[0];
    if (!run) continue;
    const jobs = (await api(`/actions/runs/${run.id}/jobs`)).jobs ?? [];
    for (const j of jobs) for (const s of j.steps ?? []) {
      if (SKIP.test(s.name)) continue;
      const st = s.started_at ?? null, en = s.completed_at ?? null;
      steps.push({ workflow: wf, key: `${wf}#${s.number}`, step: KO[s.name] ?? s.name, status: S(s.status, s.conclusion), started_at: st ?? run.run_started_at, completed_at: en, minutes: st ? Math.round((((en ? new Date(en) : now) - new Date(st)) / 60000) * 10) / 10 : 0, run_status: run.status, run_started_at: run.run_started_at, run_url: run.html_url });
    }
  } catch (e) { console.log(`::warning::${wf} 단계 읽기 실패: ${e.message}`); }
}

for (const [n, v] of Object.entries({ coverage, counters, steps })) writeFileSync(join(out, `${n}.json`), JSON.stringify(v));
console.log(`대시보드 데이터: ${out} — coverage ${coverage.length} · counters ${counters.length} · steps ${steps.length}${prev ? "" : " (하루 전 기준값 없음)"}`);
