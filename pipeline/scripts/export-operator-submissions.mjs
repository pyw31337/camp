// 승인된 운영자 셀프 등록을 공개 registry로 내보낸다(연락처·제출자 이름은 내보내지 않음).
// 사용: DATABASE_URL=... node scripts/export-operator-submissions.mjs   (없으면 아무것도 바꾸지 않고 끝)
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { publicItem } from "../lib/operator-form.mjs";

const out = fileURLToPath(new URL("../registry/operator-submissions.json", import.meta.url));
if (!process.env.DATABASE_URL) { console.log("DATABASE_URL 없음 — 건너뜀"); process.exit(0); }
function writeIfChanged(path, body) {
  const prev = existsSync(path) ? readFileSync(path, "utf8") : "";
  const next = `${JSON.stringify(body)}\n`;
  if (prev !== next) { writeFileSync(path, next); console.log(`갱신 → ${path}`); }
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
try {
  const exists = await pool.query("SELECT to_regclass('public.operator_submission') AS t");
  if (!exists.rows[0].t) { console.log("operator_submission 표가 아직 없음(db/015 적용 전) — 건너뜀"); process.exit(0); }
  const { rows } = await pool.query("SELECT id, campground_id, kind, submitter_role, fields, evidence_url, status, created_at, reviewed_at FROM public.operator_submission WHERE status = 'APPROVED' ORDER BY id");
  const counts = await pool.query("SELECT status, kind, count(*)::int AS n FROM public.operator_submission GROUP BY 1, 2 ORDER BY 1, 2");
  const items = rows.map(publicItem).filter(Boolean);
  const prev = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
  if (prev && JSON.stringify(prev.items) === JSON.stringify(items)) { console.log(`변경 없음(승인 ${items.length}건)`); }
  else {
    writeFileSync(out, `${JSON.stringify({ generated_at: new Date().toISOString(), note: "운영자 셀프 등록 중 소유자가 승인한 것(연락처 제외). export-operator-submissions.mjs가 만든다.", items }, null, 1)}\n`);
    console.log(`승인 ${items.length}건 → ${out}`);
  }
  // 공개 파일 2개(화면이 읽는다, 연락처·이름 없음):
  // - takedowns.json: 승인된 내리기 요청(kind TAKEDOWN)의 대상 주소 → 화면에서 그 사진·글을 뺀다(db/027).
  // - operator-verified.json: 운영자가 직접 등록해 승인된 캠핑장 id → ‘운영자 확인’ 배지.
  const pub = fileURLToPath(new URL("../../camping-atlas/public/explore/data/", import.meta.url));
  const td = await pool.query("SELECT campground_id, fields->>'TARGET_URL' AS url, reviewed_at FROM public.operator_submission WHERE status = 'APPROVED' AND kind = 'TAKEDOWN' ORDER BY id");
  const tdItems = td.rows.filter((r) => /^https?:\/\//.test(r.url ?? "")).map((r) => ({ cid: String(r.campground_id), url: r.url, at: new Date(r.reviewed_at ?? Date.now()).toISOString().slice(0, 10) }));
  writeIfChanged(`${pub}takedowns.json`, { note: "권리자 요청으로 내린 사진·글 주소(소유자 승인분). export-operator-submissions.mjs", items: tdItems });
  writeIfChanged(`${pub}operator-verified.json`, { note: "운영자가 직접 등록해 승인된 캠핑장. export-operator-submissions.mjs", cids: [...new Set(items.map((it) => it.cid))].sort() });
  console.log(`제출 현황: ${counts.rows.map((r) => `${r.status}/${r.kind} ${r.n}`).join(", ") || "없음"}`);
} finally { await pool.end(); }
