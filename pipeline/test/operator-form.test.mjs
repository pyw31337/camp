import test from "node:test";
import assert from "node:assert/strict";

test("운영자 셀프 등록: 값 정리·승인분만 공개·사실 행", async () => {
  const { normalizeFields, publicItem, operatorFormFacts } = await import("../lib/operator-form.mjs");
  const { readFileSync } = await import("node:fs");
  assert.equal(readFileSync(new URL("../lib/operator-form.mjs", import.meta.url), "utf8"), readFileSync(new URL("../../camping-atlas/public/operator/rules.js", import.meta.url), "utf8"), "화면 사본(public/operator/rules.js)을 같이 고치세요");
  assert.deepEqual(normalizeFields({ CHECKIN_TIME: "14:00", CHECKOUT_TIME: "11시", PRICE_NIGHT: "45,000원", PET_POLICY: "SMALL_ONLY", HOMEPAGE: "javascript:alert(1)", MANNER_TIME: "  22:00~07:00 ", X: 1 }),
    { CHECKIN_TIME: "14:00", CHECKOUT_TIME: "11:00", MANNER_TIME: "22:00~07:00", PRICE_NIGHT: 45000, PET_POLICY: "SMALL_ONLY" });
  const row = { id: 3, campground_id: "483", kind: "UPDATE", status: "APPROVED", submitter_role: "OWNER", contact: "010-0000-0000", submitter_name: "홍길동", fields: { CHECKIN_TIME: "15:00" }, evidence_url: "https://ex.com/notice", created_at: "2026-10-19T00:00:00Z", reviewed_at: "2026-10-20T00:00:00Z" };
  const it = publicItem(row);
  assert.equal(JSON.stringify(it).includes("010-0000"), false);
  assert.equal(JSON.stringify(it).includes("홍길동"), false);
  assert.equal(publicItem({ ...row, status: "PENDING" }), null);
  const facts = operatorFormFacts([it, { ...it, id: 4, at: "2026-10-21T00:00:00.000Z", fields: { CHECKIN_TIME: "14:00" } }]);
  assert.equal(facts.length, 1);
  assert.equal(facts[0].value, "14:00");
  assert.equal(facts[0].grade, "OPERATOR");
  assert.equal(facts[0].src, "operator_form");
  const { validateFacts } = await import("../lib/fact-store.mjs");
  assert.deepEqual(validateFacts(facts), []);
});

test("운영자 폼: 미끼 칸·동의·연락처 검사", async () => {
  globalThis.document ??= undefined;
  const { rowFrom } = await import("../../camping-atlas/public/operator/form.js");
  const fd = (o) => ({ get: (k) => o[k] ?? null });
  const base = { cid: "483", cname: "금원산", role: "OWNER", name: "김", contact: "010-1234-5678", consent: "on", f_CHECKIN_TIME: "14:00" };
  assert.equal(rowFrom(fd({ ...base, website: "spam" })).error, "보내지 못했어요.");
  assert.match(rowFrom(fd({ ...base, consent: null })).error, /동의/);
  assert.match(rowFrom(fd({ ...base, f_CHECKIN_TIME: "" })).error, /하나 이상/);
  const { row } = rowFrom(fd(base));
  assert.deepEqual(row.fields, { CHECKIN_TIME: "14:00" });
  assert.equal(row.kind, "UPDATE"); assert.equal(row.consent, true); assert.equal(row.campground_id, "483");
});
