"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ExternalLink,
  Heart,
  Info,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  TentTree,
  Trees,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type CampType = "오토캠핑" | "카라반";
type Camp = {
  id: string;
  campground: string;
  product: string;
  region: string;
  type: CampType;
  capacity: string;
  size: string;
  price: string;
  image: string;
  imageAlt: string;
  imagePageUrl: string;
  reservationUrl: string;
  noticeUrl: string;
  officialUpdate: string;
  officialUpdateDate: string;
};

const JARASUM_FACILITY_URL = "https://www.gpfmc.or.kr/page/selectPage.do?muNo=649";
const JARASUM_RESERVATION_URL = "https://www.gpfmc.or.kr/page/selectPage.do?muNo=707";
const JARASUM_NOTICE_URL = "https://www.gpfmc.or.kr/board/facList.do?muGpNo=424&muNo=648&stNo=11";

const camps: Camp[] = [
  {
    id: "jarasum-caravan-c",
    campground: "자라섬캠핑장",
    product: "카라반 C",
    region: "경기 · 가평",
    type: "카라반",
    capacity: "객실별 정원 확인",
    size: "공식 시설 안내 참고",
    price: "공식 예약 화면에서 확인",
    image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=140050b6-09a9-4416-ab12-ac71dc28f202&fileName=tour4_04_02_02_02_01.jpg",
    imageAlt: "자라섬캠핑장 카라반 C 외부 전경",
    imagePageUrl: JARASUM_FACILITY_URL,
    reservationUrl: JARASUM_RESERVATION_URL,
    noticeUrl: JARASUM_NOTICE_URL,
    officialUpdate: "11월 예약 일정 및 이용안내사항",
    officialUpdateDate: "2026.10.06",
  },
  {
    id: "jarasum-caravan-b",
    campground: "자라섬캠핑장",
    product: "카라반 B",
    region: "경기 · 가평",
    type: "카라반",
    capacity: "객실별 정원 확인",
    size: "공식 시설 안내 참고",
    price: "공식 예약 화면에서 확인",
    image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=68cfcb78-3961-408b-8fb2-d809c07c98a4&fileName=05.jpg",
    imageAlt: "자라섬캠핑장 카라반 B 내부",
    imagePageUrl: JARASUM_FACILITY_URL,
    reservationUrl: JARASUM_RESERVATION_URL,
    noticeUrl: JARASUM_NOTICE_URL,
    officialUpdate: "11월 예약 일정 및 이용안내사항",
    officialUpdateDate: "2026.10.06",
  },
  {
    id: "jarasum-site-a",
    campground: "자라섬캠핑장",
    product: "사이트 A",
    region: "경기 · 가평",
    type: "오토캠핑",
    capacity: "공식 예약 화면에서 확인",
    size: "데크 4m × 4m 안내",
    price: "공식 예약 화면에서 확인",
    image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=f82a26b9-1ffa-49f0-bb23-a9f128a738b6&fileName=ckImgSubmit.jpg",
    imageAlt: "자라섬캠핑장 사이트 A 데크",
    imagePageUrl: JARASUM_FACILITY_URL,
    reservationUrl: JARASUM_RESERVATION_URL,
    noticeUrl: JARASUM_NOTICE_URL,
    officialUpdate: "11월 예약 일정 및 이용안내사항",
    officialUpdateDate: "2026.10.06",
  },
  {
    id: "jarasum-site-b",
    campground: "자라섬캠핑장",
    product: "사이트 B",
    region: "경기 · 가평",
    type: "오토캠핑",
    capacity: "공식 예약 화면에서 확인",
    size: "데크 4m × 4m 안내",
    price: "공식 예약 화면에서 확인",
    image: "https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=ef2aa11f-0dda-4662-80aa-5140c0c23f40&fileName=ckImgSubmit.jpg",
    imageAlt: "자라섬캠핑장 사이트 B 데크",
    imagePageUrl: JARASUM_FACILITY_URL,
    reservationUrl: JARASUM_RESERVATION_URL,
    noticeUrl: JARASUM_NOTICE_URL,
    officialUpdate: "11월 예약 일정 및 이용안내사항",
    officialUpdateDate: "2026.10.06",
  },
];

