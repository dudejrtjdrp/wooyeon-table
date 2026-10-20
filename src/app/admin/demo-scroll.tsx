"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * 주소에 demo=1이 있으면 시연 패널(#demo)로 내려간다. 서버 액션 뒤 돌아올 때 #demo가 빠져도 패널이 보이게.
 * 패널 버튼을 누를 때마다(m이 바뀔 때마다) 다시 맞춘다
 */
export function DemoScroll() {
  const sp = useSearchParams();
  const key = sp.get("demo") === "1" ? sp.toString() : "";
  useEffect(() => {
    if (!key) return;
    document.getElementById("demo")?.scrollIntoView({ block: "start" });
  }, [key]);
  return null;
}
