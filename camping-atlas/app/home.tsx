"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowRight, BadgeCheck, CalendarClock, CalendarDays, Camera, Check, ChevronDown,
  CircleAlert, ExternalLink, Globe2, Heart, ImageIcon, Info,
  MapPin, Menu, Search, ShieldCheck, SlidersHorizontal, Sparkles, TentTree, Trees,
  UsersRound, Video, Wind, X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type CampType = "오토캠핑" | "카라반";
type Camp = {
  id: string; campground: string; product: string; region: string; type: CampType;
  capacity: string; size: string; price: string; image: string; imageAlt: string;
  imagePageUrl: string; reservationUrl: string; noticeUrl: string;
  officialUpdate: string; officialUpdateDate: string; observedAt: string;
};
type Channel = {
  name: string; label: string; description: string; href: string;
  icon: typeof Video; status: "공식 링크 확인" | "권한 연결 대기" | "검색 API 준비";
};

const JARASUM_FACILITY_URL = "https://www.gpfmc.or.kr/page/selectPage.do?muNo=649";
const JARASUM_RESERVATION_URL = "https://www.gpfmc.or.kr/page/selectPage.do?muNo=707";
const JARASUM_NOTICE_URL = "https://www.gpfmc.or.kr/board/facList.do?muGpNo=424&muNo=648&stNo=11";

const camps: Camp[] = [
  { id:"jarasum-caravan-c", campground:"자라섬캠핑장", product:"카라반 C", region:"경기 · 가평", type:"카라반", capacity:"객실별 정원 확인", size:"공식 시설 안내 참고", price:"공식 예약 화면에서 확인", image:"https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=140050b6-09a9-4416-ab12-ac71dc28f202&fileName=tour4_04_02_02_02_01.jpg", imageAlt:"자라섬캠핑장 카라반 C 외부 전경", imagePageUrl:JARASUM_FACILITY_URL, reservationUrl:JARASUM_RESERVATION_URL, noticeUrl:JARASUM_NOTICE_URL, officialUpdate:"11월 예약 일정 및 이용안내사항", officialUpdateDate:"2026.10.06", observedAt:"2026.10.13" },
  { id:"jarasum-caravan-b", campground:"자라섬캠핑장", product:"카라반 B", region:"경기 · 가평", type:"카라반", capacity:"객실별 정원 확인", size:"공식 시설 안내 참고", price:"공식 예약 화면에서 확인", image:"https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=68cfcb78-3961-408b-8fb2-d809c07c98a4&fileName=05.jpg", imageAlt:"자라섬캠핑장 카라반 B 내부", imagePageUrl:JARASUM_FACILITY_URL, reservationUrl:JARASUM_RESERVATION_URL, noticeUrl:JARASUM_NOTICE_URL, officialUpdate:"11월 예약 일정 및 이용안내사항", officialUpdateDate:"2026.10.06", observedAt:"2026.10.13" },
  { id:"jarasum-site-a", campground:"자라섬캠핑장", product:"사이트 A", region:"경기 · 가평", type:"오토캠핑", capacity:"공식 예약 화면에서 확인", size:"데크 4m × 4m 안내", price:"공식 예약 화면에서 확인", image:"https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=f82a26b9-1ffa-49f0-bb23-a9f128a738b6&fileName=ckImgSubmit.jpg", imageAlt:"자라섬캠핑장 사이트 A 데크", imagePageUrl:JARASUM_FACILITY_URL, reservationUrl:JARASUM_RESERVATION_URL, noticeUrl:JARASUM_NOTICE_URL, officialUpdate:"11월 예약 일정 및 이용안내사항", officialUpdateDate:"2026.10.06", observedAt:"2026.10.13" },
  { id:"jarasum-site-b", campground:"자라섬캠핑장", product:"사이트 B", region:"경기 · 가평", type:"오토캠핑", capacity:"공식 예약 화면에서 확인", size:"데크 4m × 4m 안내", price:"공식 예약 화면에서 확인", image:"https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=ef2aa11f-0dda-4662-80aa-5140c0c23f40&fileName=ckImgSubmit.jpg", imageAlt:"자라섬캠핑장 사이트 B 데크", imagePageUrl:JARASUM_FACILITY_URL, reservationUrl:JARASUM_RESERVATION_URL, noticeUrl:JARASUM_NOTICE_URL, officialUpdate:"11월 예약 일정 및 이용안내사항", officialUpdateDate:"2026.10.06", observedAt:"2026.10.13" },
];

