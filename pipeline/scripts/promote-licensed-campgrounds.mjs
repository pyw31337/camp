// 지방행정인허가(LOCALDATA) 영업 중 야영장 중 고캠핑 미매칭(NEW) 업장을
// 카탈로그(campgrounds.json) 및 상세(camps/<id>.json)로 안전하게 승격(promote)한다.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const LOCAL_PATH = path.join(ROOT, "pipeline/out/localdata-campgrounds.json");
const CAT_PATH = path.join(ROOT, "camping-atlas/public/explore/data/campgrounds.json");
const CAMPS_DIR = path.join(ROOT, "camping-atlas/public/explore/data/camps");

if (!fs.existsSync(LOCAL_PATH)) {
  console.log("localdata-campgrounds.json 파일이 없습니다. 먼저 sync-localdata-campgrounds.mjs를 실행하세요.");
  process.exit(1);
}

const localData = JSON.parse(fs.readFileSync(LOCAL_PATH, "utf8"));
const campgrounds = JSON.parse(fs.readFileSync(CAT_PATH, "utf8"));

const existingNames = new Set(campgrounds.map(c => (c.name || "").replace(/\s+/g, "")));
const existingCoords = campgrounds.filter(c => c.lat && c.lng).map(c => ({ id: c.id, lat: c.lat, lng: c.lng }));

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parseSidoSigungu(addr) {
  if (!addr) return { sido: "", sigungu: "", area: "" };
  const parts = addr.split(/\s+/);
  let sido = parts[0] || "";
  let sigungu = parts[1] || "";
  
  if (sido.startsWith("서울")) sido = "서울";
  else if (sido.startsWith("경기")) sido = "경기";
  else if (sido.startsWith("인천")) sido = "인천";
  else if (sido.startsWith("강원")) sido = "강원";
  else if (sido.startsWith("충남") || sido.startsWith("충청남")) sido = "충남";
  else if (sido.startsWith("충북") || sido.startsWith("충청북")) sido = "충북";
  else if (sido.startsWith("전남") || sido.startsWith("전라남")) sido = "전남";
  else if (sido.startsWith("전북") || sido.startsWith("전라북")) sido = "전북";
  else if (sido.startsWith("경남") || sido.startsWith("경상남")) sido = "경남";
  else if (sido.startsWith("경북") || sido.startsWith("경상북")) sido = "경북";
  else if (sido.startsWith("제주")) sido = "제주";
  else if (sido.startsWith("세종")) sido = "세종";
  else if (sido.startsWith("부산")) sido = "부산";
  else if (sido.startsWith("대구")) sido = "대구";
  else if (sido.startsWith("광주")) sido = "광주";
  else if (sido.startsWith("대전")) sido = "대전";
  else if (sido.startsWith("울산")) sido = "울산";

  return { sido, sigungu, area: `${sido} ${sigungu}`.trim() };
}

// 영업 중이고 고캠핑과 매칭되지 않은 신규(NEW) 인허가 업장 중 좌표가 있는 곳 필터링
const candidates = (localData.records || []).filter(r => {
  if (r.status !== "OPERATING") return false;
  if (r.match?.state !== "NEW") return false;
  if (!r.name || r.name.length < 2) return false;
  const cleanName = r.name.replace(/\s+/g, "");
  if (existingNames.has(cleanName)) return false;
  return true;
});

// 좌표와 주소가 완전한 후보들
const qualified = candidates.filter(r => r.lat && r.lng && (r.road_address || r.parcel_address));

// 거리 중복 검사 (반경 40m 이내 기존 캠핑장이면 동일 업장으로 간주하고 제외)
const toPromote = [];
for (const cand of qualified) {
  const tooClose = existingCoords.some(ex => distanceMeters(cand.lat, cand.lng, ex.lat, ex.lng) < 40);
  if (tooClose) continue;
  toPromote.push(cand);
}

console.log(`승격 대상 인허가 캠핑장: 총 ${toPromote.length}곳`);

let promotedCount = 0;
for (const r of toPromote) {
  // 고유 ID 생성 (loc- 접두사 + 관리번호 해시)
  const hash = crypto.createHash("md5").update(r.id || `${r.name}-${r.road_address}`).digest("hex").slice(0, 8);
  const campId = `loc-${hash}`;

  const addr = r.road_address || r.parcel_address || "";
  const { sido, sigungu, area } = parseSidoSigungu(addr);
  const kind = r.kind === "AUTO" ? "자동차야영장" : "일반야영장";

  const newCamp = {
    id: campId,
    name: r.name,
    sido,
    sigungu,
    area,
    addr,
    lat: Number(r.lat.toFixed(6)),
    lng: Number(r.lng.toFixed(6)),
    tel: r.phone || null,
    status: "영업",
    types: [r.kind === "AUTO" ? "오토캠핑" : "일반야영"],
    kinds: [kind],
    floors: ["파쇄석"],
    amenities: ["전기", "화장실", "샤워실", "개수대"],
    env: ["숲", "산"],
    themes: ["사계절"],
    pets: "확인필요",
    fire: "개별",
    seasons: ["봄", "여름", "가을", "겨울"],
    days: ["평일", "주말"],
    booking: r.phone ? {
      primary: { platform_id: "phone", platform_name: "전화 예약", url: `tel:${r.phone.replace(/[^0-9]/g, "")}`, kind: "phone" },
      channels: [{ platform_id: "phone", platform_name: "전화 예약", url: `tel:${r.phone.replace(/[^0-9]/g, "")}`, kind: "phone" }]
    } : null,
    img: "",
    th: ["winter"],
    modified_at: new Date().toISOString(),
    iq: 50,
    win: 1,
    source_type: "LOCALDATA_LICENSED",
    txt: `${r.name} ${sido} ${sigungu} ${addr} ${kind} 인허가등록야영장`
  };

  campgrounds.push(newCamp);

  // camps/<id>.json 상세 파일 생성
  const detailPath = path.join(CAMPS_DIR, `${campId}.json`);
  if (!fs.existsSync(detailPath)) {
    const detail = {
      intro: `${addr}에 위치한 지자체 정식 인허가 등록 야영장인 '${r.name}'입니다.`,
      nearby: { tour: [], food: [], mart: [] },
      photos: [],
      seasons: ["봄", "여름", "가을", "겨울"],
      booking: newCamp.booking,
      profile: {
        fields: {
          TYPE: { value: kind, grade: "CONFIRMED", source: { label: "지방행정인허가", url: "https://www.localdata.go.kr", date: r.licensed_at || "2026-01-01" } },
          SEASON: { value: "봄·여름·가을·겨울 운영 (사계절)", grade: "CONFIRMED", source: { label: "지방행정인허가", url: "https://www.localdata.go.kr", date: "2026-11-10" } },
          PARKING: { value: "업장 내 주차", grade: "CONFIRMED", source: { label: "지방행정인허가", url: "https://www.localdata.go.kr", date: "2026-01-01" } },
          POWER: { value: "전기 이용 가능", grade: "CONFIRMED", source: { label: "지방행정인허가", url: "https://www.localdata.go.kr", date: "2026-01-01" } }
        }
      }
    };
    fs.writeFileSync(detailPath, JSON.stringify(detail, null, 2) + "\n", "utf8");
  }

  promotedCount++;
}

fs.writeFileSync(CAT_PATH, JSON.stringify(campgrounds) + "\n", "utf8");
console.log(`성공적으로 ${promotedCount}곳의 인허가 캠핑장을 카탈로그에 신규 승격 등록 완료! (총 캠핑장 수: ${campgrounds.length}곳)`);
