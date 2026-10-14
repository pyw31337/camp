"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowRight, BadgeCheck, Bell, CalendarClock, CalendarDays, Car, ChevronRight,
  CircleHelp, Database, ExternalLink, Heart, ImageIcon, Info, MapPin,
  Search, TentTree, Trees, UsersRound, X,
} from "lucide-react";
import { SITE_HEADER_HTML, SITE_HEADER_JS, SITE_TABBAR_HTML } from "./site-header.generated";
import { FormEvent, memo, useEffect, useMemo, useState } from "react";

type CampType = "오토캠핑" | "카라반";
type Camp = {
  id: string; campground: string; product: string; region: string; type: CampType;
  capacity: string; size: string; price: string; image: string; imageAlt: string;
  imagePageUrl: string; reservationUrl: string; noticeUrl: string;
  officialUpdate: string; officialUpdateDate: string; observedAt: string;
};
// 캠핑장별 예약 오픈(pipeline build:explore → explore/data/openings.json)
type Opening = { at: string; tk: boolean; id: string; name: string; where: string; ph: string | null; kind: string; label: string; stay: string | null; platform: string | null; url: string | null; src: string | null; unv: boolean };
type FeaturedCamp = { id: string; name: string; where: string; line: string | null; ph: string; rt: boolean };
type FeaturedTheme = { id: string; label: string; desc: string; count: number; camps: FeaturedCamp[] };
type Featured = { total: number; photo_count: number; themes: FeaturedTheme[] };
const largeOfficialPhoto = (path: string) => path.replace(/-t\.webp(?=$|[?#])/, "-l.webp");
type Catalog = {
  generated_at: string;
  counts: { opening_events: number; gocamping_records: number | null; official_pilot_products: number };
  sources: { gocamping: { state: "PUBLISHED" | "PENDING_PERSISTENCE_REVIEW" | "AWAITING_API_SYNC"; source_url: string; fetched_at: string | null } };
};

const FACILITY_URL = "https://www.gpfmc.or.kr/page/selectPage.do?muNo=649";
const RESERVATION_URL = "https://www.gpfmc.or.kr/page/selectPage.do?muNo=707";
const NOTICE_URL = "https://www.gpfmc.or.kr/board/facList.do?muGpNo=424&muNo=648&stNo=11";
const FORESTTRIP_URL = "https://www.foresttrip.go.kr/";
const KNPS_URL = "https://reservation.knps.or.kr/";
const SEOUL_YEYAK_URL = "https://yeyak.seoul.go.kr/";

const officialProducts: Camp[] = [
  { id: "jarasum-site-a", campground: "자라섬캠핑장", product: "사이트 A", region: "경기 가평", type: "오토캠핑", capacity: "공식 예약 화면에서 확인", size: "데크 4m × 4m 안내", price: "공식 예약 화면에서 확인", image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=f82a26b9-1ffa-49f0-bb23-a9f128a738b6&fileName=ckImgSubmit.jpg", imageAlt: "자라섬캠핑장 사이트 A 데크", imagePageUrl: FACILITY_URL, reservationUrl: RESERVATION_URL, noticeUrl: NOTICE_URL, officialUpdate: "11월 예약 일정 및 이용안내사항", officialUpdateDate: "2026.10.06", observedAt: "2026.10.13" },
  { id: "jarasum-site-b", campground: "자라섬캠핑장", product: "사이트 B", region: "경기 가평", type: "오토캠핑", capacity: "공식 예약 화면에서 확인", size: "데크 4m × 4m 안내", price: "공식 예약 화면에서 확인", image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=ef2aa11f-0dda-4662-80aa-5140c0c23f40&fileName=ckImgSubmit.jpg", imageAlt: "자라섬캠핑장 사이트 B 데크", imagePageUrl: FACILITY_URL, reservationUrl: RESERVATION_URL, noticeUrl: NOTICE_URL, officialUpdate: "11월 예약 일정 및 이용안내사항", officialUpdateDate: "2026.10.06", observedAt: "2026.10.13" },
  { id: "jarasum-caravan-c", campground: "자라섬캠핑장", product: "카라반 C", region: "경기 가평", type: "카라반", capacity: "객실별 정원 확인", size: "공식 시설 안내 참고", price: "공식 예약 화면에서 확인", image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=140050b6-09a9-4416-ab12-ac71dc28f202&fileName=tour4_04_02_02_02_01.jpg", imageAlt: "자라섬캠핑장 카라반 C 외부 전경", imagePageUrl: FACILITY_URL, reservationUrl: RESERVATION_URL, noticeUrl: NOTICE_URL, officialUpdate: "11월 예약 일정 및 이용안내사항", officialUpdateDate: "2026.10.06", observedAt: "2026.10.13" },
  { id: "jarasum-caravan-b", campground: "자라섬캠핑장", product: "카라반 B", region: "경기 가평", type: "카라반", capacity: "객실별 정원 확인", size: "공식 시설 안내 참고", price: "공식 예약 화면에서 확인", image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=68cfcb78-3961-408b-8fb2-d809c07c98a4&fileName=05.jpg", imageAlt: "자라섬캠핑장 카라반 B 내부", imagePageUrl: FACILITY_URL, reservationUrl: RESERVATION_URL, noticeUrl: NOTICE_URL, officialUpdate: "11월 예약 일정 및 이용안내사항", officialUpdateDate: "2026.10.06", observedAt: "2026.10.13" },
];

const fallbackCatalog: Catalog = {
  generated_at: "2026-10-13T02:29:30.771Z",
  counts: { opening_events: 23, gocamping_records: null, official_pilot_products: 4 },
  sources: { gocamping: { state: "AWAITING_API_SYNC", source_url: "https://www.data.go.kr/data/15101933/openapi.do", fetched_at: null } },
};
const categories = ["무료", "오토캠핑", "캠핑", "타프존", "쉘터존", "카라반", "글램핑", "캠프닉"];
const scrollTo = (id: string) => document.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function kstDate() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "01";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

// 공통 헤더·하단 탭: 한 번만 그린다(다시 그리면 스크립트가 채운 이름 뱃지·메뉴가 지워진다).
const SiteChrome = memo(function SiteChrome({ html }: { html: string }) { return <div className="sh-host" dangerouslySetInnerHTML={{ __html: html }} suppressHydrationWarning />; });

export default function Home() {
  const [mode] = useState<"camp" | "open">("camp");
  const [keyword, setKeyword] = useState("");
  const [region] = useState("전국");
  const [tripDate, setTripDate] = useState("");
  const [guests, setGuests] = useState("성인 2 · 차 1");
  const [gear, setGear] = useState("선택 안 함");
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [saved, setSaved] = useState<string[]>([]);
  const [selectedCamp, setSelectedCamp] = useState<Camp | null>(null);
  const [catalog, setCatalog] = useState<Catalog>(fallbackCatalog);
  const [featured, setFeatured] = useState<Featured | null>(null);
  // 공통 헤더(이름 뱃지·설정)는 모든 페이지와 같은 스크립트로 움직인다.
  useEffect(() => { if (!(window as unknown as { moyeoraUser?: unknown }).moyeoraUser) { const el = document.createElement("script"); el.textContent = SITE_HEADER_JS; document.body.appendChild(el); } }, []);
  const [openings, setOpenings] = useState<Opening[] | null>(null);
  const [weekCount, setWeekCount] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("./explore/data/openings.json", { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)).then((raw) => { const d = raw as { items?: Opening[] } | null; if (!Array.isArray(d?.items)) return; const now = Date.now(); const items = d.items.filter((o) => Date.parse(o.at) >= now - 3_600_000); setOpenings(items); setWeekCount(new Set(items.filter((o) => Date.parse(o.at) <= now + 7 * 86_400_000).map((o) => o.id)).size); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  // 전국 탐색 데이터에서 뽑은 테마별 사진 캠핑장(매일 Data sync가 갱신)
  useEffect(() => {
    const controller = new AbortController();
    fetch("./explore/data/featured.json", { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.themes?.length) setFeatured(d as Featured); }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setSaved(JSON.parse(window.localStorage.getItem("moyeora-camping-saved") ?? "[]")); }
      catch { setSaved([]); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("./data/catalog.json", { signal: controller.signal }).then((response) => response.ok ? response.json() : null).then((nextCatalog) => {
      if (nextCatalog?.counts && nextCatalog?.sources?.gocamping) setCatalog(nextCatalog as Catalog);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const results = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return officialProducts.filter((camp) => (selectedCategory === "전체" || camp.type === selectedCategory) && (region === "전국" || camp.region.includes(region)) && (!query || [camp.campground, camp.product, camp.region, camp.type].some((value) => value.toLowerCase().includes(query))));
  }, [keyword, region, selectedCategory]);
  const toggleSaved = (id: string) => setSaved((current) => { const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]; window.localStorage.setItem("moyeora-camping-saved", JSON.stringify(next)); return next; });
  // 캠핑장 찾기는 전국 캠핑장 탐색 화면(explore/)의 검색 결과 페이지로 보낸다. 시범 상품 몇 건만 거르지 않는다.
  const runSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode !== "camp") return scrollTo("#calendar");
    const params = new URLSearchParams();
    if (keyword.trim() && keyword.trim() !== "전국") params.set("q", keyword.trim());
    const gearKind: Record<string, string> = { 카라반: "t=trailer", 차박: "k=AUTO_PITCH" };
    window.location.assign(`explore/#${[params.toString(), gearKind[gear]].filter(Boolean).join("&")}`);
  };
  const selectCamp = (camp: Camp) => { setSelectedCamp(camp); window.requestAnimationFrame(() => scrollTo("#camp-detail")); };
  const CATEGORY_KIND: Record<string, string> = { 오토캠핑: "AUTO_PITCH", 캠핑: "PITCH", 타프존: "TARP_ZONE", 쉘터존: "SHELTER_ZONE", 카라반: "CARAVAN_RENTAL", 글램핑: "GLAMPING", 캠프닉: "CAMPNIC_DAY" };
  const selectCategory = (category: string) => {
    if (CATEGORY_KIND[category]) { window.location.assign(`explore/#k=${CATEGORY_KIND[category]}`); return; }
    setSelectedCategory(category === selectedCategory ? "전체" : category); scrollTo("#search");
  };
  const dataState = catalog.sources.gocamping.state === "PUBLISHED" ? `고캠핑 ${catalog.counts.gocamping_records?.toLocaleString("ko-KR")}곳 동기화` : catalog.sources.gocamping.state === "PENDING_PERSISTENCE_REVIEW" ? "고캠핑 수집 완료 · 공개 전 권리 검토" : "고캠핑 API 동기화 대기";

  return <main className="may-app" id="home">
    <SiteChrome html={SITE_HEADER_HTML} />

    <div className="may-shell">
      <section className="may-hero" aria-label="캠핑 탐색">
        <img src={officialProducts[2].image} alt={officialProducts[2].imageAlt} referrerPolicy="no-referrer" /><div className="may-hero-overlay" />
        <div className="may-hero-copy"><h1><span>전국 {featured ? featured.total.toLocaleString("ko-KR") : "3,000"}곳 캠핑장,</span><span>사진 보고 바로 예약</span></h1><p>사이트·시설·주변 정보와 예약 오픈 일정까지<br />한 화면에서 비교하세요.</p></div>
        <div className="may-hero-stats" aria-label="예약 오픈"><a href="explore/openings/"><small><CalendarClock size={14} />이번 주 예약 오픈</small><strong>{weekCount ?? "–"}<i>곳</i></strong></a></div>
        <form className="may-searchbox" onSubmit={runSearch}>
          
          <div className="may-search-card">{mode === "camp" ? <div className="may-search-grid">
            <label className="may-search-field may-destination"><MapPin size={19} /><span><small>어디로</small><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="전국 또는 캠핑장명" aria-label="캠핑장 또는 지역 검색" /></span></label>
            <label className="may-search-field"><CalendarDays size={18} /><span><small>언제</small><input type="date" value={tripDate} onChange={(event) => setTripDate(event.target.value)} aria-label="입실일" /></span></label>
            <label className="may-search-field"><UsersRound size={18} /><span><small>누구와</small><select value={guests} onChange={(event) => setGuests(event.target.value)} aria-label="인원과 차량"><option>성인 2 · 차 1</option><option>성인 1 · 차 1</option><option>성인 3 · 차 1</option><option>성인 4 · 차 1</option></select></span></label>
            <label className="may-search-field"><TentTree size={18} /><span><small>내 장비</small><select value={gear} onChange={(event) => setGear(event.target.value)} aria-label="캠핑 장비"><option>선택 안 함</option><option>텐트</option><option>카라반</option><option>차박</option></select></span></label>
            <button className="may-search-go" type="submit"><Search size={19} /><span>찾기</span></button>
          </div> : <div className="may-open-search"><div><Bell size={20} /><span><small>예약 오픈 캘린더</small><b>출처와 확인일이 있는 일정만 표시합니다</b></span></div><button className="may-search-go" type="submit"><CalendarClock size={18} /><span>일정 보기</span></button></div>}</div>
        </form>
        <a className="may-hero-source" href={FACILITY_URL} target="_blank" rel="noreferrer"><ImageIcon size={13} />히어로 사진: 자라섬캠핑장 운영기관 원문 <ExternalLink size={12} /></a>
      </section>

      <section className="may-categories" aria-label="캠핑 형태">{categories.map((category) => <button key={category} type="button" className={selectedCategory === category ? "selected" : ""} onClick={() => selectCategory(category)}>{category === "무료" ? <span className="may-free-icon">₩</span> : category === "오토캠핑" || category === "카라반" ? <Car size={17} /> : <TentTree size={17} />}<span>{category}</span></button>)}</section>

      {featured && <section className="may-section may-featured" aria-label="테마별 캠핑장">
        {featured.themes.map((theme) => <div className="may-theme-row" key={theme.id}>
          <div className="may-section-head"><div><h2>{theme.label}</h2><p>{theme.desc} · 전국 {theme.count.toLocaleString("ko-KR")}곳</p></div><a href={`explore/#t=${theme.id}`}>전체 보기 <ChevronRight size={16} /></a></div>
          <div className="may-photo-rail">{theme.camps.map((camp) => <a className="may-photo-card" key={camp.id} href={`explore/#c=${camp.id}`}>
            <span className="may-photo-img"><img src={`media/${largeOfficialPhoto(camp.ph)}`} alt={`${camp.name} 공식 사진`} loading="lazy" decoding="async" />{camp.rt && <em>실시간 예약</em>}</span>
            <b>{camp.name}</b><small><MapPin size={12} />{camp.where}</small>{camp.line && <span className="may-photo-line">{camp.line}</span>}
          </a>)}</div>
        </div>)}
        <p className="may-disclosure"><ImageIcon size={15} />사진: 한국관광공사 고캠핑(공식 등록 사진) · 예약 가능 여부와 요금은 각 예약처에서 확인하세요.</p>
      </section>}

      <section className="may-section" id="calendar">
        <div className="may-section-head"><div><h2>곧 열리는 예약</h2><p>캠핑장별 · 오픈이 빠른 순서</p></div><a href="explore/openings/">전체 일정 <ChevronRight size={16} /></a></div>
        {openings && openings.length > 0 ? <div className="may-open-list">{openings.filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i).slice(0, 16).map((o) => { const d = new Date(Date.parse(o.at) + 9 * 3_600_000); const days = Math.round((Date.parse(o.at.slice(0, 10) + "T00:00:00+09:00") - Date.parse(`${kstDate()}T00:00:00+09:00`)) / 86_400_000); return <article className="may-open-card" key={`${o.id}-${o.at}-${o.kind}`}><div className="may-open-date"><div><strong className={days <= 1 ? "urgent" : ""}>{days <= 0 ? "오늘" : `D-${days}`}</strong><span className={o.unv ? "review" : ""}>{o.kind}</span></div><time>{`${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, "0")}(${"일월화수목금토"[d.getUTCDay()]}) · ${o.tk ? `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : "시각 미정"}`}</time></div><div className="may-open-title"><span><Trees size={19} /></span><div><h3><a href={`explore/#c=${o.id}`}>{o.name}</a></h3><p>{[o.where, o.stay].filter(Boolean).join(" · ")}</p></div></div><div className="may-open-bottom"><span className="may-open-platform">{o.platform ?? "캠핑장 직접 예약"}</span><a href={o.src ?? o.url ?? "explore/openings/"} target="_blank" rel="noreferrer" className={o.unv ? "checking" : "verified"}>{o.unv ? <CircleHelp size={14} /> : <BadgeCheck size={14} />}{o.unv ? "확인 필요" : "공식 원문"}<ExternalLink size={11} /></a></div></article>; })}</div>
          : <div className="may-empty"><CalendarClock size={27} /><b>{openings ? "앞으로 45일 안에 확인된 캠핑장별 오픈 일정이 없습니다." : "예약 오픈 일정을 불러오는 중입니다."}</b><span>예약처 공통 규칙은 각 캠핑장 상세의 ‘예약’에서 볼 수 있어요.</span></div>}
        <p className="may-disclosure"><Info size={15} />캠핑장별 예약 규칙과 서울시 공공예약 접수 기간으로 계산한 일정입니다. 최종 잔여 자리는 각 예약처에서 확인하세요.</p>
      </section>

      <section className="may-section" id="search">
        <div className="may-section-head"><div><h2>공식 정보로 확인한 상품</h2><p>{keyword || selectedCategory !== "전체" ? `${results.length}개 조건 일치 상품` : "실제 시설 사진, 사이트 규격, 공식 예약 경로를 함께 봅니다."}</p></div><a className="may-all-link" href="explore/">전국 캠핑장 전체 보기 <ArrowRight size={14} /></a></div>
        <div className="may-camp-grid">{results.map((camp) => { const isSaved = saved.includes(camp.id); return <article className="may-camp-card" key={camp.id}><button type="button" className="may-card-image" onClick={() => selectCamp(camp)} aria-label={`${camp.campground} ${camp.product} 상세 보기`}><img src={camp.image} alt={camp.imageAlt} loading="lazy" referrerPolicy="no-referrer" /><span>운영기관 원문</span></button><button type="button" className={isSaved ? "may-card-save saved" : "may-card-save"} aria-label={`${camp.product} 관심 저장`} aria-pressed={isSaved} onClick={() => toggleSaved(camp.id)}><Heart size={18} fill={isSaved ? "currentColor" : "none"} /></button><div className="may-card-body"><span className="may-provider-tag">{camp.type}</span><button type="button" className="may-card-title" onClick={() => selectCamp(camp)}>{camp.campground}<b>{camp.product}</b></button><p><MapPin size={13} />{camp.region}</p><div className="may-card-details"><span><small>사이트</small><b>{camp.size}</b></span><span><small>인원·가격</small><b>{camp.capacity}</b></span></div><div className="may-card-footer"><a href={camp.reservationUrl} target="_blank" rel="noreferrer">공식 예약 안내 <ExternalLink size={12} /></a><button type="button" onClick={() => selectCamp(camp)}>상세 <ArrowRight size={13} /></button></div></div></article>; })}</div>
        {results.length === 0 && <div className="may-empty"><TentTree size={27} /><b>이 분류의 검증 상품은 아직 공개하지 않았습니다.</b><span>가공된 예시 대신, 공식 원천을 확인한 뒤 이 목록에 추가합니다.</span></div>}
      </section>

      {selectedCamp && <section className="may-detail" id="camp-detail" aria-label={`${selectedCamp.product} 상세 정보`}><button className="may-detail-close" type="button" onClick={() => setSelectedCamp(null)} aria-label="상세 닫기"><X size={18} /></button><div className="may-detail-image"><img src={selectedCamp.image} alt={selectedCamp.imageAlt} referrerPolicy="no-referrer" /><a href={selectedCamp.imagePageUrl} target="_blank" rel="noreferrer"><ImageIcon size={14} />사진 원문 <ExternalLink size={13} /></a></div><div className="may-detail-copy"><p><BadgeCheck size={15} />공식 원문과 매칭된 상품</p><h2>{selectedCamp.campground}<span>{selectedCamp.product}</span></h2><div className="may-detail-facts"><span><small>사이트 규격</small><b>{selectedCamp.size}</b></span><span><small>요금·정원</small><b>{selectedCamp.price}</b></span></div><ol><li><i>1</i><span><b>공식 예약처에서 날짜·인원을 입력</b><small>이 서비스는 재고를 추정해 예약 가능으로 표시하지 않습니다.</small></span></li><li><i>2</i><span><b>상품별 정원과 가격 확인</b><small>{selectedCamp.capacity}</small></span></li><li><i>3</i><span><b>최근 공지 확인</b><small>{selectedCamp.officialUpdate} · {selectedCamp.officialUpdateDate}</small></span></li></ol><div className="may-detail-actions"><a href={selectedCamp.noticeUrl} target="_blank" rel="noreferrer">최근 공지</a><a href={selectedCamp.reservationUrl} target="_blank" rel="noreferrer">공식 예약 안내 <ExternalLink size={15} /></a></div></div></section>}

      <section className="may-data-section" id="saved-camps"><div className="may-data-intro"><p>DATA FOUNDATION</p><h2>캠핑장·상품·예약처를<br />각각 매칭합니다.</h2><span>하나의 캠핑장에 여러 구역·상품·예약 채널이 연결될 수 있습니다. 가격과 재고는 출처·관측 시각·유효시간이 있는 경우에만 표시합니다.</span></div><div className="may-data-cards"><article><span><Database size={21} /></span><small>전국 기준 모수</small><b>{dataState}</b><a href={catalog.sources.gocamping.source_url} target="_blank" rel="noreferrer">고캠핑 원천 <ExternalLink size={13} /></a></article><article><span><CalendarClock size={21} /></span><small>예약 규칙 레지스트리</small><b>공식 예약처 3곳 · 규칙 5개</b><a href="#providers">규칙 보기 <ChevronRight size={14} /></a></article><article><span><ImageIcon size={21} /></span><small>공식 상품 스펙</small><b>자라섬 4개 상품 검증</b><a href={FACILITY_URL} target="_blank" rel="noreferrer">시설 원문 <ExternalLink size={13} /></a></article></div></section>

      <section className="may-section may-provider-section" id="providers"><div className="may-section-head"><div><h2>예약처별 예약 방법</h2><p>같은 예약처는 공통 규칙을 묶고, 시설별 예외는 따로 보관합니다.</p></div></div><div className="may-provider-grid"><article><span><Trees size={21} /></span><h3>숲나들e</h3><p>국립·공립·사립 휴양림 통합예약</p><ul><li>주중: 6주 전 수요일 09:00</li><li>주말·공휴일: 월별 추첨</li><li>미결제분: 선착순 전환</li></ul><a href={FORESTTRIP_URL} target="_blank" rel="noreferrer">공식 일정 보기 <ExternalLink size={14} /></a></article><article><span><TentTree size={21} /></span><h3>국립공원공단</h3><p>국립공원 야영장 예약시스템</p><ul><li>이용 2개월 전 추첨 접수</li><li>발표·결제 일정은 회차별 확인</li><li>취소분은 예약처에서 확인</li></ul><a href={KNPS_URL} target="_blank" rel="noreferrer">공식 예약처 <ExternalLink size={14} /></a></article><article><span><CalendarDays size={21} /></span><h3>서울시 공공서비스예약</h3><p>서울시·자치구 공영 캠핑장</p><ul><li>시설별 접수 기간 공개</li><li>OpenAPI 읽기 연동 준비</li><li>감면 조건은 시설별 상이</li></ul><a href={SEOUL_YEYAK_URL} target="_blank" rel="noreferrer">공식 예약처 <ExternalLink size={14} /></a></article></div></section>
    </div>
    <SiteChrome html={SITE_TABBAR_HTML} />
  </main>;
}
