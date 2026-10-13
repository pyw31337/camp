"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowRight, BadgeCheck, Bell, CalendarClock, CalendarDays, ChevronRight,
  CircleHelp, Clock3, ExternalLink, Heart, ImageIcon, Info, MapPin, Menu,
  Search, TentTree, Trees, UsersRound, X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type CampType = "오토캠핑" | "카라반";
type Camp = {
  id: string; campground: string; product: string; region: string; type: CampType;
  capacity: string; size: string; price: string; image: string; imageAlt: string;
  imagePageUrl: string; reservationUrl: string; noticeUrl: string;
  officialUpdate: string; officialUpdateDate: string; observedAt: string;
};
type BookingEvent = { id: string; dday: string; action: string; label: string; stay: string; provider: string; sourceUrl: string; checkedAt: string; needsVerification: boolean };

const FACILITY_URL = "https://www.gpfmc.or.kr/page/selectPage.do?muNo=649";
const RESERVATION_URL = "https://www.gpfmc.or.kr/page/selectPage.do?muNo=707";
const NOTICE_URL = "https://www.gpfmc.or.kr/board/facList.do?muGpNo=424&muNo=648&stNo=11";
const FORESTTRIP_URL = "https://www.foresttrip.go.kr/";
const FORESTTRIP_RULE_URL = "https://www.foresttrip.go.kr/pot/cc/fa/selectFaqBbrssListView.do?bbrssMsterId=BBRSSMSTER_00000002&ctgryCd=&hmpgId=FRIP&nowPage=1&srwrd=%EC%A3%BC%EC%A4%91&twbbsId=";
const KNPS_URL = "https://reservation.knps.or.kr/";
const SEOUL_YEYAK_URL = "https://yeyak.seoul.go.kr/";

const camps: Camp[] = [
  { id:"jarasum-site-a", campground:"자라섬캠핑장", product:"사이트 A", region:"경기 가평", type:"오토캠핑", capacity:"공식 예약 화면에서 확인", size:"데크 4m × 4m 안내", price:"공식 예약 화면에서 확인", image:"https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=f82a26b9-1ffa-49f0-bb23-a9f128a738b6&fileName=ckImgSubmit.jpg", imageAlt:"자라섬캠핑장 사이트 A 데크", imagePageUrl:FACILITY_URL, reservationUrl:RESERVATION_URL, noticeUrl:NOTICE_URL, officialUpdate:"11월 예약 일정 및 이용안내사항", officialUpdateDate:"2026.10.06", observedAt:"2026.10.13" },
  { id:"jarasum-site-b", campground:"자라섬캠핑장", product:"사이트 B", region:"경기 가평", type:"오토캠핑", capacity:"공식 예약 화면에서 확인", size:"데크 4m × 4m 안내", price:"공식 예약 화면에서 확인", image:"https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=ef2aa11f-0dda-4662-80aa-5140c0c23f40&fileName=ckImgSubmit.jpg", imageAlt:"자라섬캠핑장 사이트 B 데크", imagePageUrl:FACILITY_URL, reservationUrl:RESERVATION_URL, noticeUrl:NOTICE_URL, officialUpdate:"11월 예약 일정 및 이용안내사항", officialUpdateDate:"2026.10.06", observedAt:"2026.10.13" },
  { id:"jarasum-caravan-c", campground:"자라섬캠핑장", product:"카라반 C", region:"경기 가평", type:"카라반", capacity:"객실별 정원 확인", size:"공식 시설 안내 참고", price:"공식 예약 화면에서 확인", image:"https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=140050b6-09a9-4416-ab12-ac71dc28f202&fileName=tour4_04_02_02_02_01.jpg", imageAlt:"자라섬캠핑장 카라반 C 외부 전경", imagePageUrl:FACILITY_URL, reservationUrl:RESERVATION_URL, noticeUrl:NOTICE_URL, officialUpdate:"11월 예약 일정 및 이용안내사항", officialUpdateDate:"2026.10.06", observedAt:"2026.10.13" },
  { id:"jarasum-caravan-b", campground:"자라섬캠핑장", product:"카라반 B", region:"경기 가평", type:"카라반", capacity:"객실별 정원 확인", size:"공식 시설 안내 참고", price:"공식 예약 화면에서 확인", image:"https://www.gpfmc.or.kr/file/ckeditor/ckImgSubmit.do?uid=68cfcb78-3961-408b-8fb2-d809c07c98a4&fileName=05.jpg", imageAlt:"자라섬캠핑장 카라반 B 내부", imagePageUrl:FACILITY_URL, reservationUrl:RESERVATION_URL, noticeUrl:NOTICE_URL, officialUpdate:"11월 예약 일정 및 이용안내사항", officialUpdateDate:"2026.10.06", observedAt:"2026.10.13" },
];

