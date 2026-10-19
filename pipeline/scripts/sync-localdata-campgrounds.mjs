// LOCALDATA 일반야영장업·자동차야영장업 인허가 수집 → 정규화 → 고캠핑 시설과 매칭 → out/localdata-campgrounds.json
// 키 불필요(공개 파일). 업종 페이지 slug는 추정값을 먼저 쓰고, 실패하면 사이드바 목록에서 ‘camp’ 업종을 찾는다.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import { downloadLocaldata, LOCALDATA_BASE } from "../lib/localdata.mjs";
import { matchLicenses, normalizeLicense } from "../lib/localdata-campgrounds.mjs";

const out = fileURLToPath(new URL("../out/", import.meta.url));
await mkdir(out, { recursive: true });
const fetchedAt = toKstIso(nowInKst());
const warn = (title, msg) => console.log(`::warning title=${title}::${msg}`);

const KINDS = [
  { kind: "GENERAL", guesses: ["general_campgrounds", "general_campground"], re: /general.*camp/, file: /일반야영장/ },
  { kind: "AUTO", guesses: ["auto_campgrounds", "auto_campground"], re: /auto.*camp/, file: /자동차야영장/ },
];
let sidebar = null;
async function discover() {
  if (sidebar) return sidebar;
  try { sidebar = (await downloadLocaldata("public_restroom_info", { pick: () => false })).slugs; } catch (e) { sidebar = e.slugs ?? []; }
  console.log(`사이드바 업종 중 camp: ${sidebar.filter((s) => /camp/.test(s)).join(", ") || "없음"}`);
  return sidebar;
}

const records = [];
const sources = [];
for (const k of KINDS) {
  let got = null;
  const tried = [];
  for (const slug of [...k.guesses, ...(await discover()).filter((s) => k.re.test(s) && !k.guesses.includes(s))]) {
    try { got = { slug, ...(await downloadLocaldata(slug, { pick: (n) => k.file.test(n), log: console.log })) }; break; } catch (e) { tried.push(`${slug}: ${e.message.slice(0, 160)}`); }
  }
  if (!got) { warn(`LOCALDATA ${k.kind} 실패`, tried.join(" / ")); continue; }
  const norm = got.rows.map((r) => normalizeLicense(r, k.kind)).filter(Boolean);
  console.log(`${k.kind}: ${got.slug} → ${got.rows.length}행, 정규화 ${norm.length} (좌표 ${norm.filter((r) => r.lat != null).length}, 영업 ${norm.filter((r) => r.status === "OPERATING").length}, 폐업 ${norm.filter((r) => r.status === "CLOSED").length})`);
  if (got.rows[0]) console.log(`  머리글: ${Object.keys(got.rows[0]).join(", ")}`);
  records.push(...norm);
  sources.push({ kind: k.kind, page_url: got.pageUrl, download_url: `${LOCALDATA_BASE}${got.downloadPath}`, rows: got.rows.length });
}

let matched = records.map((r) => ({ ...r, match: { state: "NEW", flags: [] } }));
const campPath = `${out}campgrounds.json`;
if (existsSync(campPath) && records.length) {
  const { campgrounds } = JSON.parse(await readFile(campPath, "utf8"));
  const gc = campgrounds.map((c) => ({ id: String(c.external_id.id), name: c.name, lat: c.location?.lat ?? null, lng: c.location?.lng ?? null,
    address: [c.address?.line1, c.address?.line2].filter(Boolean).join(" "), phone: c.contact?.tel ?? null, status: c.status_text ?? null,
    licensed_on: c.registry?.licensed_on ?? null, business_no: c.registry?.business_no ?? null }));
  matched = matchLicenses(records, gc);
} else if (records.length) warn("매칭 건너뜀", "out/campgrounds.json이 없습니다(고캠핑 동기화가 먼저 필요).");

const stat = (f) => matched.filter(f).length;
const stats = {
  total: matched.length,
  operating: stat((r) => r.status === "OPERATING"),
  matched: stat((r) => r.match.state === "MATCHED"),
  needs_review: stat((r) => r.match.state === "NEEDS_REVIEW"),
  hidden_candidates: stat((r) => r.match.flags.includes("HIDDEN_CANDIDATE")),
  closed_but_listed: stat((r) => r.match.flags.includes("LICENSE_CLOSED_BUT_LISTED")),
  license_date_same: stat((r) => r.match.evidence?.license_date_same === true),
};
console.log(`매칭: ${JSON.stringify(stats)}`);
await writeFile(`${out}localdata-campgrounds.json`, JSON.stringify({
  fetched_at: fetchedAt, sources, tier: "A",
  notes: "인허가 원천(행정안전부 LOCALDATA). 좌표는 EPSG:5174 변환(수 m 오차). 매칭 0.9 이상 자동 연결, 0.6~0.9 검수, 미만은 숨은 후보.",
  stats, records: matched,
}));
