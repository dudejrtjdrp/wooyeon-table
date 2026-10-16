"use client";

import { SendHorizontal } from "lucide-react";
import { useRef, useState } from "react";

/** 단체방 입력창. 보내고 나면 비우고, 보내는 동안은 다시 못 누르게 한다 */
export function Composer({ tableId, action, lateAction }: { tableId: string; action: (f: FormData) => Promise<void>; lateAction?: (f: FormData) => Promise<void> }) {
  const ref = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  return (
    <form
      ref={ref}
      action={async (f) => {
        if (!text.trim()) return;
        setBusy(true);
        setText("");
        try {
          await action(f);
        } finally {
          setBusy(false);
          setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 200);
        }
      }}
      className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-line2 bg-paper px-4 pt-3"
    >
      <input type="hidden" name="table_id" value={tableId} />
      {lateAction && (
        <button type="submit" formAction={lateAction} className="mb-2 flex h-11 items-center rounded-[22px] bg-[#FDF3D2] px-4 text-[14px] font-bold text-[#6b5410]">
          늦을 것 같아요
        </button>
      )}
      <div className="flex items-center gap-2.5 pb-3">
        <input
          name="body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지를 입력해 주세요"
          autoComplete="off"
          maxLength={500}
          className="h-[54px] flex-1 rounded-full border border-line bg-card px-5 text-[16px] text-ink outline-none placeholder:text-muted/70 focus:border-accent"
        />
        <button
          aria-label="보내기"
          disabled={busy || !text.trim()}
          className="flex size-[54px] shrink-0 items-center justify-center rounded-full bg-accent text-white transition disabled:bg-accent/40 disabled:shadow-none"
        >
          <SendHorizontal size={24} strokeWidth={2.2} className="fill-white/90" />
        </button>
      </div>
    </form>
  );
}