const events: BookingEvent[] = [
  { id:"weekday-open", dday:"D-1", action:"선착순 오픈 · 10.14(수) 09:00", label:"국립자연휴양림 주중", stay:"11.23–11.29 주중 이용분", provider:"숲나들e", sourceUrl:FORESTTRIP_RULE_URL, checkedAt:"2026.10.12", needsVerification:false },
  { id:"weekend-reopen", dday:"D-2", action:"미결제분 오픈 · 10.15(목) 09:00", label:"국립자연휴양림 주말 잔여분", stay:"11월 주말 이용분", provider:"숲나들e", sourceUrl:FORESTTRIP_RULE_URL, checkedAt:"2026.10.12", needsVerification:true },
  { id:"next-weekday", dday:"D-8", action:"선착순 오픈 · 10.21(수) 09:00", label:"국립자연휴양림 주중", stay:"11.30–12.06 주중 이용분", provider:"숲나들e", sourceUrl:FORESTTRIP_RULE_URL, checkedAt:"2026.10.12", needsVerification:false },
  { id:"knps-lottery", dday:"D-19", action:"추첨 접수 · 11.01(일) 시각 미정", label:"국립공원 야영장", stay:"2027년 1월 이용분", provider:"국립공원공단", sourceUrl:KNPS_URL, checkedAt:"2026.10.12", needsVerification:true },
];

const categories = ["오토캠핑", "카라반", "글램핑", "타프존", "쉘터존", "캠프닉"];
const scrollTo = (id: string) => document.querySelector(id)?.scrollIntoView({ behavior:"smooth", block:"start" });

