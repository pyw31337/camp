// 캠핑장 프로필: 흩어진 원천(고캠핑 등록값·파일럿 원문 대조·운영자 홈페이지 문장·운영자 공지·후기 요약)을
// 같은 18개 항목으로 합치고, 확인된 값만으로 한 줄 요약과 분류 태그를 만든다.
// 원칙(docs/CAMPGROUND_PROFILE.md):
// - 항목마다 값·등급·출처(라벨·URL·확인 시각·원문 문장)를 함께 둔다. 원천 없는 값은 만들지 않는다.
// - 등급: VERIFIED(사람이 원문 대조) > OPERATOR(운영자 공개 문장) > CONFIRMED(고캠핑 등록값) > MENTION(후기 언급, 건수와 함께) > UNKNOWN.
// - 요약·태그는 MENTION을 사실처럼 쓰지 않는다(후기 태그는 ‘후기’라고 표시).

export const PROFILE_FIELDS = [
  ["TYPE", "유형·규모"], ["CHECKIN", "입실"], ["CHECKOUT", "퇴실"], ["MANNER", "매너타임"], ["PRICE", "1박 요금"],
  ["EXTRA_FEE", "추가 인원·차량"], ["POWER", "전기"], ["PARKING", "주차"], ["FIRE", "불멍"], ["CAR_CAMPING", "차박"],
  ["PET", "반려견"], ["SITE", "사이트 규격·바닥"], ["SANITARY", "화장실·샤워·온수"], ["AMENITIES", "편의시설"],
  ["SEASON", "운영 기간"], ["REFUND", "취소·환불"], ["BOOKING", "예약"], ["REVIEW", "후기 장단점"],
];
const KIND_LABEL = { AUTO_PITCH: "오토", PITCH: "일반", GLAMPING: "글램핑", CARAVAN_RENTAL: "카라반", RV_PITCH: "개인 카라반", TARP_ZONE: "타프존", SHELTER_ZONE: "쉘터존", CAMPNIC_DAY: "캠프닉" };
const FLOOR_LABEL = { GRASS: "잔디", CRUSHED_STONE: "파쇄석", DECK: "데크", GRAVEL: "자갈", SOIL: "맨흙" };
const man = (n) => (n % 10000 === 0 ? `${n / 10000}만` : `${(n / 10000).toFixed(1).replace(/\.0$/, "")}만`);
const GOCAMPING = (c) => ({ label: "한국관광공사 고캠핑 등록값", url: c.gc_url ?? null, date: c.modified_at ?? null });
const opSource = (x) => ({ label: "운영자 홈페이지", url: x.u ?? x.url ?? null, date: x.t ?? x.date ?? null, quote: x.q ?? x.quote ?? null });
const specSource = (v) => ({ label: v.source?.label ?? null, url: v.source?.url ?? null, date: v.source?.date ?? null, quote: v.quote ?? null });
// 스펙 시트 등급 → 프로필 등급(운영자 홈페이지·공지 문장은 OPERATOR, 고캠핑 소개글은 CONFIRMED에 준함)
const specGrade = (v, g) => (g === "OPERATOR" || v?.source?.kind === "operator_homepage" ? "OPERATOR" : g === "OFFICIAL_TEXT" ? "CONFIRMED" : "MENTION");

function specField(spec, code) {
  const f = spec?.fields?.[code];
  const v = f?.values?.[0];
  if (!v) {
    // 확정값이 없으면 후기 언급을 ‘언급’ 등급으로(1건 이상, 가장 많이 나온 값). 요약·태그에는 쓰지 않는다.
    const m = [...(f?.mentions ?? [])].sort((a, b) => b.count - a.count)[0];
    if (!m || m.count < 1) return null;
    const x = m.samples?.[0] ?? {};
    return { value: m.value, grade: "MENTION", source: { label: m.count > 1 ? `후기 ${m.count}건` : (x.label ?? "후기 언급"), url: x.url ?? null, date: m.latest ?? x.date ?? null, quote: x.quote ?? null }, count: m.count };
  }
  return { value: v.value, grade: specGrade(v, f.grade), source: specSource(v), conflict: f.conflict || undefined };
}

