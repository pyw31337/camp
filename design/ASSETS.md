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
