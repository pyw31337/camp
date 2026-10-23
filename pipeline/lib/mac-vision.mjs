// 맥미니 전용 판독 도구(2026-10-23). 둘 다 무료·오프라인이고 없으면 null을 돌려 호출한 쪽이 건너뛴다.
//  1) Apple Vision(local/macmini/vision-ocr.swift를 컴파일한 실행 파일): 한글 글자 인식(OCR)·장면 분류.
//     tesseract보다 한글 요금표·간판을 훨씬 잘 읽는다. 표는 같은 줄의 글 덩어리를 두 칸 띄어 이어 lib/ocr.mjs가 칸으로 나눈다.
//  2) Ollama 로컬 비전 모델(기본 qwen2.5vl:7b): “이 사진이 그 가게의 겉모습/매장 안인가”를 예/아니요(JSON)로 답한다.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const VISION_BIN = process.env.VISION_OCR_BIN || join(homedir(), ".letscamp/bin/vision-ocr");
export const VLM_MODEL = process.env.LOCAL_VLM_MODEL || "qwen2.5vl:7b";
const OLLAMA = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

const run = (args, timeout = 60000) => new Promise((ok) => execFile(VISION_BIN, args, { timeout, maxBuffer: 8e6 }, (e, out) => ok(e ? null : String(out))));

/** Apple Vision 실행 파일이 있나(맥이 아니면 false) */
export const visionAvailable = () => process.platform === "darwin" && existsSync(VISION_BIN);

/** 이미지 파일 → { text(줄바꿈으로 이은 표 모양 글), labels:[{id, c}] } 또는 null */
export async function appleVision(file, { classify = false } = {}) {
  if (!visionAvailable()) return null;
  const out = await run([classify ? "--classify" : "--ocr", file]);
  try { const j = JSON.parse(out ?? ""); return { text: (j.rows ?? []).join("\n"), labels: j.labels ?? [] }; } catch { return null; }
}

// ── 간판 글자 맞추기 ───────────────────────────────────────────
const fold = (s) => String(s ?? "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
const BRANDS = [/gs\s*25/i, /\bcu\b/i, /세븐\s*일레븐|7-?eleven/i, /이마트\s*24|emart\s*24/i, /미니스톱|ministop/i, /하나로\s*마트/i, /홈플러스/i, /롯데마트/i, /이마트/i, /s-?oil|에쓰오일/i, /sk\s*에너지|sk\s*energy/i, /gs\s*칼텍스|caltex/i, /오일뱅크|oilbank/i, /올리브영/i, /다이소|daiso/i];
const GENERIC = /^(편의점|마트|약국|병원|의원|주유소|휴게소|정육점|정육|식당|슈퍼|마켓|본점|지점|점)$/;
/** 업체 이름의 알아볼 낱말: 상표(GS25·CU…)와 지점 이름(“OO점”의 OO, 3글자 이상) */
export function nameTokens(name) {
  const n = String(name ?? "");
  const brands = BRANDS.filter((re) => re.test(n));
  const words = n.replace(/\(.*?\)/g, " ").split(/[\s·,]+/).map((w) => w.replace(/(점|지점|본점)$/, "")).map(fold).filter((w) => w.length >= 3 && !GENERIC.test(w));
  return { brands, words: [...new Set(words)] };
}
/** OCR 글에 업체 상표나 이름 낱말이 보이나 */
export function signMatches(name, text) {
  const { brands, words } = nameTokens(name);
  const t = String(text ?? ""), ft = fold(t);
  return brands.some((re) => re.test(t)) || words.some((w) => ft.includes(w));
}

// ── 로컬 비전 모델(Ollama) ────────────────────────────────────
let vlmOk = null;
/** Ollama가 켜져 있고 모델이 받아져 있나 */
export async function vlmAvailable() {
  if (vlmOk !== null) return vlmOk;
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    vlmOk = r.ok && ((await r.json()).models ?? []).some((m) => m.name === VLM_MODEL || m.name === `${VLM_MODEL}:latest`);
  } catch { vlmOk = false; }
  return vlmOk;
}
/** 이미지(Buffer) + 질문 → JSON 답(못 읽으면 null). 온도 0, JSON 형식 강제 */
export async function askVlm(buf, prompt, { timeout = 120000 } = {}) {
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: "POST", signal: AbortSignal.timeout(timeout), headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: VLM_MODEL, prompt, images: [buf.toString("base64")], format: "json", stream: false, options: { temperature: 0 } }),
    });
    if (!r.ok) return null;
    return JSON.parse((await r.json()).response ?? "null");
  } catch { return null; }
}
export const nearbyPrompt = (name) => `This small photo came from a web search for the place "${name}" in Korea.
Answer only JSON: {"scene": "exterior" | "interior" | "food" | "people" | "document" | "map" | "logo" | "landscape" | "other", "same_place": true | false}.
"exterior" = the outside of a shop/building/station, "interior" = inside a shop or facility. same_place = true only if the scene plausibly shows this kind of place (its storefront, sign or inside), not an ad, menu, product or unrelated scene.`;

/**
 * 맥 판독 결론. clip = lib/nearby-photo-judge decideNearby 결과, sign = 간판 글자 일치, vlm = 비전 모델 답(없으면 null).
 * 비전 모델이 있으면 그 답이 주인(겉모습·매장 안 + 같은 곳일 때만), CLIP이 음식·인물 등을 강하게 가리키면 막는다.
 * 비전 모델이 없으면 CLIP 통과이거나, 간판 글자가 맞고 CLIP 1위가 글·광고·지도·로고가 아닐 때 통과.
 */
export function decideNearbyMac({ clip, sign, vlm }) {
  const textLike = /screenshot|advertisement|logo|map|menu board/.test(clip?.top ?? "");
  const strongNeg = clip && !clip.ok && clip.why && clip.why !== "가게 모습 아님" && (clip.pos ?? 0) < 0.3;
  if (vlm && typeof vlm === "object") {
    const ok = ["exterior", "interior"].includes(vlm.scene) && vlm.same_place === true && !strongNeg;
    return { ok, by: "mac", sign: Boolean(sign), scene: vlm.scene ?? null, ...(ok ? {} : { why: strongNeg ? clip.why : `비전 모델: ${vlm.scene ?? "?"}` }) };
  }
  const ok = Boolean(clip?.ok) || (Boolean(sign) && !textLike && !strongNeg);
  return { ok, by: "mac", sign: Boolean(sign), scene: null, ...(ok ? {} : { why: clip?.why ?? "판독 없음" }) };
}
