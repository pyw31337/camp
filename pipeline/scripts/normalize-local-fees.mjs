#!/usr/bin/env node
/**
 * Stub: Normalize local government camping fee/open files into Fact Store shape.
 * Target examples: 여주, 구미, 화성, 청양 public CSVs from data.go.kr.
 * Output: pipeline/registry/local-fee-facts.json
 * Run after downloading source files manually or via public-data workflow.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

const sampleFacts = [
  {
    camp_hint: "여주 금은모래 캠핑장",
    attribute: "PRICE_NIGHT",
    value: "데크존 25000원 / 하천부지 15000원 (기준 5인)",
    source: "여주시 공식 안내",
    grade: "CONFIRMED",
    note: "공개 페이지 기반. 실제 파일 파싱 후 교체."
  },
  {
    camp_hint: "여주 대신 오토캠핑장",
    attribute: "PRICE_NIGHT",
    value: "파쇄석 50000원 (기준 5인)",
    source: "여주 관광 공식",
    grade: "CONFIRMED"
  }
];

const out = {
  generated_at: new Date().toISOString(),
  note: "초기 샘플. 실제 CSV 다운로드 후 파싱하여 확장. 다른 에이전트가 속성 매핑 후 data/facts/ 적재.",
  facts: sampleFacts
};

writeFileSync(join(process.cwd(), 'pipeline/registry/local-fee-facts-sample.json'), JSON.stringify(out, null, 2));
console.log('Wrote local fee sample');
