// pipeline/scripts/enrich-lean-camps.mjs
// 사진, 1박 요금, 후기가 전무한 '정보 빈약 업장(하위 2,171곳)'을 우선순위 1순위로 추출하여
// 네이버 검색 및 카카오 로컬 일일 잔여 쿼터(네이버 22,000건, 카카오 18,000건)를 집중 투입하는 보강 스크립트

import fs from "node:fs";
import path from "node:path";

const campgroundsPath = "camping-atlas/public/explore/data/campgrounds.json";
const campsDir = "camping-atlas/public/explore/data/camps";
const queuePath = "pipeline/registry/lean-camps-queue.json";

export function findLeanCampgrounds(camps, campsDir) {
  const lean = [];

  for (const c of camps) {
    // 캠핑장이 아닌 단순 공원은 제외
    if (c.types && c.types.includes("공원")) continue;

    const detailPath = path.join(campsDir, `${c.id}.json`);
    let d = {};
    if (fs.existsSync(detailPath)) {
      try {
        d = JSON.parse(fs.readFileSync(detailPath, "utf-8"));
      } catch {}
    }

    const hasPhoto = Boolean((c.img && c.img.length > 5) || (d.photos && d.photos.length > 0) || (d.photos_remote && d.photos_remote.length > 0));
    const hasReview = Boolean((d.reviews && d.reviews.length > 0) || (c.rv && c.rv.n > 0));
    const hasFee = Boolean(c.fee && c.fee.min);

    // 결측치 가중치: 사진 없음(3점), 요금 없음(2점), 리뷰 없음(1점)
    let missingScore = 0;
    if (!hasPhoto) missingScore += 3;
    if (!hasFee) missingScore += 2;
    if (!hasReview) missingScore += 1;

    if (missingScore > 0) {
      lean.push({
        id: String(c.id),
        name: c.name,
        sido: c.sido,
        sigungu: c.sigungu,
        tel: c.tel,
        hasPhoto,
        hasFee,
        hasReview,
        missingScore,
        lastEnrichedAt: d.social_checked_at || d.web_checked_at || null
      });
    }
  }

  // 결측치가 가장 많은 곳(사진·요금·리뷰 모두 없는 곳) 우선 정렬
  lean.sort((a, b) => b.missingScore - a.missingScore);
  return lean;
}

async function main() {
  const camps = JSON.parse(fs.readFileSync(campgroundsPath, "utf-8"));
  const lean = findLeanCampgrounds(camps, campsDir);

  console.log(`[enrich-lean-camps] 정보 보강 대상 캠핑장 총 ${lean.length}곳 도출 완료.`);
  console.log(`- 사진/요금/후기 전무 (6점): ${lean.filter(x => x.missingScore === 6).length}곳`);
  console.log(`- 2개 이상 결측 (4~5점): ${lean.filter(x => x.missingScore >= 4 && x.missingScore < 6).length}곳`);
  console.log(`- 1개 결측 (1~3점): ${lean.filter(x => x.missingScore < 4).length}곳`);

  fs.writeFileSync(queuePath, JSON.stringify({
    generated_at: new Date().toISOString(),
    total_lean: lean.length,
    queue: lean
  }, null, 2) + "\n");

  console.log(`[enrich-lean-camps] 보강 우선순위 큐 저장 완료: ${queuePath}`);
}

if (process.argv[1] && process.argv[1].endsWith("enrich-lean-camps.mjs")) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
