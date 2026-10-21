"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** 휴대폰에서 열 주소. 누르면 복사한다 */
export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <code className="min-w-0 break-all rounded-lg bg-card px-3 py-2 text-[15px] font-semibold text-ink">{url}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          } catch {
            /* 복사가 막힌 브라우저면 주소를 직접 보고 입력 */
          }
        }}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 text-[14px] font-semibold text-ink hover:border-accent"
      >
        {done ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {done ? "복사했어요" : "주소 복사"}
      </button>
    </div>
  );
}
