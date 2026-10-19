# 지자체 요금·시설 사실 전달 (여주·구미·화성)

## 현재 상태 (2026-10-19)
- `pipeline/registry/local-fee-facts.json` : 여주·구미·화성 공개 데이터 기반 56개 사실
- 라이브 사이트 `data/facts/` 에는 아직 미반영
- 핵심 파일(`fact-store.mjs`, `build-fact-store.mjs`) 일시 손상 이력 있음 → 원본 복구 필요

## 원본 복구 (필수)
```bash
cd ~/Developer/camp
git checkout 96c91e42b179350c32280ab4fd44c64f9a6b9a17 -- pipeline/lib/fact-store.mjs pipeline/scripts/build-fact-store.mjs
git commit -m "restore fact-store files"
```

## 다른 에이전트가 할 일
1. 위 복구 후 `pipeline/registry/local-fee-facts.json` 읽기
2. 캠핑장 이름/주소로 기존 `campgrounds.json` 과 매칭
3. `PRICE_NIGHT` 등을 Fact Store 형식(`cid`, `attr`, `value`, `grade: CONFIRMED`, `src: local_gov`)으로 변환
4. `build-fact-store.mjs` 실행 또는 `data/facts/` 에 적재 후 커밋
5. 다음 `data-sync` 워크플로우가 라이브 사이트에 반영

## 보조 스크립트
```bash
cd pipeline
node scripts/inject-local-fees.mjs
```
→ `registry/local-fee-facts-matched.json` 생성 (숫자 요금 추출된 형태)
