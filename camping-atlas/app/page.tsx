"use client";

import { useEffect } from "react";

export const dynamic = "force-static";

export default function Page() {
  useEffect(() => {
    const legacy = window.location.hash.match(/^#c=(.+)$/);
    const hash = legacy ? `#/c/${legacy[1]}` : window.location.hash;
    window.location.replace(`./explore/${window.location.search}${hash}`);
  }, []);

  return <><meta httpEquiv="refresh" content="0; url=./explore/" /><main aria-live="polite"><a href="./explore/">캠핑장 찾기 열기</a></main></>;
}
