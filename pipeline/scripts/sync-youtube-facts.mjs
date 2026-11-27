#!/usr/bin/env node
/**
 * 유튜브 영상(shorts-search.json 및 camps/*.json의 videos/shorts)의 설명·자막을 수집·분석해
 * 캠핑장 실전 스펙과 현장 단서를 추출·반영하는 스크립트.
 *
 * - youtube.com/robots.txt 에서 허용하는 /watch 페이지의 shortDescription 및 자막(captionTracks)을 읽는다.
 * - 기존 값을 덮어쓰지 않고, 빈 스펙 보강 및 youtube_facts(MENTION 등급, 원문 URL, 근거 문장)로 누적 저장한다.
 * - 사용: node pipeline/scripts/sync-youtube-facts.mjs [--limit=150] [--camp=loc-872363c1]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nowInKst, toKstIso } from "../lib/kst.mjs";
import { extractFactsFromYoutubeText, fetchYoutubeVideoContent } from "../lib/youtube-transcript.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const REG_PATH = join(ROOT, "pipeline/registry/youtube-facts.json");
const SHORTS_PATH = join(ROOT, "pipeline/registry/shorts-search.json");
const CAMPS_DIR = join(ROOT, "camping-atlas/public/explore/data/camps");
const PINS_PATH = join(ROOT, "pipeline/registry/curated-pins.json");

const argVal = (prefix) => process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length) ?? null;
const LIMIT = Number(argVal("--limit=") ?? process.env.YT_FACT_MAX ?? 150);
const ONLY_CAMP = argVal("--camp=");
const GAP_MS = Number(process.env.YT_FACT_GAP_MS ?? 1200);
const YT_KEY = process.env.YOUTUBE_API_KEY || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(p, fb) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; }
}

function collectCandidateVideos(reg, priorityIds) {
  const shorts = readJson(SHORTS_PATH, { campgrounds: {} }).campgrounds ?? {};
  const byCamp = new Map();

  const addVid = (cid, v) => {
    const id = v?.yt || (String(v?.url ?? "").match(/(?:v=|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1]);
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    if (!byCamp.has(cid)) byCamp.set(cid, new Map());
    if (!byCamp.get(cid).has(id)) byCamp.get(cid).set(id, { id, title: v?.t || v?.title || "", url: `https://www.youtube.com/watch?v=${id}` });
  };

  for (const [cid, entry] of Object.entries(shorts)) {
    if (ONLY_CAMP && cid !== ONLY_CAMP) continue;
    for (const v of entry?.videos ?? []) addVid(cid, v);
    for (const v of entry?.shorts ?? []) addVid(cid, v);
  }

  if (existsSync(CAMPS_DIR)) {
    const files = ONLY_CAMP ? [`${ONLY_CAMP}.json`] : readdirSync(CAMPS_DIR).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      const cid = f.replace(/\.json$/, "");
      const d = readJson(join(CAMPS_DIR, f), null);
      if (!d) continue;
      for (const v of d.videos ?? []) addVid(cid, v);
      for (const v of d.shorts ?? []) addVid(cid, v);
    }
  }

  const todos = [];
  for (const [cid, vids] of byCamp.entries()) {
    const prio = priorityIds.has(cid) ? 1 : 0;
    for (const v of vids.values()) {
      if (reg.videos?.[v.id]?.checked_at) continue;
      todos.push({ cid, ...v, prio });
    }
  }
  todos.sort((a, b) => b.prio - a.prio);
  return todos.slice(0, LIMIT);
}

function applyFactsToCampFile(cid, campFacts) {
  const campPath = join(CAMPS_DIR, `${cid}.json`);
  if (!existsSync(campPath) || !campFacts.length) return false;
  const d = readJson(campPath, null);
  if (!d) return false;

  d.youtube_facts ??= [];
  const existingKeys = new Set(d.youtube_facts.map((f) => `${f.attr}:${f.value}:${f.url}`));
  let changed = false;
  for (const f of campFacts) {
    const k = `${f.attr}:${f.value}:${f.url}`;
    if (!existingKeys.has(k)) {
      d.youtube_facts.push(f);
      existingKeys.add(k);
      changed = true;
    }
  }
  // 빈 p5 칸만 보강(기존 확정값 덮어쓰기 금지)
  const p5 = (d.p5 ??= {});
  for (const f of campFacts) {
    if (f.attr === "POWER_MAX_W" && p5.pw == null) { p5.pw = `${f.value}W`; changed = true; }
    if (f.attr === "PET_POLICY" && p5.pet == null) {
      p5.pet = f.value === "ALLOWED" ? "가능" : f.value === "SMALL_ONLY" ? "소형견" : "불가";
      changed = true;
    }
    if (f.attr === "PARKING_MODE" && p5.pk == null) {
      p5.pk = f.value === "SITE_ADJACENT" ? "텐트옆" : "카트";
      changed = true;
    }
  }
  if (changed) writeFileSync(campPath, `${JSON.stringify(d)}\n`);
  return changed;
}

async function main() {
  const reg = readJson(REG_PATH, { updated_at: null, videos: {}, camps: {} });
  reg.videos ??= {};
  reg.camps ??= {};

  const pins = readJson(PINS_PATH, []);
  const priorityIds = new Set((Array.isArray(pins) ? pins : []).map((x) => String(x?.id ?? x?.cid ?? x)));
  const todos = collectCandidateVideos(reg, priorityIds);
  console.log(`[youtube-facts] 기존 분석 영상 ${Object.keys(reg.videos).length}건 · 이번 수집 대상 ${todos.length}건`);

  const checkedAt = toKstIso(nowInKst());
  let fetched = 0, withTranscript = 0, totalFacts = 0, stopped = null;
  const campUpdates = new Map();

  const recordOne = (item, description, transcript, url) => {
    const combined = [item.title, description, transcript].filter(Boolean).join("\n");
    const facts = extractFactsFromYoutubeText(combined, url, checkedAt);
    reg.videos[item.id] = {
      cid: item.cid,
      url,
      checked_at: checkedAt,
      has_transcript: Boolean(transcript),
      desc_len: String(description ?? "").length,
      transcript_len: String(transcript ?? "").length,
      facts_count: facts.length,
    };
    if (facts.length) {
      totalFacts += facts.length;
      if (!campUpdates.has(item.cid)) campUpdates.set(item.cid, []);
      campUpdates.get(item.cid).push(...facts);
      reg.camps[item.cid] ??= [];
      const seen = new Set(reg.camps[item.cid].map((x) => `${x.attr}:${x.value}:${x.url}`));
      for (const f of facts) {
        const k = `${f.attr}:${f.value}:${f.url}`;
        if (!seen.has(k)) { reg.camps[item.cid].push(f); seen.add(k); }
      }
    }
  };

  // 1) YOUTUBE_API_KEY가 있으면 공식 videos.list(50개/1단위)로 설명·태그를 초고속·무차단 수집
  const remaining = [];
  if (YT_KEY && todos.length) {
    for (let i = 0; i < todos.length; i += 50) {
      const chunk = todos.slice(i, i + 50);
      try {
        const u = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${chunk.map((x) => x.id).join(",")}&key=${encodeURIComponent(YT_KEY)}`;
        const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) { remaining.push(...todos.slice(i)); break; }
        const j = await r.json();
        const byId = new Map((j.items ?? []).map((it) => [it.id, it.snippet]));
        for (const item of chunk) {
          const sn = byId.get(item.id);
          if (sn) {
            fetched++;
            const desc = [sn.title, sn.description, ...(sn.tags ?? [])].filter(Boolean).join("\n");
            recordOne(item, desc, "", `https://www.youtube.com/watch?v=${item.id}`);
          }
        }
      } catch {
        remaining.push(...todos.slice(i));
        break;
      }
    }
  } else {
    remaining.push(...todos);
  }

  // 2) 남은 영상은 /watch(robots.txt 허용)에서 설명+자막 수집 (429/403 거절 시 즉시 중단)
  for (const item of remaining) {
    if (stopped) break;
    try {
      const content = await fetchYoutubeVideoContent(item.id);
      if (content) {
        fetched++;
        if (content.transcript) withTranscript++;
        recordOne(item, content.description, content.transcript, content.url);
      }
    } catch (e) {
      if (e?.code === "RATE_LIMIT") {
        stopped = e.message;
        console.log(`[youtube-facts] 서버 제한(${stopped})으로 안전 중단`);
        break;
      }
    }
    if (GAP_MS > 0) await sleep(GAP_MS);
  }

  let updatedCamps = 0;
  for (const [cid, facts] of campUpdates.entries()) {
    if (applyFactsToCampFile(cid, facts)) updatedCamps++;
  }

  reg.updated_at = checkedAt;
  mkdirSync(join(ROOT, "pipeline/registry"), { recursive: true });
  writeFileSync(REG_PATH, `${JSON.stringify(reg, null, 2)}\n`);
  console.log(`[youtube-facts] 완료: 조회 ${fetched}건(자막 ${withTranscript}건) · 추출 사실 ${totalFacts}건 · 캠핑장 반영 ${updatedCamps}곳`);
}

main();
