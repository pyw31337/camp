# 데이터 품질 보고 — 2026-10-23

자동 생성(pipeline/scripts/quality-ledger.mjs). 기준·절차는 [docs/DATA_QUALITY_PROCESS.md](../../docs/DATA_QUALITY_PROCESS.md).

- 사실 170,724건 · (캠핑장×속성) 135,793쌍 · 캠핑장 6,404곳
- 평균 신뢰도 **0.797** (-0.009) · 확정 비율 **87.9%** (-1.2)
- 독립 원천 2곳↑ 확증 2,881쌍 (-5) · 충돌(검토 대기) **84** (-211) · 검토 판정 누적 69

## ⚠ 어제보다 나빠진 속성 4개

- REFUND_POLICY confidence: 0.893 → 0.498
- CHECKIN_TIME confidence: 0.67 → 0.52
- CHECKOUT_TIME confidence: 0.674 → 0.522
- MANNER_TIME confidence: 0.615 → 0.353

## 신뢰도가 낮은 속성(커버리지 50곳↑) — 다음 수집 우선순위

| 속성 | 커버리지 | 평균 신뢰도 | 확정 % | 충돌 |
|---|---:|---:|---:|---:|
| 매너타임 (MANNER_TIME) | 1182 | 0.353 | 10.1 | 0 |
| 후기에 나온 요금 (PRICE_MENTION) | 2086 | 0.367 | 0 | 0 |
| 취소·환불 규정 (REFUND_POLICY) | 820 | 0.498 | 46.1 | 0 |
| 입실 시각 (CHECKIN_TIME) | 1788 | 0.52 | 28.4 | 30 |
| 퇴실 시각 (CHECKOUT_TIME) | 1763 | 0.522 | 29.8 | 13 |
| 얼리 입실 (EARLY_CHECKIN) | 94 | 0.561 | 38.3 | 0 |
| 레이트 퇴실 (LATE_CHECKOUT) | 66 | 0.57 | 40.9 | 0 |
| 연박·최소 숙박 (MIN_STAY) | 54 | 0.577 | 42.6 | 0 |
| 인원 추가 요금 (EXTRA_PERSON_FEE) | 267 | 0.682 | 60.3 | 0 |
| 차량 추가 요금 (EXTRA_CAR_FEE) | 75 | 0.69 | 61.3 | 0 |

## 검토 대기열 상위 10건 (전체 data/quality/review-queue.json)

- 여주참숯마을 캠핑장 · 입실 시각: "10:00"(0.99, 2곳) vs "14:00"(0.94, 2곳)
- 80 SS 오토캠핑장 · 반려견 동반: "NOT_ALLOWED"(0.985, 2곳) vs "ALLOWED"(0.935, 2곳)
- 용두산오토캠핑장 · 반려견 동반: "SMALL_ONLY"(0.985, 2곳) vs "NOT_ALLOWED"(0.935, 2곳)
- 양지뜰캠핑장 · 반려견 동반: "SMALL_ONLY"(0.985, 2곳) vs "NOT_ALLOWED"(0.935, 2곳)
- 수피야글램핑 · 반려견 동반: "NOT_ALLOWED"(0.985, 2곳) vs "ZONE_ONLY"(0.9, 1곳)
- 일루 글램핑 스파 · 반려견 동반: "NOT_ALLOWED"(0.985, 2곳) vs "ZONE_ONLY"(0.9, 1곳)
- 옥당걸숲속관광농원 · 반려견 동반: "ALLOWED"(0.9, 1곳) vs "NOT_ALLOWED"(0.9, 1곳)
- 제천 클라우드글램핑 · 반려견 동반: "ALLOWED"(0.903, 2곳) vs "NOT_ALLOWED"(0.9, 1곳)
- 덕두글램핑 · 반려견 동반: "NOT_ALLOWED"(0.985, 2곳) vs "SMALL_ONLY"(0.9, 1곳)
- 즐거운녀석들 · 반려견 동반: "ALLOWED"(0.985, 2곳) vs "NOT_ALLOWED"(0.9, 1곳)