/**
 * @param {object} c 공개 카탈로그 레코드(field_conditions·of·rv 포함)
 * @param {object|null} d 상세(camps/{id}.json: spec·prices)
 * @param {object|null} details 운영자 문장 상세(extractSiteDetails 결과, 공용 홈페이지면 null)
 * @param {{detailDate?:string, urlOf?:(quote:string)=>string|null}} opts 운영자 문장의 확인 시각·원문 쪽 URL 찾기
 */
export function buildProfile(c, d = null, details = null, { detailDate = null, urlOf = null, imageOf = null, intro = null } = {}) {
  const f = c.field_conditions ?? {}, of = c.of ?? {}, verified = f.status === "VERIFIED";
  const fields = {};
  const set = (code, value, grade, source, extra = {}) => { if (value != null && value !== "") fields[code] = { value, grade, source, ...extra }; };
  const dsrc = (x) => { const image = imageOf?.(x?.quote) ?? null; return { label: image ? "운영자 안내 이미지(글자 인식)" : "운영자 홈페이지", url: urlOf?.(x?.quote) ?? null, date: detailDate, quote: x?.quote ?? null, ...(image ? { image } : {}) }; };

  // 유형·규모
  const kinds = (c.kinds ?? []).filter(([k]) => KIND_LABEL[k]);
  if (kinds.length) set("TYPE", kinds.map(([k, n]) => `${KIND_LABEL[k]} ${n}`).join(" · "), "CONFIRMED", GOCAMPING(c), { total: kinds.reduce((s, [, n]) => s + (Number(n) || 0), 0) });
  // 입실·퇴실·매너타임
  for (const [code, sc] of [["CHECKIN", "CHECKIN_TIME"], ["CHECKOUT", "CHECKOUT_TIME"], ["MANNER", "MANNER_TIME"]]) {
    const s = specField(d?.spec, sc);
    if (s) set(code, s.value, s.grade, s.source, s.conflict ? { conflict: true } : {});
  }
  // 1박 요금: 운영자 문장 > 후기 언급(건수)
  if (details?.SITE_PRICE) {
    const p = details.SITE_PRICE;
    set("PRICE", p.min === p.max ? `${man(p.min)}원` : `${man(p.min)}~${man(p.max)}원`, "OPERATOR", dsrc(p.items[0]), { min: p.min, max: p.max });
  } else if (d?.prices?.length) {
    const ws = d.prices.map((x) => x.won).filter((n) => n >= 20000 && n <= 400000).sort((a, b) => a - b);
    if (ws.length) set("PRICE", `${man(ws[0])}${ws.length > 1 && ws.at(-1) !== ws[0] ? `~${man(ws.at(-1))}` : ""}원대`, "MENTION", { label: "후기 언급", url: d.prices[0].url ?? null, date: d.prices[0].date ?? null, quote: d.prices[0].quote ?? null }, { count: ws.length, min: ws[0], max: ws.at(-1) });
  }
  // 추가 인원·차량·방문객
  const extra = ["EXTRA_PERSON_FEE", "EXTRA_CAR_FEE", "VISITOR_POLICY"].map((k) => [k, specField(d?.spec, k)]).filter(([, v]) => v);
  if (extra.length) {
    const L = { EXTRA_PERSON_FEE: "인원", EXTRA_CAR_FEE: "차량", VISITOR_POLICY: "방문객" };
    const best = extra.find(([, v]) => v.grade === "OPERATOR") ?? extra[0];
    set("EXTRA_FEE", extra.map(([k, v]) => `${L[k]} ${v.value}`).join(" · "), best[1].grade, best[1].source);
  }
  // 전기
  const lw = Number(f.power?.limit_w);
  const spW = specField(d?.spec, "POWER_W");
  if (verified && lw > 0) set("POWER", `최대 ${lw}W`, "VERIFIED", { label: f.source?.label ?? "원문 대조", url: f.source?.url ?? null, date: f.source?.checked_at ?? null }, { watts: lw });
  else if (of.w) set("POWER", `최대 ${of.w.v}W`, "OPERATOR", opSource(of.w), { watts: of.w.v });
  else if (spW) set("POWER", `최대 ${spW.value}`, spW.grade, spW.source, { watts: Number(spW.value.replace(/[^0-9]/g, "")) || null });
  else if (f.power?.available || (c.amenities ?? []).some((a) => /전기/.test(a))) set("POWER", "최대 600W (법정 기준)", "CONFIRMED", { label: "관광진흥법 야영장 안전위생기준(사이트당 600W 이하)", url: "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=247854" }, { watts: 600, statutory: true });
  if (details?.ELECTRIC_FEE && fields.POWER) fields.POWER.fee = details.ELECTRIC_FEE.amount;
  // 주차
  const spPk = specField(d?.spec, "PARKING");
  if (verified && f.parking?.tent_side != null) set("PARKING", f.parking.tent_side ? "사이트 옆 주차" : "외부 주차", "VERIFIED", { label: f.source?.label ?? "원문 대조", url: f.source?.url ?? null, date: f.source?.checked_at ?? null });
  else if (of.pk) set("PARKING", of.pk.v === "SITE_SIDE" ? "사이트 옆 주차" : "외부 주차 후 이동", "OPERATOR", opSource(of.pk));
  else if (spPk) set("PARKING", spPk.value, spPk.grade, spPk.source);
  else if (f.parking?.tent_side != null) set("PARKING", f.parking.tent_side ? "사이트 옆 주차" : "전용 주차장 주차", "CONFIRMED", GOCAMPING(c));
  // 불멍
  if (verified && f.firewood?.allowed != null) set("FIRE", f.firewood.allowed ? "장작 가능" : "장작 불가", "VERIFIED", { label: f.source?.label ?? "원문 대조", url: f.source?.url ?? null, date: f.source?.checked_at ?? null });
  else if (of.fire) set("FIRE", { FIREWOOD_OK: "장작 가능", CHARCOAL_ONLY: "숯만 가능", NO_FIRE: "개인 화기 불가" }[of.fire.v], "OPERATOR", opSource(of.fire));
  else if (details?.FIRE_SET_FEE) set("FIRE", `불멍 세트 유료(${man(details.FIRE_SET_FEE.amount)}원)`, "OPERATOR", dsrc(details.FIRE_SET_FEE));
  else if (c.fire === "개별") set("FIRE", "화로대 개별(연료 미확인)", "CONFIRMED", GOCAMPING(c));
  else if (c.fire === "불가") set("FIRE", "화기 불가", "CONFIRMED", GOCAMPING(c));
  if (details?.FIRE_SET_FEE && fields.FIRE && !fields.FIRE.value.includes("세트")) fields.FIRE.set_fee = details.FIRE_SET_FEE.amount;
  // 차박
  if (of.cc) set("CAR_CAMPING", of.cc.v ? "차박 가능" : "차박 불가", "OPERATOR", opSource(of.cc));
  // 반려견
  const pet = specField(d?.spec, "PET_POLICY");
  if (pet && pet.grade === "OPERATOR") set("PET", pet.value, "OPERATOR", pet.source);
  else if (c.pets) set("PET", c.pets === "불가능" ? "동반 불가" : c.pets.replace("가능", "동반 가능"), "CONFIRMED", GOCAMPING(c));
  else if (pet) set("PET", pet.value, pet.grade, pet.source);
  if (details?.PET_FEE && fields.PET) fields.PET.fee = details.PET_FEE.amount;
  // 사이트 규격·바닥
  const sizes = (f.site_size?.groups ?? []).map((g) => `${g.width_m}×${g.depth_m}m`);
  const floors = (f.ground?.types ?? []).map((x) => FLOOR_LABEL[x.type] ?? x.type).filter(Boolean);
  if (sizes.length || floors.length) set("SITE", [sizes.slice(0, 3).join("·"), floors.join("·")].filter(Boolean).join(" / "), verified ? "VERIFIED" : "CONFIRMED", GOCAMPING(c));
  // 위생
  const hot = details?.AMENITIES?.find((a) => a.code === "HOT_WATER");
  const san = [c.toilets && `화장실 ${c.toilets}`, c.showers && `샤워 ${c.showers}`, hot && "온수"].filter(Boolean);
  if (san.length) set("SANITARY", san.join(" · "), c.toilets || c.showers ? "CONFIRMED" : "OPERATOR", c.toilets || c.showers ? GOCAMPING(c) : dsrc(hot));
  // 편의시설: 고캠핑 등록 + 운영자 문장(기간 포함)
  const am = new Set((c.amenities ?? []).filter((a) => a.length <= 8).map((a) => a.replace(/\./g, "·")));
  for (const a of details?.AMENITIES ?? []) if (a.code !== "HOT_WATER") am.add(a.period ? `${a.label}(${a.period})` : a.label);
  // 고캠핑 소개글(공식 소개 문장)에서 찾은 편의시설도 더한다. 주차·불멍·전력 W는 소개글만으로 확정하지 않는다(PILOT_INTAKE_CONTRACT 2.1).
  for (const a of intro?.AMENITIES ?? []) if (a.code !== "HOT_WATER") am.add(a.period ? `${a.label}(${a.period})` : a.label);
  if (am.size) {
    // 등급: 고캠핑 등록·소개글이 있으면 CONFIRMED, 운영자 문장만 있으면 OPERATOR
    const fromOp = !(c.amenities ?? []).length && !(intro?.AMENITIES ?? []).length && details?.AMENITIES?.[0];
    set("AMENITIES", [...am].slice(0, 8).join(" · "), fromOp ? "OPERATOR" : "CONFIRMED", fromOp ? dsrc(details.AMENITIES[0]) : GOCAMPING(c), { items: [...am] });
  }
  // 운영 기간
  if (details?.SEASON) set("SEASON", details.SEASON.value === "YEAR_ROUND" ? "연중 운영" : "기간 휴장 있음", "OPERATOR", dsrc(details.SEASON));
  else if (intro?.SEASON) set("SEASON", intro.SEASON.value === "YEAR_ROUND" ? "연중 운영" : "기간 휴장 있음", "CONFIRMED", { ...GOCAMPING(c), label: "고캠핑 소개글", quote: intro.SEASON.quote });
  else if (c.seasons?.length) set("SEASON", c.seasons.length === 4 ? "사계절 운영" : `${c.seasons.join("·")} 운영`, "CONFIRMED", GOCAMPING(c));
  // 취소·환불
  const spRf = specField(d?.spec, "REFUND_POLICY");
  if (details?.REFUND) set("REFUND", "규정 있음", "OPERATOR", dsrc(details.REFUND));
  else if (spRf) set("REFUND", spRf.value, spRf.grade, spRf.source);
  else if (c.booking || c.tel) set("REFUND", "10일 전 100% 환불 (소비자분쟁기준)", "CONFIRMED", { label: "공정거래위원회 소비자분쟁해결기준(야영장업)", url: "https://www.ftc.go.kr/" }, { statutory: true });
  // 예약
  const ch = (c.booking?.channels ?? []).filter((x) => x.kind !== "phone").map((x) => x.platform_name).filter(Boolean);
  if (ch.length || c.tel) set("BOOKING", [...new Set(ch)].slice(0, 3).join(" · ") || "전화 예약", "CONFIRMED", { label: c.booking?.source?.label ?? "고캠핑 등록 예약 정보", url: c.booking?.source?.url ?? c.gc_url ?? null, date: c.booking?.source?.checked_at ?? null });
  // 후기 장단점(언급)
  if (c.rv) set("REVIEW", [c.rv.p.map(([t]) => t).join(", "), c.rv.c.length ? `아쉬움: ${c.rv.c.map(([t]) => t).join(", ")}` : null].filter(Boolean).join(" / ") || "언급 적음", "MENTION", { label: `후기 요약 ${c.rv.n}건`, url: null, date: null }, { count: c.rv.n });

  const known = PROFILE_FIELDS.filter(([code]) => fields[code]).length;
  const facts = PROFILE_FIELDS.filter(([code]) => fields[code] && fields[code].grade !== "MENTION").length;
  return { version: 1, fields, tags: tagsOf(c, fields, details, intro), summary: summaryOf(fields), score: { known, facts, total: PROFILE_FIELDS.length } };
}

