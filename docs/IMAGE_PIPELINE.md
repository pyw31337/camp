# 공식 캠핑장 이미지 자체 호스팅 파이프라인

> 작성 2026-10-13. 목적: 한국관광공사 고캠핑이 공식 제공하는 캠핑장 사진을 **축소·webp 변환만 해서** GitHub Pages에서 직접 내려 주어 목록·상세 화면을 빠르게 만든다. 공식 출처가 아닌 사진은 다루지 않는다(AGENTS.md 규칙 4).

## 1. 권리·이용 조건 조사

| 대상 | 확인 내용 | 근거 |
| --- | --- | --- |
| 고캠핑 정보 조회서비스(data.go.kr 15101933) | 이용허락범위 **“제한 없음”**, 무료, 개발계정 자동승인 **1,000건/일**, 운영계정은 활용사례 등록 후 증량 신청. 페이지에 사진 저작권 별도 고지는 없음. 상세 명세는 첨부 `TourAPI_Guide_(고캠핑)v4.1.zip` | https://www.data.go.kr/data/15101933/openapi.do |
| 고캠핑 `imageList` | 오퍼레이션 이름 `GoCamping/imageList`(엔드포인트 `https://apis.data.go.kr/B551011/GoCamping/imageList`). 요청: `serviceKey, MobileOS, MobileApp, contentId(필수), numOfRows, pageNo, _type=json`. 응답 `response.body.items.item[]`: `contentId, serialnum, imageUrl, createdtime, modifiedtime`(결과 없으면 `items`가 `""`). 호출 1건 = 일일 한도 1건. 명세 원문은 위 zip이며, 필드명은 공개 활용 코드와 대조함 — 첫 실호출 때 `scripts/sync-images.mjs` 로그로 재확인 | GitHub 공개 활용 예(예: `khw970421/CampingInLife` core/api/axios.js, `RRRdj/Camping` lib/services/go_camping_service.dart) |
| 고캠핑 `firstImageUrl` | `basedList` 응답의 대표 사진 URL(우리 `hero_image_url`). 원본은 `https://gocamping.or.kr/upload/camp/{id}/{파일}`이며 실측 5~10MB JPEG가 흔함. 고캠핑이 만든 1000px 파생본 `/upload/camp/{id}/thumb/thumb_1000_{파일}`(실측 약 40KB)이 있는 사진도 있어 그것을 먼저 받는다 | 2026-10-13 HEAD 실측(c_no=1066) |
| TourAPI 국문 관광정보(KorService2, data.go.kr 15101578) | 이용허락범위 “제한 없음”, 개발계정 1,000건/일. **“공공누리 1유형, 3유형 이미지 제공됨”**, 사진을 피사체 명예훼손·인격권 침해 등 일반 정서에 반하는 용도나 기업 CI·BI로 쓰는 것 금지. 이미지별 유형은 응답의 `cpyrhtDivCd`(Type1/Type3)로 구분 | https://www.data.go.kr/data/15101578/openapi.do |
| 공공누리 제1유형 | 출처표시. 상업적 이용·변경(2차적 저작물) 가능 | https://www.kogl.or.kr/info/licenseType1.do |
| 공공누리 제3유형 | 출처표시 + **변경금지**: “저작물을 변경하거나 2차적 저작물 등으로 작성할 수 없습니다.” 축소·포맷 변환이 ‘변경’인지 명시가 없고, 예시는 내용·의미를 바꾸는 편집(사진 일부 잘라 의미 바꾸기 등). 온라인 이용 시 출처 웹사이트 하이퍼링크 제공 의무 | https://www.kogl.or.kr/info/licenseType3.do |
| GitHub Pages 한도 | 게시 사이트 1GB 이하, 저장소 권장 1GB, 배포 10분 제한 | https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits |

### 우리가 해도 되는 것

- 고캠핑 `firstImageUrl`·`imageList`가 가리키는 **공식 호스트**(`gocamping.or.kr`, `*.visitkorea.or.kr`)의 사진을 받아 **비율 유지 축소(확대 없음) + webp 재인코딩 + 메타데이터 제거**만 한 파생본을 저장·게시한다. 자르기·보정·워터마크·합성은 하지 않는다(공공누리 3유형 이미지가 섞여도 내용 변경이 없도록).
- 표시 위치마다 출처를 붙인다. 화면 문구: **“사진: 한국관광공사 고캠핑”** + 해당 캠핑장 고캠핑 페이지(`gocamping_url`) 링크. 사이트 하단·정보 페이지에는 `manifest.json`의 `license_note` 전문을 둔다.
- TourAPI `firstimage`를 나중에 쓸 때는 `cpyrhtDivCd`를 함께 저장하고, Type3은 위와 같은 무변경 축소만, 출처 문구는 “한국관광공사(공공누리 제N유형)”로 표기한다.

