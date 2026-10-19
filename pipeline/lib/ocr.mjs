// 운영자 안내 이미지(요금표·이용안내)의 OCR 결과 정리.
// tesseract 출력은 표 한 행이 한 줄이고 칸 사이가 공백 여러 개다. 머리 행(평일·주말·성수기·기준 인원 …)을 찾아
// 각 행을 “오토캠핑 비수기 — 주중요금 45,000원 · 주말요금 45,000원”처럼 칸 이름이 붙은 문장으로 바꾼다.
// 그래야 기존 추출기(spec-extractor·operator-site·요금 추출)가 평일/주말·성수기/비수기·인원을 알아본다.
// 원칙: 값은 바꾸거나 추정하지 않는다. 숫자만 있고 “원”이 빠진 요금 칸은 머리 행이 요금 칸일 때만 “원”을 붙인다.

const HEADER_WORD = /평일|주중|주말|금[,·\s]*토|일[~\-]?목|성수기|비수기|준성수기|극성수기|요금|이용료|가격|기준\s*인원|기준|최대\s*인원|인원|사이트(수|명|그룹)?|구분|객실|방이름|평형|크기|규격|면적|비고|전기|1박|2박|연박/;
const PRICE_COL = /평일|주중|주말|금[,·\s]*토|일[~\-]?목|성수기|비수기|요금|이용료|가격|1박|2박|연박|추가/;
// 요금 칸 이름에 OCR 잡음(“$s 비고·Fue)”)이 섞이면 칸 이름 낱말만 남긴다.
const priceWordOf = (c) => (hangulRatio(c.replace(/[()[\],·~/]/g, "")) >= 0.6 ? c : (c.match(new RegExp(PRICE_COL.source, "g")) ?? []).join("·"));
const cellsOf = (line) => line.split(/\s{2,}|\t|\s*[|│]\s*/).map((c) => c.trim()).filter(Boolean);
const hangulRatio = (s) => (s.match(/[가-힣]/g)?.length ?? 0) / Math.max(1, s.replace(/\s/g, "").length);

/** OCR 결과의 품질 점수(요금·시간 단서 수 + 한글 비율). 전처리 여러 방식 중 좋은 것을 고를 때 쓴다. */
export function ocrScore(text) {
  const t = String(text ?? "");
  const price = (t.match(/\d{1,3}(?:,\d{3})+\s*원?|\d{1,2}\s*만\s*원/g) ?? []).length;
  const time = (t.match(/\d{1,2}\s*[:시]\s*\d{0,2}/g) ?? []).length;
  return price * 3 + time + hangulRatio(t) * 5;
}

/** 금액처럼 보이는 숫자 칸(“45,000”, “45000”)에 원을 붙인다. 이미 원·만원이면 그대로. */
const wonCell = (c) => (/원/.test(c) ? c : /^\d{1,3}(?:,\d{3})+$|^\d{4,6}$/.test(c.replace(/\s/g, "")) ? `${c.replace(/\s/g, "")}원` : c);

/**
 * OCR 텍스트 → 문장 목록. 표 머리 행이 있으면 각 행을 칸 이름이 붙은 문장으로 바꾸고,
 * 표가 아닌 줄은 한글이 충분한 줄만 남긴다(잡음 제거).
 */
export function ocrSentences(text) {
  // 자주 틀리는 글자(한글 OCR): 주줌→주중, 차량!대→차량1대, 1박의 l/I
  const fixed = String(text ?? "").replace(/주줌/g, "주중").replace(/(\d|량|인|박)\s*[!|lI]\s*(대|박|인|명)/g, "$11$2").replace(/([^\d])[lI](박|인|대)/g, "$11$2");
  const lines = fixed.replace(/[“”"]/g, "").split(/\r?\n/).map((l) => l.replace(/[ \t]+$/g, "")).filter((l) => l.trim());
  const out = [];
  let header = null, priceWords = [], groupLabel = "", lastWasHeader = false;
  const isPriceCell = (c) => /\d\s*(만\s*)?원$|^\d{1,3}(?:,\d{3})+$|^\d{1,2}\s*만\s*원?$/.test(c.replace(/\s/g, ""));
  for (const raw of lines) {
    const line = raw.trim();
    const cells = cellsOf(raw);
    const headerHits = cells.filter((c) => HEADER_WORD.test(c)).length;
    const hasValue = cells.some((c) => /\d/.test(c));
    if (cells.length >= 3 && headerHits >= Math.max(2, Math.ceil(cells.length * 0.5)) && !/\d{1,3},\d{3}|\d+\s*만\s*원/.test(line)) {
      header = cells; priceWords = cells.filter((c) => PRICE_COL.test(c)).map(priceWordOf).filter(Boolean); groupLabel = ""; lastWasHeader = true; continue;
    }
    // 두 줄 머리: 머리 바로 다음의 숫자 없는 짧은 줄(“주말(금,토)  평일”)은 요금 칸 이름으로 보탠다.
    if (lastWasHeader && !hasValue && cells.length <= 4 && cells.every((c) => HEADER_WORD.test(c))) { priceWords.push(...cells.filter((c) => PRICE_COL.test(c)).map(priceWordOf).filter(Boolean)); continue; }
    lastWasHeader = false;
    if (header && hasValue && cells.length >= 2) {
      // 행 머리(사이트·객실 이름)는 첫 칸. 첫 칸이 숫자뿐이거나 계절·요일이면 앞 행 이름을 잇는다(병합 셀).
      let name = cells[0];
      if (/^[\d,.\s]+$/.test(name) || /^(비수기|성수기|준성수기|극성수기|평일|주말)$/.test(name)) name = `${groupLabel} ${name}`.trim();
      else groupLabel = name;
      const meta = [], prices = [];
      if (cells.length <= header.length) {
        // 칸 수가 머리 이하이면 오른쪽(값 칸)부터 맞춘다. 요금 칸은 밖에, 구성·규격 칸은 괄호 안에 둔다
        // (추출기가 괄호 안의 “4인/차량1대” 같은 구성 설명을 추가 요금으로 오해하지 않게).
        const offset = Math.max(0, header.length - cells.length);
        cells.forEach((c, j) => {
          if (j === 0) return;
          const h = header[j + offset] ?? "";
          if (!h || !/\d|가능|불가|무료|포함|없음|성수기|비수기|평일|주말/.test(c)) return;
          if (PRICE_COL.test(h) && (isPriceCell(c) || /원/.test(c))) prices.push(`${priceWordOf(h)} ${wonCell(c)}`);
          else meta.push(`${h} ${c}`);
        });
      } else {
        // 칸 이름을 맞출 수 없으면(두 줄 머리·병합 칸) 금액은 머리의 요금 칸 이름 묶음과 함께, 나머지는 괄호 안에.
        cells.slice(1).forEach((c) => (isPriceCell(c) ? prices.push(wonCell(c)) : meta.push(c)));
        if (prices.length && priceWords.length) prices[0] = `${priceWords.join("·")} 요금 ${prices[0]}`;
      }
      if (prices.length || meta.length) {
        out.push(`${name}${meta.length ? ` (${meta.join(", ")})` : ""}${prices.length ? ` — ${prices.join(", ")}` : ""}`.slice(0, 140));
        continue;
      }
    }
    const sentence = line.replace(/\s{2,}/g, " ");
    if (sentence.length >= 6 && (hangulRatio(sentence) >= 0.35 || /\d[\d,]*\s*(만\s*)?원/.test(sentence))) out.push(sentence.slice(0, 140));
  }
  return [...new Set(out)];
}
