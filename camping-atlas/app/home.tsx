"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowRight, BadgeCheck, Bell, CalendarClock, CalendarDays, Car, ChevronRight,
  CircleHelp, Database, ExternalLink, Heart, ImageIcon, Info, MapPin,
  BookOpen, House, LocateFixed, Search, Sparkles, Tent, TentTree, Trees, UsersRound, X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type CampType = "오토캠핑" | "카라반";
type Camp = {
  id: string; campground: string; product: string; region: string; type: CampType;
  capacity: string; size: string; price: string; image: string; imageAlt: string;
  imagePageUrl: string; reservationUrl: string; noticeUrl: string;
  officialUpdate: string; officialUpdateDate: string; observedAt: string;
};
type FsKey = "s" | "m" | "l" | "xl";
const FS_ORDER: FsKey[] = ["s", "m", "l", "xl"];
const FS_LABEL: Record<FsKey, string> = { s: "작게", m: "보통", l: "크게", xl: "아주 크게" };
type FeaturedCamp = { id: string; name: string; where: string; line: string | null; ph: string; rt: boolean };
type FeaturedTheme = { id: string; label: string; desc: string; count: number; camps: FeaturedCamp[] };
type Featured = { total: number; photo_count: number; themes: FeaturedTheme[] };
type BookingEvent = {
  id: string; dday: string; action: string; dateTime: string; label: string;
  stay: string; provider: string; sourceUrl: string; checkedAt: string; needsVerification: boolean;
};
type PipelineEvent = {
  id?: string; type?: string; at?: string; date?: string; time_known?: boolean;
  label?: string; stay?: { from?: string; to?: string; month?: string };
  source?: { url?: string; checked_at?: string }; needs_verification?: boolean;
};
type Catalog = {
  generated_at: string;
  counts: { opening_events: number; gocamping_records: number | null; official_pilot_products: number };
  sources: { gocamping: { state: "PUBLISHED" | "PENDING_PERSISTENCE_REVIEW" | "AWAITING_API_SYNC"; source_url: string; fetched_at: string | null } };
};

const FACILITY_URL = "https://www.gpfmc.or.kr/page/selectPage.do?muNo=649";
const RESERVATION_URL = "https://www.gpfmc.or.kr/page/selectPage.do?muNo=707";
const NOTICE_URL = "https://www.gpfmc.or.kr/board/facList.do?muGpNo=424&muNo=648&stNo=11";
const FORESTTRIP_URL = "https://www.foresttrip.go.kr/";
const FORESTTRIP_RULE_URL = "https://www.foresttrip.go.kr/pot/cc/fa/selectFaqBbrssListView.do?bbrssMsterId=BBRSSMSTER_00000002&ctgryCd=&hmpgId=FRIP&nowPage=1&srwrd=%EC%A3%BC%EC%A4%91&twbbsId=";
const KNPS_URL = "https://reservation.knps.or.kr/";
const SEOUL_YEYAK_URL = "https://yeyak.seoul.go.kr/";

