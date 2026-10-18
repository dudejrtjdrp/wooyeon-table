import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 식당 사진은 브라우저에서 줄여 한 장씩 보내지만 여유를 둔다 (Vercel 요청 한도 4.5MB 안)
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // 서비스 워커는 늘 최신 파일을 받아야 새 버전이 바로 적용된다
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
