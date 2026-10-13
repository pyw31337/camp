# 서비스 소유자가 할 일 (순서대로)

> 작성일: 2026-10-12 KST · 담당: 박영우<br>
> 원칙: **무료로 운영**, 로그인은 나중에 결정. 키·토큰 값은 채팅이나 저장소에 붙이지 말고 **GitHub Secret에만** 넣는다. 각 단계를 마치면 “N단계 완료”라고만 알려 주면 이어서 작업한다.

| # | 할 일 | 어디서 | 넣을 곳 | 소요 | 비용 | 막히는 것 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 시안 v2 검토·피드백 | Artifact 링크 | 채팅으로 의견 | 15분 | 무료 | 앱 이식 |
| 2 | ✅ 공공데이터포털 인증키 (2026-10-13 확인: 고캠핑·기상청·TourAPI 정상) | data.go.kr | Secret `DATA_GO_KR_SERVICE_KEY` | 완료 | 무료 | – |
| 2-1 | 추가 활용신청: **자동차야영장업 조회서비스**(경로 확인됨, 미신청, 선택) · 화장실은 LOCALDATA 파일로 해결돼 표준데이터 신청 불필요 · 완료 확인: 공공시설개방정보, 일반야영장업, **전국졸음쉼터표준데이터(2026-10-13 253곳 수신)** | data.go.kr | 같은 키 | 5분 | 무료 | 숨은 캠핑장 |
| 2-2 | ✅ 한국도로공사 OpenAPI 인증키 (2026-10-13 CI 확인: 휴게소 203곳) | data.ex.co.kr | Secret `EX_API_KEY` | 완료 | 무료 | – |
| 3 | ~~Cloudflare 계정·API 토큰~~ → **더 이상 쓰지 않음**(2026-10-13 주소를 https://pyw31337.github.io/camp/ 하나로 통일). Secret `CLOUDFLARE_*`는 지워도 되고 남겨도 무해 | – | – | – | – | – |
| 4 | PR 병합 | GitHub | – | 5분 | 무료 | **병합해야 https://pyw31337.github.io/camp/explore/ 에 전국 캠핑장 지도가 열림** |
| 5-0 | 카카오 JavaScript SDK 도메인에 `https://pyw31337.github.io` 추가 | developers.kakao.com | 5-3 참고 | 2분 | 무료 | 지도 표시 |
| 5 | ✅ 카카오 개발자 앱 (2026-10-13 CI 확인: REST 주소→좌표 정상, 화장실 28,798곳 변환. JS 키는 Secret으로 등록돼 그대로 사용) | developers.kakao.com | Secret `KAKAO_REST_API_KEY`, `KAKAO_JS_KEY` | 완료 | 무료 한도 | – |
| 6 | 서울 열린데이터광장 인증키 | data.seoul.go.kr | Secret `SEOUL_OPEN_API_KEY` | 10분 | 무료 | 서울 공영 캠핑장 접수 기간 |
| 7 | 저장소 공개 여부 결정 | GitHub Settings | – | 1분 | 무료 | Actions 사용량 여유 |
| 8 | (선택) 도메인 | 도메인 등록업체 | GitHub Pages 사용자 도메인 | 20분 | 연 1~2만 원 | 없음(`pyw31337.github.io/camp`로 충분) |

## 1. 시안 v2 검토
- 링크: https://claude.ai/artifact/57VZAanbcJ8KTBTb4PrtBq (비공개 링크. 다른 사람에게 보여 주려면 페이지의 Share 메뉴에서 공유)
- 봐 줄 것: 첫 화면에서 ‘캠핑장 찾기 / 예약 오픈 일정’ 두 탭이 바로 이해되는지, 초록색 톤, 카드 정보량, 모바일(폰으로 직접 열기)에서 불편한 곳.

## 2. 공공데이터포털 인증키 (가장 먼저)
1. https://www.data.go.kr 회원가입 → 로그인.
2. 아래 데이터마다 ‘활용신청’ 클릭(목적: 웹 서비스 개발, 상업적 이용 여부는 사실대로). 대부분 자동승인이고, 일부는 1~2일 걸린다.
   - 한국관광공사_고캠핑 정보 조회서비스 (15101933) — 필수
   - 행정안전부_문화_일반야영장업 조회서비스 (15155149) — 숨은 캠핑장 발견
   - 기상청_단기예보 조회서비스 — 주말 날씨
   - 한국관광공사_국문 관광정보 서비스(TourAPI) — 주변 관광지·맛집
   - (나중) 한국천문연구원 출몰시각 정보, 에어코리아 대기오염정보
3. 마이페이지 → 인증키 발급현황에서 **일반 인증키(Encoding)** 를 복사한다. 키 하나로 위 서비스 모두 호출된다.
4. GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret → 이름 `DATA_GO_KR_SERVICE_KEY`, 값 붙여넣기.
5. Actions 탭 → `Data sync` → Run workflow로 한 번 실행해 성공하는지 확인(실패하면 로그 링크만 알려 주면 된다).

## 2-1. 추가 활용신청
- (불필요해짐) ‘전국공중화장실표준데이터’: 2026-10-13 LOCALDATA 화장실 전용 다운로드로 53,584곳을 받아 신청하지 않아도 된다.
- ‘행정안전부_문화_자동차야영장업 조회서비스’ → 활용신청(숨은 오토캠핑장 후보).
- (완료) ‘전국공공시설개방정보표준데이터’(15013117), ‘전국졸음쉼터표준데이터’.
- 같은 인증키로 호출되므로 Secret은 그대로 두면 된다.

## 2-2. 한국도로공사 고속도로 공공데이터 포털 (data.go.kr과 별도 사이트)
> 2026-10-13 확인: `한국도로공사_주유소별 가격,업체 현황`(apiId 0312)은 data.go.kr이 아니라 **data.ex.co.kr**의 API다. 같은 포털의 휴게소 위치·편의시설 API와 함께 이미 파이프라인에 연결했다(예제 키로 휴게소 203곳, 주유 가격 168곳 수신). 예제 키는 시험용이라 운영 전에 본인 키로 바꾼다.
1. https://data.ex.co.kr 오른쪽 위 **회원가입** → 로그인.
2. 상단 **OpenAPI 활용** → **OpenAPI 목록** → 아무 API(예: 주유소별 가격) 상세 화면에서 **인증키 신청**(또는 마이페이지 → 인증키 발급). 활용 목적: 웹 서비스 개발.
3. 마이페이지 → **인증키 관리**에서 키를 복사한다. 키 하나로 이 포털의 모든 OpenAPI가 호출된다.
4. GitHub → Settings → Secrets and variables → Actions → **New repository secret** → Name `EX_API_KEY`, Secret에 붙여넣기 → Add secret.

## 3. Cloudflare — 폐기(2026-10-13)

서비스 주소를 GitHub Pages(https://pyw31337.github.io/camp/) 하나로 통일했다. 아래 안내는 기록용이며 더 할 일은 없다.

### (기록) Cloudflare 무료 호스팅 — 2026-10 새 대시보드 기준

### 3-1. API 토큰 만들기
1. 주소창에 `https://dash.cloudflare.com/profile/api-tokens` 입력(또는 오른쪽 위 사람 아이콘 → Profile → API Tokens).
2. **Create Token** → 화면 맨 아래 **Create Custom Token** 옆 **Get started**.
3. **Create Custom Token** 화면의 칸을 아래처럼 채운다.

| 칸 | 입력값 |
| --- | --- |
| Token name | `moyeora-github-deploy` (이름은 자유) |
| Permissions | 첫 칸 `Account` 그대로 → 두 번째 칸 `Cloudflare Pages` → 세 번째 칸 `Edit` |
| Account Resources | `Include` 그대로 → `All accounts` 대신 `Pyw213@naver.com's Account` 선택 |
| Client IP Address Filtering | **비워 둔다** (GitHub 서버 IP가 바뀌어 지정하면 배포가 실패) |
| TTL | **비워 둔다** (만료 없음) |

4. **Continue to summary** → **Create Token**. 토큰 문자열은 **이 화면에서 한 번만** 보이므로 바로 복사한다.
5. 오른쪽에 뜨는 ‘Enable Agent Lee access’ 패널은 Cloudflare 자체 AI 기능이라 이번 작업과 무관(닫으면 됨).

### 3-2. Account ID 찾기
- Cloudflare 대시보드 첫 화면 왼쪽 위 계정 이름 아래, 또는 Workers & Pages 화면 오른쪽의 32자리 값(`219da05e…`로 시작).

### 3-3. GitHub Secret 두 개 등록
1. https://github.com/pyw31337/camp/settings/secrets/actions 접속(저장소 → Settings → Secrets and variables → Actions).
2. **New repository secret** → Name `CLOUDFLARE_API_TOKEN`, Secret에 3-1에서 복사한 토큰 → Add secret.
3. 다시 **New repository secret** → Name `CLOUDFLARE_ACCOUNT_ID`, Secret에 3-2의 Account ID → Add secret.
4. (선택) 사이트 주소를 바꾸려면 같은 화면의 **Variables** 탭 → `CF_PAGES_PROJECT`에 영문 이름(기본 `moyeora` → `https://moyeora.pages.dev`, 이미 쓰는 이름이면 다른 이름).
5. 끝나면 “3단계 완료”라고 알려 준다 → 배포 워크플로를 실행해 외부 주소를 확인한다.

## 4. PR 병합
- 열려 있는 PR을 검토 후 Merge. 병합 전에는 미리보기 주소(https://preview.moyeora-6pd.pages.dev)만 열리고, 정식 주소 https://moyeora-6pd.pages.dev 는 병합 후 첫 배포부터 열린다(`moyeora.pages.dev`는 다른 사람이 쓰고 있어 Cloudflare가 `-6pd`를 붙였다). main에 반영되면 `Deploy to Cloudflare Pages`가 실행되고, 3단계를 마쳤다면 외부 접속 주소가 생긴다.

## 5. 카카오 개발자 (지도·주소→좌표·길찾기)

> 클라우드 작업 환경에서는 브라우저로 로그인할 수 없어 직접 진행해야 한다. 키 두 개를 만들어 GitHub에 넣으면 끝난다.
> 쓰는 곳: **REST API 키** → 화장실 주소 52,255곳을 좌표로 변환(GitHub Actions), 이후 길찾기·통행료. **JavaScript 키** → 웹 화면의 카카오 지도.

### 5-1. 앱 만들기
1. https://developers.kakao.com 접속 → 오른쪽 위 **로그인**(평소 카카오 계정).
2. 처음이면 개발자 약관 동의 → 개발자 등록(이름·이메일만 있으면 된다. 사업자 등록 필요 없음).
3. 상단 **내 애플리케이션** → **애플리케이션 추가하기**.

| 칸 | 입력값 |
| --- | --- |
| 앱 아이콘 | 비워 둬도 됨 |
| 앱 이름 | `모여라 캠핑` |
| 회사명(사업자명) | 본인 이름(예: `박영우`) |
| 카테고리 | `여행` (없으면 `라이프스타일`) |
| 운영정책 동의 | 체크 |

4. **저장** → 목록에서 방금 만든 앱을 누른다.

### 5-2. 카카오맵 사용 켜기 (안 켜면 지도·주소 검색이 403)
1. 왼쪽 메뉴 **제품 설정** → **카카오맵** (새 화면에서는 **앱 → 제품 설정 → 카카오맵**).
2. **사용 설정**을 `ON`으로 바꾸고 저장. 이 스위치 하나로 지도(JavaScript)와 주소→좌표(로컬 REST API)가 함께 열린다.

### 5-3. 웹 도메인 등록 (JavaScript 키가 이 주소에서만 동작)
1. 왼쪽 메뉴 **앱 설정 → 플랫폼** → **Web 플랫폼 등록** (새 화면에서는 **앱 → 플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인**).
2. 아래 세 줄을 한 줄씩 등록한다.

| 사이트 도메인 |
| --- |
| `https://pyw31337.github.io` (**필수**, 실제 서비스 주소. 경로 `/camp`는 넣지 않음) |
| `https://moyeora-6pd.pages.dev` (폐기, 지워도 됨) |
| `https://preview.moyeora-6pd.pages.dev` (폐기, 지워도 됨) |
| `http://localhost:5173` |

### 5-4. 키 복사
1. 왼쪽 메뉴 **앱 설정 → 앱 키** (새 화면: **앱 → 플랫폼 키**).
2. **REST API 키**와 **JavaScript 키** 두 개를 복사한다. **Admin 키는 쓰지 않는다**(절대 어디에도 넣지 않음).
3. REST API 키 설정에 **허용 IP 주소**가 보이면 **비워 둔다**(GitHub 서버 IP가 매번 달라 지정하면 실패).

### 5-5. GitHub에 넣기
1. https://github.com/pyw31337/camp/settings/secrets/actions 접속.
2. **Secrets** 탭 → **New repository secret** → Name `KAKAO_REST_API_KEY`, Secret에 REST API 키 → Add secret.
3. 같은 화면 **Variables** 탭 → **New repository variable** → Name `KAKAO_JS_KEY`, Value에 JavaScript 키 → Add variable.
   (JavaScript 키는 원래 브라우저에 노출되는 키라 Variable로 둔다. 5-3의 도메인 제한이 보호 장치다.)
4. “5단계 완료”라고 알려 주면 데이터 동기화를 다시 돌려 화장실 좌표 변환 결과(몇 곳 성공했는지)를 확인한다.

### 5-6. 사용량·비용
- 무료 한도 안에서만 쓴다. 화장실 좌표 변환은 첫 실행에 최대 3만 건, 이후엔 바뀐 주소만 호출하고 결과를 캐시한다. 한도에 걸리면 파이프라인이 멈추지 않고 다음 날 이어서 한다.
- 길찾기(카카오모빌리티)는 같은 REST API 키로 호출하지만 이용 조건·무료 한도가 별도로 있다. 콘솔 **제품 설정**에 ‘카카오내비/모빌리티’ 항목이 보이면 한도를 알려 주면 그에 맞춰 캐시 정책을 정한다.
- 결제 수단 등록은 하지 않는다(무료 한도를 넘는 유료 전환을 막는 가장 확실한 방법).

## 6. 서울 열린데이터광장
- https://data.seoul.go.kr 가입 → 인증키 신청 → Secret `SEOUL_OPEN_API_KEY`.

## 7. 저장소 공개 여부
- 공개(Public)면 GitHub Actions가 무제한 무료, 비공개면 월 2,000분 무료(현재 사용량은 하루 몇 분이라 비공개도 충분).
- API 키는 Secret이라 공개해도 노출되지 않는다. 기획 문서를 공개해도 괜찮은지만 결정하면 된다.

## 하지 않아도 되는 것
- 서버 임대, DB 가입(Supabase 등), 결제 수단 등록: 로그인·저장 동기화를 도입할 때까지 필요 없다.
- 네이버 클라우드 길찾기(유료): 카카오로 먼저 시작한다.
