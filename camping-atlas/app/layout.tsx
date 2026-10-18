import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./pilot.css";
import "./premium.css";
import "./site-header.css";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "모여라 캠핑 | 전국 캠핑장 정보 허브",
  description: "전국 캠핑장 정보·예약 방식·여행 판단 정보를 출처와 수집 시각으로 비교하는 서비스 프로토타입",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "favicon.svg",
    shortcut: "favicon.svg",
  },
  manifest: "./manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // PWA에서는 상태 표시 영역까지 히어로가 이어진다. 실제 조작부는 공통
    // 헤더의 safe-area inset 아래에서 시작하므로 노치·상태 아이콘과 겹치지 않는다.
    statusBarStyle: "black-translucent",
    title: "모여라 캠핑",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f6f4",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
