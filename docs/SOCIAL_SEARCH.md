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

## 환경 변수

`KAKAO_REST_API_KEY`, `SOCIAL_MAX_CALLS`(기본 4000, 0이면 호출 없음), `SOCIAL_MAX_AGE_DAYS`(14), `SOCIAL_DROP_AGE_DAYS`(45), `SOCIAL_CONCURRENCY`(4), `SOCIAL_DELAY_MS`(120).
