// 콘텐츠 카드 격자(소유자 2026-10-20): 블로그 후기·캠퍼 사진·영상·축제 카드처럼 피드형 카드만
// 태블릿부터 여러 단으로 깔고, 처음엔 몇 개만 보이다가 '더보기'로 같은 개수씩 늘린다.
// 업장 기본 정보(요금·이용 정보·시설·주변시설 등)에는 쓰지 않는다 — 그런 칸은 항상 전부 보인다.
//
// 단 수(화면 너비): ~767px 기존 모바일 배치(제한 없음) · 768px~ 2단 · 1024px~ 3단 · 1280px~ 4단 · 1600px~ 5단
// 처음 개수: 짝수 단은 4나 6 중 단 수의 배수(2단→4, 4단→4, 6단→6), 홀수 단은 5를 기준으로
//           5 이상인 단 수의 배수(3단→6, 5단→5). 그래서 첫 화면은 늘 줄이 꽉 찬다. 더보기도 같은 개수씩.
export const BREAKS = [[1024, 5], [860, 4], [640, 3], [480, 2]];
export function colsFor(w = (typeof innerWidth === "number" ? innerWidth : 0)) {
  for (const [min, n] of BREAKS) if (w >= min) return n;
  return 1;
}
export function pageFor(cols) {
  if (cols <= 1) return 3;
  return cols;
}
const STATE = new WeakMap();
/** grid: 카드 묶음 요소. 카드는 직계 자식. filter(card)가 false인 카드는 세지 않고 숨긴다(탭 필터용). */
export function apply(grid) {
  const st = STATE.get(grid);
  if (!st) return;
  const cols = colsFor();
  const page = pageFor(cols);
  grid.style.setProperty("--cg-cols", String(cols));
  if (st.cols !== cols) { st.cols = cols; st.n = page; }
  let shown = 0, total = 0;
  for (const c of grid.children) {
    if (c.matches?.(".cg-more-wrap")) continue;
    const hit = st.filter ? st.filter(c) : true;
    const visible = hit && total < st.n;
    c.toggleAttribute("data-cg-hide", !visible);
    if (hit) { total++; if (visible) shown++; }
  }
  st.btn.hidden = shown >= total;
  st.btn.textContent = `${total - shown}개 더보기`;
}
export function setup(grid, { filter } = {}) {
  if (!grid || STATE.has(grid)) return;
  grid.classList.add("cgrid");
  const wrap = document.createElement("div");
  wrap.className = "cg-more-wrap";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cg-more";
  wrap.append(btn);
  grid.after(wrap);
  STATE.set(grid, { filter, btn, cols: 0, n: 0 });
  btn.addEventListener("click", () => { const st = STATE.get(grid); st.n += pageFor(st.cols); apply(grid); });
  apply(grid);
  let t = 0;
  const onResize = () => { clearTimeout(t); t = setTimeout(() => { if (!grid.isConnected) { removeEventListener("resize", onResize); wrap.remove(); return; } apply(grid); }, 120); };
  addEventListener("resize", onResize);
}
export function setFilter(grid, filter) { const st = STATE.get(grid); if (!st) return; st.filter = filter; st.n = pageFor(st.cols); apply(grid); }
export function setupAll(root = document) { root.querySelectorAll("[data-cgrid]").forEach((g) => setup(g)); }
