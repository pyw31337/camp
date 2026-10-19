# 지자체 요금·시설 사실 전달 (여주·구미·화성)

## 현재 상태 (2026-10-19, 보완 후)
- `pipeline/registry/local-fee-facts.json` : 원천 URL·확인 시각(`at`)이 포함된 사실
- Fact Store 원칙을 충족 (`CONFIRMED` + `url` + `at`)
- 라이브 사이트 `data/facts/` 에는 아직 미반영 (캠핑장 ID 매칭 후 적재 필요)

## 원본 복구 (여전히 필요)
```bash
cd ~/Developer/camp
git checkout 96c91e42b179350c32280ab4fd44c64f9a6b9a17 -- pipeline/lib/fact-store.mjs pipeline/scripts/build-fact-store.mjs
git commit -m "restore fact-store files"
```

## 다른 에이전트가 할 일
1. 위 복구 후 `pipeline/registry/local-fee-facts.json` 읽기
2. `camp_hint` (이름) 또는 주소로 기존 `campgrounds.json` 과 매칭하여 `cid` 확보
3. 아래 형식으로 Fact Store 사실 생성
   ```json
   {"cid":"...", "attr":"PRICE_NIGHT", "value":25000, "grade":"CONFIRMED", "src":"local_gov", "url":"https://...", "at":"2026-10-19T04:50:00Z", "text":"원문 요약"}
   ```
4. `build-fact-store.mjs` 실행 또는 `data/facts/` 에 적재 후 커밋
5. 다음 `data-sync` 워크플로우가 라이브 사이트에 반영

## 원천 URL 예시
- 여주: https://www.data.go.kr/data/15100692/fileData.do
- 구미캠핑장: https://www.gumi.go.kr/reservation/www/campingFcltWebView.do?fcltNo=8
- 옥성자연휴양림: https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030066
- 향남 오토캠핑장: https://www.hsuco.or.kr/
- 매송: https://www.data.go.kr/data/15136415/fileData.do

## 보조 스크립트
```bash
cd pipeline
node scripts/inject-local-fees.mjs
```
