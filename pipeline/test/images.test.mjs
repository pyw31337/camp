import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateUrls, desiredImages, downloadImage, estimateBytes, fitWidth, hash8, heroIndex, isOfficialImageUrl, mapLimit, mergeManifest,
  limitManifestPerCamp, normalizeSrcUrl, orphanFiles, parseImageListResponse, planDownloads, safeCampId, selectImageListTargets, variantPaths,
} from "../lib/images.mjs";

// 가상 표본(실제 시설·실제 파일 아님).
const G = (n) => `https://gocamping.or.kr/upload/camp/1/${n}.jpg`;
const camps = [
  { external_id: { provider: "gocamping", id: "100" }, hero_image_url: G("hero100") },
  { external_id: { provider: "gocamping", id: "200" }, hero_image_url: "https://scontent.cdninstagram.com/x.jpg" },
  { external_id: { provider: "gocamping", id: "300" }, hero_image_url: null },
  { external_id: { provider: "gocamping", id: "../etc" }, hero_image_url: G("evil") },
];

test("해시·경로 이름", () => {
  const h = hash8(Buffer.from("abc"));
  assert.equal(h, "ba7816bf"); // sha256("abc") 앞 8자
  assert.deepEqual(variantPaths("100", h), { thumb: "camps/100/ba7816bf-t.webp", large: "camps/100/ba7816bf-l.webp" });
  assert.throws(() => variantPaths("../x", h), /ID/);
  assert.throws(() => variantPaths("100", "XYZ"), /해시/);
  assert.equal(safeCampId(" 42 "), "42");
  assert.equal(safeCampId("a/b"), null);
});

test("공식 호스트만 허용하고 URL을 정규화한다", () => {
  assert.ok(isOfficialImageUrl("https://gocamping.or.kr/upload/a.jpg"));
  assert.ok(isOfficialImageUrl("http://tong.visitkorea.or.kr/cms/resource/1.jpg"));
  assert.ok(!isOfficialImageUrl("https://blogfiles.pstatic.net/a.jpg"));
  assert.ok(!isOfficialImageUrl("https://evilgocamping.or.kr/a.jpg"));
  assert.ok(!isOfficialImageUrl("ftp://gocamping.or.kr/a.jpg"));
  assert.equal(normalizeSrcUrl(" http://www.gocamping.or.kr/upload/a.jpg "), "https://gocamping.or.kr/upload/a.jpg");
  assert.equal(normalizeSrcUrl(""), null);
});

test("고캠핑 원본은 공식 1000px 파생본을 먼저 시도한다", () => {
  assert.deepEqual(candidateUrls("http://www.gocamping.or.kr/upload/camp/1066/abcDEF.jpg"), [
    "https://gocamping.or.kr/upload/camp/1066/thumb/thumb_1000_abcDEF.jpg",
    "https://gocamping.or.kr/upload/camp/1066/abcDEF.jpg",
  ]);
  assert.deepEqual(candidateUrls("https://gocamping.or.kr/upload/camp/1066/thumb/thumb_720_x.jpg"), ["https://gocamping.or.kr/upload/camp/1066/thumb/thumb_720_x.jpg"]);
  assert.deepEqual(candidateUrls("http://tong.visitkorea.or.kr/cms/a.jpg"), ["http://tong.visitkorea.or.kr/cms/a.jpg"]);
  assert.deepEqual(candidateUrls(null), []);
});

test("확대하지 않는 크기 계산", () => {
  assert.deepEqual(fitWidth(2000, 1500, 1280), { w: 1280, h: 960 });
  assert.deepEqual(fitWidth(400, 300, 480), { w: 400, h: 300 });
  assert.equal(fitWidth(0, 10, 480), null);
});