const channels: Channel[] = [
  { name:"YouTube", label:"가평군시설관리공단 공식 채널", description:"운영기관이 시설 안내 페이지에서 연결한 채널입니다. 업로드 목록 연동 후 게시 시각순으로 표시합니다.", href:"https://youtube.com/channel/UCKaqqDletn_4jU8sGONDFkg?si=OpnHdofr6HcdGH33", icon:Video, status:"공식 링크 확인" },
  { name:"Instagram", label:"@gp_fmc · 운영기관 공식 계정", description:"공개 게시물 URL과 임베드 권한, 캠핑장 매칭이 함께 확인된 게시물만 최근 현장 카드에 노출합니다.", href:"https://instagram.com/gp_fmc", icon:Camera, status:"권한 연결 대기" },
  { name:"Facebook", label:"가평군시설관리공단 공식 페이지", description:"페이지 원문과 게시일을 남기고, 시설명이 확인되는 공개 게시물만 현장 분위기 자료로 연결합니다.", href:"https://facebook.com/gpfmc", icon:UsersRound, status:"권한 연결 대기" },
  { name:"네이버 블로그·카페", label:"최신순 관련 후기 탐색", description:"검색 API의 제목·발행일·원문 링크만 표시합니다. 후기 이미지는 저장하거나 운영 사실의 근거로 쓰지 않습니다.", href:"https://developers.naver.com/docs/serviceapi/search/cafearticle/cafearticle.md", icon:Globe2, status:"검색 API 준비" },
];
const campTypes: CampType[] = ["오토캠핑", "카라반"];
const scrollTo = (id: string) => document.querySelector(id)?.scrollIntoView({ behavior:"smooth", block:"start" });

