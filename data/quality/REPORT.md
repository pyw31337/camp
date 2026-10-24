# 데이터 품질 보고 — 2026-10-24

자동 생성(pipeline/scripts/quality-ledger.mjs). 기준·절차는 [docs/DATA_QUALITY_PROCESS.md](../../docs/DATA_QUALITY_PROCESS.md).

- 사실 210,443건 · (캠핑장×속성) 164,210쌍 · 캠핑장 6,409곳
- 평균 신뢰도 **0.778** (-0.017) · 확정 비율 **83.4%** (-4.2)
- 독립 원천 2곳↑ 확증 3,667쌍 (+674) · 충돌(검토 대기) **838** (+752) · 검토 판정 누적 69

## ⚠ 어제보다 나빠진 속성 10개

- EXTRA_PERSON_FEE confidence: 0.668 → 0.594
- VISITOR_POLICY confidence: 0.745 → 0.612
- EXTRA_CAR_FEE confidence: 0.681 → 0.599
- DISCOUNT confidence: 0.458 → 0.421
- SEASONAL_CLOSURE confidence: 0.9 → 0.86
- SITE_TYPE confidence: 0.807 → 0.747
- CHECKIN_TIME conflicts: 30 → 37
- EARLY_CHECKIN confidence: 0.539 → 0.472
- LATE_CHECKOUT confidence: 0.563 → 0.477
- MIN_STAY confidence: 0.562 → 0.487

## 신뢰도가 낮은 속성(커버리지 50곳↑) — 다음 수집 우선순위

| 속성 | 커버리지 | 평균 신뢰도 | 확정 % | 충돌 |
|---|---:|---:|---:|---:|
| 후기에 나온 요금 (PRICE_MENTION) | 2527 | 0.367 | 0 | 0 |
| 매너타임 (MANNER_TIME) | 1918 | 0.376 | 6.3 | 0 |
| 할인 대상 (DISCOUNT) | 64 | 0.421 | 12.5 | 0 |
| 얼리 입실 (EARLY_CHECKIN) | 159 | 0.472 | 22.6 | 0 |
| 레이트 퇴실 (LATE_CHECKOUT) | 114 | 0.477 | 23.7 | 0 |
| 연박·최소 숙박 (MIN_STAY) | 88 | 0.487 | 26.1 | 0 |
| 취소·환불 규정 (REFUND_POLICY) | 833 | 0.497 | 45.5 | 0 |
| 입실 시각 (CHECKIN_TIME) | 2498 | 0.514 | 20.1 | 37 |
| 퇴실 시각 (CHECKOUT_TIME) | 2501 | 0.515 | 21 | 14 |
| 인원 추가 요금 (EXTRA_PERSON_FEE) | 366 | 0.594 | 44 | 0 |

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
