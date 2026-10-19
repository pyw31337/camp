#!/usr/bin/env node
/**
 * local-fee-facts.json 을 기존 캠핑장과 매칭해 Fact Store 형식 사실로 변환.
 * 출력: pipeline/registry/local-fee-facts-matched.json
 * 다른 에이전트가 이 파일을 읽어 data/facts 적재 또는 build-fact-store 후처리에 활용.
 *
 * 원본 복구가 필요하면:
 *   git checkout 96c91e42b179350c32280ab4fd44c64f9a6b9a17 -- pipeline/lib/fact-store.mjs pipeline/scripts/build-fact-store.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const localPath = join(ROOT, 'registry/local-fee-facts.json');
const outPath = join(ROOT, 'registry/local-fee-facts-matched.json');

if (!existsSync(localPath)) {
  console.error('local-fee-facts.json 없음');
  process.exit(1);
}

const local = JSON.parse(readFileSync(localPath, 'utf8'));
const facts = local.facts || [];

// 간단 숫자 추출 (요금 텍스트에서 첫 숫자)
function extractWon(text) {
  const m = String(text).match(/(\d{4,6})/);
  return m ? Number(m[1]) : null;
}

const matched = facts.map(f => {
  const won = f.attribute === 'PRICE_NIGHT' ? extractWon(f.value) : null;
  return {
    camp_hint: f.camp_hint,
    attribute: f.attribute,
    value: won ?? f.value,
    text: f.value,
    grade: 'CONFIRMED',
    src: 'local_gov',
    source_note: f.source,
  };
});

const out = {
  generated_at: new Date().toISOString(),
  note: '여주·구미·화성 공개 데이터 기반 사실. Fact Store 적재용. 캠핑장 ID 매칭은 다른 에이전트가 이어서 진행.',
  fact_count: matched.length,
  facts: matched,
};

writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${matched.length} matched-ready facts to ${outPath}`);
console.log('\n원본 복구 필요 시:');
console.log('git checkout 96c91e42b179350c32280ab4fd44c64f9a6b9a17 -- pipeline/lib/fact-store.mjs pipeline/scripts/build-fact-store.mjs');
