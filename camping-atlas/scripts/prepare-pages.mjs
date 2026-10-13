import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

const clientOutput = join(process.cwd(), "dist", "client");
const prefixedAssets = join(clientOutput, "camp", "_next");
const publicAssets = join(clientOutput, "_next");

// Vinext writes assets under the configured prefix during static export. GitHub
// Pages mounts this artifact at /camp, so the generated HTML needs them at _next.
await rm(publicAssets, { recursive: true, force: true });
await cp(prefixedAssets, publicAssets, { recursive: true });
await rm(join(clientOutput, "camp"), { recursive: true, force: true });
