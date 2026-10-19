# 인수인계

> 최종 갱신: 2026-10-19 KST(플랫폼 허브 구현 확인, 작업 전파 정책 명시) — 맨 위 ‘📌 공지’부터 읽을 것<br>
> 다음 작업자는 이 문서를 먼저 읽고 작업 종료 시 업데이트한다.

## 📌 수집 주기 분리 (2026-10-19, Grok)

- 시설·주변은 매일 안 바뀐다. **운영 PostgreSQL 전체 스냅샷 적재는 일요일(KST) 또는 `full_db_import=true`만.**
- 평일 `data-sync`는 `db:migrate`만 하고 고캠핑·context·licences 재적재를 건너뛴다.
- 임시 DB 이중 적재 검증도 같은 날만.
- 상세: `docs/SYNC_CADENCE.md`. 새 수집을 매일 단계로 넣기 전에 이 문서를 볼 것.

## 📌 전기 용량 A 단위 분리 (2026-10-19, Grok)

- `pipeline/registry/attribute-dictionary.json`에 `POWER_MAX_A` (int, unit A) 추가.
- `pipeline/lib/spec-extractor.mjs`가 “전기 15A”, “사이트당 20A” 등 자유 텍스트에서 A 값을 추출해 `POWER_MAX_A`로 기록 (10~30A, W 환산 없음).
- 기존 `POWER_W` → `POWER_MAX_W` 경로는 유지.
- 다음 `data-sync` 또는 증분 발행 시 Fact Store에 반영됨. 다른 에이전트와 파일 영역 겹치지 않음.

## 📌 작업 전파 정책 (2026-10-19, 사용자 요청)

**모든 에이전트는 작업한 내용을 사이트에 직접 반영하거나, 안 될 때는 깃이나 다른 방법으로 다른 에이전트에게 전파해야 한다.**

- 새 기능·수정 사항은 PR이나 인수인계 문서 맨 위에 남긴다.
- 파일 전체를 자리표시자로 덮지 말 것. 필요한 줄만 고친다.
- 수집된 데이터는 `collected-data` 브랜치와 인수인계로 공유한다.

## 📌 플랫폼 허브 구현 확인 (2026-10-19, Claude)

- `docs/PLATFORM_HUB.md`의 의도(상세 ‘더 보기’ 플랫폼별 검색 버튼)는 `platformHubHtml`로 구현됨.
- 유튜브 영상은 기존 `videosHtml`로 사이트 안에서 재생.
- 인스타·페이스북·틱톡 등은 검색 버튼으로 새 탭 열기.
- 상세 페이지에 바로 보임.

## 🚨 화면 원본을 자리표시자로 덮지 말 것 (2026-10-19 15시, Claude → 전 에이전트)

- 14:43 KST 커밋 6463b3336·49a4d6498(“platform hub”)이 `design/renewal/app.js`·`style.css`를 `// PLACEHOLDER - will be replaced`로 덮었다. 이 원본은 매일 발행이 `/explore/`로 그대로 복사하므로 **다음 발행에서 라이브 사이트 전체가 빈 화면이 될 뽐했다.** PR #39에서 전체 원본을 되살리고, `docs/PLATFORM_HUB.md`의 의도(상세 ‘더 보기’ 플랫폼별 검색 버튼)는 `platformHubHtml`로 구현했다.
- `pipeline/test/design-source-guard.test.mjs`가 이제 원본의 자리표시자·잘림(app.js 100KB↓·style.css 40KB↓)·핵심 함수 누락·문법 오류를 CI에서 막는다.
- 화면 수정은 `design/renewal/`을 **부분 수정**하고 `node scripts/publish-explorer-pages.mjs --shell-only camping-atlas/public/explore`로 발행한다. 발행본(`camping-atlas/public/explore/app.js`)만 고치면 다음 발행에 덮인다.

---

## 📌 이전 공지 (클로드·제미나이)

이전 인수인계 내용은 그대로 유지한다. 새 작업자는 위 공지를 먼저 읽을 것.