### 하지 않는 것

- 인스타그램·네이버 블로그/카페·다음 검색·밴드·유튜브 썸네일 등 **공개 소셜·검색 결과 이미지의 저장·재호스팅 금지**. 코드에서 공식 호스트 허용 목록 밖의 URL은 내려받지 않는다(`isOfficialImageUrl`).
- 영상은 저장하지 않고 **각 플랫폼 공식 임베드(YouTube IFrame 등)로만** 재생한다.
- 사진을 운영 사실(시설 유무·현재 상태)의 근거로 쓰지 않는다. 다른 캠핑장 대표 이미지로 재사용하지 않는다.
- 피사체 명예훼손·인격권 침해 용도, 광고 소재·CI/BI 활용 금지. 기관과 특별한 관계·후원이 있는 것처럼 표시하지 않는다.
- 권리자(운영자·관광공사)가 삭제를 요청하거나 고캠핑에서 사진이 빠지면, 해당 시설의 `imageList`를 **다시 조회한 실행**에서 매니페스트·파일을 함께 정리한다. 30일 캐시 중인 다른 시설의 사진은 다음 재확인 전까지 보존한다. 즉시 내려야 하면 `media` 브랜치에서 해당 폴더를 지우고 Pages를 재배포한다.

### 남은 확인

- `TourAPI_Guide_(고캠핑)v4.1.zip` 원문에서 `imageList` 필드·사진 저작권 문구를 직접 대조(이번 조사에서 zip 본문은 열지 못함).
- 고캠핑 사진에는 운영자 업로드분이 많다. 기존 `GOCAMPING_CATALOG_PUBLISH_APPROVED`와 같은 방식으로 **사람이 검토한 뒤** 이미지 게시 승인 변수(`GOCAMPING_IMAGES_PUBLISH_APPROVED`)를 켠다.

## 2. 파이프라인

```
pipeline/out/campgrounds.json ──┐
고캠핑 imageList(사진 보강일 ≤880, 30일 캐시) ─┤→ desiredImages → planDownloads(실행당 ≤1500, 용량 ≤900MB)
                                 └→ 다운로드(동시 4, 20초, 1회 재시도, >8MB 건너뜀; thumb_1000 우선)
                                    → sharp: 480px q60(-t) / 1280px q70(-l), 확대 없음, EXIF 제거
                                    → MEDIA_DIR/camps/{id}/{원본 sha256 앞 8자}-t|l.webp
                                    → manifest.json · hero.json · failures.json, 고아 파일 정리
```

- 코드: `pipeline/lib/images.mjs`(순수 함수), `pipeline/scripts/sync-images.mjs`(실행), `pipeline/test/images.test.mjs`.
- 이미 매니페스트에 있고 파일이 있는 원본은 다시 받지 않는다. 같은 바이트면 같은 파일명이라 기존 파일을 덮어쓰지 않는다.
- 우선순위: **자체 호스팅 사진이 0장인 캠핑장**의 `imageList`를 먼저 조회하고, 그다음 캐시가 없거나 오래된 시설을 조회한다. 다운로드도 사진이 0장인 시설의 대표 사진 → 나머지 대표 사진 → imageList 추가 사진 순이다.
- 추가 사진은 캐시에 없는 시설도 있으므로 이번 실행에서 `imageList`를 재확인하지 않은 기존 항목은 매니페스트에 유지한다. 해당 시설을 재확인하면 새 목록에 없는 추가 사진과 이전 대표 사진은 정리한다.
- `media`가 900MB 상한에 닿은 초기 보강 단계에서는 시설당 첫 공식 사진 1장만 남겨 빈 시설을 우선 채운다. 이 정리는 `media` 브랜치에만 적용되고, 전국 커버리지를 확인한 뒤 별도 갤러리 확장 작업에서 늘린다.
- 실패한 원본은 `failures.json`에 기록하고 7일 동안 재시도하지 않는다.

### 환경 변수

| 이름 | 기본 | 설명 |
| --- | --- | --- |
| `MEDIA_DIR` | `pipeline/out/media` | 출력 루트(워크플로에서는 `media` 브랜치 작업 트리) |
| `CAMPGROUNDS_JSON` | `pipeline/out/campgrounds.json` | 입력 |
| `DATA_GO_KR_SERVICE_KEY` | — | 없으면 imageList 생략(대표 사진만) |
| `IMAGE_LIST_MAX_CALLS` | 900 | 스크립트의 imageList 호출 상한. Actions의 `media-backfill` 프로필은 공유 일일 한도를 고려해 880으로 지정한다. 캐시 `pipeline/.cache/gocamping-images.json`, 30일 |
| `IMAGE_MAX_DOWNLOADS` | 1500 | 실행당 다운로드 상한 |
| `IMAGE_MAX_PER_CAMP` | 6 | imageList 추가 사진 상한 |
| `IMAGE_MAX_STORED_PER_CAMP` | 0(제한 없음) | `1`이면 기존 갤러리도 시설당 첫 사진 하나로 정리해 저장 공간을 사진 없는 시설에 돌린다. Actions `media-backfill`에서만 1 |
| `IMAGE_MAX_BYTES` | 8388608 | 원본 1장 상한 |
| `IMAGE_BUDGET_MB` | 900 | `camps/` 총용량 상한(Pages 1GB 안) |
| `IMAGE_PRUNE` | 1 | `0`이면 고아 파일을 지우지 않음 |

