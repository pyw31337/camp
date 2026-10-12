# 서비스 소유자가 할 일 (순서대로)

> 작성일: 2026-10-12 KST · 담당: 박영우<br>
> 원칙: **무료로 운영**, 로그인은 나중에 결정. 키·토큰 값은 채팅이나 저장소에 붙이지 말고 **GitHub Secret에만** 넣는다. 각 단계를 마치면 “N단계 완료”라고만 알려 주면 이어서 작업한다.

| # | 할 일 | 어디서 | 넣을 곳 | 소요 | 비용 | 막히는 것 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 시안 v2 검토·피드백 | Artifact 링크 | 채팅으로 의견 | 15분 | 무료 | 앱 이식 |
| 2 | 공공데이터포털 인증키 발급·활용신청 | data.go.kr | Secret `DATA_GO_KR_SERVICE_KEY` | 20분 + 승인 대기 | 무료 | 실제 캠핑장 데이터 |
| 3 | Cloudflare 계정·API 토큰 | dash.cloudflare.com | Secret `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | 15분 | 무료 | 외부 공개 주소 |
| 4 | PR 병합 | GitHub | – | 5분 | 무료 | 자동 배포 시작 |
| 5 | 카카오 개발자 앱(지도·길찾기) | developers.kakao.com | Secret `KAKAO_REST_API_KEY`, Variable `KAKAO_JS_KEY` | 15분 | 무료 한도 | 지도·이동시간·통행료 |
| 6 | 서울 열린데이터광장 인증키 | data.seoul.go.kr | Secret `SEOUL_OPEN_API_KEY` | 10분 | 무료 | 서울 공영 캠핑장 접수 기간 |
| 7 | 저장소 공개 여부 결정 | GitHub Settings | – | 1분 | 무료 | Actions 사용량 여유 |
| 8 | (선택) 도메인 | 도메인 등록업체 | Cloudflare에 연결 | 20분 | 연 1~2만 원 | 없음(`*.pages.dev`로 충분) |

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

## 3. Cloudflare (무료 호스팅·서버 함수)
1. https://dash.cloudflare.com 가입(무료 플랜).
2. 우측 상단 프로필 → My Profile → API Tokens → Create Token → **Custom token**:
   - 권한: Account → Cloudflare Pages → Edit (나중에 Workers를 쓰면 Workers Scripts → Edit 추가)
   - Account Resources: 내 계정
3. 생성된 토큰을 Secret `CLOUDFLARE_API_TOKEN`으로 저장.
4. 대시보드 오른쪽 사이드바(또는 Workers & Pages 개요)의 **Account ID**를 Secret `CLOUDFLARE_ACCOUNT_ID`로 저장.
5. (선택) 사이트 주소 이름을 바꾸고 싶으면 Settings → Variables → `CF_PAGES_PROJECT`에 원하는 영문 이름(기본 `moyeora` → `https://moyeora.pages.dev`, 이미 쓰는 이름이면 다른 이름을 넣는다).

## 4. PR 병합
- 열려 있는 PR을 검토 후 Merge. main에 반영되면 `Deploy to Cloudflare Pages`가 실행되고, 3단계를 마쳤다면 외부 접속 주소가 생긴다.

## 5. 카카오 개발자 (지도·길찾기)
1. https://developers.kakao.com → 내 애플리케이션 → 애플리케이션 추가(이름: 모여라 캠핑).
2. 앱 설정 → 플랫폼 → Web → 사이트 도메인에 배포 주소(예: `https://moyeora.pages.dev`)와 `http://localhost:5173` 등록.
3. 앱 키에서 **JavaScript 키** → Variable `KAKAO_JS_KEY`(브라우저에 노출되는 키라 Secret이 아니어도 된다. 도메인 제한으로 보호), **REST API 키** → Secret `KAKAO_REST_API_KEY`(길찾기는 서버 함수에서만 호출).
4. 카카오모빌리티 길찾기 API 이용 조건(무료 호출 한도)을 확인해 알려 주면 그에 맞춰 캐시 정책을 정한다.

## 6. 서울 열린데이터광장
- https://data.seoul.go.kr 가입 → 인증키 신청 → Secret `SEOUL_OPEN_API_KEY`.

## 7. 저장소 공개 여부
- 공개(Public)면 GitHub Actions가 무제한 무료, 비공개면 월 2,000분 무료(현재 사용량은 하루 몇 분이라 비공개도 충분).
- API 키는 Secret이라 공개해도 노출되지 않는다. 기획 문서를 공개해도 괜찮은지만 결정하면 된다.

## 하지 않아도 되는 것
- 서버 임대, DB 가입(Supabase 등), 결제 수단 등록: 로그인·저장 동기화를 도입할 때까지 필요 없다.
- 네이버 클라우드 길찾기(유료): 카카오로 먼저 시작한다.
