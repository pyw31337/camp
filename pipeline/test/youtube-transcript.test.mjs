import test from "node:test";
import assert from "node:assert/strict";
import { extractFactsFromYoutubeText, extractPlayerMeta, parseTranscriptXml } from "../lib/youtube-transcript.mjs";

test("extractPlayerMeta parses shortDescription and Korean captionTrack", () => {
  const html = `
    "shortDescription":"김포 범바위 캠핑장 입실 14:00 퇴실 11:00 전기 600W 파쇄석 사이트 6x8m",
    "captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc&lang=ko","languageCode":"ko"}]
  `;
  const meta = extractPlayerMeta(html);
  assert.match(meta.description, /범바위 캠핑장/);
  assert.equal(meta.captionUrl, "https://www.youtube.com/api/timedtext?v=abc&lang=ko");
});

test("parseTranscriptXml extracts clean spoken text", () => {
  const xml = `<transcript><text start="0" dur="2">안녕하세요 &amp; 텐트 옆 주차가 가능해요</text><text start="2" dur="2">전기는 600W까지 됩니다</text></transcript>`;
  assert.equal(parseTranscriptXml(xml), "안녕하세요 & 텐트 옆 주차가 가능해요 전기는 600W까지 됩니다");
});

test("extractFactsFromYoutubeText extracts specs with evidence and MENTION grade", () => {
  const text = "김포 범바위 캠핑장 입실 14:00 퇴실 11:00 전기 600W 반려견 동반 가능 파쇄석 6x8m 텐트 옆 주차 1박 5만원";
  const facts = extractFactsFromYoutubeText(text, "https://www.youtube.com/watch?v=l8fOq-4M5pY", "2026-11-27T13:40:00+09:00");
  const byAttr = Object.fromEntries(facts.map((f) => [f.attr, f.value]));
  assert.equal(byAttr.POWER_MAX_W, 600);
  assert.equal(byAttr.CHECKIN_TIME, "14:00");
  assert.equal(byAttr.CHECKOUT_TIME, "11:00");
  assert.equal(byAttr.PET_POLICY, "ALLOWED");
  assert.equal(byAttr.SITE_SURFACE, "GRAVEL");
  assert.equal(byAttr.SITE_SIZE, "6×8m");
  assert.equal(byAttr.PARKING_MODE, "SITE_ADJACENT");
  assert.equal(byAttr.PRICE_MENTION, 50000);
  assert.ok(facts.every((f) => f.grade === "MENTION" && f.source === "youtube_mention" && f.evidence.length > 0));
});