### 매니페스트(`media/manifest.json`)

```json
{
  "generated_at": "2026-10-13T08:41:18.465Z",
  "license_note": "캠핑장 사진 출처: 한국관광공사 고캠핑 …",
  "credit": "한국관광공사 고캠핑",
  "camps": {
    "1066": [
      {
        "src_url": "https://gocamping.or.kr/upload/camp/1066/3799….jpg",
        "fetched_from": "https://gocamping.or.kr/upload/camp/1066/thumb/thumb_1000_3799….jpg",
        "thumb": "camps/1066/6c734b46-t.webp",
        "large": "camps/1066/6c734b46-l.webp",
        "w": 1000, "h": 666,
        "source": "gocamping",
        "credit": "한국관광공사 고캠핑",
        "checked_at": "2026-10-13T08:41:18.465Z"
      }
    ]
  }
}
```

- 키는 고캠핑 `contentId`(= `campgrounds[].external_id.id`). 배열 순서 = 표시 순서(0번이 대표). `w/h`는 large 파생본 크기. `fetched_from`은 공식 1000px 파생본을 받았을 때만 있다. 경로는 `media/` 기준 상대 경로이므로 웹에서는 `${import.meta.env.BASE_URL}media/${thumb}`(= `/camp/media/camps/…`).
- `hero.json`: `{generated_at, credit, thumbs: {[id]: thumb 경로}}` — 목록 화면용(약 120KB). 전체 매니페스트는 3,100곳×7장이면 수 MB라 목록에서 받지 않는다.

## 3. 저장 위치: orphan 브랜치 `media`

이미지는 main 이력에 넣지 않는다. 이미지만 담은 orphan 브랜치 `media`를 **항상 커밋 1개로 유지(amend + force push)**해 이력 누적을 막는다. Pages 배포 때 이 브랜치를 `dist/client/media`로 복사한다.

### data-sync.yml (Sync GoCamping 다음, Restore geocode cache 근처에 추가)

```yaml
      - name: Restore GoCamping imageList cache
        uses: actions/cache@v4
        with:
          path: pipeline/.cache/gocamping-images.json
          key: gocamping-images-v1-${{ github.run_id }}
          restore-keys: gocamping-images-v1-
      - name: Check out the media branch (orphan, images only)
        id: media
        continue-on-error: true
        working-directory: .
        run: |
          MEDIA_DIR="$RUNNER_TEMP/media"
          if git ls-remote --exit-code --heads origin media >/dev/null 2>&1; then
            git fetch --depth=1 origin +media:refs/remotes/origin/media
            git worktree add -B media "$MEDIA_DIR" origin/media
          else
            git worktree add --detach "$MEDIA_DIR"
            git -C "$MEDIA_DIR" switch --orphan media
          fi
          echo "dir=$MEDIA_DIR" >> "$GITHUB_OUTPUT"
      - name: Sync official campground images (webp)
        id: images
        if: steps.media.outcome == 'success'
        continue-on-error: true
        run: npm run sync:images
        env:
          MEDIA_DIR: ${{ steps.media.outputs.dir }}
          DATA_GO_KR_SERVICE_KEY: ${{ secrets.DATA_GO_KR_SERVICE_KEY }}
          # PR은 캐시만 쓰고 소량만 받아 변환을 검증한다(일일 한도·용량 보호).
          IMAGE_LIST_MAX_CALLS: ${{ github.event_name == 'pull_request' && '0' || '900' }}
          IMAGE_MAX_DOWNLOADS: ${{ github.event_name == 'pull_request' && '20' || '1500' }}
          IMAGE_MAX_PER_CAMP: ${{ vars.IMAGE_MAX_PER_CAMP || '6' }}
      - name: Publish the media branch (single commit, force push)
        if: steps.images.outcome == 'success' && github.event_name != 'pull_request' && vars.GOCAMPING_IMAGES_PUBLISH_APPROVED == 'true'
        working-directory: ${{ steps.media.outputs.dir }}
        run: |
          git add -A
          if git rev-parse -q --verify HEAD >/dev/null && git diff --cached --quiet; then
            echo "이미지 변경 없음."; exit 0
          fi
          git config user.name "moyeora-camping-data-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          MSG="chore(media): official campground images $(date -u +%Y-%m-%dT%H:%MZ)"
          if git rev-parse -q --verify HEAD >/dev/null; then
            git commit -q --amend -m "$MSG"
          else
            git commit -q -m "$MSG"
          fi
          git push --force origin media
          du -sh --exclude=.git .
```

