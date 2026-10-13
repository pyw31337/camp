import type { Metadata } from "next";
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
