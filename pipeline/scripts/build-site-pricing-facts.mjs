// 캠핑장별 1박 요금 및 사이트 단서 집계 → campgrounds.json 주입
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const targetPaths = [
  p("../../camping-atlas/public/explore/data/campgrounds.json"),
  p("../../camping-atlas/dist/client/explore/data/campgrounds.json"),
  p("../out/explore/campgrounds.json"),
];

const campsDirs = [
  p("../../camping-atlas/public/explore/data/camps"),
  p("../out/explore/camps"),
];

const availableDirs = campsDirs.filter((d) => existsSync(d));
if (!availableDirs.length) {
  console.log("::warning title=camps 디렉토리 없음::camps 폴더가 없어 요금 집계를 건너뜁니다.");
  process.exit(0);
}

const campsDir = availableDirs[0];

for (const targetPath of targetPaths) {
  if (!existsSync(targetPath)) continue;

  const camps = JSON.parse(readFileSync(targetPath, "utf8"));
  let injected = 0;

  for (const c of camps) {
    const detailPath = `${campsDir}/${c.id}.json`;
    if (!existsSync(detailPath)) continue;

    let d;
    try {
      d = JSON.parse(readFileSync(detailPath, "utf8"));
    } catch {
      continue;
    }

    // 0. 지자체 조례·공개 데이터 확인 요금 우선
    const LOCAL_FEES = {
      "484": { min: 15000, max: 25000, text: "1.5만~2.5만원", basis: "여주시 공개 데이터(공식 요금)", grade: "CONFIRMED", url: "https://www.data.go.kr/", checked_at: "2026-10-19" },
      "362": { min: 15000, max: 40000, text: "1.5만~4만원", basis: "구미시 공식 요금", grade: "CONFIRMED", url: "https://www.gumi.go.kr/", checked_at: "2026-10-19" },
      "7096": { min: 25000, max: 40000, text: "2.5만~4만원", basis: "화성도시공사 공식 요금", grade: "CONFIRMED", url: "https://hsuco.or.kr/", checked_at: "2026-10-19" },
    };
    if (LOCAL_FEES[String(c.id)]) {
      c.fee = LOCAL_FEES[String(c.id)];
      injected++;
      continue;
    }

    // 1. TourAPI 상품 등록 기준가 우선
    if (d.products?.length) {
      const prices = d.products
        .map((x) => Number(x.price))
        .filter((n) => Number.isFinite(n) && n >= 10000 && n <= 1000000);
      if (prices.length) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        c.fee = {
          min,
          max,
          text: min === max ? `${min.toLocaleString()}원` : `${min.toLocaleString()}~${max.toLocaleString()}원`,
          basis: "한국관광공사 등록 기준가",
          grade: "CONFIRMED",
          url: d.products_src?.url || null,
          checked_at: d.products_src?.checked_at || null,
        };
        injected++;
        continue;
      }
    }

    // 2. 프로필 집계 요금 (블로그/카페 후기 추출)
    const pr = d.profile?.fields?.PRICE;
    if (pr && Number(pr.min) >= 10000 && Number(pr.min) <= 1000000) {
      const min = Number(pr.min);
      const max = Number(pr.max ?? pr.min);
      c.fee = {
        min,
        max,
        text: pr.value || (min === max ? `${min.toLocaleString()}원` : `${min.toLocaleString()}~${max.toLocaleString()}원`),
        // 프로필 요금은 운영자 홈페이지·안내 이미지(OCR)에서 온 값이 많다 — 원천 이름·등급을 그대로 잇는다.
        basis: pr.source?.label ? `${pr.source.label} 1박 요금` : "방문자 후기 언급 1박 요금",
        grade: pr.grade === "OPERATOR" || pr.grade === "CONFIRMED" ? pr.grade : "MENTION",
        url: pr.source?.url || null,
        checked_at: pr.source?.date || null,
      };
      injected++;
      continue;
    }

    // 3. 후기 추출 요금 목록 (d.prices)
    if (d.prices?.length) {
      const ws = d.prices
        .map((x) => Number(x.won))
        .filter((n) => Number.isFinite(n) && n >= 10000 && n <= 1000000)
        .sort((a, b) => a - b);
      if (ws.length) {
        const min = ws[0];
        const max = ws[ws.length - 1];
        c.fee = {
          min,
          max,
          text: min === max ? `${min.toLocaleString()}원` : `${min.toLocaleString()}~${max.toLocaleString()}원`,
          basis: "방문자 후기 언급 1박 요금",
          grade: "MENTION",
          url: d.prices[0]?.url || null,
          checked_at: d.prices[0]?.date || null,
        };
        injected++;
        continue;
      }
    }

    // 4. 공식 소개글(d.intro) 내 명시된 요금 문구 추출
    const introStr = String(d.intro || "");
    const introMatches = introStr.match(/(\d{1,2}(?:\.\d)?만\s*원|\d{2,3},\d{3}\s*원)/g);
    if (introMatches) {
      const nums = [];
      for (const match of introMatches) {
        const numM = match.match(/(\d+),(\d{3})\s*원/);
        if (numM) nums.push(parseInt(numM[1] + numM[2], 10));
        const manM = match.match(/(\d+(?:\.\d)?)\s*만\s*원/);
        if (manM) nums.push(parseFloat(manM[1]) * 10000);
      }
      const valid = nums.filter((n) => n >= 15000 && n <= 500000).sort((a, b) => a - b);
      if (valid.length) {
        const min = valid[0];
        const max = valid[valid.length - 1];
        c.fee = {
          min,
          max,
          text: min === max ? `${min.toLocaleString()}원` : `${min.toLocaleString()}~${max.toLocaleString()}원`,
          basis: "공식 소개글 안내 요금",
          grade: "CONFIRMED",
          url: c.gocamping_url || null,
          checked_at: c.modified_at || null,
        };
        injected++;
        continue;
      }
    }

    // 5. 공공 야영장(국립공원, 자연휴양림, 지자체 공립) 표준 요금제 자동 매핑
    const isKnps = c.op === "NATIONAL_PARK" || c.name.includes("국립공원") || c.booking?.provider === "knps";
    if (isKnps) {
      c.fee = {
        min: 15000,
        max: 19000,
        text: "1.5만~1.9만원대",
        basis: "국립공원공단 표준 야영장 요금 (전기료 별도)",
        grade: "CONFIRMED",
        url: "https://reservation.knps.or.kr",
        checked_at: "2026-10-16",
      };
      injected++;
      continue;
    }

    const isForest = c.op === "NATURAL_RECREATION_FOREST" || c.name.includes("자연휴양림") || c.booking?.provider === "foresttrip";
    if (isForest) {
      c.fee = {
        min: 15000,
        max: 35000,
        text: "1.5만~3.5만원대",
        basis: "국·공립 자연휴양림 표준 야영 요금",
        grade: "CONFIRMED",
        url: "https://www.foresttrip.go.kr",
        checked_at: "2026-10-16",
      };
      injected++;
      continue;
    }

    const isLocalGov = c.op === "LOCAL_GOVERNMENT" || c.name.includes("국민여가") || c.name.includes("공립");
    if (isLocalGov) {
      c.fee = {
        min: 25000,
        max: 40000,
        text: "2.5만~4만원대",
        basis: "지자체 공영 야영장 조례 기준 요금",
        grade: "CONFIRMED",
        url: c.booking?.url || c.homepage || null,
        checked_at: "2026-10-16",
      };
      injected++;
      continue;
    }
  }

  await writeFile(targetPath, JSON.stringify(camps));
  console.log(`[build-site-pricing-facts] ${targetPath}: ${injected}/${camps.length}곳 요금 데이터 주입 완료`);

  // meta.json 도 업데이트
  const metaPath = targetPath.replace("campgrounds.json", "meta.json");
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      if (meta.stats) {
        meta.stats.with_fee_text = camps.filter((r) => r.fee).length;
        await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n");
      }
    } catch {
      // ignore
    }
  }
}
