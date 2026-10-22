# 데이터 품질 보고 — 2026-10-23

자동 생성(pipeline/scripts/quality-ledger.mjs). 기준·절차는 [docs/DATA_QUALITY_PROCESS.md](../../docs/DATA_QUALITY_PROCESS.md).

- 사실 169,379건 · (캠핑장×속성) 134,988쌍 · 캠핑장 6,404곳
- 평균 신뢰도 **0.799** (-0.007) · 확정 비율 **88.3%** (-0.8)
- 독립 원천 2곳↑ 확증 2,823쌍 (-63) · 충돌(검토 대기) **84** (-211) · 검토 판정 누적 69

## ⚠ 어제보다 나빠진 속성 6개

- REFUND_POLICY confidence: 0.893 → 0.55
- CHECKIN_TIME coverage: 1693 → 1627
- CHECKIN_TIME confidence: 0.67 → 0.546
- CHECKOUT_TIME coverage: 1645 → 1604
- CHECKOUT_TIME confidence: 0.674 → 0.547
- MANNER_TIME confidence: 0.615 → 0.371

## 신뢰도가 낮은 속성(커버리지 50곳↑) — 다음 수집 우선순위

| 속성 | 커버리지 | 평균 신뢰도 | 확정 % | 충돌 |
|---|---:|---:|---:|---:|
| 후기에 나온 요금 (PRICE_MENTION) | 2055 | 0.367 | 0 | 0 |
| 매너타임 (MANNER_TIME) | 1027 | 0.371 | 11.6 | 0 |
| 입실 시각 (CHECKIN_TIME) | 1627 | 0.546 | 31.2 | 30 |
| 퇴실 시각 (CHECKOUT_TIME) | 1604 | 0.547 | 32.7 | 13 |
| 취소·환불 규정 (REFUND_POLICY) | 713 | 0.55 | 53 | 0 |
| 얼리 입실 (EARLY_CHECKIN) | 89 | 0.574 | 40.4 | 0 |
| 레이트 퇴실 (LATE_CHECKOUT) | 63 | 0.579 | 42.9 | 0 |
| 연박·최소 숙박 (MIN_STAY) | 51 | 0.591 | 45.1 | 0 |
| 인원 추가 요금 (EXTRA_PERSON_FEE) | 261 | 0.689 | 61.7 | 0 |
| 차량 추가 요금 (EXTRA_CAR_FEE) | 73 | 0.699 | 63 | 0 |

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
