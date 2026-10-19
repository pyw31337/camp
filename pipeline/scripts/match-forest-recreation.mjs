#!/usr/bin/env node
/**
 * Match collected 국립자연휴양림 list to existing camping catalog.
 * Usage: node pipeline/scripts/match-forest-recreation.mjs
 * Output: pipeline/registry/forest-matches.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const forestPath = join(root, 'pipeline/registry/forest-recreation-collected.json');
const catalogPath = join(root, 'camping-atlas/public/explore/data/campgrounds.json');
const outPath = join(root, 'pipeline/registry/forest-matches.json');

try {
  const forest = JSON.parse(readFileSync(forestPath, 'utf8'));
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')) : [];

  const matches = forest.items.map(f => {
    const nameKey = f.name.replace(/자연휴양림$/, '').trim();
    const m = f.address.match(/([가-힣0-9·]+(?:로|길))\s*([0-9-]+)/);
    const roadNo = m ? `${m[1]} ${m[2]}` : null;
    const road = m ? m[1] : null;

    // 1순위: 도로명+번지 일치 (가장 확실한 물리적 동일성)
    // 2순위: 이름에 '휴양림' 포함 + 핵심어 일치 + 시/도 또는 시/군/구 일치
    let hit = null;
    let confidence = 'none';

    if (roadNo) {
      hit = catalog.find(c => (c.addr || '').includes(roadNo));
      if (hit) confidence = 'exact_address';
    }

    if (!hit) {
      hit = catalog.find(c => {
        const cName = c.name || '';
        const nameMatch = cName.includes(nameKey) && cName.includes('휴양림');
        const addrMatch = f.address ? ((c.sido && f.address.includes(c.sido)) || (c.sigungu && f.address.includes(c.sigungu))) : true;
        return nameMatch && addrMatch;
      });
      if (hit) confidence = 'name_and_region';
    }

    return {
      forest_name: f.name,
      phone: f.phone,
      address: f.address,
      reservation: f.reservation,
      matched_camp_id: hit ? String(hit.id) : null,
      matched_camp_name: hit ? hit.name : null,
      matched_camp_addr: hit ? hit.addr : null,
      match_confidence: confidence
    };
  });

  const out = {
    generated_at: new Date().toISOString(),
    total_items: forest.items.length,
    matched_count: matches.filter(m => m.matched_camp_id).length,
    matches
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`국립자연휴양림 ${forest.items.length}곳 중 ${out.matched_count}곳 고신뢰 매칭 완료 -> ${outPath}`);
} catch (e) {
  console.error(e);
  process.exit(1);
}
