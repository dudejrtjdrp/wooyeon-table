"use client";

import { ArrowUp } from "lucide-react";
import { useRef, useState } from "react";

/** 단체방 입력창. 보내고 나면 비우고, 보내는 동안은 다시 못 누르게 한다 */
export function Composer({ tableId, action }: { tableId: string; action: (f: FormData) => Promise<void> }) {
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
      className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-line bg-card px-3 pt-2"
    >
      <input type="hidden" name="table_id" value={tableId} />
      <div className="flex items-end gap-2 pb-2">
        <input
          name="body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지 보내기"
          autoComplete="off"
          maxLength={500}
          className="h-11 flex-1 rounded-full bg-paper px-4 text-[16px] outline-none placeholder:text-muted/70"
        />
        <button
          aria-label="보내기"
          disabled={busy || !text.trim()}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white transition disabled:bg-line disabled:text-muted"
        >
          <ArrowUp size={22} strokeWidth={2.4} />
        </button>
      </div>
    </form>
  );
}
