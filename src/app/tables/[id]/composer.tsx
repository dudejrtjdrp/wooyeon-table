"use client";

import { SendHorizontal } from "lucide-react";
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
      className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-t from-paper via-paper to-paper/0 px-4 pt-4"
    >
      <input type="hidden" name="table_id" value={tableId} />
      <div className="flex items-center gap-2.5 pb-3">
        <input
          name="body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지를 입력해 주세요"
          autoComplete="off"
          maxLength={500}
          className="shadow-card h-[54px] flex-1 rounded-full border border-line bg-card px-5 text-[16px] text-ink outline-none placeholder:text-muted/70 focus:border-accent"
        />
        <button
          aria-label="보내기"
          disabled={busy || !text.trim()}
          className="shadow-cta flex size-[54px] shrink-0 items-center justify-center rounded-full bg-accent text-white transition disabled:bg-accent/40 disabled:shadow-none"
        >
          <SendHorizontal size={24} strokeWidth={2.2} className="fill-white/90" />
        </button>
      </div>
    </form>
  );
}
