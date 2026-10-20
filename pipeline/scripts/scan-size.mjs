import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText, isOperatorHost, isClosedHost } from "../lib/operator-site.mjs";
const root = resolve(fileURLToPath(import.meta.url), "../../..");
const camps = JSON.parse(readFileSync(join(root, "camping-atlas/public/explore/data/campgrounds.json"), "utf8"));
const noSize = (c) => ((c.field_conditions||{}).site_size||{}).state !== "SURVEYED";
const targets = camps.filter(c => noSize(c) && c.homepage && isOperatorHost(c.homepage) && !isClosedHost(c.homepage));
const off = Number(process.argv[2]||0);
const lim = Number(process.argv[3]||50);
const batch = targets.slice(off, off+lim);
console.log("targets", targets.length, "batch", off, batch.length);
const SIZE = /(\d{1,2}(?:\.\d)?)\s*[x×*]\s*(\d{1,2}(?:\.\d)?)\s*(?:m|미터)?/gi;
const hits = [];
for (const c of batch) {
  const url = c.homepage.startsWith("http") ? c.homepage : `http://${c.homepage}`;
  try {
    const r = await fetch(url, { headers: {"user-agent":"Mozilla/5.0"}, signal: AbortSignal.timeout(8000), redirect:"follow" });
    if (!r.ok) { console.log("fail", c.id); continue; }
    const text = htmlToText(await r.text());
    const m = [...text.matchAll(SIZE)].map(x => `${x[1]}x${x[2]}`).filter(s => {
      const [a,b] = s.split("x").map(Number);
      return a >= 2 && a <= 20 && b >= 2 && b <= 20;
    });
    if (m.length) { hits.push({id:c.id, name:c.name, size:m[0], url}); console.log("HIT", c.id, c.name, m[0]); }
    else console.log("empty", c.id);
  } catch { console.log("fail", c.id); }
}
writeFileSync("/tmp/size-hits.json", JSON.stringify(hits));
console.log("hits", hits.length);
