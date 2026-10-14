"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** 휴대폰 알림 켜기. 아이폰은 홈 화면에 추가한 앱에서만 켤 수 있다 */
export function PushToggle({ variant = "row" }: { variant?: "row" | "card" }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(ios && !standalone ? "needs-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      setState("on");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
    setBusy(false);
  };

  const desc: Record<State, string> = {
    loading: "",
    unsupported: "이 브라우저에서는 알림을 받을 수 없어요. 알림함에서 확인해 주세요.",
    "needs-install": "아이폰은 공유 버튼 → '홈 화면에 추가'로 앱을 설치한 뒤 켤 수 있어요.",
    denied: "알림이 꺼져 있어요. 휴대폰 설정에서 우연한 식탁 알림을 허용해 주세요.",
    off: "매칭 결과, 모임 하루 전 안내, 단체방 새 메시지를 휴대폰으로 받아요.",
    on: "매칭 결과와 모임 안내를 휴대폰으로 보내드려요.",
  };

  if (variant === "card") {
    if (state !== "off" && state !== "needs-install") return null;
    return (
      <div className="mt-4 flex items-start gap-3 rounded-3xl bg-card p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><BellRing size={20} /></span>
        <div className="flex-1">
          <p className="text-[15px] font-bold">휴대폰 알림을 켜 두세요</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{desc[state]}</p>
          {state === "off" && (
            <button onClick={turnOn} disabled={busy} className="mt-3 h-10 rounded-xl bg-accent px-4 text-[14px] font-semibold text-white disabled:opacity-50">
              {busy ? "켜는 중" : "알림 켜기"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-3 text-[16px]"><BellRing size={20} className="text-muted" />휴대폰 알림</p>
        {state !== "loading" && <p className="mt-1 pl-8 text-[13px] leading-relaxed text-muted">{desc[state]}</p>}
      </div>
      {(state === "on" || state === "off") && (
        <button
          role="switch"
          aria-checked={state === "on"}
          aria-label="휴대폰 알림"
          disabled={busy}
          onClick={state === "on" ? turnOff : turnOn}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${state === "on" ? "bg-accent" : "bg-line"}`}
        >
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${state === "on" ? "left-[22px]" : "left-0.5"}`} />
        </button>
      )}
    </div>
  );
}