export default function Home() {
  const [selectedTypes, setSelectedTypes] = useState<CampType[]>([]);
  const [region, setRegion] = useState("전국");
  const [keyword, setKeyword] = useState("");
  const [tripDate, setTripDate] = useState("");
  const [guests, setGuests] = useState("2");
  const [searched, setSearched] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [selectedCamp, setSelectedCamp] = useState<Camp>(camps[0]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setSaved(JSON.parse(window.localStorage.getItem("moyeora-camping-saved") ?? "[]")); } catch { setSaved([]); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const results = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return camps.filter((camp) => (selectedTypes.length === 0 || selectedTypes.includes(camp.type)) && (region === "전국" || camp.region.includes(region)) && (!query || [camp.campground,camp.product,camp.region,camp.type].some((value) => value.toLowerCase().includes(query))) && (!savedOnly || saved.includes(camp.id)));
  }, [keyword, region, saved, savedOnly, selectedTypes]);
  const toggleType = (type: CampType) => setSelectedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current,type]);
  const toggleSaved = (id: string) => setSaved((current) => { const next = current.includes(id) ? current.filter((item) => item !== id) : [...current,id]; window.localStorage.setItem("moyeora-camping-saved", JSON.stringify(next)); return next; });
  const runSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSearched(true); scrollTo("#search-results"); };
  const showCamp = (camp: Camp) => { setSelectedCamp(camp); scrollTo("#camp-detail"); };

  return <main className="atlas-app">
    <header className="atlas-header">
      <a className="atlas-brand" href="#top" aria-label="모여라 캠핑 홈"><span className="atlas-brand-mark"><TentTree size={19} strokeWidth={2.4} /></span><span>모여라 캠핑</span><em>pilot</em></a>
      <nav className="atlas-nav" aria-label="주요 메뉴"><a href="#search-results">캠핑장 찾기</a><a href="#camp-detail">예약 가이드</a><a href="#live-media">최근 현장</a></nav>
      <div className="atlas-header-actions"><button className="atlas-saved-link" type="button" onClick={() => { setSavedOnly((current) => !current); scrollTo("#search-results"); }}>저장목록 {saved.length > 0 && <b>{saved.length}</b>}</button><button className="atlas-menu" type="button" aria-label="메뉴"><Menu size={18} /></button></div>
    </header>

    <section id="top" className="atlas-hero">
      <img className="atlas-hero-image" src={selectedCamp.image} alt={selectedCamp.imageAlt} referrerPolicy="no-referrer" /><div className="atlas-hero-overlay" />
      <div className="atlas-hero-copy"><p className="atlas-overline light"><Sparkles size={15} /> 운영자 원문으로 고르는 캠핑</p><h1>떠나기 전,<br className="atlas-desktop-break" /> 지금의 정보를.</h1><p>사진은 실제 시설 원문으로 보고, 예약 조건은 공식 채널에서 마지막으로 확인하세요.</p></div>
      <div className="atlas-hero-signals" aria-label="파일럿 데이터 현황"><div><ImageIcon size={16} /><b>4</b><span>상품별 실제 사진</span></div><div><BadgeCheck size={16} /><b>3</b><span>운영기관 공식 채널</span></div><div><CalendarClock size={16} /><b>1</b><span>최근 공식 공지</span></div></div>
      <form className="atlas-search" onSubmit={runSearch}>
        <label className="atlas-search-field atlas-search-keyword"><Search size={19} aria-hidden="true" /><span><small>어디로 갈까요?</small><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="캠핑장 또는 상품 검색" aria-label="캠핑장 검색어" /></span></label>
        <label className="atlas-search-field"><MapPin size={18} aria-hidden="true" /><span><small>지역</small><select value={region} onChange={(event) => setRegion(event.target.value)} aria-label="지역 선택"><option>전국</option><option>경기</option></select></span><ChevronDown size={15} aria-hidden="true" /></label>
        <label className="atlas-search-field"><CalendarDays size={18} aria-hidden="true" /><span><small>입실일</small><input type="date" value={tripDate} onChange={(event) => setTripDate(event.target.value)} aria-label="입실일" /></span></label>
        <label className="atlas-search-field"><UsersRound size={18} aria-hidden="true" /><span><small>인원</small><select value={guests} onChange={(event) => setGuests(event.target.value)} aria-label="인원"><option value="1">1명</option><option value="2">2명</option><option value="3">3명</option><option value="4">4명</option><option value="5">5명 이상</option></select></span><ChevronDown size={15} aria-hidden="true" /></label>
        <button className="atlas-search-submit" type="submit"><span>조건으로 보기</span><Search size={18} /></button>
      </form>
      <div className="atlas-hero-foot"><span><ShieldCheck size={15} /> 가격·재고는 공식 예약처에서 확인</span><span><Camera size={15} /> 사진 원문과 확인일 표시</span></div>
    </section>

    <section className="atlas-type-strip" aria-label="캠핑 형태 빠른 선택"><div><p>어떤 캠핑을 찾고 있나요?</p><span>상품 단위로 분류합니다</span></div><div className="atlas-type-buttons">{campTypes.map((type) => <button className={selectedTypes.includes(type) ? "selected" : ""} type="button" onClick={() => { toggleType(type); scrollTo("#search-results"); }} key={type}><TentTree size={16} /> {type}</button>)}<span className="atlas-coming-type">글램핑 · 타프존 · 쉘터존 · 캠프닉은 전국 적재 후 제공</span></div></section>

    <section className="atlas-explorer" id="search-results"><div className="atlas-section-head"><div><p className="atlas-overline"><Trees size={15} /> 실제 원문 파일럿</p><h2>사진의 분위기와<br />예약의 근거를 함께 보세요.</h2></div><button className="atlas-filter-mobile" type="button" onClick={() => setMobileFilters(true)}><SlidersHorizontal size={16} /> 필터 {selectedTypes.length > 0 && <b>{selectedTypes.length}</b>}</button></div>
      <div className="atlas-explorer-layout"><aside className="atlas-filter-panel"><div className="atlas-filter-heading"><strong>상세 조건</strong><button type="button" onClick={() => { setSelectedTypes([]); setSavedOnly(false); }}>초기화</button></div><fieldset><legend>캠핑 형태</legend><div className="atlas-chips">{campTypes.map((type) => <button className={selectedTypes.includes(type) ? "active" : ""} type="button" onClick={() => toggleType(type)} key={type} aria-pressed={selectedTypes.includes(type)}>{selectedTypes.includes(type) && <Check size={13} />}{type}</button>)}</div></fieldset><fieldset><legend>저장 목록</legend><label className="atlas-checkbox"><input type="checkbox" checked={savedOnly} onChange={(event) => setSavedOnly(event.target.checked)} /><span>저장한 상품만 보기</span></label></fieldset><fieldset className="atlas-filter-source"><legend>정보 원칙</legend><p><ShieldCheck size={15} /> 재고와 요금은 공식 예약처에서 최종 확인합니다.</p><a href={JARASUM_FACILITY_URL} target="_blank" rel="noreferrer">시설 사진 원문 <ExternalLink size={13} /></a></fieldset></aside>
        <div className="atlas-result-area"><div className="atlas-result-bar"><p><b>{results.length}</b>개 공식 상품 {searched && <span>· {tripDate || "날짜 미선택"} · {guests}명</span>}</p><button type="button" onClick={() => setSavedOnly((current) => !current)}>{savedOnly ? "전체 보기" : "저장한 항목"}<ChevronDown size={15} /></button></div><p className="atlas-result-note"><Info size={15} /> 이 화면은 사진·규격·공지의 원문을 모읍니다. 날짜별 가능 여부와 결제 가격은 공식 예약 화면에서만 확정됩니다.</p><div className="atlas-camp-grid">{results.map((camp,index) => <article className="atlas-camp-card" key={camp.id}><div className="atlas-camp-image"><img src={camp.image} alt={camp.imageAlt} loading={index === 0 ? "eager" : "lazy"} referrerPolicy="no-referrer" /><span className="atlas-image-pill"><Camera size={13} /> 운영자 원문</span><button className={saved.includes(camp.id) ? "atlas-heart saved" : "atlas-heart"} type="button" aria-label={`${camp.product} 저장`} onClick={() => toggleSaved(camp.id)}><Heart size={18} fill={saved.includes(camp.id) ? "currentColor" : "none"} /></button><a className="atlas-image-source" href={camp.imagePageUrl} target="_blank" rel="noreferrer">사진 출처 <ExternalLink size={12} /></a></div><div className="atlas-camp-body"><div className="atlas-card-eyebrow"><span><Trees size={14} /> {camp.type}</span><time>확인 {camp.observedAt}</time></div><button className="atlas-camp-title" type="button" onClick={() => showCamp(camp)}>{camp.campground}<span>· {camp.product}</span></button><p className="atlas-location"><MapPin size={14} /> {camp.region}</p><div className="atlas-specs"><div><small>공간 규격</small><b>{camp.size}</b></div><div><small>이용 인원</small><b>{camp.capacity}</b></div></div><div className="atlas-card-bottom"><span><CalendarClock size={14} /> {camp.officialUpdateDate} 공지</span><button type="button" onClick={() => showCamp(camp)}>정보 보기 <ArrowRight size={14} /></button></div></div></article>)}</div>{results.length === 0 && <div className="atlas-empty"><Trees size={28} /><b>조건에 맞는 파일럿 상품이 없습니다.</b><p>필터를 초기화하거나 전체 목록을 확인해 보세요.</p></div>}</div>
      </div>
    </section>

    <section className="atlas-detail" id="camp-detail"><div className="atlas-detail-media"><img src={selectedCamp.image} alt={selectedCamp.imageAlt} referrerPolicy="no-referrer" /><div className="atlas-detail-glass"><Wind size={16} /><span>현장 날씨·바람은 기상 연동 후 표시</span></div><a href={selectedCamp.imagePageUrl} target="_blank" rel="noreferrer" className="atlas-detail-caption"><Camera size={15} /> 운영자 시설 사진 원문 <ExternalLink size={14} /></a></div><div className="atlas-detail-content"><p className="atlas-overline"><BadgeCheck size={15} /> 선택한 공식 정보</p><h2>{selectedCamp.campground}<span> {selectedCamp.product}</span></h2><p>이 상품의 사진, 최근 공지, 예약 안내를 서로 다른 원문으로 보여 줍니다. 사진 원문에는 게시일이 표기되지 않아 확인일과 분리해 표시합니다.</p><div className="atlas-detail-stats"><span><ImageIcon size={16} /> 시설 사진<br /><b>원문 외부 표시</b></span><span><CalendarDays size={16} /> 최근 공지<br /><b>{selectedCamp.officialUpdateDate}</b></span></div><div className="atlas-booking-card"><div className="atlas-booking-top"><span><BadgeCheck size={15} /> 가평군시설관리공단 공식 원문</span><time>확인 {selectedCamp.observedAt}</time></div><h3>예약하기 전 확인할 것</h3><ol><li><i>1</i><span><b>선택 날짜와 인원을 다시 입력</b><small>공식 예약처의 잔여 상품을 기준으로 합니다.</small></span></li><li><i>2</i><span><b>상품별 정원·요금 확인</b><small>{selectedCamp.price}</small></span></li><li><i>3</i><span><b>최근 운영 공지 확인</b><small>{selectedCamp.officialUpdate}</small></span></li></ol><div className="atlas-booking-actions"><a href={selectedCamp.noticeUrl} target="_blank" rel="noreferrer">공지 보기</a><a className="primary" href={selectedCamp.reservationUrl} target="_blank" rel="noreferrer">공식 예약 안내 <ExternalLink size={16} /></a></div></div></div></section>

    <section className="atlas-live" id="live-media"><div className="atlas-live-head"><div><p className="atlas-overline light"><Video size={15} /> 최근 현장 콘텐츠 경로</p><h2>더 생생한 사진은<br />원문에서 최신순으로.</h2></div><p>사진을 무단으로 복제하지 않습니다. 운영자가 연결한 공식 계정, 공개 게시물 임베드, 허용된 검색 API를 통해 게시 시각과 원문을 함께 보여 줍니다.</p></div><div className="atlas-live-layout"><div className="atlas-gallery-wall">{camps.slice(1).map((camp) => <a href={camp.imagePageUrl} target="_blank" rel="noreferrer" key={camp.id}><img src={camp.image} alt={camp.imageAlt} loading="lazy" referrerPolicy="no-referrer" /><span>{camp.product}<small>운영자 시설 안내</small></span></a>)}<a className="atlas-gallery-cta" href={JARASUM_FACILITY_URL} target="_blank" rel="noreferrer"><ImageIcon size={23} /><b>모든 시설 사진 원문</b><span>저장·가공 없이 외부 표시</span><ArrowRight size={18} /></a></div><div className="atlas-live-summary"><BadgeCheck size={19} /><p>현재 확인된 채널</p><b>운영기관 공식 링크 3개</b><span>자라섬캠핑장 시설 안내 페이지의 소셜 링크를 기준으로 확인했습니다.</span><a href={JARASUM_FACILITY_URL} target="_blank" rel="noreferrer">확인 근거 열기 <ExternalLink size={15} /></a></div></div><div className="atlas-channel-grid">{channels.map((channel) => { const Icon=channel.icon; return <article key={channel.name}><div className="atlas-channel-icon"><Icon size={21} /></div><div><p>{channel.status}</p><h3>{channel.name}</h3><b>{channel.label}</b><span>{channel.description}</span></div><a href={channel.href} target="_blank" rel="noreferrer">원문 열기 <ExternalLink size={14} /></a></article>; })}</div><div className="atlas-media-rule"><CircleAlert size={17} /><p><b>최신 사진 표시 기준:</b> 캠핑장 또는 운영기관 계정의 소유 확인, 게시물 URL, 게시 시각, 임베드·표시 권한을 모두 기록해야 합니다. 일반 후기와 검색 결과는 분위기 참고 자료로만 구분합니다.</p></div></section>

    <footer className="atlas-footer"><div><a className="atlas-brand" href="#top"><span className="atlas-brand-mark"><TentTree size={18} /></span>모여라 캠핑</a><p>공식 원문과 확인 시각을 함께 보여 주는 캠핑 탐색 파일럿.</p></div><div><a href={JARASUM_FACILITY_URL} target="_blank" rel="noreferrer">시설 안내</a><a href={JARASUM_RESERVATION_URL} target="_blank" rel="noreferrer">예약 안내</a><a href="https://github.com/pyw31337/camp" target="_blank" rel="noreferrer">GitHub</a></div><p>실시간 재고는 공식 예약처 기준<br />Pilot · 2026.10.13</p></footer>
    {mobileFilters && <div className="atlas-filter-sheet" role="dialog" aria-modal="true" aria-label="상세 필터"><div><b>상세 조건</b><button type="button" onClick={() => setMobileFilters(false)} aria-label="필터 닫기"><X size={20} /></button></div><p>캠핑 형태</p><div className="atlas-chips">{campTypes.map((type) => <button className={selectedTypes.includes(type) ? "active" : ""} type="button" onClick={() => toggleType(type)} key={type}>{selectedTypes.includes(type) && <Check size={13} />}{type}</button>)}</div><button className="atlas-mobile-apply" type="button" onClick={() => { setMobileFilters(false); setSearched(true); }}>결과 보기 ({results.length})</button></div>}
  </main>;
}
