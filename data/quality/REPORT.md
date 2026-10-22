# 데이터 품질 보고 — 2026-10-23

자동 생성(pipeline/scripts/quality-ledger.mjs). 기준·절차는 [docs/DATA_QUALITY_PROCESS.md](../../docs/DATA_QUALITY_PROCESS.md).

- 사실 202,282건 · (캠핑장×속성) 158,770쌍 · 캠핑장 6,409곳
- 평균 신뢰도 **0.788** (-0.018) · 확정 비율 **85.5%** (-3.6)
- 독립 원천 2곳↑ 확증 3,431쌍 (+545) · 충돌(검토 대기) **830** (+535) · 검토 판정 누적 69

## ⚠ 어제보다 나빠진 속성 13개

- EXTRA_PERSON_FEE confidence: 0.689 → 0.628
- VISITOR_POLICY confidence: 0.791 → 0.676
- EXTRA_CAR_FEE confidence: 0.699 → 0.615
- DISCOUNT confidence: 0.471 → 0.44
- PROMOTION confidence: 0.46 → 0.435
- REFUND_POLICY confidence: 0.893 → 0.498
- SEASONAL_CLOSURE confidence: 0.9 → 0.86
- CHECKIN_TIME confidence: 0.67 → 0.512
- CHECKOUT_TIME confidence: 0.674 → 0.511
- MANNER_TIME confidence: 0.615 → 0.368
- EARLY_CHECKIN confidence: 0.574 → 0.496
- LATE_CHECKOUT confidence: 0.579 → 0.507
- MIN_STAY confidence: 0.591 → 0.519

## 신뢰도가 낮은 속성(커버리지 50곳↑) — 다음 수집 우선순위

| 속성 | 커버리지 | 평균 신뢰도 | 확정 % | 충돌 |
|---|---:|---:|---:|---:|
| 후기에 나온 요금 (PRICE_MENTION) | 2282 | 0.367 | 0 | 0 |
| 매너타임 (MANNER_TIME) | 1686 | 0.368 | 7.1 | 0 |
| 할인 대상 (DISCOUNT) | 52 | 0.44 | 15.4 | 0 |
| 얼리 입실 (EARLY_CHECKIN) | 135 | 0.496 | 26.7 | 0 |
| 취소·환불 규정 (REFUND_POLICY) | 827 | 0.498 | 45.8 | 0 |
| 레이트 퇴실 (LATE_CHECKOUT) | 92 | 0.507 | 29.3 | 0 |
| 퇴실 시각 (CHECKOUT_TIME) | 2221 | 0.511 | 23.6 | 13 |
| 입실 시각 (CHECKIN_TIME) | 2231 | 0.512 | 22.7 | 31 |
| 연박·최소 숙박 (MIN_STAY) | 73 | 0.519 | 31.5 | 0 |
| 차량 추가 요금 (EXTRA_CAR_FEE) | 96 | 0.615 | 47.9 | 0 |

## 검토 대기열 상위 10건 (전체 data/quality/review-queue.json)

- 여주참숯마을 캠핑장 · 입실 시각: "10:00"(0.99, 2곳) vs "14:00"(0.94, 2곳)
- 벨하우스 · 입실 시각: "15:00"(0.99, 2곳) vs "13:00"(0.94, 2곳)
- 캠프더쉼 · 입실 시각: "14:00"(0.94, 2곳) vs "15:00"(0.94, 2곳)
- 80 SS 오토캠핑장 · 반려견 동반: "NOT_ALLOWED"(0.985, 2곳) vs "ALLOWED"(0.935, 2곳)
- 용두산오토캠핑장 · 반려견 동반: "SMALL_ONLY"(0.985, 2곳) vs "NOT_ALLOWED"(0.935, 2곳)
- 양지뜰캠핑장 · 반려견 동반: "SMALL_ONLY"(0.985, 2곳) vs "NOT_ALLOWED"(0.935, 2곳)
- 군위전투전승기념공원 캠핑장 · 입실 시각: "13:00"(0.95, 2곳) vs "14:00"(0.935, 2곳)
- 군위전투전승기념공원 캠핑장 · 퇴실 시각: "12:00"(0.945, 2곳) vs "11:00"(0.935, 2곳)
- 벨하우스 · 퇴실 시각: "11:00"(0.994, 3곳) vs "12:00"(0.935, 2곳)
- 더힐글램핑 · 입실 시각: "15:00"(0.99, 2곳) vs "21:00"(0.935, 2곳)
