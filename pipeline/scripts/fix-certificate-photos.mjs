// pipeline/scripts/fix-certificate-photos.mjs
// 전수 조사하여 관광사업등록증/사업자등록증/도면 등 서류 이미지가 메인 사진으로 등록된 캠핑장을
// 고해상도 실물 풍경/시설 사진으로 정정하는 스크립트

import fs from "node:fs";
import path from "node:path";
import { isDocumentOrCertificate, prioritizeRealCampPhotos } from "../lib/image-document-filter.mjs";

const campsDir = "camping-atlas/public/explore/data/camps";
const campgroundsPath = "camping-atlas/public/explore/data/campgrounds.json";

const camps = JSON.parse(fs.readFileSync(campgroundsPath, "utf-8"));
const campMap = new Map(camps.map(c => [String(c.id), c]));

let fixedCount = 0;
const fixedList = [];

for (const camp of camps) {
  const id = String(camp.id);
  const detailFile = path.join(campsDir, `${id}.json`);
  if (!fs.existsSync(detailFile)) continue;

  let detail;
  try {
    detail = JSON.parse(fs.readFileSync(detailFile, "utf-8"));
  } catch {
    continue;
  }

  let campModified = false;
  let detailModified = false;

  // 1. detail.photos 검사 및 재정렬
  if (Array.isArray(detail.photos) && detail.photos.length > 1) {
    if (isDocumentOrCertificate(detail.photos[0], camp, detail)) {
      const reordered = prioritizeRealCampPhotos(detail.photos, camp, detail);
      if (!isDocumentOrCertificate(reordered[0], camp, detail)) {
        detail.photos = reordered;
        detailModified = true;
        // camp.ph 도 1등 사진으로 갱신
        if (reordered[0].t) {
          camp.ph = reordered[0].t;
          campModified = true;
        }
      }
    }
  }

  // 2. camp.img 또는 camp.ph 가 서류인지 검사
  const imgIsDoc = isDocumentOrCertificate(camp.img, camp, detail);
  const phIsDoc = isDocumentOrCertificate(camp.ph, camp, detail);

  if (imgIsDoc || phIsDoc) {
    // 실물 사진 후보군 찾기
    const candidateUrls = [
      ...(detail.photos?.filter(p => !isDocumentOrCertificate(p, camp, detail)).map(p => p.l || p.t) || []),
      ...(detail.gcd?.photos?.filter(u => !isDocumentOrCertificate(u, camp, detail)) || []),
      ...(detail.photos_remote?.filter(u => !isDocumentOrCertificate(u, camp, detail)) || [])
    ];

    if (candidateUrls.length > 0) {
      const bestRealPhoto = candidateUrls[0];
      if (imgIsDoc) {
        camp.img = bestRealPhoto;
        campModified = true;
      }
      if (phIsDoc && detail.photos?.length && !isDocumentOrCertificate(detail.photos[0], camp, detail)) {
        camp.ph = detail.photos[0].t;
        campModified = true;
      }
      fixedCount++;
      fixedList.push({ id, name: camp.name, newImg: camp.img, newPh: camp.ph });
    }
  }

  if (detailModified) {
    fs.writeFileSync(detailFile, JSON.stringify(detail, null, 2) + "\n");
  }
}

if (campModifiedList(fixedCount)) {
  fs.writeFileSync(campgroundsPath, JSON.stringify(camps) + "\n");
}

function campModifiedList(cnt) {
  return cnt > 0;
}

console.log(`[fix-certificate-photos] 총 ${fixedCount}개 캠핑장의 서류/등록증 메인 사진을 실물 고해상도 사진으로 교체 완료.`);
console.log("교체된 캠핑장 목록:", JSON.stringify(fixedList, null, 2));
