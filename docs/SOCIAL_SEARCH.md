# 캠핑장 소셜 검색(카카오 Daum 검색 API)

캠핑장마다 사람들이 남긴 블로그·카페 글, 이미지, 동영상 **링크**를 모은다. 지오코딩과 같은 `KAKAO_REST_API_KEY`를 쓰며 새 키는 필요 없다.

- 코드: `pipeline/lib/social-search.mjs`(순수 함수), `pipeline/scripts/sync-social.mjs`(호출·캐시·출력), `pipeline/test/social-search.test.mjs`
- 캐시: `pipeline/.cache/social-search.json` · 출력: `pipeline/out/campground-social.json`
- 신뢰 등급 D(사용자 게시물). 운영 여부·가격·예약 가능 여부의 근거로 쓰지 않는다(AGENTS.md 3·4번).

## API 확인 결과(2026-10-13, developers.kakao.com)

출처: <https://developers.kakao.com/docs/latest/ko/daum-search/dev-guide>

| 종류 | URL | sort | page | size |
|---|---|---|---|---|
| 블로그 | `GET https://dapi.kakao.com/v2/search/blog` | accuracy(기본)·recency | 1~50 | 1~50(기본 10) |
| 카페 | `GET https://dapi.kakao.com/v2/search/cafe` | accuracy·recency | 1~50 | 1~50(기본 10) |
| 이미지 | `GET https://dapi.kakao.com/v2/search/image` | accuracy·recency | 1~50 | 1~80(기본 80) |
| 동영상 | `GET https://dapi.kakao.com/v2/search/vclip` | accuracy·recency | 1~15 | 1~30(기본 15) |

- 헤더 `Authorization: KakaoAK <REST API 키>`. 응답 `meta{total_count, pageable_count, is_end}`, `documents[]`.
- 블로그: `title, contents, url, blogname, thumbnail, datetime` · 카페: `title, contents, url, cafename, thumbnail, datetime`
- 이미지: `collection, thumbnail_url, image_url, width, height, display_sitename, doc_url, datetime`
- 동영상: `title, url, datetime, play_time(초), thumbnail, author`
- `title`·`contents`에는 검색어 강조용 `<b>` 태그가 들어 있다 → 저장 전 제거.

