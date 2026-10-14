"use client";

import PortOne from "@portone/browser-sdk/v2";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmVerification } from "../verify/actions";

/** PASS 통합인증 창을 띄우고, 끝나면 서버에서 결과를 확인한다 */
export function PassButton({ userKey, next, onError }: { userKey: string; next: string; onError: (m: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const id = `idv-${userKey}-${crypto.randomUUID().slice(0, 12)}`;
      const res = await PortOne.requestIdentityVerification({
        storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID!,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_IDV_CHANNEL_KEY!,
        identityVerificationId: id,
        redirectUrl: `${window.location.origin}/verify/complete?next=${encodeURIComponent(next)}`,
      });
      if (!res) return; // 모바일은 리디렉션으로 이어진다
      if (res.code) {
        onError(res.message ?? "본인인증을 마치지 않았어요");
        return;
      }
      const r = await confirmVerification(id);
      if (!r.ok) onError(r.error);
      else router.replace(`/onboarding?next=${encodeURIComponent(next)}&verified=1`);
    } catch {
      onError("본인인증 창을 열지 못했어요. 잠시 뒤 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[16px] font-semibold text-white transition active:scale-[.985] disabled:opacity-50"
    >
      <ShieldCheck size={20} />
      {busy ? "인증 창을 여는 중" : "PASS로 본인인증하기"}
    </button>
  );
}
