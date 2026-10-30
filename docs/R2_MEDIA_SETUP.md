# 공식 사진 저장소를 Cloudflare R2로 (2026-10-30 소유자 결정 ⓒ)

## 왜

GitHub Pages는 사이트 전체가 1GB를 넘을 수 없다. 그래서 공식 사진 저장이 900MB에서 멈췄다.
- 2026-10-24부터 “1,500건 건너뜀”이 나왔고, 사진 없는 캠핑장이 844곳이다.

R2(무료 10GB, 내려받기 요금 없음)에 사진 파일을 두면 이 상한이 사라진다.

## 소유자가 할 일 (한 번만, 약 10분)

1. **Cloudflare 가입·R2 켜기**: <https://dash.cloudflare.com> → 왼쪽 메뉴 **R2 Object Storage**.
   - 처음 켤 때 결제수단 등록을 요구할 수 있다. 무료 한도(저장 10GB, 쓰기 100만 회·읽기 1,000만 회/월) 안에서는 요금이 나오지 않는다.
2. **버킷 만들기**: *Create bucket*을 누르고 이름은 예: `letscamp-media`, 위치는 *Automatic*.
3. **공개 주소 켜기**: 버킷 → *Settings* → *Public access* → **R2.dev subdomain** *Allow*.
   - 나오는 주소(예: `https://pub-1234abcd.r2.dev`)를 복사한다.
   - 나중에 도메인을 연결하면 그 주소를 쓰면 된다.
4. **API 키 만들기**: R2 첫 화면 → *Manage R2 API Tokens* → *Create API token*.
   - 권한 **Object Read & Write**, 적용 대상은 위 버킷만 선택한다.
   - 만들어지면 **Access Key ID**·**Secret Access Key**를 복사한다(Secret은 이때 한 번만 보인다).
   - **Account ID**는 R2 첫 화면 오른쪽에 있다.
5. **GitHub에 넣기**: 저장소 *Settings* → *Secrets and variables* → *Actions*.
   - **Secrets**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   - **Variables**: `R2_BUCKET`(버킷 이름), `R2_PUBLIC_BASE`(3번의 공개 주소)
6. 다 넣었다고 에이전트에게 알려 준다. 에이전트가 정기 수집(data-sync)을 돌려 첫 업로드(약 1GB, 9천여 장)와 사이트 표시를 확인한다.

## 넣은 뒤 자동으로 바뀌는 것 (`.github/scripts/media-r2.sh`)

- **data-sync**
  - 수집 전에 R2의 사진을 내려받는다(다시 받지 않게).
  - 사진 저장 상한이 900MB에서 20GB가 된다.
  - 새 사진을 R2에 올린다(지우지 않음).
  - **로컬의 모든 사진이 R2에 있는 것을 확인한 뒤에만** media 브랜치에서 사진 파일을 뺀다. 브랜치에는 manifest·카드 색인 같은 목록 파일만 남는다.
- **card-photos**: 카드 사진도 같은 방식이다.
- **deploy-pages**
  - Pages에는 목록 파일만 싣는다.
  - `index.html`의 `<meta name="media-base">`에 R2 주소를 넣는다.
  - R2에서 사진 60장을 표본으로 열어 보고, 10%를 넘게 없으면 배포를 멈춘다(사이트는 직전 버전 유지).
- **화면(app.js)**: 사진 파일(webp)만 R2에서 받는다. 목록 파일은 그대로 Pages에서 받으므로 R2에 CORS 설정이 필요 없다.
- 설정이 없거나 일부만 있으면 지금처럼 media 브랜치 + Pages로 동작한다.

## 되돌리기

저장소 변수 `R2_PUBLIC_BASE`를 지우면 배포가 다시 Pages의 `/media/`를 쓴다. 단, 브랜치에서 사진을 뺀 뒤라면 사진 파일을 R2에서 media 브랜치로 되돌려야 한다.
- `media-r2.sh pull`로 받은 뒤 `.gitignore`를 지우고 커밋한다.