const officialProducts: Camp[] = [
  { id: "jarasum-site-a", campground: "자라섬캠핑장", product: "사이트 A", region: "경기 가평", type: "오토캠핑", capacity: "공식 예약 화면에서 확인", size: "데크 4m × 4m 안내", price: "공식 예약 화면에서 확인", image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=f82a26b9-1ffa-49f0-bb23-a9f128a738b6&fileName=ckImgSubmit.jpg", imageAlt: "자라섬캠핑장 사이트 A 데크", imagePageUrl: FACILITY_URL, reservationUrl: RESERVATION_URL, noticeUrl: NOTICE_URL, officialUpdate: "11월 예약 일정 및 이용안내사항", officialUpdateDate: "2026.10.06", observedAt: "2026.10.13" },
  { id: "jarasum-site-b", campground: "자라섬캠핑장", product: "사이트 B", region: "경기 가평", type: "오토캠핑", capacity: "공식 예약 화면에서 확인", size: "데크 4m × 4m 안내", price: "공식 예약 화면에서 확인", image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=ef2aa11f-0dda-4662-80aa-5140c0c23f40&fileName=ckImgSubmit.jpg", imageAlt: "자라섬캠핑장 사이트 B 데크", imagePageUrl: FACILITY_URL, reservationUrl: RESERVATION_URL, noticeUrl: NOTICE_URL, officialUpdate: "11월 예약 일정 및 이용안내사항", officialUpdateDate: "2026.10.06", observedAt: "2026.10.13" },
  { id: "jarasum-caravan-c", campground: "자라섬캠핑장", product: "카라반 C", region: "경기 가평", type: "카라반", capacity: "객실별 정원 확인", size: "공식 시설 안내 참고", price: "공식 예약 화면에서 확인", image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=140050b6-09a9-4416-ab12-ac71dc28f202&fileName=tour4_04_02_02_02_01.jpg", imageAlt: "자라섬캠핑장 카라반 C 외부 전경", imagePageUrl: FACILITY_URL, reservationUrl: RESERVATION_URL, noticeUrl: NOTICE_URL, officialUpdate: "11월 예약 일정 및 이용안내사항", officialUpdateDate: "2026.10.06", observedAt: "2026.10.13" },
  { id: "jarasum-caravan-b", campground: "자라섬캠핑장", product: "카라반 B", region: "경기 가평", type: "카라반", capacity: "객실별 정원 확인", size: "공식 시설 안내 참고", price: "공식 예약 화면에서 확인", image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=68cfcb78-3961-408b-8fb2-d809c07c98a4&fileName=05.jpg", imageAlt: "자라섬캠핑장 카라반 B 내부", imagePageUrl: FACILITY_URL, reservationUrl: RESERVATION_URL, noticeUrl: NOTICE_URL, officialUpdate: "11월 예약 일정 및 이용안내사항", officialUpdateDate: "2026.10.06", observedAt: "2026.10.13" },
];

const fallbackEvents: BookingEvent[] = [
  { id: "weekday-open", dday: "D-1", action: "선착순 오픈", dateTime: "10.14(수) · 09:00", label: "국립자연휴양림 주중", stay: "11.23–11.29 주중", provider: "숲나들e", sourceUrl: FORESTTRIP_RULE_URL, checkedAt: "2026.10.12", needsVerification: false },
  { id: "weekend-reopen", dday: "D-2", action: "잔여분 오픈", dateTime: "10.15(목) · 09:00", label: "숲나들e 주말 잔여분", stay: "11월 주말 이용분", provider: "숲나들e", sourceUrl: FORESTTRIP_RULE_URL, checkedAt: "2026.10.12", needsVerification: true },
  { id: "next-weekday", dday: "D-8", action: "선착순 오픈", dateTime: "10.21(수) · 09:00", label: "국립자연휴양림 주중", stay: "11.30–12.06 주중", provider: "숲나들e", sourceUrl: FORESTTRIP_RULE_URL, checkedAt: "2026.10.12", needsVerification: false },
  { id: "knps-lottery", dday: "D-19", action: "추첨 접수", dateTime: "11.01(일) · 시각 미정", label: "국립공원 야영장", stay: "2027년 1월 이용분", provider: "국립공원공단", sourceUrl: KNPS_URL, checkedAt: "2026.10.12", needsVerification: true },
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

function formatEvent(event: PipelineEvent): BookingEvent | null {
  if (!event.id || !event.date || !event.label || !event.source?.url) return null;
  const reference = Date.parse(`${kstDate()}T00:00:00+09:00`);
  const opening = Date.parse(`${event.date}T00:00:00+09:00`);
  const days = Math.round((opening - reference) / 86_400_000);
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short" }).format(new Date(`${event.date}T00:00:00+09:00`)).replace(/\s/g, "");
  const time = event.time_known && event.at ? event.at.slice(11, 16) : "시각 미정";
  const action = event.type === "REOPEN" ? "잔여분 오픈" : event.type?.includes("LOTTERY") ? "추첨 접수" : "선착순 오픈";
  const stay = event.stay?.from && event.stay?.to ? `${event.stay.from.slice(5).replace("-", ".")}–${event.stay.to.slice(5).replace("-", ".")} 이용분` : event.stay?.month ? `${event.stay.month.replace("-", ".")} 이용분` : "이용 대상은 공식 원문에서 확인";
  return { id: event.id, dday: days < 0 ? "일정 경과" : `D-${days}`, action, dateTime: `${dateLabel} · ${time}`, label: event.label.replace("비수기 ", ""), stay, provider: event.id.startsWith("foresttrip") ? "숲나들e" : event.id.startsWith("knps") ? "국립공원공단" : "공식 예약처", sourceUrl: event.source.url, checkedAt: event.source.checked_at ?? "확인일 미상", needsVerification: event.needs_verification === true };
}

export default function Home() {
  const [mode] = useState<"camp" | "open">("camp");
  const [keyword, setKeyword] = useState("");
  const [region] = useState("전국");
  const [tripDate, setTripDate] = useState("");
  const [guests, setGuests] = useState("성인 2 · 차 1");
  const [gear, setGear] = useState("선택 안 함");
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [saved, setSaved] = useState<string[]>([]);
  const [savedEvents, setSavedEvents] = useState<string[]>([]);
  const [selectedCamp, setSelectedCamp] = useState<Camp | null>(null);
  const [upcoming, setUpcoming] = useState(fallbackEvents);
  const [catalog, setCatalog] = useState<Catalog>(fallbackCatalog);
  const [featured, setFeatured] = useState<Featured | null>(null);
  // 글자 크기(탐색 화면과 같은 저장값 moyeora-fs를 공유)
  const [fs, setFs] = useState<FsKey>("m");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { try { const v = window.localStorage.getItem("moyeora-fs") as FsKey | null; if (v && FS_ORDER.includes(v)) { setFs(v); document.documentElement.dataset.fs = v; } } catch { /* 저장소 없음 */ } });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const cycleFs = () => { const next = FS_ORDER[(FS_ORDER.indexOf(fs) + 1) % FS_ORDER.length]; setFs(next); document.documentElement.dataset.fs = next; try { window.localStorage.setItem("moyeora-fs", next); } catch { /* 저장소 없음 */ } };
  // 전국 탐색 데이터에서 뽑은 테마별 사진 캠핑장(매일 Data sync가 갱신)
  useEffect(() => {
    const controller = new AbortController();
    fetch("./explore/data/featured.json", { signal: controller.signal }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.themes?.length) setFeatured(d as Featured); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  const ddayNum = (d: string) => (d === "D-0" ? 0 : Number(d.replace(/[^0-9]/g, "")) || 999);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setSaved(JSON.parse(window.localStorage.getItem("moyeora-camping-saved") ?? "[]")); setSavedEvents(JSON.parse(window.localStorage.getItem("moyeora-camping-open-alerts") ?? "[]")); }
      catch { setSaved([]); setSavedEvents([]); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetch("./data/open-calendar.json", { signal: controller.signal }).then((response) => response.ok ? response.json() : null), fetch("./data/catalog.json", { signal: controller.signal }).then((response) => response.ok ? response.json() : null)]).then(([calendar, nextCatalog]) => {
      const parsedEvents = Array.isArray(calendar?.events) ? calendar.events.map(formatEvent).filter((event): event is BookingEvent => Boolean(event)) : [];
      if (parsedEvents.length) setUpcoming(parsedEvents);
      if (nextCatalog?.counts && nextCatalog?.sources?.gocamping) setCatalog(nextCatalog as Catalog);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const results = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return officialProducts.filter((camp) => (selectedCategory === "전체" || camp.type === selectedCategory) && (region === "전국" || camp.region.includes(region)) && (!query || [camp.campground, camp.product, camp.region, camp.type].some((value) => value.toLowerCase().includes(query))));
  }, [keyword, region, selectedCategory]);
  const toggleSaved = (id: string) => setSaved((current) => { const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]; window.localStorage.setItem("moyeora-camping-saved", JSON.stringify(next)); return next; });
  const toggleEvent = (id: string) => setSavedEvents((current) => { const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]; window.localStorage.setItem("moyeora-camping-open-alerts", JSON.stringify(next)); return next; });
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
    <header className="gnb"><div className="gnb-in">
      <a className="sh-brand" href="./" aria-label="모여라 캠핑 홈"><span><Tent size={20} /></span><b>모여라 캠핑</b></a>
      <nav className="sh-nav" aria-label="주요 메뉴"><a href="explore/"><Search size={18} />캠핑장 찾기</a><a href="explore/collections/"><Sparkles size={18} />컬렉션</a><a href="explore/guide/"><BookOpen size={18} />예약 가이드</a><a href="#calendar"><Bell size={18} />예약 오픈</a><a href="explore/passport/"><Heart size={18} />관심·패스포트</a></nav>
      <div className="sh-actions"><button type="button" className="sh-fs" onClick={cycleFs} aria-label="글자 크기 바꾸기">가<small>{FS_LABEL[fs]}</small></button><a className="sh-icon" href="explore/#near=1" aria-label="내 주변 캠핑장"><LocateFixed size={18} /></a></div>
    </div></header>

    <div className="may-shell">
      <section className="may-hero" aria-label="캠핑 탐색">
        <img src={officialProducts[2].image} alt={officialProducts[2].imageAlt} referrerPolicy="no-referrer" /><div className="may-hero-overlay" />
        <div className="may-hero-copy"><h1><span>전국 {featured ? featured.total.toLocaleString("ko-KR") : "3,000"}곳 캠핑장,</span><span>사진 보고 바로 예약</span></h1><p>사이트·시설·주변 정보와 예약 오픈 일정까지<br />한 화면에서 비교하세요.</p></div>
        <div className="may-hero-stats" aria-label="수집 현황"><div><small><CalendarClock size={14} />이번 주 예약 오픈</small><strong>{upcoming.length}<i>건</i></strong></div><div><small><Database size={14} />공개 비교 상품</small><strong>{catalog.counts.official_pilot_products}<i>개</i></strong></div></div>
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
            <span className="may-photo-img"><img src={`media/${camp.ph}`} alt={`${camp.name} 공식 사진`} loading="lazy" />{camp.rt && <em>실시간 예약</em>}</span>
            <b>{camp.name}</b><small><MapPin size={12} />{camp.where}</small>{camp.line && <span className="may-photo-line">{camp.line}</span>}
          </a>)}</div>
        </div>)}
        <p className="may-disclosure"><ImageIcon size={15} />사진: 한국관광공사 고캠핑(공식 등록 사진) · 예약 가능 여부와 요금은 각 예약처에서 확인하세요.</p>
      </section>}

      <section className="may-section" id="calendar">
        <div className="may-section-head"><div><h2>곧 열리는 예약</h2><p>오픈이 빠른 순서 · 종을 누르면 이 기기에 저장돼요</p></div><a href={FORESTTRIP_URL} target="_blank" rel="noreferrer">전체 <ChevronRight size={16} /></a></div>
        <div className="may-open-list">{[...upcoming].sort((a, b) => ddayNum(a.dday) - ddayNum(b.dday)).map((event) => { const isSaved = savedEvents.includes(event.id); return <article className="may-open-card" key={event.id}><div className="may-open-date"><div><strong className={event.dday === "D-0" || event.dday === "D-1" ? "urgent" : ""}>{event.dday}</strong><span className={event.needsVerification ? "review" : ""}>{event.action}</span></div><time>{event.dateTime}</time></div><div className="may-open-title"><span><Trees size={19} /></span><div><h3>{event.label}</h3><p>{event.stay}</p></div></div><div className="may-open-bottom"><a href={event.sourceUrl} target="_blank" rel="noreferrer" className={event.needsVerification ? "checking" : "verified"}>{event.needsVerification ? <CircleHelp size={14} /> : <BadgeCheck size={14} />}{event.needsVerification ? "확인 필요" : `공식 확인 · ${event.checkedAt.slice(5)}`}<ExternalLink size={11} /></a><button type="button" className={isSaved ? "on" : ""} aria-pressed={isSaved} onClick={() => toggleEvent(event.id)}><Bell size={14} />{isSaved ? "저장됨" : "알림"}</button></div></article>; })}</div>
        <p className="may-disclosure"><Info size={15} />일정은 규칙으로 계산한 읽기 전용 캘린더입니다. 예외·추첨 자격·최종 잔여 자리는 각 공식 예약처에서 확인하세요.</p>
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
    <nav className="gnb-tabbar" aria-label="모바일 주요 탐색"><a href="./" aria-current="page"><House size={22} />홈</a><a href="explore/"><Search size={22} />찾기</a><a href="explore/collections/"><Sparkles size={22} />컬렉션</a><a href="#calendar"><Bell size={22} />예약오픈</a><a href="explore/passport/"><Heart size={22} />관심</a></nav>
  </main>;
}