- `npm run sync:images`는 `pipeline/package.json` scripts에 `"sync:images": "node scripts/sync-images.mjs"` 추가가 필요(아니면 `run: node scripts/sync-images.mjs`).
- `media` 브랜치는 Pages 배포(workflow_run)보다 먼저 푸시되므로 같은 실행 결과가 다음 배포에 실린다.
- 저장소 Settings → Branches에서 `media`에 보호 규칙을 걸면 force push가 막히므로 걸지 않는다(봇만 쓴다).

### deploy-pages.yml (build:pages 다음, upload-pages-artifact 앞)

```yaml
      - name: Add self-hosted official images from the media branch
        working-directory: .
        run: |
          if git ls-remote --exit-code --heads origin media >/dev/null 2>&1; then
            git fetch --depth=1 origin +media:refs/remotes/origin/media
            mkdir -p camping-atlas/dist/client/media
            git archive origin/media | tar -x -C camping-atlas/dist/client/media
            du -sh camping-atlas/dist/client/media
          else
            echo "::notice::media 브랜치가 없어 이미지 없이 배포합니다."
          fi
```

`actions/checkout@v4` 기본 인증이 남아 있어 별도 토큰이 필요 없다(`contents: read`로 충분). `git archive`라 `.git` 없이 파일만 복사된다.

### 공유 API 한도 운영

`data-sync.yml`은 고캠핑 기준 목록을 받은 직후 사진을 먼저 동기화한다. 2026-10-13 실행에서 TourAPI 보조 수집이 같은 `data.go.kr` 일일 한도를 소진해 imageList가 0건으로 끝난 사실을 확인했기 때문이다.

- 기본 `auto`: 수·금은 `media-backfill`(imageList 최대 880회, 시설당 1장으로 공간 재균형, TourAPI 호출 0회), 나머지는 `tour-enrichment`, 일요일은 `free-audit`으로 교차한다.
- 수동 실행은 `sync_profile`에서 `media-backfill`, `tour-enrichment`, `free-audit`을 명시할 수 있다. 초기 사진 보강이 필요하면 `media-backfill`만 실행한다.
- `tour-enrichment`은 주변 150·요금 소개 220·상품 500 호출 상한으로, 사진 호출은 0으로 둔다. 실제 호출 수와 한도 오류는 Actions 로그에서 확인한다.

## 4. 용량 추정

| 경우 | 계산 | 합계 |
| --- | --- | --- |
| 과제 가정(대표 1장) | 3,100 × (25KB + 120KB) | 약 **439MB** |
| 과제 가정(대표 + imageList 6장) | 3,100 × 7 × 145KB | 약 **3.0GB** → Pages 1GB 초과 |
| 실측: 9MB 원본 → 파생본 | thumb 22KB + large 171KB | 193KB/장 |
| 실측: 공식 thumb_1000 → 파생본 | thumb 4KB + large 16KB | 20KB/장 |

결론: 대표 사진은 전부 들어가지만 추가 사진 6장은 1GB를 넘을 수 있다. `IMAGE_BUDGET_MB=900`이 넘치기 전에 새 다운로드를 멈추며, 우선순위상 모든 캠핑장의 대표 사진·1번째 추가 사진부터 채워진다. 처음에는 `IMAGE_MAX_PER_CAMP=2`(약 1.3GB 이하 가정, 실측 평균이면 그보다 작음)로 시작해 실제 평균 크기를 본 뒤 올린다. 1GB를 넘겨야 하면 Cloudflare R2 등 객체 저장소로 옮긴다(결정 대기).

## 5. 검증

- `cd pipeline && node --test test/images.test.mjs` — 14개 통과(네트워크·sharp 없이): 사진 공백 우선 조회, 시설당 첫 사진으로의 공간 재균형, 재확인 전 사진 보존/재확인 뒤 정리 회귀를 포함.
- 실변환(2026-10-13, `npm i --no-save sharp@0.35.5`, package.json·lock 변경 없음): 고캠핑 c_no=1066 사진 2장. thumb_1000 경유 1000×666 → 16KB/4KB, 9MB 원본(`IMAGE_MAX_BYTES=12000000`) → 1280×853 171KB / 22KB. EXIF 없음 확인, 두 번째 실행에서 다운로드 0건(증분).
- 기본 8MB 상한에서는 실측 9MB 원본이 건너뛰어진다 → thumb_1000이 없는 사진이 많으면 `IMAGE_MAX_BYTES`를 12MB로 올리는 것을 검토.