// 한 줄 요약: 확인된 값(후기 언급 제외)을 고정 순서로, 최대 6조각.
export function summaryOf(fields) {
  const parts = [];
  const v = (k) => fields[k] && fields[k].grade !== "MENTION" ? fields[k] : null;
  if (v("TYPE")) parts.push(v("TYPE").value.split(" · ").slice(0, 2).join("·"));
  if (v("CHECKIN")) parts.push(`입실 ${v("CHECKIN").value.replace("부터", "")}`);
  if (v("PRICE")) parts.push(`1박 ${v("PRICE").value}`);
  if (v("POWER")?.watts) parts.push(`전기 ${v("POWER").watts}W`);
  if (v("FIRE")) parts.push(v("FIRE").value.replace("(연료 미확인)", ""));
  if (v("PARKING")) parts.push(v("PARKING").value);
  if (v("CAR_CAMPING")?.value === "차박 가능") parts.push("차박 가능");
  if (v("PET") && !/불가/.test(v("PET").value)) parts.push(`반려견 ${v("PET").value.replace("동반 ", "")}`);
  return parts.slice(0, 6).join(" · ");
}

const TERRAIN = { 산: "MOUNTAIN", 숲: "FOREST", 계곡: "VALLEY", 강: "RIVER", 호수: "LAKE", 해변: "BEACH", 섬: "ISLAND", 도심: "CITY" };
export const TAG_LABEL = {
  MOUNTAIN: "산", FOREST: "숲", VALLEY: "계곡", RIVER: "강", LAKE: "호수", BEACH: "바다", ISLAND: "섬", CITY: "도심 근교",
  AUTO: "오토캠핑", GLAMPING: "글램핑", CARAVAN: "카라반", FAMILY: "가족·키즈", PET_OK: "반려견 동반", CAR_CAMPING: "차박",
  WINTER: "겨울 운영", FIREWOOD: "장작 불멍", SITE_PARKING: "사이트 옆 주차", WATER_PLAY: "물놀이", HIGH_POWER: "고전력(1kW↑)",
  REVIEW_QUIET: "후기: 조용", REVIEW_VIEW: "후기: 경치", REVIEW_CLEAN: "후기: 깨끗", REVIEW_HOST: "후기: 친절",
};
// 분류 태그: 근거(why)를 함께. 후기 기반 태그는 REVIEW_*로 구분하고 2건 이상일 때만.
export function tagsOf(c, fields, details, intro = null) {
  const t = new Map();
  const add = (code, why) => { if (!t.has(code)) t.set(code, why); };
  for (const e of c.env ?? []) if (TERRAIN[e]) add(TERRAIN[e], "고캠핑 입지");
  const kinds = new Set((c.kinds ?? []).map(([k]) => k));
  if (kinds.has("AUTO_PITCH")) add("AUTO", "고캠핑 유형");
  if (kinds.has("GLAMPING")) add("GLAMPING", "고캠핑 유형");
  if (kinds.has("CARAVAN_RENTAL")) add("CARAVAN", "고캠핑 유형");
  const kidsAm = (c.amenities ?? []).some((a) => /물놀이|수영|트렘|방방|놀이터|에어바운스|썰매/.test(a));
  const kidsOp = [...(details?.AMENITIES ?? []), ...(intro?.AMENITIES ?? [])].some((a) => ["POOL", "TRAMPOLINE", "PLAYGROUND"].includes(a.code));
  if (kidsAm || kidsOp) add("FAMILY", kidsAm ? "고캠핑 부대시설" : "운영자 안내");
  if (fields.PET && !/불가/.test(fields.PET.value)) add("PET_OK", fields.PET.grade === "OPERATOR" ? "운영자 안내" : "고캠핑 등록값");
  if (fields.CAR_CAMPING?.value === "차박 가능") add("CAR_CAMPING", "운영자 안내");
  if ((c.seasons ?? []).includes("겨울") && fields.POWER) add("WINTER", "고캠핑 운영 계절 + 전기");
  if (fields.FIRE?.value === "장작 가능") add("FIREWOOD", fields.FIRE.grade === "VERIFIED" ? "원문 대조" : "운영자 안내");
  if (fields.PARKING?.value === "사이트 옆 주차") add("SITE_PARKING", fields.PARKING.grade === "VERIFIED" ? "원문 대조" : "운영자 안내");
  if ((c.amenities ?? []).some((a) => /물놀이|수영/.test(a)) || [...(details?.AMENITIES ?? []), ...(intro?.AMENITIES ?? [])].some((a) => a.code === "POOL")) add("WATER_PLAY", "부대시설");
  if ((fields.POWER?.watts ?? 0) >= 1000) add("HIGH_POWER", fields.POWER.grade === "VERIFIED" ? "원문 대조" : "운영자 안내");
  const rv = new Map([...(c.rv?.p ?? [])]);
  const R = [["REVIEW_QUIET", "조용·한적"], ["REVIEW_VIEW", "뷰·경치 좋음"], ["REVIEW_CLEAN", "화장실·샤워장 깨끗"], ["REVIEW_HOST", "사장님 친절"]];
  for (const [code, topic] of R) if ((rv.get(topic) ?? 0) >= 2) add(code, `후기 ${rv.get(topic)}건`);
  return [...t.entries()].map(([code, why]) => ({ code, label: TAG_LABEL[code], why }));
}

