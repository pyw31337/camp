# 플랫폼별 컨텐츠 허브 구현 안내

## 목적
상세 페이지에서 플랫폼별로 컨텐츠를 묶어 보여준다.
- 수집된 컨텐츠(유튜브 영상 등)는 사이트 안에서 바로 재생
- 수집 안 된 플랫폼은 "해당 플랫폼에서 보기" 버튼으로 검색 결과로 이동

## 구현 위치
`design/renewal/app.js`에 아래 함수를 추가하고, 상세 페이지 템플릿에서 호출한다.

```js
function platformHubHtml(d, c) {
  const name = nameOf(c).name;
  const q = encodeURIComponent(name + " 캠핑");
  const platforms = [
    { id: "youtube", label: "YouTube", icon: "video", search: `https://www.youtube.com/results?search_query=${q}`, has: (d?.videos ?? []).some(x => x.yt) },
    { id: "instagram", label: "Instagram", icon: "camera", search: `https://www.instagram.com/explore/search/keyword/?q=${q}` },
    { id: "facebook", label: "Facebook", icon: "users", search: `https://www.facebook.com/search/posts/?q=${q}` },
    { id: "tiktok", label: "TikTok", icon: "music", search: `https://www.tiktok.com/search?q=${q}` },
    { id: "vimeo", label: "Vimeo", icon: "video", search: `https://vimeo.com/search?q=${q}` },
    { id: "naver", label: "네이버", icon: "search", search: `https://search.naver.com/search.naver?query=${q}` },
    { id: "kakao", label: "카카오", icon: "search", search: `https://search.daum.net/search?q=${q}` },
  ];
  const buttons = platforms.map(p => {
    const has = p.has;
    return `<a class="plat-btn${has ? " has" : ""}" href="${esc(p.search)}" target="_blank" rel="noopener" title="${esc(p.label)}에서 ${esc(name)} 검색">${ic(p.icon)}<span>${esc(p.label)}</span>${has ? `<i>수집됨</i>` : ""}</a>`;
  }).join("");
  return `<section class="d-sec plat-hub"><div class="sec-head">${iconTitle("share", "더 보기")}<span class="sec-note">플랫폼별</span></div><div class="plat-btns">${buttons}</div></section>`;
}
```

## 템플릿 호출
상세 페이지 렌더링에서 아래 위치에 추가:
```js
${videosHtml(d)}
${platformHubHtml(d, c)}
${nearbyHubHtml(c, d)}
```

## CSS
```css
.plat-hub .plat-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.plat-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper); color: var(--ink); text-decoration: none; font-size: .85rem; font-weight: 700; }
.plat-btn:hover { background: var(--soft); }
.plat-btn.has { border-color: var(--cobalt); color: var(--cobalt); }
.plat-btn i { font-style: normal; font-size: .7rem; font-weight: 800; padding: 2px 6px; border-radius: 999px; background: var(--cobalt); color: #fff; }
```

## 원칙
- 유튜브는 이미 수집된 영상이 있으면 사이트 안에서 재생 (기존 `videosHtml` 활용)
- 인스타·페이스북·틱톡은 약관상 직접 수집 불가 → 검색 버튼으로 새 탭 열기
- 모든 버튼은 캠핑장 이름으로 검색된 결과 페이지로 이동