test("imageList 응답 파싱", () => {
  const ok = (item) => ({ response: { header: { resultCode: "0000", resultMsg: "OK" }, body: { items: item === undefined ? "" : { item }, totalCount: 2 } } });
  assert.deepEqual(parseImageListResponse(ok()), []);
  const one = parseImageListResponse(ok({ contentId: "100", serialnum: 1, imageUrl: "http://gocamping.or.kr/upload/a.jpg", createdtime: "2024-01-01 00:00:00", modifiedtime: "2024-01-02 00:00:00" }));
  assert.deepEqual(one, [{ imageUrl: "https://gocamping.or.kr/upload/a.jpg", serialnum: "1", createdtime: "2024-01-01 00:00:00", modifiedtime: "2024-01-02 00:00:00" }]);
  const many = parseImageListResponse(ok([{ imageUrl: G("a") }, { imageUrl: G("a") }, { imageUrl: "" }, { imageUrl: G("b") }]));
  assert.deepEqual(many.map((x) => x.imageUrl), [G("a"), G("b")]);
  assert.throws(() => parseImageListResponse({ response: { header: { resultCode: "22", resultMsg: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR" } } }), (e) => e.code === "QUOTA");
  assert.throws(() => parseImageListResponse({ response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } }), (e) => e.code === "API");
  assert.throws(() => parseImageListResponse({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: "22", returnAuthMsg: "LIMITED" } } }), (e) => e.code === "QUOTA");
});

test("imageList 호출 대상: 캐시 없음 먼저, TTL 지난 것, 상한", () => {
  const now = Date.parse("2026-10-13T00:00:00Z");
  const cache = {
    a: { fetched_at: "2026-10-10T00:00:00Z" }, // 3일 → 신선
    b: { fetched_at: "2026-08-01T00:00:00Z" }, // 73일 → 오래됨
    c: { fetched_at: "2026-09-01T00:00:00Z" }, // 42일 → 오래됨
  };
  assert.deepEqual(selectImageListTargets(["a", "b", "c", "d", "e"], cache, { now, maxCalls: 10, ttlDays: 30 }), ["d", "e", "b", "c"]);
  assert.deepEqual(selectImageListTargets(["a", "b", "c", "d", "e"], cache, { now, maxCalls: 3, ttlDays: 30 }), ["d", "e", "b"]);
  assert.deepEqual(selectImageListTargets(["a", "b", "c", "d", "e"], cache, { now, maxCalls: 3, ttlDays: 30, priorityIds: ["c"] }), ["c", "d", "e"]);
  assert.deepEqual(selectImageListTargets(["d"], {}, { now, maxCalls: 0 }), []);
});

test("원하는 사진 목록: 대표 사진 + imageList(상한·중복·비공식 제외)", () => {
  const cache = { "100": { images: [{ imageUrl: G("hero100") }, { imageUrl: G("x1") }, { imageUrl: "https://blog.naver.com/x.jpg" }, { imageUrl: G("x2") }, { imageUrl: G("x3") }] }, "300": { images: [{ imageUrl: G("y1") }] } };
  const d = desiredImages(camps, cache, { maxPerCamp: 2 });
  assert.deepEqual([...d.keys()], ["100", "300"]); // 200은 인스타그램 URL이라 제외, ../etc는 ID 거부
  assert.deepEqual(d.get("100"), [
    { src_url: G("hero100"), source: "gocamping" },
    { src_url: G("x1"), source: "gocamping-imageList" },
    { src_url: G("x2"), source: "gocamping-imageList" },
  ]);
  assert.deepEqual(d.get("300"), [{ src_url: G("y1"), source: "gocamping-imageList" }]);
  const coverageFirst = desiredImages(camps, cache, { maxPerCamp: 2, maxTotalPerCamp: 1 });
  assert.deepEqual(coverageFirst.get("100"), [{ src_url: G("hero100"), source: "gocamping" }]);
  assert.deepEqual(coverageFirst.get("300"), [{ src_url: G("y1"), source: "gocamping-imageList" }]);
});

const entry = (id, src, h, extra = {}) => ({ src_url: src, ...variantPaths(id, h), w: 1280, h: 960, source: "gocamping", credit: "한국관광공사 고캠핑", checked_at: "2026-10-01T00:00:00Z", ...extra });

test("다운로드 계획: 이미 있는 것 건너뛰기·우선순위·실행당 상한·실패 대기", () => {
  const desired = new Map([
    ["1", [{ src_url: G("h1"), source: "gocamping" }, { src_url: G("e1"), source: "gocamping-imageList" }]],
    ["2", [{ src_url: G("h2"), source: "gocamping" }, { src_url: G("e2"), source: "gocamping-imageList" }]],
    ["3", [{ src_url: G("h3"), source: "gocamping" }]],
  ]);
  const manifest = { camps: { "1": [entry("1", G("h1"), "aaaaaaaa")], "3": [entry("3", G("h3"), "cccccccc")] } };
  const now = Date.parse("2026-10-13T00:00:00Z");
  // h3 파일이 사라졌다면 다시 받는다(캠핑장 3은 사진 0장 → 최우선).
  const exists = (p) => !p.startsWith("camps/3/");
  const failures = { [G("e2")]: { last_at: "2026-10-12T00:00:00Z", count: 1 } };
  const plan = planDownloads(desired, manifest, { fileExists: exists, failures, now, maxDownloads: 10 });
  assert.deepEqual(plan.jobs.map((j) => j.src_url), [G("h2"), G("h3"), G("e1")]);
  assert.equal(plan.pending, 3);
  assert.equal(plan.alreadyDone, 1);
  const capped = planDownloads(desired, manifest, { fileExists: exists, failures, now, maxDownloads: 2 });
  assert.deepEqual(capped.jobs.map((j) => j.src_url), [G("h2"), G("h3")]);
  assert.equal(capped.pending, 3);
  // 실패 후 7일이 지나면 다시 시도
  const later = planDownloads(desired, manifest, { fileExists: exists, failures, now: Date.parse("2026-10-20T00:00:00Z") });
  assert.ok(later.jobs.some((j) => j.src_url === G("e2")));
  assert.equal(planDownloads(desired, manifest, { maxDownloads: 0 }).jobs.length, 0);
  const imageOnly = planDownloads(new Map([
    ["4", [{ src_url: G("only-list"), source: "gocamping-imageList" }]],
    ["1", [{ src_url: G("later-extra"), source: "gocamping-imageList" }]],
  ]), manifest, { fileExists: () => true, maxDownloads: 10 });
  assert.equal(imageOnly.jobs[0].campId, "4");
});

test("매니페스트 병합: 재사용·새 결과·빠진 캠핑장/원본 제거·순서 유지", () => {
  const prev = { camps: { "1": [entry("1", G("old"), "00000000"), entry("1", G("h1"), "aaaaaaaa")], "9": [entry("9", G("gone"), "99999999")] } };
  const desired = new Map([
    ["1", [{ src_url: G("h1"), source: "gocamping" }, { src_url: G("e1"), source: "gocamping-imageList" }]],
    ["10", [{ src_url: G("h10"), source: "gocamping" }]],
    ["2", [{ src_url: G("missing"), source: "gocamping" }]],
  ]);
  const results = new Map([
    [G("e1"), entry("1", G("e1"), "bbbbbbbb", { source: "gocamping-imageList" })],
    [G("h10"), entry("10", G("h10"), "dddddddd")],
  ]);
  const m = mergeManifest(prev, desired, results, { now: "2026-10-13T00:00:00Z", licenseNote: "note" });
  assert.equal(m.generated_at, "2026-10-13T00:00:00Z");
  assert.equal(m.license_note, "note");
  assert.deepEqual(Object.keys(m.camps), ["1", "10"]); // 숫자 순 정렬, 2는 결과 없음, 9는 빠짐
  assert.deepEqual(m.camps["1"].map((e) => [e.src_url, e.thumb, e.source]), [
    [G("h1"), "camps/1/aaaaaaaa-t.webp", "gocamping"],
    [G("e1"), "camps/1/bbbbbbbb-t.webp", "gocamping-imageList"],
  ]);
  assert.deepEqual(orphanFiles(m, ["camps/1/aaaaaaaa-t.webp", "camps/1/00000000-t.webp", "camps/9/99999999-l.webp", "manifest.json"]), ["camps/1/00000000-t.webp", "camps/9/99999999-l.webp"]);
  assert.deepEqual(heroIndex(m), { "1": "camps/1/aaaaaaaa-t.webp", "10": "camps/10/dddddddd-t.webp" });
});

test("매니페스트: 아직 재조회하지 않은 imageList 사진은 유지하고, 재조회 뒤 빠진 사진만 정리", () => {
  const prev = { camps: {
    "1": [entry("1", G("h1"), "aaaaaaaa"), entry("1", G("old-extra"), "bbbbbbbb", { source: "gocamping-imageList" })],
    "2": [entry("2", G("old-hero"), "cccccccc"), entry("2", G("old-extra"), "dddddddd", { source: "gocamping-imageList" })],
  } };
  const desired = new Map([
    ["1", [{ src_url: G("h1"), source: "gocamping" }]],
    ["2", [{ src_url: G("new-hero"), source: "gocamping" }]],
  ]);
  const results = new Map([[G("new-hero"), entry("2", G("new-hero"), "eeeeeeee")]]);
  const m = mergeManifest(prev, desired, results, { preserveUnseen: true, refreshedImageListIds: ["2"] });
  assert.deepEqual(m.camps["1"].map((x) => x.src_url), [G("h1"), G("old-extra")]);
  assert.deepEqual(m.camps["2"].map((x) => x.src_url), [G("new-hero")]);
});

test("전국 커버리지 우선일에는 시설당 첫 공식 사진만 남긴다", () => {
  const manifest = { generated_at: "now", camps: {
    "1": [entry("1", G("h1"), "aaaaaaaa"), entry("1", G("x1"), "bbbbbbbb")],
    "2": [entry("2", G("h2"), "cccccccc")],
  } };
  const limited = limitManifestPerCamp(manifest, 1);
  assert.deepEqual(limited.camps["1"].map((x) => x.src_url), [G("h1")]);
  assert.deepEqual(limited.camps["2"].map((x) => x.src_url), [G("h2")]);
  assert.equal(limitManifestPerCamp(manifest, 0), manifest);
});

test("동시성 제한 map", async () => {
  let active = 0, peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (x) => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return x * 2; });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3);
});

