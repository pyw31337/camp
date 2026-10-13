// 파이프라인 결과를 GitHub Pages가 읽는 최소 카탈로그로 내보낸다.
// 사용: PUBLISH_GOCAMPING_CATALOG=true node scripts/publish-web-catalog.mjs
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildWebCatalog, preservePublishedGoCampingCatalog } from "../lib/web-catalog.mjs";

const outDir = fileURLToPath(new URL("../out/", import.meta.url));
const webDataDir = fileURLToPath(new URL("../../camping-atlas/public/data/", import.meta.url));
const readJsonIfPresent = async (filename) => {
  try {
    return JSON.parse(await readFile(`${outDir}${filename}`, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};
const readExistingCatalog = async () => {
  try {
    return JSON.parse(await readFile(`${webDataDir}catalog.json`, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const calendar = await readJsonIfPresent("open-calendar.json");
if (!calendar) throw new Error("pipeline/out/open-calendar.json이 없습니다. 먼저 npm run calendar를 실행하세요.");
const campgroundsPayload = await readJsonIfPresent("campgrounds.json");
const candidateCatalog = buildWebCatalog({
  calendar,
  campgroundsPayload,
  publishGoCamping: process.env.PUBLISH_GOCAMPING_CATALOG === "true",
  generatedAt: new Date().toISOString(),
});
const { catalog, retainedPreviousGoCampingCatalog } = preservePublishedGoCampingCatalog({
  candidate: candidateCatalog,
  existingCatalog: await readExistingCatalog(),
  allowWithdrawal: process.env.ALLOW_GOCAMPING_CATALOG_WITHDRAWAL === "true",
});

await mkdir(webDataDir, { recursive: true });
await cp(`${outDir}open-calendar.json`, `${webDataDir}open-calendar.json`);
await writeFile(`${webDataDir}catalog.json`, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify({
  calendar_events: catalog.counts.opening_events,
  gocamping_state: catalog.sources.gocamping.state,
  published_campgrounds: catalog.campgrounds.length,
  retained_previous_gocamping_catalog: retainedPreviousGoCampingCatalog,
}, null, 2));
