"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// 안드로이드 크롬은 설치 제안 이벤트를 한 번만 준다. 화면이 바뀌어도 쓸 수 있게 모듈에 붙잡아 둔다
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((f) => f());
  });
}

export type Platform = "ios-safari" | "ios-other" | "android" | "desktop";

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return /crios|fxios|edgios|kakaotalk|naver|instagram|fban|line\//i.test(ua) ? "ios-other" : "ios-safari";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as { standalone?: boolean }).standalone);
}

async function syncBadge() {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (!nav.setAppBadge) return;
  try {
    const { count } = await (await fetch("/api/push/badge", { cache: "no-store" })).json();
    if (count > 0) await nav.setAppBadge(count);
    else await nav.clearAppBadge?.();
  } catch {}
}

/** 서비스 워커 등록과 아이콘 배지 맞추기. 모든 화면에서 한 번 */
export function PwaRegister() {
  const path = usePathname();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
    const onVis = () => document.visibilityState === "visible" && syncBadge();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    if (isStandalone()) syncBadge();
  }, [path]);
  return null;
}

export function useInstall() {
  const [, force] = useState(0);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [standalone, setStandalone] = useState(true);
  useEffect(() => {
    setPlatform(detectPlatform());
    setStandalone(isStandalone());
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  const prompt = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    force((n) => n + 1);
    return outcome === "accepted";
  };
  return { platform, standalone, canPrompt: Boolean(deferred), prompt };
}

const DISMISS = "wt_install_dismissed";

/** 홈 화면에 앱 설치를 권하는 카드. 이미 앱으로 열었으면 안 보인다 */
export function InstallCard() {
  const { platform, standalone, canPrompt, prompt } = useInstall();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      const t = Number(localStorage.getItem(DISMISS) ?? 0);
      setHidden(Date.now() - t < 3 * 24 * 3600_000);
    } catch {
      setHidden(false);
    }
  }, []);
  if (!platform || standalone || hidden || platform === "desktop") return null;
  const close = () => {
    try { localStorage.setItem(DISMISS, String(Date.now())); } catch {}
    setHidden(true);
  };

  return (
    <div className="relative mt-4 overflow-hidden rounded-[22px] bg-card p-5 text-ink">
      <button onClick={close} aria-label="닫기" className="absolute right-1.5 top-1.5 flex size-11 items-center justify-center rounded-full text-muted"><X size={18} /></button>
      <div className="flex items-start gap-3.5 pr-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" className="size-12 shrink-0 rounded-[14px]" />
        <div>
          <p className="text-[16px] font-bold">앱으로 설치하고 알림 받기</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            {platform === "android"
              ? "홈 화면에 설치하면 매칭 결과와 모임 안내가 바로 와요."
              : "아이폰은 홈 화면에 추가해야 알림을 받을 수 있어요."}
          </p>
        </div>
      </div>
      {platform === "android" && canPrompt ? (
        <button onClick={prompt} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent-soft text-[15px] font-bold text-accent-text">
          <Download size={18} /> 설치하기
        </button>
      ) : (
        <Link href="/install" className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent-soft text-[15px] font-bold text-accent-text">
          {platform === "android" ? <Download size={18} /> : <SquarePlus size={18} />} 설치 방법 보기
        </Link>
      )}
    </div>
  );
}

/** 설치 안내 화면 본문 */
export function InstallGuide() {
  const { platform, standalone, canPrompt, prompt } = useInstall();
  const [tab, setTab] = useState<"ios" | "android">("ios");
  useEffect(() => {
    if (platform === "android") setTab("android");
  }, [platform]);
  if (!platform) return null;

  if (standalone) {
    return (
      <div className="mt-4 rounded-3xl bg-card p-6">
        <p className="text-[17px] font-bold">이미 앱으로 쓰고 있어요</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">내 정보 → 휴대폰 알림을 켜 두면 매칭 결과와 모임 안내를 바로 받아요.</p>
        <Link href="/me" className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-accent text-[15px] font-semibold text-white">알림 설정하러 가기</Link>
      </div>
    );
  }

  const ios = [
    platform === "ios-other"
      ? { t: "Safari로 열기", d: "카카오톡·네이버 같은 앱 안에서는 설치가 안 돼요. 오른쪽 아래 메뉴에서 'Safari로 열기'를 눌러 주세요." }
      : { t: "Safari에서 열기", d: "지금 보고 있는 Safari 화면에서 바로 하면 돼요." },
    { t: "공유 버튼 누르기", d: "화면 아래(또는 주소창 옆)의 공유 버튼을 눌러요.", icon: <Share size={16} /> },
    { t: "'홈 화면에 추가' 고르기", d: "목록을 조금 내려서 '홈 화면에 추가'를 눌러요. '웹 앱으로 열기'가 켜져 있는지 확인하고(꺼져 있으면 주소창이 있는 브라우저로 열려요) 오른쪽 위 '추가'를 눌러요.", icon: <SquarePlus size={16} /> },
    { t: "홈 화면 아이콘으로 열고 알림 켜기", d: "추가된 우연한 식탁 아이콘으로 앱을 열어요. 앱은 Safari와 로그인이 따로라 한 번 더 로그인하면, 처음에 알림을 켤지 물어봐요. '허용'을 눌러 주세요. (iOS 16.4 이상)" },
  ];
  const android = [
    { t: "Chrome에서 열기", d: "삼성 인터넷이나 다른 앱 안에서 열었다면 Chrome으로 열어 주세요." },
    { t: "설치하기", d: "아래 버튼을 누르거나, 오른쪽 위 ⋮ 메뉴 → '앱 설치'(또는 '홈 화면에 추가')를 눌러요.", icon: <Download size={16} /> },
    { t: "앱을 열고 알림 켜기", d: "설치된 우연한 식탁 앱을 열면 처음에 알림을 켤지 물어봐요. '알림 켜기' → '허용'을 눌러요." },
  ];
  const steps = tab === "ios" ? ios : android;

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-card p-1">
        {(["ios", "android"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`h-11 rounded-xl text-[14px] font-semibold ${tab === k ? "bg-accent text-white" : "text-muted"}`}>
            {k === "ios" ? "아이폰" : "안드로이드"}
          </button>
        ))}
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={s.t} className="flex gap-4 rounded-3xl bg-card p-5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">{i + 1}</span>
            <div>
              <p className="flex items-center gap-1.5 text-[15px] font-bold">{s.t}{"icon" in s && s.icon ? <span className="text-accent">{s.icon}</span> : null}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
      {tab === "android" && canPrompt && (
        <button onClick={prompt} className="mt-4 flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-semibold text-white">
          <Download size={18} /> 지금 설치하기
        </button>
      )}
    </>
  );
}
