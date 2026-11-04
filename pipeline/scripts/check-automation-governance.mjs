#!/usr/bin/env node
// GitHub Actions writer guard: data-producing workflows must share one queue.
// This is intentionally a static check so a new workflow cannot silently start
// writing the published catalog in parallel with data-sync.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const workflowDir = join(root, ".github", "workflows");
const expectedData = "letscamp-data-publish";
const expectedMedia = "letscamp-media-publish";
const errors = [];

for (const name of readdirSync(workflowDir).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
  const file = join(workflowDir, name);
  const text = readFileSync(file, "utf8");
  const writesData = /land-on-main|publish-incremental|git\s+push/.test(text) && name !== "web-quality.yml";
  if (!writesData) continue;
  const group = text.match(/(?:^\s+group:|\{\s*group:)\s*([^,}\n#]+)/m)?.[1]?.trim() ?? "";
  const expected = name === "card-photos.yml" ? expectedMedia : expectedData;
  if (group !== expected) errors.push(`${name}: concurrency group must be ${expected}, got ${group || "(missing)"}`);
  if (/cancel-in-progress:\s*true/.test(text)) errors.push(`${name}: writer workflows must queue, not cancel an active publisher`);
}

if (errors.length) {
  console.error(`FAIL automation governance\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("OK automation governance — all writer workflows use the shared queue");
