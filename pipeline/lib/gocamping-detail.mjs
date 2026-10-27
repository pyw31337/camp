// 고캠핑 상세 화면(https://www.gocamping.or.kr/bsite/camp/info/read.do?c_no=…)에서 공개 API에 없는 항목을 읽는다.
// 소유자 2026-10-20: 요금표(평상시·성수기 × 주중·주말), 시설정보 표 전체, 글램핑·카라반 내부시설, 배치도, 시설 사진, 소개 전문, 최종 수정일.
// robots.txt(User-Agent: * Disallow: /*search*)상 상세 화면은 허용. 출처(고캠핑 상세 주소·확인 시각)를 항상 같이 남긴다.
const ent = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&middot;": "·" };
export const text = (h) => String(h ?? "")
  .replace(/<!--[\s\S]*?-->/g, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&[a-z#0-9]+;/gi, (m) => ent[m] ?? (m.startsWith("&#") ? String.fromCharCode(parseInt(m.slice(2).replace(/^x/, "0x"))) : " "))
  .replace(/[ \t\r]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
const ORIGIN = "https://www.gocamping.or.kr";
const abs = (u) => (/^https?:/.test(u) ? u : `${ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`);
const orig = (u) => abs(u).replace(/\/thumb\/thumb_\d+_/, "/"); // 썸네일 → 원본
const list = (v) => v.split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean);

function dl(html) {
  const out = [];
  for (const m of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    const k = text(m[1]).replace(/\s+/g, " "), v = text(m[2]).replace(/홈페이지 바로가기|새창으로/g, "").replace(/\s+/g, " ").trim();
    if (k) out.push([k, v]);
  }
  return out;
}
function table(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<(th|td)([^>]*)>([\s\S]*?)<\/\1>/g)].map((c) => ({ h: c[1] === "th", t: text(c[3]).replace(/\s+/g, " "), cs: +(c[2].match(/colspan="(\d+)"/)?.[1] ?? 1), rs: +(c[2].match(/rowspan="(\d+)"/)?.[1] ?? 1) })));
  return rows.filter((r) => r.length);
}
/** 요금표: 머리 2줄(평상시/성수기 × 주중/주말)을 펼쳐 열 이름을 만든다. */
function priceTable(rows) {
  const head = rows.filter((r) => r.every((c) => c.h));
  const body = rows.filter((r) => !r.every((c) => c.h));
  let cols = [];
  if (head.length >= 2) {
    const top = []; for (const c of head[0].slice(1)) for (let i = 0; i < c.cs; i++) top.push(c.t);
    cols = head[1].map((c, i) => `${top[i] ?? ""} ${c.t}`.trim());
  } else if (head.length === 1) cols = head[0].slice(1).map((c) => c.t);
  return { cols, rows: body.map((r) => ({ label: r[0]?.t ?? "", values: r.slice(1).map((c) => c.t) })) };
}
const won = (s) => { const n = Number(String(s).replace(/[^\d]/g, "")); return n >= 1000 && n <= 5000000 ? n : null; };

