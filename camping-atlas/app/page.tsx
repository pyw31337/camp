export const dynamic = "force-static";

export default function Page() {
  // GitHub Pages 발행 단계가 이 파일의 정적 산출물을 /camp/ 탐색 셸로 교체한다.
  // 이 fallback도 다른 주소로 보내지 않는다. 운영 주소는 언제나 /camp/ 하나다.
  return <main aria-live="polite"><h1>모여라 캠핑</h1></main>;
}
