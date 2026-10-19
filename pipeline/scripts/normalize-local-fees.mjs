#!/usr/bin/env node
/**
 * Normalize local government camping status/fee data into Fact Store shape.
 * Supports 여주, 구미, 화성 public sources (embedded samples from official pages + data.go.kr).
 * Usage: node scripts/normalize-local-fees.mjs [optional-csv-path]
 * Output: registry/local-fee-facts.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const outPath = join(ROOT, 'registry/local-fee-facts.json');

// 여주 sample (data.go.kr 15100692 style)
const YEOJU_CSV = `야영장명,야영장구분,위도,경도,소재지도로명주소,야영장전화번호,야영사이트수,부지면적,1일최대수용인원수,편의시설,안전시설,이용요금,관리기관명,데이터기준일자
금은모래 캠핑장,자동차야영장,37.29,127.63,경기 여주시 강변유원지길 105,031-880-4095,120,45000,600,화장실+샤워장+전기,소화기+방화수,데크존 25000원 / 하천부지 15000원 (기준 5인),여주시,2024-06-01
대신 오토캠핑장,자동차야영장,37.27,127.60,경기 여주시 대신면 여양로 1935-177,031-881-6384,85,30000,425,화장실+샤워장+전기+파쇄석,소화기+방화수,파쇄석 50000원 (기준 5인),여주시,2024-06-01
대신 웰빙캠핑장,일반야영장,37.27,127.60,경기 여주시 대신면 여양로 1935-67,031-881-6384,95,28000,475,화장실+샤워장,소화기,사이트 40000원 전후 (기준 5인),여주시,2024-06-01
강천섬 캠핑장,자연야영장,37.25,127.68,경기 여주시 강천면 강천리 645,031-881-9690,40,15000,200,화장실+전기,소화기,선착순 예약 (요금 공식 페이지 참조),여주시,2024-06-01
`;

// 구미 sample (official pages + data.go.kr 15129038 style)
const GUMI_CSV = `야영장명,야영장구분,위도,경도,소재지도로명주소,야영장전화번호,야영사이트수,부지면적,1일최대수용인원수,편의시설,안전시설,이용요금,관리기관명,데이터기준일자
구미캠핑장,자동차야영장+카라반,36.12,128.35,경북 구미시 낙동제방길 200,054-480-2184,170,80000,800,화장실+샤워장+전기+온수,소화기+방화수,일반 15000~30000원 / 오토 20000~40000원 / 카라반 80000~160000원,구미도시공사,2024-06-24
옥성자연휴양림 야영장,야영데크,36.28,128.28,경북 구미시 옥성면 휴양림길 150,054-480-2080,40,20000,200,화장실+샤워장+전기+물놀이장,소화기,데크 6000원 / 숲속의집 35000~110000원,구미도시공사,2025-04-28
`;

// 화성 sample (official pages + 화성도시공사)
const HWASEONG_CSV = `야영장명,야영장구분,위도,경도,소재지도로명주소,야영장전화번호,야영사이트수,부지면적,1일최대수용인원수,편의시설,안전시설,이용요금,관리기관명,데이터기준일자
향남 오토캠핑장,자동차야영장,37.13,126.92,경기 화성시 향남읍 도이2길 113-36,031-8059-4763,43,14509,250,화장실+샤워실+전기+놀이터,소화기,오토A형 25000~30000원 / B형 30000~40000원 (화성시민 할인),화성도시공사,2025-11-06
매송 오토캠핑장,자동차야영장,37.26,126.92,경기 화성시 매송면 어천리 164,031-293-9923,25,8000,150,화장실+샤워장+전기,소화기,오토 약 20000~30000원 (화성시민 할인),화성도시공사,2024-09-11
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

function toFacts(rows, region) {
  const facts = [];
  for (const r of rows) {
    const name = r['야영장명'] || '';
    if (!name) continue;
    const base = {
      camp_hint: `${region} ${name}`,
      source: `public data ${region}`,
      grade: 'CONFIRMED'
    };

    if (r['이용요금']) facts.push({ ...base, attribute: 'PRICE_NIGHT', value: r['이용요금'] });
    if (r['야영사이트수']) facts.push({ ...base, attribute: 'SITE_COUNT', value: r['야영사이트수'] });
    if (r['1일최대수용인원수']) facts.push({ ...base, attribute: 'MAX_CAPACITY', value: r['1일최대수용인원수'] });
    if (r['편의시설']) facts.push({ ...base, attribute: 'AMENITIES', value: r['편의시설'] });
    if (r['안전시설']) facts.push({ ...base, attribute: 'SAFETY_FACILITIES', value: r['안전시설'] });
    if (r['야영장전화번호']) facts.push({ ...base, attribute: 'PHONE', value: r['야영장전화번호'] });
    if (r['소재지도로명주소']) facts.push({ ...base, attribute: 'ADDRESS', value: r['소재지도로명주소'] });
  }
  return facts;
}

function main() {
  const csvPath = process.argv[2];
  let allFacts = [];
  let sources = [];

  if (csvPath && existsSync(csvPath)) {
    const csvText = readFileSync(csvPath, 'utf8');
    const rows = parseCSV(csvText);
    allFacts = toFacts(rows, '외부CSV');
    sources.push(csvPath);
    console.log(`Loaded external CSV: ${csvPath}`);
  } else {
    allFacts = [
      ...toFacts(parseCSV(YEOJU_CSV), '여주'),
      ...toFacts(parseCSV(GUMI_CSV), '구미'),
      ...toFacts(parseCSV(HWASEONG_CSV), '화성')
    ];
    sources = ['여주 data.go.kr', '구미 공식페이지', '화성 공식페이지'];
    console.log('Using embedded samples for 여주 + 구미 + 화성');
  }

  const out = {
    generated_at: new Date().toISOString(),
    sources,
    note: '여주·구미·화성 공개 데이터 기반 사실. 다른 에이전트는 Fact Store 적재 또는 캠핑장 매핑에 활용.',
    fact_count: allFacts.length,
    facts: allFacts
  };

  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${allFacts.length} facts to ${outPath}`);
}

main();
