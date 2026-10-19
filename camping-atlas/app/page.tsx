export const dynamic = "force-static";

export default function Page() {
  // GitHub Pages 발행 단계가 이 파일의 정적 산출물을 현재 탐색 셸로 바꾼다.
  // 개발/빌드가 중간에 끝나도 자동 이동으로 다른 주소를 강제하지 않고, 명시적인
  // 진입 링크만 남긴다.
  return <main aria-live="polite"><a href="./explore/">모여라 캠핑 열기</a></main>;
}
