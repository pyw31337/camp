import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  gocampingTel, maskTel, validBizNo, formatBizNo, bizNameMatch, parseNtsStatus,
  decideBizOwnership, mockNtsStatus, preflightPhoto, TEST_BIZ, campSiteTypes, isPreviewHost,
} from "../lib/operator-photo-verify.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

assert.equal(gocampingTel({ tel: "041-532-0106" }), "041-532-0106");
assert.equal(gocampingTel({ tel: "010-1234-5678", tel_src: "kakao" }), "");
assert.equal(gocampingTel({ tel_src: "naver", tel: "0507-000-0000" }), "");
assert.equal(gocampingTel({ tel: "010-3436-7676", tel_src: { by: "kakao" } }), "");
assert.deepEqual(campSiteTypes({ st: [["PITCH", 24, "c", null], ["AUTO", null, "m", null]] }), ["PITCH", "AUTO"]);
assert.deepEqual(campSiteTypes({ st: ["DECK", "HOUSE"] }), ["DECK", "HOUSE"]);
assert.equal(gocampingTel({}), "");

assert.equal(maskTel("041-532-0106"), "041-532-****");
assert.equal(maskTel("010-1234-5678"), "010-1234-****");
assert.equal(maskTel("02-123-4567"), "02-123-****");
assert.ok(!maskTel("12").includes("*"));

assert.equal(validBizNo(TEST_BIZ.ok), true);
assert.equal(validBizNo(TEST_BIZ.closed), true);
assert.equal(validBizNo(TEST_BIZ.suspended), true);
assert.equal(validBizNo("123-45-67890"), false);
assert.equal(formatBizNo("1234567891"), "123-45-67891");

assert.equal(bizNameMatch("선장포노을캠핑장", "선장포노을사회적협동조합").ok, true);
assert.equal(bizNameMatch("파이어메이플캠핑장", "완전히다른상호").ok, false);

assert.equal(parseNtsStatus({ b_stt_cd: "01", b_stt: "계속사업자" }).ok, true);
assert.equal(parseNtsStatus({ b_stt_cd: "03", b_stt: "폐업자" }).reason, "closed");
assert.equal(parseNtsStatus({ tax_type: "국세청에 등록되지 않은 사업자등록번호입니다." }).reason, "unregistered");

const ok = decideBizOwnership({ campName: "양촌캠핑장", bizName: "양촌캠핑장", ntsItem: mockNtsStatus(TEST_BIZ.ok) });
assert.equal(ok.verified, true);
assert.equal(ok.pending_name, false);

const mismatch = decideBizOwnership({ campName: "양촌캠핑장", bizName: "다른회사", ntsItem: mockNtsStatus(TEST_BIZ.ok) });
assert.equal(mismatch.verified, true);
assert.equal(mismatch.pending_name, true);

assert.equal(decideBizOwnership({ campName: "양촌", bizName: "양촌", ntsItem: mockNtsStatus(TEST_BIZ.closed) }).verified, false);

assert.equal(preflightPhoto({ name: "auto-site.jpg", type: "image/jpeg", size: 200000, width: 1200, height: 800 }).ok, true);
assert.ok(preflightPhoto({ name: "사업자등록증.jpg", type: "image/jpeg", size: 1000, width: 1200, height: 800 }).reasons.includes("document"));
assert.ok(preflightPhoto({ name: "요금표.png", type: "image/png", size: 1000, width: 800, height: 600 }).reasons.includes("ad-or-text"));
assert.ok(preflightPhoto({ name: "a.jpg", type: "image/jpeg", size: 1000, width: 200, height: 200 }).reasons.includes("size"));
assert.ok(preflightPhoto({ name: "a.jpg", type: "image/jpeg", size: 1000, width: 2000, height: 400 }).reasons.includes("ratio"));
assert.ok(preflightPhoto({ name: "a.gif", type: "image/gif", size: 1000, width: 800, height: 600 }).reasons.includes("format"));

// 파이프라인 라이브러리와 브라우저 복제가 같아야 한다.
const a = readFileSync(resolve(root, "pipeline/lib/operator-photo-verify.mjs"), "utf8");
const b = readFileSync(resolve(root, "camping-atlas/public/operator/verify.js"), "utf8");
assert.equal(a, b, "operator-photo-verify.mjs and public/operator/verify.js must stay identical");

// 넘침 방지 규칙이 업로드·관리자 CSS에 들어 있는지
const photos = readFileSync(resolve(root, "camping-atlas/public/operator/photos.js"), "utf8");
assert.match(photos, /overflow-wrap:anywhere/);
assert.match(photos, /flex-wrap:wrap/);
assert.match(photos, /max-width:100%/);
assert.match(photos, /grid-template-columns:1fr/);
assert.match(photos, /fill="currentColor"/); // 채움 아이콘
assert.match(photos, /data-mask/);
assert.doesNotMatch(photos, /<input[^>]+name="tel"/);

const adminCss = readFileSync(resolve(root, "camping-atlas/public/admin/operator-photos/index.html"), "utf8");
assert.match(adminCss, /overflow-wrap: anywhere/);
assert.match(adminCss, /max-width: 360px/);
assert.match(adminCss, /fill="currentColor"/);


assert.equal(isPreviewHost({ host: "pyw31337.github.io", pathname: "/camp-preview/t62-operator/camp/", search: "" }), true);
assert.equal(isPreviewHost({ host: "pyw31337.github.io", pathname: "/camp/", search: "" }), false);
assert.equal(isPreviewHost({ host: "example.com", pathname: "/camp/", search: "?oppreview=1" }), true);
console.log("operator-photo-verify: ok");
