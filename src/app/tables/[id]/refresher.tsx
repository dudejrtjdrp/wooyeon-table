"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 단체방 새 메시지를 보려고 몇 초마다 화면을 다시 불러온다 */
export function Refresher({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}
