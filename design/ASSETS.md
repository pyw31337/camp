# 시안 이미지 출처·권리 기록

> 작성: 2026-10-13 KST. AGENTS.md 규칙 4(외부 사진을 원본 저장소·운영 근거로 쓰지 않음)에 따른 기록.

`design/mockup/assets/*.jpg`, `design/mockup-v2/assets/*.jpg`는 **외부 사진이 아니다**. 모두 이 저장소의
`camping-atlas/public/images/` 디자인 검증용 생성 이미지(`camping-atlas-hero.png`, `concept-auto-camping.png`,
`concept-caravan.png`, `concept-glamping.png`)를 Pillow로 잘라 내고 줄여 JPEG로 저장한 파생본이다.

| 파생본 | 원본 | 처리 |
| --- | --- | --- |
| mockup-v2 `hero`, `hero-tents`, `hero-van` | `camping-atlas-hero.png` | 전체·부분 크롭, 최대 1600/720px, JPEG q76 |
| mockup-v2 `auto`, `auto-site`, `auto-sunset` | `concept-auto-camping.png` | 전체·부분 크롭 |
| mockup-v2 `caravan`, `caravan-deck`, `lake` | `concept-caravan.png` | 전체·부분 크롭 |
| mockup-v2 `glamping`, `glamping-tent`, `valley` | `concept-glamping.png` | 전체·부분 크롭 |
| mockup `camping-atlas-hero`, `concept-*` | 같은 이름의 PNG | 축소, JPEG q74 |

- 용도: 시안의 분위기 표현 전용. 특정 캠핑장의 실제 모습이 아니므로 화면에 실제 시설 사진처럼 표시하지 않는다(시안 문구는 “예시”).
- 실제 캠핑장 사진으로 바꿀 때는 `media_asset`에 원본 URL·권리 범위·수집 시각·표시 동의를 기록한 것만 쓴다(고캠핑 이미지 API 등 공식 원천).

## 테마 대표 사진 (2026-10-14, `camping-atlas/public/images/themes/`)

- 원천: 위키미디어 공용의 자유 이용 사진만(퍼블릭 도메인·CC0·CC BY·CC BY-SA). 테마 23개마다 1장, 800×600 webp(q72)로 줄이고 잘랐다(합계 약 2.4MB).
- 저작자·원본 페이지·라이선스는 `design/explore/theme-photos.json`에 있고, 테마 페이지(`explore/themes/`) 아래 ‘사진 출처’에 모두 표시한다. CC BY-SA 사진의 크기 조정본은 같은 라이선스(CC BY-SA)를 따른다.
- 용도: 테마 분위기 사진. 특정 캠핑장 사진이 아니며 운영 사실의 근거로 쓰지 않는다. 테마별 캠핑장 사진은 계속 고캠핑 공식 사진을 쓴다.
- 바꿀 때: 같은 파일 이름으로 교체하고 `theme-photos.json`의 출처를 함께 고친다. AI 생성 이미지는 실제 사진처럼 보이게 쓰지 않는다.

## Vision 01 히어로 (2026-10-16, `design/vision/assets/`)

| 파일 | 제작 방식 | 용도·표기 |
| --- | --- | --- |
| `korea-camp-hero-v1.png` | OpenAI 이미지 생성 도구. 국내 산지의 해질녘 캠핑 분위기, 특정 실제 업장·상호·텍스트·로고 없음 | `/vision/`의 브랜드 히어로 배경 전용. 특정 캠핑장 사진이나 운영·시설 사실의 근거로 사용하지 않는다. |

- 카탈로그 카드의 사진은 이 파일을 쓰지 않고 각 레코드의 고캠핑 공식 이미지 URL을 직접 표시한다. 그 원천·확인일은 카드의 `i` 팝오버와 데이터 레코드에 남긴다.