export default function Home() {
  const [mode, setMode] = useState<"camp" | "open">("camp");
  const [keyword, setKeyword] = useState("");
  const [region, setRegion] = useState("전국");
  const [tripDate, setTripDate] = useState("");
  const [guests, setGuests] = useState("성인 2 · 차 1");
  const [selectedTypes, setSelectedTypes] = useState<CampType[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedEvents, setSavedEvents] = useState<string[]>([]);
  const [selectedCamp, setSelectedCamp] = useState<Camp | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setSaved(JSON.parse(window.localStorage.getItem("moyeora-camping-saved") ?? "[]"));
        setSavedEvents(JSON.parse(window.localStorage.getItem("moyeora-camping-open-alerts") ?? "[]"));
      } catch { setSaved([]); setSavedEvents([]); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const results = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return camps.filter((camp) => (selectedTypes.length === 0 || selectedTypes.includes(camp.type)) && (region === "전국" || camp.region.includes(region)) && (!query || [camp.campground,camp.product,camp.region,camp.type].some((value) => value.toLowerCase().includes(query))));
  }, [keyword, region, selectedTypes]);

  const toggleType = (type: CampType) => setSelectedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current,type]);
  const toggleSaved = (id: string) => setSaved((current) => { const next = current.includes(id) ? current.filter((item) => item !== id) : [...current,id]; window.localStorage.setItem("moyeora-camping-saved", JSON.stringify(next)); return next; });
  const toggleEvent = (id: string) => setSavedEvents((current) => { const next = current.includes(id) ? current.filter((item) => item !== id) : [...current,id]; window.localStorage.setItem("moyeora-camping-open-alerts", JSON.stringify(next)); return next; });
  const runSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); scrollTo(mode === "camp" ? "#camp-list" : "#opening-list"); };
  const selectCamp = (camp: Camp) => { setSelectedCamp(camp); window.requestAnimationFrame(() => scrollTo("#camp-detail")); };

  return <main className="may-app">
    <header className="may-topbar">
      <a className="may-brand" href="#home" aria-label="모여라 캠핑 홈"><span><TentTree size={19} /></span>모여라 캠핑</a>
      <nav aria-label="주요 메뉴"><a href="#opening-list">예약 오픈</a><a href="#camp-list">캠핑장 찾기</a><a href="#providers">예약 방법</a></nav>
      <div className="may-top-actions"><button type="button" className="may-icon-button" onClick={() => scrollTo("#saved-camps")} aria-label="관심 캠핑장"><Heart size={18} /><b>{saved.length}</b></button><button type="button" className="may-icon-button may-menu" aria-label="메뉴"><Menu size={19} /></button></div>
    </header>

    <div className="may-shell" id="home">
      <section className="may-hero" aria-label="캠핑 탐색">
        <img src={camps[2].image} alt={camps[2].imageAlt} referrerPolicy="no-referrer" /><div className="may-hero-overlay" />
        <div className="may-hero-copy"><p><BadgeCheck size={15} /> 공식 원문으로 쌓는 예약 정보</p><h1>캠핑장 예약,<br />열리는 날부터 챙겨요.</h1><span>예약 방법과 오픈 일정, 내 텐트에 맞는 사이트까지 한 번에.</span></div>
        <div className="may-hero-stats"><div><small><CalendarClock size={14} /> 공개 일정</small><strong>23<span>건</span></strong><em>규칙 기반 · 확인 필요 14건</em></div><div><small><ImageIcon size={14} /> 실제 사진</small><strong>4<span>개</span></strong><em>운영기관 원문 외부 표시</em></div></div>
        <form className="may-searchbox" onSubmit={runSearch}>
          <div className="may-search-tabs" role="tablist" aria-label="탐색 종류"><button type="button" role="tab" aria-selected={mode === "camp"} onClick={() => setMode("camp")}><MapPin size={16} /> 캠핑장</button><button type="button" role="tab" aria-selected={mode === "open"} onClick={() => setMode("open")}><Bell size={16} /> 예약 오픈</button></div>
          <div className="may-search-card">{mode === "camp" ? <div className="may-search-grid">
            <label className="may-search-field may-keyword"><Search size={19} /><span><small>어디로</small><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="캠핑장 또는 지역" aria-label="캠핑장 또는 지역 검색" /></span></label>
            <label className="may-search-field"><MapPin size={18} /><span><small>지역</small><select value={region} onChange={(event) => setRegion(event.target.value)} aria-label="지역"><option>전국</option><option>경기</option></select></span></label>
            <label className="may-search-field"><CalendarDays size={18} /><span><small>언제</small><input type="date" value={tripDate} onChange={(event) => setTripDate(event.target.value)} aria-label="입실일" /></span></label>
            <label className="may-search-field"><UsersRound size={18} /><span><small>누구와</small><select value={guests} onChange={(event) => setGuests(event.target.value)} aria-label="인원과 차량"><option>성인 2 · 차 1</option><option>성인 1 · 차 1</option><option>성인 3 · 차 1</option><option>성인 4 · 차 1</option></select></span></label>
            <button className="may-search-go" type="submit"><Search size={18} /><span>찾기</span></button>
          </div> : <div className="may-open-search"><div><Bell size={20} /><span><small>예약 오픈 캘린더</small><b>공식·검토중 일정을 확인하세요</b></span></div><button className="may-search-go" type="submit"><CalendarClock size={18} /><span>일정 보기</span></button></div>}</div>
        </form>
        <a className="may-hero-source" href={FACILITY_URL} target="_blank" rel="noreferrer"><ImageIcon size={13} /> 자라섬캠핑장 운영기관 시설 사진 원문 <ExternalLink size={12} /></a>
      </section>

      <section className="may-categories" aria-label="캠핑 형태">{categories.map((category) => (["오토캠핑","카라반"] as string[]).includes(category) ? <button key={category} type="button" className={selectedTypes.includes(category as CampType) ? "selected" : ""} onClick={() => { toggleType(category as CampType); scrollTo("#camp-list"); }}><TentTree size={19} /><span>{category}</span></button> : <span key={category} className="soon"><TentTree size={19} /><span>{category}</span><small>준비 중</small></span>)}</section>

      <section className="may-section" id="opening-list"><div className="may-section-head"><div><p>예약 캘린더</p><h2>이번 주 열리는 예약</h2><span>관심 일정은 이 기기에 저장됩니다.</span></div><a href={FORESTTRIP_URL} target="_blank" rel="noreferrer">전체 일정 <ChevronRight size={16} /></a></div>
        <div className="may-open-list">{events.map((event) => { const isSaved = savedEvents.includes(event.id); return <article className="may-open-card" key={event.id}><div className="may-open-top"><strong className={event.dday === "D-1" ? "urgent" : ""}>{event.dday}</strong><span><Clock3 size={14} /> {event.action}</span></div><div className="may-open-title"><span><Trees size={18} /></span><div><h3>{event.label}</h3><p>{event.stay}</p></div></div><div className="may-open-bottom"><a href={event.sourceUrl} target="_blank" rel="noreferrer" className={event.needsVerification ? "checking" : "verified"}>{event.needsVerification ? <CircleHelp size={14} /> : <BadgeCheck size={14} />}{event.needsVerification ? "공식 재확인 필요" : `공식 확인 · ${event.checkedAt}`}<ExternalLink size={12} /></a><button type="button" className={isSaved ? "on" : ""} aria-pressed={isSaved} onClick={() => toggleEvent(event.id)}><Bell size={14} />{isSaved ? "관심 해제" : "관심"}</button></div></article>; })}</div>
        <p className="may-disclosure"><Info size={15} /> 오픈 일정은 <time>2026.10.13</time> 생성 규칙 기준입니다. 시설별 예외와 최종 잔여 자리는 각 공식 예약처에서 확인하세요.</p>
      </section>

      <section className="may-section" id="camp-list"><div className="may-section-head"><div><p>공식 사진 파일럿</p><h2>이번 주말, 어디로 갈까요?</h2><span>{keyword || selectedTypes.length > 0 ? `${results.length}개 조건 일치 상품` : "실제 시설 사진과 예약 원문을 함께 봅니다."}</span></div><button type="button" onClick={() => { setKeyword(""); setSelectedTypes([]); setRegion("전국"); }}>필터 초기화</button></div>
        <div className="may-camp-grid">{results.map((camp) => { const isSaved = saved.includes(camp.id); return <article className="may-camp-card" key={camp.id}><button type="button" className="may-card-image" onClick={() => selectCamp(camp)} aria-label={`${camp.campground} ${camp.product} 상세 보기`}><img src={camp.image} alt={camp.imageAlt} loading="lazy" referrerPolicy="no-referrer" /><span><ImageIcon size={13} /> 운영기관 원문</span></button><div className="may-card-notch"><button type="button" aria-label={`${camp.product} 관심 저장`} aria-pressed={isSaved} className={isSaved ? "saved" : ""} onClick={() => toggleSaved(camp.id)}><Heart size={18} fill={isSaved ? "currentColor" : "none"} /></button></div><div className="may-card-body"><div className="may-card-tags"><span>{camp.type}</span><time>확인 {camp.observedAt}</time></div><button type="button" className="may-card-title" onClick={() => selectCamp(camp)}>{camp.campground}<b>{camp.product}</b></button><p><MapPin size={14} /> {camp.region}</p><div className="may-card-facts"><span><small>공간</small><b>{camp.size}</b></span><span><small>인원</small><b>{camp.capacity}</b></span></div><div className="may-card-footer"><a href={camp.reservationUrl} target="_blank" rel="noreferrer">공식 예약 안내 <ExternalLink size={13} /></a><button type="button" onClick={() => selectCamp(camp)}>상세 <ArrowRight size={14} /></button></div></div></article>; })}</div>
        {results.length === 0 && <div className="may-empty"><TentTree size={28} /><b>이 조건의 파일럿 상품은 아직 없습니다.</b><span>다른 형태를 선택하거나 필터를 초기화해 보세요.</span></div>}
      </section>

      {selectedCamp && <section className="may-detail" id="camp-detail" aria-label={`${selectedCamp.product} 상세 정보`}><button className="may-detail-close" type="button" onClick={() => setSelectedCamp(null)} aria-label="상세 닫기"><X size={18} /></button><div className="may-detail-image"><img src={selectedCamp.image} alt={selectedCamp.imageAlt} referrerPolicy="no-referrer" /><a href={selectedCamp.imagePageUrl} target="_blank" rel="noreferrer"><ImageIcon size={14} /> 사진 원문 <ExternalLink size={13} /></a></div><div className="may-detail-copy"><p><BadgeCheck size={15} /> 선택한 공식 정보</p><h2>{selectedCamp.campground}<span>{selectedCamp.product}</span></h2><div className="may-detail-facts"><span><small>사이트 규격</small><b>{selectedCamp.size}</b></span><span><small>이용 인원</small><b>{selectedCamp.capacity}</b></span></div><ol><li><i>1</i><span><b>날짜와 인원을 공식 예약처에서 입력</b><small>이 화면은 재고를 추정하지 않습니다.</small></span></li><li><i>2</i><span><b>상품별 요금과 정원 확인</b><small>{selectedCamp.price}</small></span></li><li><i>3</i><span><b>최근 공지 확인</b><small>{selectedCamp.officialUpdate} · {selectedCamp.officialUpdateDate}</small></span></li></ol><div className="may-detail-actions"><a href={selectedCamp.noticeUrl} target="_blank" rel="noreferrer">최근 공지</a><a href={selectedCamp.reservationUrl} target="_blank" rel="noreferrer">공식 예약 안내 <ExternalLink size={15} /></a></div></div></section>}

      <section className="may-section may-provider-section" id="providers"><div className="may-section-head"><div><p>예약처별 규칙</p><h2>같은 예약처는 한 번에 이해해요.</h2><span>시설별 예외는 반드시 공식 공지로 다시 확인합니다.</span></div></div><div className="may-provider-grid"><article><span><Trees size={21} /></span><h3>숲나들e</h3><p>국립·공립·사립 휴양림 통합예약</p><ul><li>주중: 6주 전 수요일 09:00</li><li>주말·공휴일: 월별 추첨</li><li>미결제분: 선착순 전환</li></ul><a href={FORESTTRIP_URL} target="_blank" rel="noreferrer">공식 일정 보기 <ExternalLink size={14} /></a></article><article><span><TentTree size={21} /></span><h3>국립공원공단</h3><p>국립공원 야영장 예약시스템</p><ul><li>이용 2개월 전 추첨 접수</li><li>5일 오전 마감·오후 결과</li><li>일정표는 재확인 필요</li></ul><a href={KNPS_URL} target="_blank" rel="noreferrer">공식 예약처 <ExternalLink size={14} /></a></article><article><span><CalendarDays size={21} /></span><h3>서울시 공공서비스예약</h3><p>서울시·자치구 공영 캠핑장</p><ul><li>시설별 접수 기간 공개</li><li>OpenAPI 값으로 갱신 예정</li><li>감면 조건은 시설별 상이</li></ul><a href={SEOUL_YEYAK_URL} target="_blank" rel="noreferrer">공식 예약처 <ExternalLink size={14} /></a></article></div></section>

      <section className="may-media" id="saved-camps"><div><p>최근 현장 콘텐츠</p><h2>사진은 원문에서,<br />분위기는 더 생생하게.</h2><span>운영기관 계정과 게시물 URL, 게시 시각, 표시 권한이 모두 확인된 콘텐츠만 이 영역에 연결합니다.</span></div><div className="may-media-grid"><a href={FACILITY_URL} target="_blank" rel="noreferrer"><img src={camps[1].image} alt={camps[1].imageAlt} loading="lazy" referrerPolicy="no-referrer" /><span>운영기관 시설 사진 원문</span></a><div><BadgeCheck size={20} /><b>공식 채널 3개 확인</b><span>YouTube · Instagram · Facebook</span><a href={FACILITY_URL} target="_blank" rel="noreferrer">근거 보기 <ExternalLink size={14} /></a></div></div></section>
    </div>
    <nav className="may-bottom-nav" aria-label="모바일 주요 탐색"><a href="#home"><TentTree size={18} />홈</a><a href="#camp-list"><Search size={18} />찾기</a><a href="#opening-list"><Bell size={18} />예약오픈</a><a href="#saved-camps"><Heart size={18} />관심</a></nav>
  </main>;
}
