import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "우연한 식탁",
    short_name: "우연한 식탁",
    description: "처음 만나는 네다섯 명과 저녁 한 끼. 날짜와 동네만 고르면 테이블을 꾸려 드려요.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#f5efe6",
    theme_color: "#f5efe6",
    lang: "ko",
    dir: "ltr",
    categories: ["social", "food", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "내 식탁", url: "/my-tables", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "모집 중인 일정", url: "/rounds", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "알림", url: "/notifications", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
