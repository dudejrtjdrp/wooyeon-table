"use client";

import { BellRing } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** 알림 권한을 묻고 이 기기를 구독한다. 켜졌으면 true */
export async function subscribePush(): Promise<"on" | "off" | "denied"> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { publicKey } = await (await fetch("/api/push")).json();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
  return "on";
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
      setState(await subscribePush());
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  const [tested, setTested] = useState<string | null>(null);
  const test = async () => {
    setTested("보내는 중");
    try {
      const { sent } = await (await fetch("/api/push/test", { method: "POST" })).json();
      setTested(sent ? "보냈어요. 잠시 뒤 알림을 확인해 보세요" : "이 기기로 보내지 못했어요. 알림을 껐다 다시 켜 주세요");
    } catch {
      setTested("보내지 못했어요");
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
    unsupported: "이 브라우저에서는 알림을 받을 수 없어요. 홈 위쪽 알림에서 확인해 주세요.",
    "needs-install": "아이폰은 홈 화면에 앱을 추가한 뒤 알림을 켤 수 있어요.",
    denied: "알림이 꺼져 있어요. 휴대폰 설정에서 우연한 식탁 알림을 허용해 주세요.",
    off: "매칭 결과, 모임 하루 전 안내, 단체방 새 메시지를 휴대폰으로 받아요.",
    on: "매칭 결과와 모임 안내를 휴대폰으로 보내드려요.",
  };

  if (variant === "card") {
    if (state !== "off") return null; // 설치 전(아이폰)은 설치 카드가 대신 안내한다
    return (
      <div className="shadow-card mt-4 flex items-start gap-3 rounded-[22px] bg-card p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><BellRing size={20} /></span>
        <div className="flex-1">
          <p className="text-[15px] font-bold">휴대폰 알림을 켜 두세요</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{desc[state]}</p>
          {state === "off" && (
            <button onClick={turnOn} disabled={busy} className="mt-3 h-11 rounded-xl bg-accent-soft px-4 text-[14px] font-bold text-accent-text disabled:opacity-50">
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
        <p className="flex items-center gap-3.5 text-[16px] font-medium text-ink"><span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent"><BellRing size={20} /></span>휴대폰 알림</p>
        {state !== "loading" && state !== "on" && state !== "off" && <p className="mt-1 pl-[54px] text-[13px] leading-relaxed text-muted">{desc[state]}</p>}
        {state === "needs-install" && <Link href="/install" className="ml-[54px] inline-flex h-11 items-center text-[13px] font-semibold text-accent">설치 방법 보기</Link>}
        {state === "on" && (
          <button onClick={test} className="ml-[54px] flex min-h-11 items-center text-left text-[13px] font-semibold text-accent">{tested ?? "시험 알림 보내기"}</button>
        )}
      </div>
      {(state === "on" || state === "off") && (
        <button
          role="switch"
          aria-checked={state === "on"}
          aria-label="휴대폰 알림"
          disabled={busy}
          onClick={state === "on" ? turnOff : turnOn}
          className="-mr-2 flex h-11 w-[66px] shrink-0 items-center justify-center"
        >
          <span className={`relative h-8 w-[54px] rounded-full transition ${state === "on" ? "bg-accent" : "bg-line"}`}>
            <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${state === "on" ? "left-[26px]" : "left-1"}`} />
          </span>
        </button>
      )}
    </div>
  );
}