const campTypes: CampType[] = ["오토캠핑", "카라반"];

export default function Home() {
  const [selectedTypes, setSelectedTypes] = useState<CampType[]>([]);
  const [region, setRegion] = useState("전국");
  const [keyword, setKeyword] = useState("");
  const [tripDate, setTripDate] = useState("");
  const [guests, setGuests] = useState("2");
  const [searched, setSearched] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem("moyeora-camping-saved") ?? "[]");
    } catch {
      return [];
    }
  });
  const [selectedCamp, setSelectedCamp] = useState<Camp>(camps[0]);

  const results = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return camps.filter((camp) => {
      const typeOK = selectedTypes.length === 0 || selectedTypes.includes(camp.type);
      const regionOK = region === "전국" || camp.region.includes(region);
      const queryOK = !query || [camp.campground, camp.product, camp.region, camp.type].some((value) => value.toLowerCase().includes(query));
      const savedOK = !savedOnly || saved.includes(camp.id);
      return typeOK && regionOK && queryOK && savedOK;
    });
  }, [keyword, region, saved, savedOnly, selectedTypes]);

  const toggleType = (type: CampType) => {
    setSelectedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  };

  const toggleSaved = (id: string) => {
    setSaved((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem("moyeora-camping-saved", JSON.stringify(next));
      return next;
    });
  };

  const runSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearched(true);
    document.querySelector("#search-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showCamp = (camp: Camp) => {
    setSelectedCamp(camp);
    document.querySelector("#camp-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return <main>
    <header className="site-header">
      <a className="brand" href="#top" aria-label="모여라 캠핑 홈"><span className="brand-mark"><TentTree size={20} strokeWidth={2.4} /></span><span>모여라 캠핑</span><em>pilot</em></a>
      <nav aria-label="주요 메뉴" className="desktop-nav"><a href="#search-results">캠핑장 찾기</a><a href="#camp-detail">공식 정보</a><a href="#sources">사진 원칙</a></nav>
      <div className="header-actions"><button className="text-button" type="button" onClick={() => { setSavedOnly((current) => !current); document.querySelector("#search-results")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>내 저장목록 {saved.length > 0 && <b>{saved.length}</b>}</button><button className="user-button" type="button" aria-label="메뉴"><Menu size={18} /></button></div>
    </header>

    <section id="top" className="hero">
      <img className="hero-image" src={selectedCamp.image} alt={selectedCamp.imageAlt} referrerPolicy="no-referrer" />
      <div className="hero-shade" />
      <div className="hero-content">
        <p className="eyebrow"><Sparkles size={15} /> 공식 원문 기반 캠핑장 탐색</p>
        <h1>모여라,<br className="desktop-only" /> 캠핑.</h1>
        <p className="hero-copy">날짜와 인원을 정하고, 검증된 시설 정보와 운영자 공식 사진·예약 안내를 바로 확인하세요.</p>
        <form className="search-box" onSubmit={runSearch}>
          <label className="search-keyword"><Search size={19} aria-hidden="true" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="캠핑장 또는 상품 검색" aria-label="캠핑장 검색어" /></label>
          <div className="search-divider" />
          <label className="search-select"><MapPin size={17} aria-hidden="true" /><select value={region} onChange={(event) => setRegion(event.target.value)} aria-label="지역 선택"><option>전국</option><option>경기</option></select><ChevronDown size={15} aria-hidden="true" /></label>
          <label className="search-detail"><CalendarDays size={16} /><span>입실일</span><input type="date" value={tripDate} onChange={(event) => setTripDate(event.target.value)} aria-label="입실일" /></label>
          <label className="search-detail"><UsersRound size={16} /><span>인원</span><select value={guests} onChange={(event) => setGuests(event.target.value)} aria-label="인원"><option value="1">1명</option><option value="2">2명</option><option value="3">3명</option><option value="4">4명</option><option value="5">5명 이상</option></select></label>
          <button className="primary-button" type="submit">찾아보기 <ArrowRight size={17} /></button>
        </form>
        <div className="hero-trust"><span><BadgeCheck size={15} /> 운영자·공공 원문 우선</span><span><Camera size={15} /> 사진 원문 링크 제공</span><span><ShieldCheck size={15} /> 재고는 공식 예약처에서 확인</span></div>
      </div>
      <aside className="hero-float-card" aria-label="파일럿 데이터 안내"><p className="small-label">PILOT DATA</p><strong>실제 사진과<br />공식 예약 안내</strong><div className="float-rule" /><p><Camera size={16} /> 운영자 홈페이지 외부 원문 표시</p><p><CalendarDays size={16} /> 최근 공지와 확인일 분리</p><p><TentTree size={16} /> 상품 단위로 시설 조건 표기</p></aside>
    </section>

    <section className="signal-strip" aria-label="사진 및 예약 데이터 원칙"><p><ShieldCheck size={17} /> 사진은 저장·가공하지 않고 운영자 원문을 표시합니다.</p><a href="#sources">원칙 보기 <ArrowRight size={15} /></a></section>

    <section className="explorer" id="search-results">
      <div className="section-heading"><div><p className="eyebrow dark"><Trees size={15} /> 검증된 파일럿</p><h2>실제 시설 조건으로 찾아보세요</h2></div><button className="filter-mobile-button" type="button" onClick={() => setMobileFilters(true)}>필터 <span>{selectedTypes.length || "전체"}</span></button></div>
      <div className="explorer-grid">
        <aside className="filter-panel">
          <div className="filter-title-row"><strong>상세 조건</strong><button type="button" onClick={() => { setSelectedTypes([]); setSavedOnly(false); }}>초기화</button></div>
          <fieldset><legend>캠핑 형태</legend><div className="chip-list">{campTypes.map((type) => <button className={selectedTypes.includes(type) ? "filter-chip active" : "filter-chip"} type="button" onClick={() => toggleType(type)} key={type} aria-pressed={selectedTypes.includes(type)}>{selectedTypes.includes(type) && <Check size={13} />}{type}</button>)}</div></fieldset>
          <fieldset><legend>데이터 상태</legend><label className="check-row"><input type="checkbox" checked={savedOnly} onChange={(event) => setSavedOnly(event.target.checked)} /> <span>저장한 상품만 보기</span></label><p className="filter-help">예약 가능 여부는 선택한 날짜·인원을 공식 예약처에서 직접 확인합니다.</p></fieldset>
          <fieldset><legend>파일럿 원천</legend><a className="filter-source-link" href={JARASUM_FACILITY_URL} target="_blank" rel="noreferrer">가평군시설관리공단 시설 안내 <ExternalLink size={13} /></a></fieldset>
        </aside>
        <div className="results-area">
          <div className="results-bar"><p><b>{results.length}</b>개 공식 상품 정보 {searched && <span>· {tripDate || "날짜 미선택"} · {guests}명 조건</span>}</p><button className="sort-button" type="button" onClick={() => setSavedOnly((current) => !current)}>{savedOnly ? "전체 보기" : "저장한 항목"} <ChevronDown size={15} /></button></div>
          <div className="result-note"><Info size={15} /> 사진은 가평군시설관리공단이 제공하는 시설 안내 원문을 외부에서 표시합니다. 가격·재고·가능 여부는 이 화면에서 추정하지 않으며 공식 예약 화면에서 확인합니다.</div>
          <div className="camp-grid">{results.map((camp, index) => <article className="camp-card" key={camp.id}>
            <div className="camp-cover actual-photo"><img src={camp.image} alt={camp.imageAlt} loading={index === 0 ? "eager" : "lazy"} referrerPolicy="no-referrer" /><span className="status-pill status-check">공식 예약 확인</span><a className="media-source" href={camp.imagePageUrl} target="_blank" rel="noreferrer"><Camera size={13} /> 운영자 사진 원문</a><button className={saved.includes(camp.id) ? "save-button saved" : "save-button"} type="button" aria-label={`${camp.product} 저장`} onClick={() => toggleSaved(camp.id)}><Heart size={18} fill={saved.includes(camp.id) ? "currentColor" : "none"} /></button><span className="cover-index">0{index + 1}</span></div>
            <div className="camp-card-body"><div className="camp-kind"><Trees size={14} /> {camp.type}</div><button className="camp-title" type="button" onClick={() => showCamp(camp)}>{camp.campground} · {camp.product}</button><p className="location"><MapPin size={14} /> {camp.region}</p><div className="spec-grid"><div><small>요금·재고</small><strong>{camp.price}</strong></div><div><small>이용 인원</small><strong>{camp.capacity}</strong></div><div><small>공간 규격</small><strong>{camp.size}</strong></div></div><p className="camp-note">최근 공식 공지: {camp.officialUpdate} ({camp.officialUpdateDate})</p><div className="card-actions"><button type="button" onClick={() => showCamp(camp)}>상세 보기</button><a href={camp.reservationUrl} target="_blank" rel="noreferrer">공식 예약 안내 <ExternalLink size={13} /></a></div><footer><span><BadgeCheck size={14} /> 가평군시설관리공단</span><span>확인 2026.10.13</span></footer></div>
          </article>)}</div>
          {results.length === 0 && <div className="empty-state"><Trees size={28} /><strong>조건에 맞는 파일럿 상품이 없습니다.</strong><p>필터를 초기화하거나 전체 보기를 선택해 보세요.</p></div>}
        </div>
      </div>
    </section>

    <section className="detail-showcase" id="camp-detail">
      <div className="detail-copy"><p className="eyebrow dark"><BadgeCheck size={15} /> 선택한 공식 정보</p><h2>{selectedCamp.campground}<br className="desktop-only" /> {selectedCamp.product}</h2><p>이 화면은 상품별로 예약 안내, 시설 사진 원문, 최근 공지를 분리해 보여 줍니다. 선택한 날짜 {tripDate || "미지정"}, 인원 {guests}명은 예약 화면에서 다시 입력해 확인해야 합니다.</p><div className="detail-links"><a className="inline-link" href={selectedCamp.reservationUrl} target="_blank" rel="noreferrer">공식 예약 안내 열기 <ExternalLink size={16} /></a><a className="inline-link secondary-link" href={selectedCamp.imagePageUrl} target="_blank" rel="noreferrer">사진 원문 열기 <Camera size={16} /></a></div></div>
      <div className="booking-panel"><div className="booking-top"><span><BadgeCheck size={16} /> 가평군시설관리공단 공식 원문</span><time>확인일: 2026.10.13</time></div><h3>원천별 정보</h3><div className="booking-row booking-head"><span>구분</span><span>내용</span><span>바로가기</span></div><div className="booking-row"><span><i className="dot dot-green" /> 시설 사진</span><span>{selectedCamp.imageAlt}</span><a href={selectedCamp.imagePageUrl} target="_blank" rel="noreferrer">원문 <ExternalLink size={13} /></a></div><div className="booking-row"><span><i className="dot dot-amber" /> 최근 공지</span><span>{selectedCamp.officialUpdate}<br />{selectedCamp.officialUpdateDate}</span><a href={selectedCamp.noticeUrl} target="_blank" rel="noreferrer">공지 <ExternalLink size={13} /></a></div><div className="booking-row"><span><i className="dot dot-blue" /> 예약 가능 여부</span><span>선택 날짜·인원으로 공식 화면에서 확인</span><a href={selectedCamp.reservationUrl} target="_blank" rel="noreferrer">예약 <ExternalLink size={13} /></a></div></div>
    </section>

    <section className="live-section" id="sources">
      <div className="live-heading"><div><p className="eyebrow"><Camera size={15} /> 사진·소셜 연동 원칙</p><h2>현재 운영자 채널을<br className="desktop-only" /> 원문 그대로 연결합니다.</h2></div><p>이 파일럿은 권한이 확인된 공식 홈페이지 사진을 외부 원문으로 표시합니다. 인스타그램·페이스북은 운영자 공식 계정과 임베드 권한이 확인된 뒤 게시물 단위로 연결합니다.</p></div>
      <div className="live-cards"><article><span className="icon-circle moss"><Camera size={22} /></span><p className="card-kicker">현재 적용</p><h3>공식 홈페이지 사진</h3><p>이미지를 저장하거나 가공하지 않고 운영자 제공 원문과 함께 표시합니다.</p><a href={JARASUM_FACILITY_URL} target="_blank" rel="noreferrer">시설 사진 원문 <ExternalLink size={14} /></a></article><article><span className="icon-circle clay"><CalendarDays size={22} /></span><p className="card-kicker">현재 적용</p><h3>최근 공지</h3><p>운영 중단, 예약 일정, 시설 변경은 공지 원문 날짜와 함께 연결합니다.</p><a href={JARASUM_NOTICE_URL} target="_blank" rel="noreferrer">공지 목록 <ExternalLink size={14} /></a></article><article><span className="icon-circle sky"><ShieldCheck size={22} /></span><p className="card-kicker">예약 원칙</p><h3>재고는 공식 채널</h3><p>정적 웹은 재고를 보유하지 않습니다. 선택 조건을 들고 공식 예약처에서 최종 확인합니다.</p><a href={JARASUM_RESERVATION_URL} target="_blank" rel="noreferrer">예약 안내 <ExternalLink size={14} /></a></article><article><span className="icon-circle plum"><Sparkles size={22} /></span><p className="card-kicker">다음 연동</p><h3>검증된 소셜 임베드</h3><p>사업자 동의와 플랫폼 임베드 조건이 갖춰진 공식 계정의 최신 게시물만 카드에 연결합니다.</p><a href="https://github.com/pyw31337/camp/blob/main/docs/%EC%BA%A0%ED%95%91%EC%9E%A5_%EB%AF%B8%EB%94%94%EC%96%B4_%EC%A7%80%EB%8F%84_%ED%88%AC%EC%96%B4_%EC%97%B0%EB%8F%99_%EC%84%A4%EA%B3%84.md" target="_blank" rel="noreferrer">연동 설계 보기 <ArrowRight size={14} /></a></article></div>
    </section>

    <footer className="site-footer"><div><a className="brand footer-brand" href="#top"><span className="brand-mark"><TentTree size={18} /></span>모여라 캠핑</a><p>공식 원문·수집 시각을 함께 보여 주는 GitHub Pages 파일럿.</p></div><div className="footer-links"><a href="https://github.com/pyw31337/camp" target="_blank" rel="noreferrer">GitHub 저장소</a><a href={JARASUM_FACILITY_URL} target="_blank" rel="noreferrer">시설 안내</a><a href={JARASUM_RESERVATION_URL} target="_blank" rel="noreferrer">예약 안내</a></div><p className="footer-meta">Pilot · 2026.10.13<br />실시간 재고는 공식 예약처에서 확인</p></footer>

    {mobileFilters && <div className="filter-sheet" role="dialog" aria-modal="true" aria-label="상세 필터"><div className="sheet-header"><strong>상세 조건</strong><button type="button" onClick={() => setMobileFilters(false)} aria-label="필터 닫기"><X size={20} /></button></div><p>캠핑 형태</p><div className="chip-list">{campTypes.map((type) => <button className={selectedTypes.includes(type) ? "filter-chip active" : "filter-chip"} type="button" onClick={() => toggleType(type)} key={type}>{selectedTypes.includes(type) && <Check size={13} />}{type}</button>)}</div><button className="primary-button sheet-apply" type="button" onClick={() => { setMobileFilters(false); setSearched(true); }}>결과 보기 ({results.length})</button></div>}
  </main>;
}
