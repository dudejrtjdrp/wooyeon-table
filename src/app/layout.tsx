import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { NavProgress } from "@/components/nav-progress";
import { PwaRegister } from "@/components/pwa";
import { Splash } from "@/components/splash";
import "./globals.css";

export const metadata: Metadata = {
  title: "우연한 식탁",
  description: "처음 만나는 4~6명이 한 테이블에서 저녁을 먹어요",
  applicationName: "우연한 식탁",
  appleWebApp: { capable: true, title: "우연한 식탁", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
  // Next 15는 appleWebApp.capable을 mobile-web-app-capable로만 내보낸다. 아이폰이 홈 화면 아이콘을 앱(주소창 없이)으로 열게 예전 이름도 함께 둔다
  other: { "mobile-web-app-capable": "yes", "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5efe6",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Gothic+A1:wght@400;500;700;800;900&display=swap" />
      </head>
      <body className="antialiased">
        <Splash />
        <PwaRegister />
        <Suspense fallback={null}><NavProgress /></Suspense>
        {children}
      </body>
    </html>
  );
}
