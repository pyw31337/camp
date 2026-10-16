// 사실 저장소 → SQLite 파일(node:sqlite). 에이전트가 SQL로 조건을 조합해 볼 때 쓴다.
// 스키마는 db/010_campground_fact_store.sql(PostgreSQL)과 같은 열 이름을 쓴다.
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const SQLITE_SCHEMA = `
CREATE TABLE campground (cid TEXT PRIMARY KEY, name TEXT NOT NULL, sido TEXT, sigungu TEXT, lat REAL, lng REAL, gc_url TEXT, gc_at TEXT, kakao_place_id TEXT);
CREATE TABLE attribute (code TEXT PRIMARY KEY, grp TEXT NOT NULL, label TEXT NOT NULL, type TEXT NOT NULL, unit TEXT, filter TEXT, pref TEXT, enum_json TEXT, note TEXT);
CREATE TABLE fact (
  id INTEGER PRIMARY KEY,
  cid TEXT NOT NULL REFERENCES campground(cid),
  attr TEXT NOT NULL REFERENCES attribute(code),
  value_json TEXT NOT NULL,      -- 원래 타입 그대로(JSON)
  value_num REAL,                -- 숫자·불리언(1/0) 조회용
  value_text TEXT,               -- enum 키·시각·문자열 조회용
  grade TEXT NOT NULL CHECK (grade IN ('VERIFIED','OPERATOR','CONFIRMED','MENTION')),
  grade_rank INTEGER NOT NULL,
  src TEXT NOT NULL, url TEXT, observed_at TEXT, quote TEXT, display TEXT,
  mentions INTEGER, period TEXT, label TEXT, extra_num REAL
);
CREATE INDEX fact_attr_idx ON fact (attr, value_num, value_text);
CREATE INDEX fact_cid_idx ON fact (cid, attr);
-- 캠핑장·속성마다 가장 높은 등급의 값들(같은 등급의 여러 값은 모두)
CREATE VIEW fact_best AS
  SELECT f.* FROM fact f
  JOIN (SELECT cid, attr, MAX(grade_rank) r FROM fact GROUP BY cid, attr) b ON b.cid = f.cid AND b.attr = f.attr AND b.r = f.grade_rank;
`;

export function writeSqlite(path, { registry, facts, attributes }) {
  mkdirSync(dirname(path), { recursive: true });
  rmSync(path, { force: true });
  const db = new DatabaseSync(path);
  db.exec(SQLITE_SCHEMA);
  db.exec("BEGIN");
  const c = db.prepare("INSERT INTO campground VALUES (?,?,?,?,?,?,?,?,?)");
  for (const r of registry) c.run(r.cid, r.name, r.sido, r.sigungu, r.lat, r.lng, r.gc_url, r.gc_at, r.kakao_place_id);
  const a = db.prepare("INSERT INTO attribute VALUES (?,?,?,?,?,?,?,?,?)");
  for (const x of attributes) a.run(x.code, x.group, x.label, x.type, x.unit ?? null, x.filter ?? null, x.pref ?? null, x.enum ? JSON.stringify(x.enum) : null, x.note ?? null);
  const rank = { VERIFIED: 4, OPERATOR: 3, CONFIRMED: 2, MENTION: 1 };
  const f = db.prepare("INSERT INTO fact (cid,attr,value_json,value_num,value_text,grade,grade_rank,src,url,observed_at,quote,display,mentions,period,label,extra_num) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const x of facts) {
    const v = x.value;
    const num = typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : null;
    const txt = typeof v === "string" ? v : null;
    f.run(x.cid, x.attr, JSON.stringify(v), num, txt, x.grade, rank[x.grade], x.src, x.url ?? null, x.at ?? null, x.quote ?? null, x.text ?? null, x.n ?? null, x.period == null ? null : typeof x.period === "string" ? x.period : JSON.stringify(x.period), x.label ?? null, x.num ?? x.count ?? null);
  }
  db.exec("COMMIT");
  db.close();
}
