"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { askedKey, shouldAskPush } from "@/lib/push-ask";
import { registration, subscribePush } from "./push-toggle";
import { isStandalone } from "./pwa";

/**
 * 처음 들어왔을 때 한 번만 휴대폰 알림을 켤지 묻는 시트. '나중에'를 누르면 다시 묻지 않고, 설정 → 휴대폰 알림에서 켤 수 있다.
 * 아이폰은 홈 화면에 추가한 앱에서만 알림이 되니, 앱으로 처음 열면 한 번 더 묻는다 (lib/push-ask.ts)
 */
export function PushAsk() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");

  useEffect(() => {
    (async () => {
      const k = askedKey(isStandalone());
      setKey(k);
      let asked = false;
      try { asked = localStorage.getItem(k) === "1"; } catch { asked = true; }
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported || asked) return;
      const sub = await (await registration()).pushManager.getSubscription();
      if (shouldAskPush({ supported, permission: Notification.permission, subscribed: Boolean(sub), asked })) setOpen(true);
    })().catch(() => null);
  }, []);

  const done = () => {
    try { localStorage.setItem(key, "1"); } catch {}
    setOpen(false);
  };
  const turnOn = async () => {
    setBusy(true);
    try { await subscribePush(); } catch {} finally { setBusy(false); done(); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" role="dialog" aria-modal="true" aria-labelledby="push-ask-title">
      <div className="pb-safe w-full max-w-md rounded-t-[28px] bg-paper px-6 pt-6">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent"><BellRing size={24} aria-hidden="true" /></span>
        <h2 id="push-ask-title" className="mt-4 text-[21px] font-extrabold leading-snug text-ink">휴대폰 알림을 켜 둘까요?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">매칭 결과, 모임 하루 전 안내, 단체방 새 글을 바로 알려 드려요. 나중에 설정에서도 켜고 끌 수 있어요.</p>
        <button onClick={turnOn} disabled={busy} className="mt-6 flex h-[54px] w-full items-center justify-center rounded-[14px] bg-accent text-[16px] font-bold text-accent-ink disabled:opacity-60">
          {busy ? "켜는 중" : "알림 켜기"}
        </button>
        <button onClick={done} className="mb-4 mt-1 flex h-12 w-full items-center justify-center text-[15px] font-semibold text-muted">나중에</button>
      </div>
    </div>
  );
}

/** 이미 앱(홈 화면에 추가한 아이콘)으로 열었으면 아무것도 보이지 않는다. 설치 안내를 감쌀 때 쓴다 */
export function HideInApp({ children }: { children: React.ReactNode }) {
  const [app, setApp] = useState(true);
  useEffect(() => setApp(isStandalone()), []);
  return app ? null : <>{children}</>;
}
