"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * 어드민 공통 결과 알림. 서버 액션이 ?m=(성공) 또는 ?e=(안 됨) 를 붙여 돌려보내면 화면 오른쪽 아래에 띄운다.
 * 긴 화면 아래쪽(#ops 등)에서 눌러도 보이도록 고정 위치에 둔다. 닫으면 주소에서도 지운다.
 */
export function Flash() {
  const sp = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const m = sp.get("m");
  const e = sp.get("e");
  const [hidden, setHidden] = useState<string | null>(null);
  const msg = e ?? m;
  const key = `${path}?${sp.toString()}`;

  useEffect(() => {
    if (!m || e) return;
    const t = setTimeout(() => setHidden(key), 8000);
    return () => clearTimeout(t);
  }, [m, e, key]);

  if (!msg || hidden === key) return null;
  const close = () => {
    setHidden(key);
    const next = new URLSearchParams(sp.toString());
    next.delete("m");
    next.delete("e");
    const q = next.toString();
    router.replace(`${path}${q ? `?${q}` : ""}${typeof window !== "undefined" ? window.location.hash : ""}`, { scroll: false });
  };
  const bad = Boolean(e);
  return (
    <div role={bad ? "alert" : "status"} className={`fixed bottom-5 right-5 z-50 flex max-w-[420px] items-start gap-3 rounded-2xl px-4 py-3.5 text-[14px] font-medium shadow-card ring-1 ${bad ? "bg-card text-danger ring-danger/30" : "bg-card text-ink ring-leaf/30"}`}>
      {bad ? <CircleAlert size={20} className="mt-px shrink-0" /> : <CircleCheck size={20} className="mt-px shrink-0 text-leaf" />}
      <p className="min-w-0 flex-1 leading-relaxed">{msg}</p>
      <button type="button" onClick={close} aria-label="알림 닫기" className="-mr-1 shrink-0 rounded-lg p-1 text-muted hover:text-ink"><X size={18} /></button>
    </div>
  );
}
