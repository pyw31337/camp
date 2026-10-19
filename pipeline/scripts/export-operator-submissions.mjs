// 승인된 운영자 셀프 등록을 공개 registry로 내보낸다(연락처·제출자 이름은 내보내지 않음).
// 사용: DATABASE_URL=... node scripts/export-operator-submissions.mjs   (없으면 아무것도 바꾸지 않고 끝)
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { publicItem } from "../lib/operator-form.mjs";

const out = fileURLToPath(new URL("../registry/operator-submissions.json", import.meta.url));
if (!process.env.DATABASE_URL) { console.log("DATABASE_URL 없음 — 건너뜀"); process.exit(0); }
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
  console.log(`제출 현황: ${counts.rows.map((r) => `${r.status}/${r.kind} ${r.n}`).join(", ") || "없음"}`);
} finally { await pool.end(); }
