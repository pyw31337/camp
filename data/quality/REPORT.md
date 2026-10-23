# 데이터 품질 보고 — 2026-10-24

자동 생성(pipeline/scripts/quality-ledger.mjs). 기준·절차는 [docs/DATA_QUALITY_PROCESS.md](../../docs/DATA_QUALITY_PROCESS.md).

- 사실 205,200건 · (캠핑장×속성) 160,592쌍 · 캠핑장 6,409곳
- 평균 신뢰도 **0.784** (-0.011) · 확정 비율 **84.5%** (-3.1)
- 독립 원천 2곳↑ 확증 3,524쌍 (+531) · 충돌(검토 대기) **832** (+746) · 검토 판정 누적 69

## ⚠ 어제보다 나빠진 속성 10개

- EXTRA_PERSON_FEE confidence: 0.668 → 0.615
- VISITOR_POLICY confidence: 0.745 → 0.639
- EXTRA_CAR_FEE confidence: 0.681 → 0.608
- DISCOUNT confidence: 0.458 → 0.431
- CHARCOAL_ALLOWED coverage: 2731 → 2661
- FIREWOOD_ALLOWED coverage: 2731 → 2661
- SEASONAL_CLOSURE confidence: 0.9 → 0.86
- EARLY_CHECKIN confidence: 0.539 → 0.482
- LATE_CHECKOUT confidence: 0.563 → 0.501
- MIN_STAY confidence: 0.562 → 0.509

## 신뢰도가 낮은 속성(커버리지 50곳↑) — 다음 수집 우선순위

| 속성 | 커버리지 | 평균 신뢰도 | 확정 % | 충돌 |
|---|---:|---:|---:|---:|
| 후기에 나온 요금 (PRICE_MENTION) | 2364 | 0.367 | 0 | 0 |
| 매너타임 (MANNER_TIME) | 1749 | 0.372 | 6.9 | 0 |
| 할인 대상 (DISCOUNT) | 56 | 0.431 | 14.3 | 0 |
| 얼리 입실 (EARLY_CHECKIN) | 148 | 0.482 | 24.3 | 0 |
| 취소·환불 규정 (REFUND_POLICY) | 828 | 0.498 | 45.8 | 0 |
| 레이트 퇴실 (LATE_CHECKOUT) | 96 | 0.501 | 28.1 | 0 |
| 연박·최소 숙박 (MIN_STAY) | 78 | 0.509 | 29.5 | 0 |
| 퇴실 시각 (CHECKOUT_TIME) | 2269 | 0.517 | 23.1 | 13 |
| 입실 시각 (CHECKIN_TIME) | 2276 | 0.518 | 22.2 | 33 |
| 차량 추가 요금 (EXTRA_CAR_FEE) | 99 | 0.608 | 46.5 | 0 |

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
