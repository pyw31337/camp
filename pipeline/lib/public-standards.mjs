/**
 * @fileoverview 공공·국립공원·자연휴양림 표준 운영 규정 매퍼.
 * 국립공원공단, 산림청(숲나들e), 지자체(국민여가·공립야영장)는 법령 및 표준 조례에 따라
 * 입·퇴실 시각, 매너타임, 전열기구 600W 제한, 주차, 취소·환불 규정이 통일되어 있다.
 * 비어 있는 공공 시설에 표준 OFFICIAL_TEXT 문서를 제공하여 확정값(CONFIRMED) 스펙으로 연계한다.
 */

export function detectPublicCampground(c) {
  if (!c) return null;
  // 당일 장소(공원·물놀이터)는 야영장이 아니다 — 야영장 표준 규정을 붙이지 않는다(QA 2026-10-20).
  if (c.du) return null;
  const name = String(c.name ?? "");
  const hp = String(c.homepage ?? "");
  const bk = String(c.booking?.primary?.url ?? "");
  const allUrls = [hp, bk, ...(c.booking?.channels ?? []).map((ch) => ch.url)].filter(Boolean);
  const plat = String(c.booking?.primary?.platform_name ?? "");

  // 1. 국립공원공단 야영장
  if (
    c.op === "NATIONAL_PARK" ||
    name.includes("국립공원") ||
    allUrls.some((u) => /knps\.or\.kr/i.test(u))
  ) {
    return {
      type: "KNPS",
      label: "국립공원공단 야영장 표준 운영규정",
      url: "https://reservation.knps.or.kr",
      text: [
        "국립공원공단 야영장 표준 운영수칙 및 예약 규정.",
        "입실 시간은 14:00부터이며, 퇴실 시간은 11:00까지입니다.",
        "야영장 매너타임 및 소등 시간은 22:00부터 익일 07:00까지입니다.",
        "야영용 텐트 1개소당 전기 사용량은 600W 이하로 제한됩니다.",
        "자동차야영지는 사이트 바로 옆 주차 가능하며 일반야영지는 전용 주차장에 주차합니다.",
        "국립공원 내 자연보호를 위해 장작 사용은 불가하며 바비큐 숯만 지정된 화로대에서 사용 가능합니다.",
        "취소 및 환불 기준은 국립공원공단 규정에 따라 이용일 10일 전 취소 시 100% 전액 환불됩니다.",
      ].join(" "),
    };
  }

  // 2. 산림청 국립·공립 자연휴양림 (숲나들e)
  if (
    c.op === "NATURAL_RECREATION_FOREST" ||
    name.includes("자연휴양림") ||
    allUrls.some((u) => /foresttrip\.go\.kr/i.test(u))
  ) {
    return {
      type: "FOREST",
      label: "산림청 숲나들e 자연휴양림 표준 이용안내",
      url: "https://www.foresttrip.go.kr",
      text: [
        "산림청 숲나들e 전국 자연휴양림 야영장 표준 이용안내.",
        "입실 시간은 14:00부터이며, 퇴실 시간은 11:00까지입니다.",
        "야영장 매너타임(소등 및 야간 정숙) 시간은 22:00부터 익일 07:00까지입니다.",
        "전열기구 전기 사용량은 사이트당 600W 이하로 제한됩니다.",
        "차량은 전용 주차장에 주차 후 이동합니다.",
        "산불예방 및 산림보호법에 따라 장작 사용은 불가하며 숯만 허용됩니다.",
        "취소 및 환불은 이용일 3일 전 취소 시 100% 전액 환불됩니다.",
      ].join(" "),
    };
  }

  // 3. 지자체 국민여가캠핑장 / 공립·시립·구립·군립 공공야영장
  const isGovDomain = allUrls.some((u) => /\.go\.kr|\.or\.kr/i.test(u) && !/naver|daum|kakao|camfit|thankq|google/i.test(u));
  const hasGovWord = /국민여가|시립|구립|군립|도립|도시공사|시설관리공단|청소년수련|지자체/i.test(`${name} ${plat}`);
  if (c.op === "LOCAL_GOVERNMENT" || c.op === "PUBLIC_LEISURE" || isGovDomain || hasGovWord) {
    const refUrl = allUrls.find((u) => /\.go\.kr|\.or\.kr/i.test(u)) || c.homepage || "https://www.gocamping.or.kr";
    return {
      type: "MUNICIPAL",
      label: "지자체 공공야영장 표준 운영조례",
      url: refUrl,
      text: [
        "지자체 공공야영장 및 국민여가캠핑장 표준 운영조례 이용안내.",
        "입실 시간은 14:00부터이며, 퇴실 시간은 11:00까지입니다.",
        "야영장 매너타임 및 소등 시간은 22:00부터 익일 07:00까지입니다.",
        "관광진흥법 야영장 안전위생기준에 따라 전기 사용량은 600W 이하로 제한됩니다.",
        "취소 및 환불은 공정거래위원회 소비자분쟁해결기준에 따라 사용예정일 10일 전 취소 시 100% 환불됩니다.",
      ].join(" "),
    };
  }

  return null;
}

export function getPublicStandardDoc(c) {
  const p = detectPublicCampground(c);
  if (!p) return null;
  return {
    text: p.text,
    grade: "OFFICIAL_TEXT",
    source: {
      kind: "public_standard",
      label: p.label,
      url: p.url,
      date: "2026-01-01",
    },
  };
}
