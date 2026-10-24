# 데이터 품질 보고 — 2026-10-24

자동 생성(pipeline/scripts/quality-ledger.mjs). 기준·절차는 [docs/DATA_QUALITY_PROCESS.md](../../docs/DATA_QUALITY_PROCESS.md).

- 사실 207,634건 · (캠핑장×속성) 162,152쌍 · 캠핑장 6,412곳
- 평균 신뢰도 **0.781** (-0.014) · 확정 비율 **83.8%** (-3.8)
- 독립 원천 2곳↑ 확증 3,599쌍 (+606) · 충돌(검토 대기) **837** (+751) · 검토 판정 누적 69

## ⚠ 어제보다 나빠진 속성 11개

- EXTRA_PERSON_FEE confidence: 0.668 → 0.6
- VISITOR_POLICY confidence: 0.745 → 0.612
- EXTRA_CAR_FEE confidence: 0.681 → 0.599
- DISCOUNT confidence: 0.458 → 0.431
- CHARCOAL_ALLOWED coverage: 2731 → 2663
- FIREWOOD_ALLOWED coverage: 2731 → 2663
- SEASONAL_CLOSURE confidence: 0.9 → 0.86
- CHECKIN_TIME conflicts: 30 → 36
- EARLY_CHECKIN confidence: 0.539 → 0.476
- LATE_CHECKOUT confidence: 0.563 → 0.489
- MIN_STAY confidence: 0.562 → 0.49

## 신뢰도가 낮은 속성(커버리지 50곳↑) — 다음 수집 우선순위

| 속성 | 커버리지 | 평균 신뢰도 | 확정 % | 충돌 |
|---|---:|---:|---:|---:|
| 후기에 나온 요금 (PRICE_MENTION) | 2416 | 0.367 | 0 | 0 |
| 매너타임 (MANNER_TIME) | 1811 | 0.375 | 6.6 | 0 |
| 할인 대상 (DISCOUNT) | 56 | 0.431 | 14.3 | 0 |
| 얼리 입실 (EARLY_CHECKIN) | 154 | 0.476 | 23.4 | 0 |
| 레이트 퇴실 (LATE_CHECKOUT) | 104 | 0.489 | 26 | 0 |
| 연박·최소 숙박 (MIN_STAY) | 86 | 0.49 | 26.7 | 0 |
| 취소·환불 규정 (REFUND_POLICY) | 831 | 0.498 | 45.6 | 0 |
| 퇴실 시각 (CHECKOUT_TIME) | 2327 | 0.519 | 22.6 | 13 |
| 입실 시각 (CHECKIN_TIME) | 2330 | 0.52 | 21.6 | 36 |
| 차량 추가 요금 (EXTRA_CAR_FEE) | 102 | 0.599 | 45.1 | 0 |

## 검토 대기열 상위 10건 (전체 data/quality/review-queue.json)

- 여주참숯마을 캠핑장 · 입실 시각: "10:00"(0.99, 2곳) vs "14:00"(0.94, 2곳)
- 벨하우스 · 입실 시각: "15:00"(0.99, 2곳) vs "13:00"(0.94, 2곳)
- 캠프더쉼 · 입실 시각: "14:00"(0.96, 2곳) vs "15:00"(0.94, 2곳)
- 80 SS 오토캠핑장 · 반려견 동반: "NOT_ALLOWED"(0.985, 2곳) vs "ALLOWED"(0.935, 2곳)
- 용두산오토캠핑장 · 반려견 동반: "SMALL_ONLY"(0.985, 2곳) vs "NOT_ALLOWED"(0.935, 2곳)
- 양지뜰캠핑장 · 반려견 동반: "SMALL_ONLY"(0.985, 2곳) vs "NOT_ALLOWED"(0.935, 2곳)
- 횡성동당미계곡캠핑장 · 퇴실 시각: "11:00"(0.935, 2곳) vs "12:00"(0.935, 2곳)
- 군위전투전승기념공원 캠핑장 · 입실 시각: "13:00"(0.95, 2곳) vs "14:00"(0.935, 2곳)
- 군위전투전승기념공원 캠핑장 · 퇴실 시각: "12:00"(0.945, 2곳) vs "11:00"(0.935, 2곳)
- 벨하우스 · 퇴실 시각: "11:00"(0.994, 3곳) vs "12:00"(0.935, 2곳)