test("다운로드: 비공식 호스트 거부·크기 제한·한 번 재시도", async () => {
  const resp = (status, body, headers = {}) => ({ ok: status < 400, status, headers: new Map(Object.entries(headers)), arrayBuffer: async () => new Uint8Array(body).buffer });
  await assert.rejects(downloadImage("https://example.com/a.jpg", { fetchImpl: async () => resp(200, [1]) }), /공식 호스트/);
  let calls = 0;
  const flaky = async () => { calls++; if (calls === 1) throw new Error("ECONNRESET"); return resp(200, [1, 2, 3], { "content-type": "image/jpeg" }); };
  assert.equal((await downloadImage(G("a"), { fetchImpl: flaky })).length, 3);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(downloadImage(G("a"), { fetchImpl: async () => { calls++; return resp(404, []); } }), /404/);
  assert.equal(calls, 1); // 4xx는 재시도 안 함
  await assert.rejects(downloadImage(G("a"), { fetchImpl: async () => resp(200, [1], { "content-length": String(9 * 1024 * 1024) }) }), /너무 큼/);
  await assert.rejects(downloadImage(G("a"), { maxBytes: 2, fetchImpl: async () => resp(200, [1, 2, 3]) }), /너무 큼/);
  await assert.rejects(downloadImage(G("a"), { fetchImpl: async () => resp(200, [1], { "content-type": "text/html" }) }), /이미지 아님/);
});

test("크기 추정", () => {
  const mb = (b) => Math.round(b / 1024 / 1024);
  assert.equal(mb(estimateBytes({ camps: 3100 })), 439);
  assert.equal(mb(estimateBytes({ camps: 3100, extrasPerCamp: 6 })), 3073);
});
