import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "우연한 식탁",
    short_name: "우연한 식탁",
    description: "처음 만나는 네다섯 명과 저녁 한 끼. 날짜와 동네만 고르면 테이블을 꾸려 드려요.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f7",
    theme_color: "#3540c4",
    lang: "ko",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