쿼터(<https://developers.kakao.com/docs/latest/ko/getting-started/quota>): Daum 검색 전체 **하루 50,000건**, 종류별(블로그·카페·이미지·동영상 등) **하루 30,000건**, 앱 전체 월 3,000,000건 무료. 초당 제한은 문서에 없음. 수치는 바뀔 수 있다고 명시됨.
→ 1곳당 4회, 기본 `SOCIAL_MAX_CALLS=4000`(1,000곳/실행)이면 약 3,100곳 전체를 4일에 한 바퀴, 14일 주기 갱신에 충분하다. 지오코딩(로컬 API)과 같은 앱 월 한도를 나눠 쓴다.

## 이용 조건(운영정책)

출처: <https://developers.kakao.com/terms/latest/ko/site-policies>

- 제5조 20호: 사용자 환경 개선 외 목적의 캐시, 캐시 후 최신 상태로 유지하지 않는 행위 금지 → 14일 주기 갱신, 45일(`SOCIAL_DROP_AGE_DAYS`) 넘은 항목은 출력에서 제외.
- 제5조 30호: 받은 데이터를 사전 승낙 없이 복제·재배포하거나 검색 엔진·디렉터리에 넣는 행위 금지 → 출력 JSON은 화면 표시용으로만 쓰고 데이터셋으로 재배포하지 않는다. 표시 페이지 구성 시 검색 결과 블록 색인 제외(`noindex` 또는 클라이언트 렌더) 검토 필요(결정 대기).
- 제5조 19호·제18조: 카카오 서비스·제휴로 오인되는 표시 금지, 상표 변형 금지 → “Daum 검색 제공” 같은 문구 표기, 로고는 변형하지 않는다.
- 제5조 26호: 카카오 밖으로 리디렉션이 주목적인 이용 금지 → 캠핑장 상세의 보조 섹션으로만 쓴다.
- 썸네일 표시·출처 표기 방식에 대한 별도 조항은 개발 문서·운영정책에 없다(블로그 썸네일은 “크기·화질이 바뀔 수 있음” 안내만 있음). 따라서 원 게시물 저작권을 존중해 **썸네일 URL을 그대로 링크(핫링크)로만 쓰고 파일은 저장·재가공·재호스팅하지 않으며**, 항상 원문 링크와 출처(`src`)를 함께 보인다. 원본 `img` URL은 확대 표시용이 아니라 참고용이며 표시는 `thumb` 우선.

### 상세 화면의 추가 후기 플랫폼 링크

- TikTok·Tripadvisor·네이버 지도·카카오맵은 상세 화면에서 캠핑장명으로 만든 **외부 검색/원문 링크**만 제공한다. 해당 서비스의 콘텐츠·별점·후기·썸네일은 API 계약 또는 공식 임베드 승인을 받기 전에는 수집·저장·재호스팅하지 않는다.
- 외부 링크는 예약 가능 여부·가격·운영 사실의 근거가 아니며, 새 탭(`noopener`)으로만 연다. 실제 방문자 콘텐츠는 Daum 검색 API 출력과 동일하게 원문·출처·수집 시각이 보존된 항목만 화면에 표시한다.

## 출력 형태

```json
{
  "generated_at": "2026-10-13T06:00:00+09:00",
  "source": { "name": "...", "url": "...", "tier": "D", "terms_note": "..." },
  "notes": "...",
  "stats": { "camps": 0, "avg_images": 0, "with_video_pct": 0, "with_posts_pct": 0 },
  "campgrounds": {
    "<gocamping id>": {
      "fetched_at": "...",
      "blog":  [{ "t": "blog", "title": "", "snippet": "", "url": "", "src": "블로그명", "thumb": "", "date": "YYYY-MM-DD" }],
      "cafe":  [{ "t": "cafe", "...": "같은 형태, src=카페명" }],
      "image": [{ "thumb": "", "img": "", "url": "원문(doc_url)", "src": "사이트명", "w": 0, "h": 0, "date": "" }],
      "vclip": [{ "title": "", "url": "", "thumb": "", "dur": 0, "author": "", "date": "", "yt": "유튜브 ID|null", "kind": "short|video" }]
    }
  }
}
```

상한: 블로그 8 · 카페 6 · 이미지 24 · 동영상 10. 관련성: 캠핑장 고유 이름 토큰이 제목·본문·출처명에 있어야 하며, 분양·매매·부동산 등 광고성 제목, 같은 시군구 다른 캠핑장을 제목으로 한 글은 뺀다. 이미지는 글자 정보가 없어 검색 순위를 기본으로 하고, 관련 판정을 통과한 글에서 나온 이미지를 앞으로 올린다.

(2026-10-14 강화) 지명만 겹친 글(예: ‘광명도덕산캠핑장’에 ‘자경마을버스 99번’·도덕산 산행 글)을 빼기 위해: ① 제목·본문 어디에도 캠핑 맥락어(캠핑·야영·글램핑·카라반·텐트·차박·데크·휴양림 등)가 없으면 제외, ② 제목이 버스·노선·산행·등산·일정표·채용·공고 등 다른 주제면 제목에 캠핑 맥락어가 있을 때만 남김, ③ 핵심어가 3자 이하(‘도덕산’)면 ‘지역명이 같이 나옴’만으로는 부족하고 핵심어 바로 뒤에 캠핑 관련어가 붙어야 함(제목, 본문의 ‘도덕산캠핑장’처럼 이름 그대로, 또는 제목에 핵심어+본문에서 붙음). 캐시된 후기에도 `build:explore`가 `refilterSocial`로 같은 규칙을 다시 적용한다. 각 글에는 정보량 점수 `q`(0~100: 제목에 이름+캠핑어, 본문 길이, 사이트·화장실·요금 같은 구체어, 썸네일)를 붙여 화면의 ‘정확순’·‘추천’ 정렬에 쓴다. 화면 정렬: 추천(최근 60일 최신순 → 정보량 70 이상 → 작년 이맘때 ±45일 → 나머지 최신순) · 최신순 · 정확순 · 작년 이맘때.

## 환경 변수

`KAKAO_REST_API_KEY`, `SOCIAL_MAX_CALLS`(기본 4000, 0이면 호출 없음), `SOCIAL_MAX_AGE_DAYS`(14), `SOCIAL_DROP_AGE_DAYS`(45), `SOCIAL_CONCURRENCY`(4), `SOCIAL_DELAY_MS`(120).

## YouTube 숏츠 능동 수집 (2026-10-22)

- 스크립트: `pipeline/scripts/sync-shorts.mjs` (`npm run sync:shorts`), 규칙: `pipeline/lib/shorts-search.mjs`, 테스트: `pipeline/test/shorts-search.test.mjs`.
- 이유: 일반 영상 검색에는 안 잡히지만 관련 숏츠는 있는 캠핑장이 많다. 영상이 하나도 없는 곳부터 찾는다.
- 출처(공식 API만, YouTube 검색 화면을 긁지 않음):
  - 카카오(Daum) 동영상 검색 `vclip` — `이름 쇼츠`, `이름 shorts` 2회/곳, `KAKAO_REST_API_KEY`. 실행당 `SHORTS_MAX_CALLS`(기본 6000 = 3,000곳).
  - YouTube Data API v3 — `YOUTUBE_API_KEY` Secret이 있을 때만. `search.list`(videoDuration=short, 100단위) + `videos.list`(길이, 1단위), 실행당 `YT_MAX_SEARCHES`(기본 80곳, 일 10,000단위 안).
- 통과 조건: YouTube 영상 · 숏츠(`/shorts/` 주소 또는 길이 ≤ 180초) · 제목(+설명)에 캠핑장 핵심어와 캠핑 맥락(`isRelevant`, 일반 후기와 같은 규칙).
- 기록 `pipeline/registry/shorts-search.json`(저장소에 커밋, 30일마다 다시 확인; 숏츠 없는 곳은 확인 시각만), 출력 `pipeline/out/campground-shorts.json`.
- 실행: `Shorts sync` 워크플로(수동 + 매일, 호출 9000). v2(2026-10-30)부터 숏츠뿐 아니라 이 캠핑장의 YouTube 일반 영상도 ‘이름’ 1·2쪽 + ‘이름 쇼츠’ 3회/곳으로 모은다(lib/shorts-search.mjs videosFromVclip). 매일 data-sync 전체 빌드는 이 기록을 읽어 채운다. 따로 돌린 결과는 증분 발행(`publish-incremental.sh --shorts`)으로 바로 화면에 붙는다.
- 화면 데이터: `build-explore-data.mjs`가 `videos`에 **채우기만** 한다(같은 YouTube id가 이미 있으면 건너뜀, 기존 영상은 그대로). 화면은 `kind: "short"`를 Shorts 세로 카드 줄로 보인다.

### 숏츠 엄격 판정 (shortsMatch, t39 #36 정밀도 보강)
첫 수집(3,000곳)에서 94곳이 잡혔지만 “물놀이장·호수·생태공원·채널명·다른 캠핑장” 오인이 많아 발행 전에 멈추고 기준을 올렸다.
제목 기준: ① 핵심어가 제목에 그대로 ② 캠핑 맥락 ③ 고유명 형태(핵심어+캠핑장/야영장/글램핑…) 또는 5자 이상+시군구명
④ 핵심어 2자·동명 캠핑장은 시군구명 필수 ⑤ 제목의 다른 ‘○○캠핑장’ 이름과 다르면 제외. 캐시는 그대로 두고 내보낼 때(sync-shorts)·빌드할 때 다시 거른다.

## 검색 대상·화면 반영 (2026-10-23)
- 검색 대상은 고캠핑 원본(`out/campgrounds.json`) ∪ 발행 카탈로그 전체(`explore/data/campgrounds.json`)다. 캐시가 없는 곳부터 검색한다.
- 고캠핑 업장은 `build-explore-data`가 재검사(`refilterSocial`)해 상세에 붙인다.
- 그 밖의 장소(휴양림·지자체·OSM·당일 장소)는 `merge-collected.mjs --social`이 상세에 없는 영상·후기·카페·사진만 덧붙인다. data-sync 전체 빌드와 증분 발행(`publish-incremental.sh --social`)에서 돈다.
