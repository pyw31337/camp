#!/usr/bin/env node
/**
 * Match collected 국립자연휴양림 list to existing camping catalog.
 * Usage: node pipeline/scripts/match-forest-recreation.mjs
 * Output: pipeline/registry/forest-matches.json
 * Other agents: use this to link or add OPERATOR facts.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const forestPath = join(ROOT, 'pipeline/registry/forest-recreation-collected.json');
const catalogPath = join(ROOT, 'data/camps.json'); // adjust if catalog path differs

try {
  const forest = JSON.parse(readFileSync(forestPath, 'utf8'));
  let catalog = [];
  try { catalog = JSON.parse(readFileSync(catalogPath, 'utf8')); } catch {}

  const matches = forest.items.map(f => {
    const nameKey = f.name.replace(/자연휴양림$/, '').trim();
    const hit = catalog.find(c =>
      (c.name || c.facltNm || '').includes(nameKey) ||
      (c.addr1 || c.addr || '').includes(f.address.split(' ')[0])
    );
    return {
      forest_name: f.name,
      phone: f.phone,
      address: f.address,
      reservation: f.reservation,
      matched_camp_id: hit?.contentId || hit?.id || null,
      match_confidence: hit ? 'name_or_addr' : 'none'
    };
  });

  const out = { generated_at: new Date().toISOString(), matches };
  writeFileSync(join(ROOT, 'pipeline/registry/forest-matches.json'), JSON.stringify(out, null, 2));
  console.log(`Wrote ${matches.length} potential matches`);
} catch (e) {
  console.error(e);
  process.exit(1);
}
