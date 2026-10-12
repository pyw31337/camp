"use client";

import {
  ArrowRight, BadgeCheck, CalendarDays, Check, ChevronDown, CloudSun,
  Compass, ExternalLink, Heart, MapPin, Menu, Mountain, Navigation,
  Search, ShieldCheck, Sparkles, TentTree, TicketCheck, Trees, UsersRound, X,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

type CampType = "오토캠핑" | "글램핑" | "카라반" | "캠프닉" | "숲속야영";
type Camp = {
  id: number; name: string; region: string; type: CampType; price: string;
  capacity: string; size: string; status: "LIVE_AVAILABLE" | "OFFICIAL_CHECK_REQUIRED" | "LOTTERY_OPEN";
  statusLabel: string; source: string; updated: string; accent: string; image: string; note: string;
};

const campTypes: CampType[] = ["오토캠핑", "글램핑", "카라반", "캠프닉", "숲속야영"];
const camps: Camp[] = [
  { id: 1, name: "수락산 숲속 야영장", region: "경기 · 포천", type: "오토캠핑", price: "요금표 확인 중", capacity: "기준 4인", size: "사이트 크기 확인 중", status: "OFFICIAL_CHECK_REQUIRED", statusLabel: "공식 예약 확인", source: "관광공사·운영자 교차 검증", updated: "10월 12일 10:20", accent: "forest", image: "/images/concept-auto-camping.png", note: "주말 가능 여부는 공식 예약처에서 다시 확인해야 합니다." },
  { id: 2, name: "물안개 카라반 파크", region: "강원 · 홍천", type: "카라반", price: "예약 채널 수집 대기", capacity: "기준/최대 인원 확인 중", size: "객실형 · 평면도 연결 예정", status: "LOTTERY_OPEN", statusLabel: "추첨 일정 확인", source: "지자체 예약·운영자 공지", updated: "10월 12일 09:45", accent: "lake", image: "/images/concept-caravan.png", note: "추첨 신청·발표·미결제 전환 일정을 분리해 보여줍니다." },
  { id: 3, name: "느티나무 글램핑", region: "충북 · 제천", type: "글램핑", price: "판매 상품 연동 대기", capacity: "기준 2인 · 최대 확인 중", size: "동별 사양 수집 중", status: "LIVE_AVAILABLE", statusLabel: "재고 조회 연결", source: "공식 판매처 우선", updated: "10월 12일 10:05", accent: "sunset", image: "/images/concept-glamping.png", note: "재고·가격은 수집 시각과 예약 채널을 함께 표시합니다." },
  { id: 4, name: "바다 곁 캠프닉", region: "전남 · 여수", type: "캠프닉", price: "당일 이용권 확인 중", capacity: "테이블 단위 확인 중", size: "존별 배치도 확인 중", status: "OFFICIAL_CHECK_REQUIRED", statusLabel: "운영 정보 확인", source: "운영자 페이지·현장 안내", updated: "10월 11일 17:30", accent: "sea", image: "/images/camping-atlas-hero.png", note: "숙박과 당일 캠프닉 상품을 별도 분류합니다." },
];
const statusClass = { LIVE_AVAILABLE: "status-live", OFFICIAL_CHECK_REQUIRED: "status-check", LOTTERY_OPEN: "status-lottery" };

export default function Home() {
  const [selectedTypes, setSelectedTypes] = useState<CampType[]>([]);
  const [region, setRegion] = useState("전국");
  const [keyword, setKeyword] = useState("");
  const [searched, setSearched] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [saved, setSaved] = useState<number[]>([]);
  const results = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return camps.filter((camp) => {
      const typeOK = !selectedTypes.length || selectedTypes.includes(camp.type);
      const regionOK = region === "전국" || camp.region.includes(region);
      const keywordOK = !query || [camp.name, camp.region, camp.type].some((value) => value.toLowerCase().includes(query));
      return typeOK && regionOK && keywordOK;
    });
  }, [keyword, region, selectedTypes]);
  const toggleType = (type: CampType) => setSelectedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSearched(true);
    document.querySelector("#search-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return <main>
    <header className="site-header">
      <a className="brand" href="#top" aria-label="모여라 캠핑 홈"><span className="brand-mark"><TentTree size={20} strokeWidth={2.4} /></span><span>모여라 캠핑</span><em>beta</em></a>
      <nav aria-label="주요 메뉴" className="desktop-nav"><a href="#search-results">캠핑장 찾기</a><a href="#how-it-works">예약 정보</a><a href="#sources">여행 계획</a></nav>
      <div className="header-actions"><button className="text-button" type="button">내 저장목록</button><button className="user-button" type="button" aria-label="계정 메뉴"><Menu size={18} /></button></div>
    </header>

    <section id="top" className="hero">
      <Image className="hero-image" src="/images/camping-atlas-hero.png" alt="서비스 콘셉트를 표현한 가을 숲속 캠핑 풍경" fill priority sizes="100vw" />
      <div className="hero-shade" />
      <div className="hero-content">
        <p className="eyebrow"><Sparkles size={15} /> 전국 캠핑장 데이터 허브</p>
        <h1>모여라,<br className="desktop-only" /> 캠핑.</h1>
        <p className="hero-copy">이번 여행에 맞는 캠핑장을 찾고, 예약 방식과 사이트 정보까지 한 번에 비교하세요.</p>
        <form className="search-box" onSubmit={handleSearch}>
          <label className="search-keyword"><Search size={19} aria-hidden="true" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="지역, 캠핑장 또는 원하는 분위기" aria-label="캠핑장 검색어" /></label>
          <div className="search-divider" />
          <label className="search-select"><MapPin size={17} aria-hidden="true" /><select value={region} onChange={(event) => setRegion(event.target.value)} aria-label="지역 선택"><option>전국</option><option>경기</option><option>강원</option><option>충북</option><option>전남</option></select><ChevronDown size={15} aria-hidden="true" /></label>
          <button className="search-detail" type="button"><CalendarDays size={16} /><span>날짜</span><strong>선택</strong></button>
          <button className="search-detail" type="button"><UsersRound size={16} /><span>인원</span><strong>2명</strong></button>
          <button className="primary-button" type="submit">찾아보기 <ArrowRight size={17} /></button>
        </form>
        <div className="hero-trust"><span><BadgeCheck size={15} /> 공공·공식 출처 우선</span><span><CalendarDays size={15} /> 예약 상태는 수집 시각 표시</span><span><ShieldCheck size={15} /> 상품별 조건 비교</span></div>
      </div>
      <aside className="hero-float-card" aria-label="이번 주말 검색 안내"><p className="small-label">WEEKEND CHECK</p><strong>이번 주말,<br />확인할 항목</strong><div className="float-rule" /><p><CalendarDays size={16} /> 입실일·연박·추첨 여부</p><p><UsersRound size={16} /> 기준/최대 인원과 추가요금</p><p><TentTree size={16} /> 사이트 규격·차량·전기 조건</p></aside>
    </section>

    <section className="signal-strip" aria-label="서비스 데이터 원칙"><p><ShieldCheck size={17} /> 공식 운영 정보와 이용자 분위기 콘텐츠를 구분합니다.</p><a href="#how-it-works">데이터 신뢰도 보는 법 <ArrowRight size={15} /></a></section>

    <section className="explorer" id="search-results">
      <div className="section-heading"><div><p className="eyebrow dark"><Compass size={15} /> 조건 탐색</p><h2>내 여행 조건에 맞춰 좁혀보세요</h2></div><button className="filter-mobile-button" type="button" onClick={() => setMobileFilters(true)}>필터 <span>{selectedTypes.length || "전체"}</span></button></div>
      <div className="explorer-grid">
        <aside className="filter-panel">
          <div className="filter-title-row"><strong>상세 조건</strong><button type="button" onClick={() => setSelectedTypes([])}>초기화</button></div>
          <fieldset><legend>캠핑 형태</legend><div className="chip-list">{campTypes.map((type) => <button className={selectedTypes.includes(type) ? "filter-chip active" : "filter-chip"} type="button" onClick={() => toggleType(type)} key={type} aria-pressed={selectedTypes.includes(type)}>{selectedTypes.includes(type) && <Check size={13} />}{type}</button>)}</div></fieldset>
          <fieldset><legend>예약 상태</legend><label className="check-row"><input type="checkbox" defaultChecked /> <span>공식 예약처 연결 가능</span></label><label className="check-row"><input type="checkbox" /> <span>추첨·선착순 일정 보기</span></label><label className="check-row"><input type="checkbox" /> <span>이번 주말 재고 확인</span></label></fieldset>
          <fieldset><legend>현장 조건</legend><label className="check-row"><input type="checkbox" /> <span>반려동물 동반</span></label><label className="check-row"><input type="checkbox" /> <span>개별 화장실·샤워실</span></label><label className="check-row"><input type="checkbox" /> <span>전기·화로대</span></label></fieldset>
        </aside>
        <div className="results-area">
          <div className="results-bar"><p><b>{results.length}</b>개의 검증 흐름 예시 {searched && <span>· 검색 조건 적용됨</span>}</p><button className="sort-button" type="button">신뢰도 높은 순 <ChevronDown size={15} /></button></div>
          <div className="result-note"><ShieldCheck size={15} /> 이 화면은 서비스 구조를 검증하는 프로토타입입니다. 카드 이미지는 서비스 콘셉트 이미지이며, 실제 예약 가능 여부·가격은 공식 채널 수집이 연결된 후에만 노출됩니다.</div>
          <div className="camp-grid">{results.map((camp, index) => <article className="camp-card" key={camp.id}>
            <div className={`camp-cover ${camp.accent}`}><Image src={camp.image} alt="" fill sizes="(max-width: 680px) 100vw, 40vw" aria-hidden="true" /><span className={`status-pill ${statusClass[camp.status]}`}>{camp.statusLabel}</span><button className={saved.includes(camp.id) ? "save-button saved" : "save-button"} type="button" aria-label={`${camp.name} 저장`} onClick={() => setSaved((current) => current.includes(camp.id) ? current.filter((id) => id !== camp.id) : [...current, camp.id])}><Heart size={18} fill={saved.includes(camp.id) ? "currentColor" : "none"} /></button><span className="cover-index">0{index + 1}</span></div>
            <div className="camp-card-body"><div className="camp-kind"><Trees size={14} /> {camp.type}</div><h3>{camp.name}</h3><p className="location"><MapPin size={14} /> {camp.region}</p><div className="spec-grid"><div><small>판매가</small><strong>{camp.price}</strong></div><div><small>이용 인원</small><strong>{camp.capacity}</strong></div><div><small>공간 규격</small><strong>{camp.size}</strong></div></div><p className="camp-note">{camp.note}</p><footer><span><BadgeCheck size={14} /> {camp.source}</span><span>{camp.updated}</span></footer></div>
          </article>)}</div>
          {results.length === 0 && <div className="empty-state"><Mountain size={28} /><strong>조건에 맞는 예시가 없습니다.</strong><p>지역 또는 캠핑 형태를 다시 선택해 보세요.</p></div>}
        </div>
      </div>
    </section>

    <section className="detail-showcase" id="how-it-works">
      <div className="detail-copy"><p className="eyebrow dark"><TicketCheck size={15} /> 예약 데이터 설계</p><h2>예약은 ‘캠핑장’이 아니라<br className="desktop-only" /> ‘판매 상품’ 단위로 봅니다.</h2><p>같은 캠핑장이라도 오토 사이트, 타프존, 글램핑 객실, 카라반, 당일 캠프닉은 가격과 정원, 예약 채널, 취소 규정이 다릅니다. 시설·구역·상품·재고·요금·정책·예약 일정을 분리해 보관합니다.</p><a className="inline-link" href="https://github.com/pyw31337/camp/blob/main/docs/캠핑장_통합검색_예약_서비스_기획_설계.md" target="_blank" rel="noreferrer">설계 문서 보기 <ArrowRight size={16} /></a></div>
      <div className="booking-panel"><div className="booking-top"><span><BadgeCheck size={16} /> 공식 예약 데이터 우선</span><time>수집 기준: 2026.10.12</time></div><h3>상품 단위 예약 판정 예시</h3><div className="booking-row booking-head"><span>상품</span><span>예약 방식</span><span>표시 상태</span></div><div className="booking-row"><span><i className="dot dot-green" /> 오토 사이트 A</span><span>공식 예약처</span><b className="green-text">수집 시각 포함</b></div><div className="booking-row"><span><i className="dot dot-amber" /> 숲속 데크 B</span><span>월간 추첨</span><b className="amber-text">접수/발표 분리</b></div><div className="booking-row"><span><i className="dot dot-blue" /> 카라반 2인형</span><span>외부 판매처</span><b className="blue-text">채널 확인 필요</b></div><div className="booking-row"><span><i className="dot dot-stone" /> 캠프닉 테이블</span><span>현장·전화</span><b className="stone-text">공식 재확인</b></div></div>
    </section>

    <section className="live-section" id="sources">
      <div className="live-heading"><div><p className="eyebrow"><CloudSun size={15} /> 현장감 있는 여행 판단</p><h2>분위기와 이동 정보도<br className="desktop-only" /> 근거를 구분해 연결합니다.</h2></div><p>사진·동영상은 플랫폼 임베드와 원문 링크를 중심으로 보여주고, 날씨·경로·주변 장소는 시각과 제공처를 표시합니다.</p></div>
      <div className="live-cards">
        <article><span className="icon-circle moss"><CloudSun size={22} /></span><p className="card-kicker">기상청</p><h3>날씨와 특보</h3><p>관측·단기예보·특보를 나눠 야외 활동 준비 정보를 제공합니다.</p><a href="https://apihub.kma.go.kr/" target="_blank" rel="noreferrer">공식 API 보기 <ExternalLink size={14} /></a></article>
        <article><span className="icon-circle clay"><Navigation size={22} /></span><p className="card-kicker">지도·경로</p><h3>거리, 시간, 통행료</h3><p>사용자가 위치 제공에 동의한 경우에만 출발지 기준 경로를 계산합니다.</p><a href="https://api.ncloud-docs.com/docs/application-maps-directions5" target="_blank" rel="noreferrer">경로 API 보기 <ExternalLink size={14} /></a></article>
        <article><span className="icon-circle sky"><Compass size={22} /></span><p className="card-kicker">관광공사·지도</p><h3>주변 여행 동선</h3><p>관광지·음식점·편의시설을 거리와 출처, 유형을 함께 비교합니다.</p><a href="https://api.visitkorea.or.kr/" target="_blank" rel="noreferrer">TourAPI 보기 <ExternalLink size={14} /></a></article>
        <article><span className="icon-circle plum"><Sparkles size={22} /></span><p className="card-kicker">소셜·콘텐츠</p><h3>최근 분위기</h3><p>공식 계정과 권한·임베드 조건이 충족된 공개 콘텐츠를 별도로 모읍니다.</p><a href="https://github.com/pyw31337/camp/blob/main/docs/캠핑장_미디어_지도_투어_연동_설계.md" target="_blank" rel="noreferrer">연동 원칙 보기 <ArrowRight size={14} /></a></article>
      </div>
    </section>

    <section className="source-section"><p className="eyebrow dark"><ShieldCheck size={15} /> 정보의 근거</p><h2>누가, 언제 확인한 정보인지<br className="desktop-only" /> 항상 남깁니다.</h2><div className="source-grid"><div><span>01</span><h3>공식·공공 원본</h3><p>관광공사 고캠핑, 운영자, 지자체, 산림·공원 예약처의 식별자와 원문을 우선 보관합니다.</p></div><div><span>02</span><h3>교차 검증</h3><p>주소, 좌표, 전화, 사업자·운영자, 명칭 이력을 비교해 같은 시설인지 판정합니다.</p></div><div><span>03</span><h3>시간이 지난 정보</h3><p>가격과 재고, 날씨, 사회관계망 콘텐츠에는 수집 시각과 만료 시각을 붙입니다.</p></div><div><span>04</span><h3>불확실성의 표시</h3><p>자동 조회 불가·공식 확인 필요·추첨 접수 중을 섞지 않고 상태로 표현합니다.</p></div></div></section>

    <footer className="site-footer"><div><a className="brand footer-brand" href="#top"><span className="brand-mark"><TentTree size={18} /></span>모여라 캠핑</a><p>전국 캠핑장 정보의 신뢰 가능한 탐색을 위한 공개 프로토타입.</p></div><div className="footer-links"><a href="https://www.gocamping.or.kr/" target="_blank" rel="noreferrer">고캠핑</a><a href="https://www.foresttrip.go.kr/" target="_blank" rel="noreferrer">숲나들e</a><a href="https://res.knps.or.kr/" target="_blank" rel="noreferrer">국립공원 예약</a><a href="https://www.eshare.go.kr/" target="_blank" rel="noreferrer">공유누리</a></div><p className="footer-meta">Prototype · 2026.10.12<br />실시간 데이터 연결 전 화면입니다.</p></footer>

    {mobileFilters && <div className="filter-sheet" role="dialog" aria-modal="true" aria-label="상세 필터"><div className="sheet-header"><strong>상세 조건</strong><button type="button" onClick={() => setMobileFilters(false)} aria-label="필터 닫기"><X size={20} /></button></div><p>캠핑 형태</p><div className="chip-list">{campTypes.map((type) => <button className={selectedTypes.includes(type) ? "filter-chip active" : "filter-chip"} type="button" onClick={() => toggleType(type)} key={type}>{selectedTypes.includes(type) && <Check size={13} />}{type}</button>)}</div><button className="primary-button sheet-apply" type="button" onClick={() => { setMobileFilters(false); setSearched(true); }}>결과 보기 ({results.length})</button></div>}
  </main>;
}
