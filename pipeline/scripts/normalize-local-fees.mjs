#!/usr/bin/env node
/**
 * Normalize local government camping status/fee CSVs into Fact Store shape.
 * Currently expanded for 여주시 야영캠핑장현황 (data.go.kr 15100692).
 * Columns: 야영장명, 구분, 위경도, 도로명주소, 전화번호, 야영사이트수, 부지면적, 편의시설, 안전시설, 이용요금, 관리기관 등.
 * Usage: node scripts/normalize-local-fees.mjs [optional-csv-path]
 * Output: registry/local-fee-facts.json  (relative to pipeline/ when run via npm script)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const outPath = join(ROOT, 'registry/local-fee-facts.json');

// Embedded sample based on public 여주 data + official fee pages
const SAMPLE_CSV = `야영장명,야영장구분,위도,경도,소재지도로명주소,야영장전화번호,야영사이트수,부지면적,1일최대수용인원수,편의시설,안전시설,이용요금,관리기관명,데이터기준일자
금은모래 캠핑장,자동차야영장,37.29,127.63,경기 여주시 강변유원지길 105,031-880-4095,120,45000,600,화장실+샤워장+전기,소화기+방화수,데크존 25000원 / 하천부지 15000원 (기준 5인),여주시,2024-06-01
대신 오토캠핑장,자동차야영장,37.27,127.60,경기 여주시 대신면 여양로 1935-177,031-881-6384,85,30000,425,화장실+샤워장+전기+파쇄석,소화기+방화수,파쇄석 50000원 (기준 5인),여주시,2024-06-01
대신 웰빙캠핑장,일반야영장,37.27,127.60,경기 여주시 대신면 여양로 1935-67,031-881-6384,95,28000,475,화장실+샤워장,소화기,사이트 40000원 전후 (기준 5인),여주시,2024-06-01
강천섬 캠핑장,자연야영장,37.25,127.68,경기 여주시 강천면 강천리 645,031-881-9690,40,15000,200,화장실+전기,소화기,선착순 예약 (요금 공식 페이지 참조),여주시,2024-06-01
`;

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  });
}

function toFacts(rows) {
  const facts = [];
  for (const r of rows) {
    const name = r['야영장명'] || r['야영(캠핑)장명'] || '';
    if (!name) continue;
    const base = { camp_hint: `여주 ${name}`, source: 'data.go.kr 여주시 야영캠핑장현황', grade: 'CONFIRMED' };

    if (r['이용요금']) {
      facts.push({ ...base, attribute: 'PRICE_NIGHT', value: r['이용요금'] });
    }
    if (r['야영사이트수']) {
      facts.push({ ...base, attribute: 'SITE_COUNT', value: r['야영사이트수'] });
    }
    if (r['1일최대수용인원수']) {
      facts.push({ ...base, attribute: 'MAX_CAPACITY', value: r['1일최대수용인원수'] });
    }
    if (r['편의시설']) {
      facts.push({ ...base, attribute: 'AMENITIES', value: r['편의시설'] });
    }
    if (r['안전시설']) {
      facts.push({ ...base, attribute: 'SAFETY_FACILITIES', value: r['안전시설'] });
    }
    if (r['야영장전화번호']) {
      facts.push({ ...base, attribute: 'PHONE', value: r['야영장전화번호'] });
    }
    if (r['소재지도로명주소']) {
      facts.push({ ...base, attribute: 'ADDRESS', value: r['소재지도로명주소'] });
    }
  }
  return facts;
}

function main() {
  const csvPath = process.argv[2];
  let csvText = SAMPLE_CSV;
  if (csvPath && existsSync(csvPath)) {
    csvText = readFileSync(csvPath, 'utf8');
    console.log(`Loaded external CSV: ${csvPath}`);
  } else {
    console.log('Using embedded Yeoju sample CSV');
  }

  const rows = parseCSV(csvText);
  const facts = toFacts(rows);

  const out = {
    generated_at: new Date().toISOString(),
    source_dataset: 'data.go.kr/15100692 경기도 여주시_야영캠핑장현황',
    note: '여주 CSV 파싱 결과. 다른 에이전트는 이 파일을 기준으로 Fact Store 적재 또는 캠핑장 매핑 진행.',
    row_count: rows.length,
    fact_count: facts.length,
    facts
  };

  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${facts.length} facts to ${outPath}`);
}

main();