// ── 목록 화면용 압축 값(카탈로그 campgrounds.json) ─────────────────────────────
// om: 운영하는 달 비트(1월=bit0 … 12월=bit11). 모르면 넣지 않는다(날짜로 거르지 않음).
// ti: 입실·퇴실·매너타임 시작 [값, 등급 c|m] — 목록 행에서 상세를 열지 않고 보이게.
const SEASON_MONTHS = { 봄: [3, 4, 5], 여름: [6, 7, 8], 가을: [9, 10, 11], 겨울: [12, 1, 2] };
const monthBits = (ms) => ms.reduce((b, m) => b | (1 << (m - 1)), 0);
export function openMonthsOf(season) {
  const v = String(season?.value ?? "");
  if (/사계절|연중/.test(v)) return monthBits([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const named = Object.keys(SEASON_MONTHS).filter((k) => v.includes(k));
  if (named.length && /운영/.test(v)) return monthBits(named.flatMap((k) => SEASON_MONTHS[k]));
  // “매년 12월부터 이듬해 3월까지 휴장”처럼 달 범위가 분명할 때만 휴장 달을 뺀다(“11월 말경” 같은 애매한 말은 그 달을 운영으로 둔다).
  const q = String(season?.source?.quote ?? "");
  const m = q.match(/(\d{1,2})\s*월\s*(초|말경?|중순)?[^0-9]{0,12}?(?:이듬해|다음\s*해|익년)?\s*(\d{1,2})\s*월\s*(초|말경?|중순)?\s*까지\s*휴장/);
  if (!m) return null;
  let from = Number(m[1]), to = Number(m[3]);
  if (from < 1 || from > 12 || to < 1 || to > 12) return null;
  if (m[2] && /말/.test(m[2])) from = from % 12 + 1; // 그 달 말부터 휴장 → 그 달은 운영
  if (m[4] && /초/.test(m[4])) to = to === 1 ? 12 : to - 1; // 그 달 초까지 휴장 → 그 달은 운영
  const closed = [];
  for (let x = from, n = 0; n < 12; x = x % 12 + 1, n++) { closed.push(x); if (x === to) break; }
  if (closed.length >= 12) return null;
  return monthBits([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((x) => !closed.includes(x)));
}
export function compactTimes(fields = {}) {
  const g = (f) => (f.grade === "MENTION" ? "m" : "c");
  const hm = (s) => String(s ?? "").match(/\d{1,2}:\d{2}/)?.[0] ?? null;
  const out = {};
  for (const [k, code] of [["i", "CHECKIN"], ["o", "CHECKOUT"], ["m", "MANNER"]]) { const f = fields[code]; const v = f && hm(f.value); if (v) out[k] = [v, g(f)]; }
  return Object.keys(out).length ? out : null;
}