export function parseGocampingDetail(html, id) {
  const sect = (start, end) => { const i = html.indexOf(start); if (i < 0) return ""; const j = end ? html.indexOf(end, i + start.length) : -1; return html.slice(i, j > 0 ? j : i + 40000); };
  const out = { id: String(id), url: `${ORIGIN}/bsite/camp/info/read.do?c_no=${id}` };
  // 머리 요약(주소·문의처·유형·운영기간·운영일·예약방법·주변이용가능시설)
  const top = sect('class="camp-info', "캠핑장 소개");
  const head = Object.fromEntries(dl(top).filter(([k]) => !/홈페이지|예약페이지/.test(k)));
  if (Object.keys(head).length) out.info = head;
  out.tagline = text(top.match(/<p[^>]*class="[^"]*(?:sub|summary|line)[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "") || undefined;
  // 안전교육 이수 연도(최근 3년, 고캠핑 HTML span/sapn 태그)
  const safetyYears = [...html.matchAll(/class="safety-year"[^>]*>(\d{4})/gi)].map((m) => Number(m[1]));
  if (safetyYears.length) out.safety_years = [...new Set(safetyYears)].sort();
  // 공식 성수기 기간
  const peakMatch = html.match(/성수기\s*:\s*([^<\n\r]+)/i);
  if (peakMatch) out.peak_season = text(peakMatch[1]);
  // 소개 전문 + 최종 수정일 + 소개 사진
  const intro = sect("캠핑장 소개</h2>", "캠핑장 시설정보");
  const introText = intro.match(/<p[^>]*>([\s\S]*?)<\/p>/g)?.map(text).filter((t) => t.length > 20 && !/최종 정보 수정일/.test(t)).join("\n");
  if (introText) out.intro = introText;
  const upd = html.match(/최종 정보 수정일\s*:\s*(\d{4}-\d{2}-\d{2})/)?.[1]; if (upd) out.updated = upd;
  // 시설정보 표 전체
  const fac = sect("캠핑장 시설정보</h2>", "시설 사진");
  const facs = dl(fac).filter(([k, v]) => v && !/^주소$/.test(k) && !(k === "사이트 간격" && /^0\s*M$/i.test(v)));
  if (facs.length) {
    out.facilities = facs.map(([k, v]) => ({ k, v, items: /내부시설|주요시설|기타|부대시설|안전시설|대여|바닥형태/.test(k) ? list(v) : undefined }));
    const rent = facs.find(([k]) => k === "캠핑장비대여")?.[1];
    if (rent && !/없음|불가/.test(rent)) out.rental_equipment = list(rent);
    const gap = facs.find(([k]) => k === "사이트 간격")?.[1];
    if (gap) out.site_gap_m = text(gap);
    const safe = facs.find(([k]) => k === "안전시설현황")?.[1];
    if (safe) out.safety_text = text(safe);
  }
  // 시설 사진(원본 주소)
  const ph = sect("시설 사진</h2>", "이용안내");
  const photos = [...new Set([...ph.matchAll(/<img[^>]+src="([^"]*\/upload\/camp\/[^"]+)"/g)].map((m) => orig(m[1])))];
  if (photos.length) out.photos = photos;
  const ip = [...new Set([...intro.matchAll(/<img[^>]+src="([^"]*\/upload\/camp\/[^"]+)"/g)].map((m) => orig(m[1])))];
  if (ip.length) out.intro_photos = ip;
  // 이용안내: 소제목(h3)마다 요금표·안내문
  const use0 = sect("이용안내</h2>", "위치/주변정보"), cut = use0.indexOf('<div class="camp-use-info">');
  const use = cut > 0 ? use0.slice(0, cut) : use0;
  const blocks = [];
  for (const b of use.split(/<h3[^>]*class="camp-title"[^>]*>/).slice(1)) {
    const title = text(b.slice(0, b.indexOf("</h3>")));
    const tb = b.match(/<table[\s\S]*?<\/table>/)?.[0];
    const imgs = [...b.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => abs(m[1])).filter((u) => /upload/.test(u));
    const x = { title };
    if (tb) { const pt = priceTable(table(tb)); if (pt.rows.length) x.table = pt; }
    else { const t = text(b.slice(b.indexOf("</h3>"))); if (t) x.text = t.slice(0, 1500); }
    if (imgs.length) x.images = imgs;
    if (x.table || x.text || x.images) blocks.push(x);
  }
  // 요금 블록과 그 밖의 안내(편의시설·주요프로그램·배치도·보험 등 h2 단위)
  for (const m of html.matchAll(/<div class="camp-use-info">([\s\S]*?)(?=<div class="camp-use-info">|<div class="camp-map">)/g)) {
    const h2 = text(m[1].match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "");
    if (!h2 || h2 === "이용안내") continue;
    const imgs = [...m[1].matchAll(/<img[^>]+src="([^"]+)"/g)].map((x) => abs(x[1])).filter((u) => /upload/.test(u));
    if (/배치도/.test(h2)) { if (imgs.length) out.layout = imgs; continue; }
    const t = text(m[1].replace(/<h2[\s\S]*?<\/h2>/, "")); 
    blocks.push({ title: h2, ...(t ? { text: t.slice(0, 1500) } : {}), ...(imgs.length ? { images: imgs } : {}) });
  }
  if (blocks.length) out.guide = blocks;
  const fees = [];
  for (const b of blocks) for (const r of b.table?.rows ?? []) r.values.forEach((v, i) => { const n = won(v); if (n) fees.push({ won: n, label: `${b.title} · ${r.label}`, period: b.table.cols[i] ?? "" }); });
  if (fees.length) out.fees = fees;
  // 찾아오시는 길 문장(있으면)
  const way = text(sect("찾아오시는 길</h3>", "공지/이벤트").replace(/<script[\s\S]*?<\/script>/g, "")).replace(/^찾아오시는 길/, "").trim();
  if (way && way.length > 10) out.directions = way.slice(0, 800);
  return out;
}
