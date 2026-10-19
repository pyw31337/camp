// 땡큐캠핑(캠퍼스토리 엔진) 공개 예약 화면 읽기 — robots.txt `User-agent: * / Allow: /`.
// 업장 1곳의 날짜별 사이트 목록(/resv/axResCampSite.hbb)은 로그인 없이 캠핑장 화면이 직접 부르는 응답이다.
// 여기서 업장이 올린 사이트 사실(이름·규격·바닥·요금·입퇴실·주차·반려동물·타입)과, 그 시각의 사이트 상태를 읽는다.
// 상태(빈자리) 공개는 원천 승인 카드(docs/PILOT_INTAKE_CONTRACT.md 2절)를 따른다 — docs/PRIVATE_AVAILABILITY_RESEARCH.md.

export const THANKQ = {
  host: "https://m.thankqcamping.com",
  view: (cseq, ymd) => `https://m.thankqcamping.com/resv/view.hbb?cseq=${cseq}${ymd ? `&res_dt=${ymd}` : ""}`,
};

const strip = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const won = (s) => { const n = Number(String(s).replace(/[^0-9]/g, "")); return Number.isFinite(n) && n >= 5000 && n <= 2000000 ? n : null; };

// 사이트 목록 응답 → 사이트 배열. 응답에는 같은 사이트가 새 배치와 주석 처리된 옛 배치로 두 번 들어 있어 주석을 먼저 지운다.
export function parseSiteList(html) {
  const body = String(html ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const blocks = body.split(/<div class="site_div\b/).slice(1);
  const sites = [];
  for (const b of blocks) {
    const tip = b.match(/<span class="q_tip\s*([a-z]*)"\s*>([^<]*)(?:<em>(\d+)<\/em>)?/);
    const status = !tip ? "UNKNOWN" : tip[1] === "og" ? "OPEN" : tip[1] === "red" ? "CLOSED" : /완료/.test(tip[2]) ? "BOOKED" : "UNKNOWN";
    const name = strip(b.match(/<p class="na">([\s\S]*?)<\/p>/)?.[1]);
    if (!name) continue;
    const time = strip(b.match(/<p class="time">(입실[\s\S]*?)<\/p>/)?.[1]);
    const size = b.match(/규격\s*:\s*([\d.]+)m\s*×\s*([\d.]+)m/);
    // 표시되는 아이콘 항목만 읽는다(해당 없는 항목은 style="display:none;"로 숨겨져 있다).
    const items = [...b.matchAll(/<li class="item[^"]*"(\s+style="display:none;")?>[\s\S]*?<i class="fa-regular ([a-z-]+)[^"]*"><\/i>[\s\S]*?<span>([\s\S]*?)<\/span>/g)]
      .filter((m) => !m[1]).map((m) => [m[2], strip(m[3])]);
    const it = (icon) => items.find(([k]) => k === icon)?.[1] ?? null;
    const floor = it("fa-arrows-maximize")?.replace(/\s*\[.*$/, "") || null;
    const io = time.match(/입실\s*(\d{1,2})시(?:\s*(\d{2})분)?\D+퇴실\s*(\d{1,2})시(?:\s*(\d{2})분)?/);
    sites.push({
      name,
      status,
      units: status === "OPEN" && tip?.[3] ? Number(tip[3]) : status === "OPEN" ? 1 : 0,
      price: won(b.match(/<p class="pri">([^<]*)<\/p>/)?.[1]),
      size: size ? [Number(size[1]), Number(size[2])] : null,
      floor,
      kind: it("fa-campground"),
      parking: it("fa-circle-parking"),
      people: it("fa-family"),
      pet: items.some(([k]) => k === "fa-paw-simple"),
      carCamp: items.some(([k]) => k === "fa-caravan-simple"),
      checkIn: io ? `${io[1].padStart(2, "0")}:${io[2] ?? "00"}` : null,
      checkOut: io ? `${io[3].padStart(2, "0")}:${io[4] ?? "00"}` : null,
    });
  }
  return sites;
}

// 사이트 배열 → 공개용 요약(사이트 수·예약 가능 수). 수량은 사이트 단위로 센다.
export function summarizeSites(sites) {
  const total = sites.length;
  const open = sites.filter((s) => s.status === "OPEN").length;
  const known = sites.filter((s) => s.status !== "UNKNOWN").length;
  const prices = sites.map((s) => s.price).filter(Boolean);
  return { total, open, known, minPrice: prices.length ? Math.min(...prices) : null, maxPrice: prices.length ? Math.max(...prices) : null };
}

// 이름 비교용: 공백·괄호·흔한 꼬리말(오토캠핑장·캠핑장·야영장·글램핑…)을 지운다.
const SUFFIX = /(오토캠핑장|캠핑장|야영장|캠핑파크|캠핑리조트|글램핑장|글램핑|카라반|캠프|캠핑|파크|리조트)$/;
export function normName(s) {
  let n = String(s ?? "").replace(/\(.*?\)|\[.*?\]/g, "").replace(/[\s·.,&'"\-_/]/g, "").toLowerCase();
  for (let i = 0; i < 2; i++) n = n.replace(SUFFIX, "");
  return n;
}

// 자동완성에 보낼 검색어: 꼬리말을 뺀 핵심 이름(두 글자 이상).
export function queryOf(name) {
  const q = String(name ?? "").replace(/\(.*?\)|\[.*?\]/g, " ").replace(/(오토캠핑장|캠핑장|야영장|글램핑장)\s*$/, "").trim();
  return q.replace(/\s+/g, " ").length >= 2 ? q : String(name ?? "").trim();
}

// 자동완성 결과 중 같은 업장 하나를 고른다: 시·군·구가 같고 핵심 이름이 같아야 한다(포함 관계는 3글자 이상일 때만).
export function pickMatch(camp, results) {
  const want = normName(camp.name);
  const sgg = String(camp.sigungu ?? "").replace(/\s+/g, "");
  if (!want || !sgg) return null;
  const hits = (results ?? []).filter((r) => {
    const addr = String(r.shortAddress ?? "").replace(/\s+/g, "");
    if (!addr.includes(sgg) && !(sgg.length > 2 && addr.includes(sgg.replace(/[시군구]$/, "")))) return false;
    const got = normName(r.campName);
    return got === want || (Math.min(got.length, want.length) >= 3 && (got.includes(want) || want.includes(got)));
  });
  const exact = hits.filter((r) => normName(r.campName) === want);
  const pick = exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : null;
  return pick ? { cseq: Number(pick.campSeq), name: pick.campName, addr: pick.shortAddress } : null;
}

// 카탈로그 링크에서 이미 알려진 엔진 번호(땡큐캠핑 cseq / 캠퍼스토리 번호는 같은 번호를 쓴다).
export function linkedCseq(text) {
  const m = String(text ?? "").match(/thankqcamping\.com[^"'\s]*[?&]cseq=(\d+)|r\.camperstory\.com\/?\?(\d+)/);
  return m ? Number(m[1] ?? m[2]) : null;
}

// 관측할 날짜: 오늘(KST) 이후 가장 가까운 토요일 n개(1박). 토요일 당일이면 그날부터.
export function nextSaturdays(now = new Date(), n = 2) {
  const kst = new Date(now.getTime() + 9 * 3600e3);
  const day = kst.getUTCDay();
  const first = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + ((6 - day + 7) % 7)));
  return Array.from({ length: n }, (_, i) => new Date(first.getTime() + i * 7 * 864e5).toISOString().slice(0, 10));
}
