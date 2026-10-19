"use client";

// 앱 바깥 틀에서 난 오류. 이 화면은 레이아웃 없이 그려지므로 html·body와 최소 스타일을 직접 둔다
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: "#f7f3ec", color: "#1f2a24", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>잠깐 문제가 생겼어요</h1>
          <p style={{ marginTop: 8, fontSize: 15, lineHeight: 1.6 }}>잠시 뒤 다시 시도해 주세요. 계속 안 되면 내 정보 → 자주 묻는 질문과 문의로 알려 주세요.</p>
          <button onClick={() => reset()} style={{ marginTop: 32, width: "100%", height: 52, border: 0, borderRadius: 14, background: "#e0532a", color: "#fff", fontSize: 16, fontWeight: 800 }}>다시 시도</button>
          {/* 바깥 틀이 깨진 상태라 새로 불러오도록 일반 링크를 쓴다 */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ marginTop: 8, display: "inline-flex", height: 44, alignItems: "center", fontSize: 14, fontWeight: 600, color: "#e0532a" }}>홈으로</a>
        </main>
      </body>
    </html>
  );
}
