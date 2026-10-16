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
        basis: "방문자 후기 언급 1박 요금",
        grade: "MENTION",
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
