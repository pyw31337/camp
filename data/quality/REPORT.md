# 데이터 품질 보고 — 2026-11-26

자동 생성(pipeline/scripts/quality-ledger.mjs). 기준·절차는 [docs/DATA_QUALITY_PROCESS.md](../../docs/DATA_QUALITY_PROCESS.md).

- 사실 290,345건 · (캠핑장×속성) 227,234쌍 · 캠핑장 7,757곳
- 평균 신뢰도 **0.765** (-0.02) · 확정 비율 **80.8%** (-4.3)
- 독립 원천 2곳↑ 확증 5,210쌍 (+933) · 충돌(검토 대기) **132** (+9) · 검토 판정 누적 69

## ⚠ 어제보다 나빠진 속성 12개

- EXTRA_PERSON_FEE confidence: 0.569 → 0.53
- EXTRA_CAR_FEE confidence: 0.549 → 0.492
- VISITOR_POLICY confidence: 0.563 → 0.515
- PROMOTION confidence: 0.46 → 0.35
- REFUND_POLICY confidence: 0.499 → 0.479
- POWER_MAX_A confidence: 0.717 → 0.625
- SITE_SIZE confidence: 0.828 → 0.802
- SITE_TYPE confidence: 0.724 → 0.629
- CHECKIN_TIME conflicts: 42 → 48
- EARLY_CHECKIN confidence: 0.446 → 0.411
- MIN_STAY confidence: 0.444 → 0.411
- LATE_CHECKOUT confidence: 0.46 → 0.423

## 신뢰도가 낮은 속성(커버리지 50곳↑) — 다음 수집 우선순위

| 속성 | 커버리지 | 평균 신뢰도 | 확정 % | 충돌 |
|---|---:|---:|---:|---:|
| 후기에 나온 요금 (PRICE_MENTION) | 4113 | 0.368 | 0 | 0 |
| 매너타임 (MANNER_TIME) | 2971 | 0.388 | 4.3 | 0 |
| 할인 대상 (DISCOUNT) | 105 | 0.398 | 8.6 | 0 |
| 얼리 입실 (EARLY_CHECKIN) | 308 | 0.411 | 13 | 0 |
| 연박·최소 숙박 (MIN_STAY) | 159 | 0.411 | 14.5 | 0 |
| 레이트 퇴실 (LATE_CHECKOUT) | 201 | 0.423 | 14.9 | 0 |
| 취소·환불 규정 (REFUND_POLICY) | 922 | 0.479 | 42 | 0 |
| 차량 추가 요금 (EXTRA_CAR_FEE) | 171 | 0.492 | 27.5 | 0 |
| 방문객 규칙·요금 (VISITOR_POLICY) | 87 | 0.515 | 33.3 | 0 |
| 퇴실 시각 (CHECKOUT_TIME) | 3782 | 0.527 | 18 | 19 |

## 검토 대기열 상위 10건 (전체 data/quality/review-queue.json)

- 여주참숯마을 캠핑장 · 입실 시각: "10:00"(0.99, 2곳) vs "14:00"(0.96, 2곳)
- 비토섬오토캠핑장 · 입실 시각: "14:00"(0.95, 2곳) vs "15:00"(0.945, 2곳)
- 군위전투전승기념공원 캠핑장 · 입실 시각: "13:00"(0.955, 2곳) vs "14:00"(0.94, 2곳)
- 벨하우스 · 입실 시각: "15:00"(0.99, 2곳) vs "13:00"(0.94, 2곳)
- 벨하우스 · 퇴실 시각: "11:00"(0.994, 3곳) vs "12:00"(0.94, 2곳)
- 캠프더쉼 · 입실 시각: "14:00"(0.955, 2곳) vs "15:00"(0.94, 2곳)
- 용두산오토캠핑장 · 반려견 동반: "SMALL_ONLY"(0.985, 2곳) vs "NOT_ALLOWED"(0.935, 2곳)
- 양지뜰캠핑장 · 반려견 동반: "SMALL_ONLY"(0.985, 2곳) vs "NOT_ALLOWED"(0.935, 2곳)
- 횡성동당미계곡캠핑장 · 퇴실 시각: "11:00"(0.935, 2곳) vs "12:00"(0.935, 2곳)
- 비토섬오토캠핑장 · 퇴실 시각: "11:00"(0.945, 2곳) vs "13:00"(0.935, 2곳)
