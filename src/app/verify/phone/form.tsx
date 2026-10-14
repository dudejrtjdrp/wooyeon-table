"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { requestCode, submitCode } from "../phone-actions";

const input =
  "h-[54px] w-full rounded-2xl border border-line bg-card px-4 text-[17px] outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:bg-paper disabled:text-muted";

const fmt = (p: string) => p.replace(/\D/g, "").replace(/^(\d{3})(\d{1,4})?(\d{1,4})?.*/, (_, a, b, c) => [a, b, c].filter(Boolean).join("-"));

export function PhoneVerifyForm({ initialPhone, next, demo }: { initialPhone: string; next: string; demo: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState(fmt(initialPhone));
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ expiresAt: number; resendAt: number; demoCode?: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<"send" | "check" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sent) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sent]);

  const left = sent ? Math.max(0, Math.ceil((sent.expiresAt - now) / 1000)) : 0;
  const canResend = sent ? now >= sent.resendAt : true;

  const send = async () => {
    setErr(null);
    setBusy("send");
    const r = await requestCode(phone);
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    setSent({ expiresAt: Date.parse(r.expiresAt), resendAt: Date.parse(r.resendAt), demoCode: r.demoCode });
    setCode("");
    setNow(Date.now());
    setTimeout(() => codeRef.current?.focus(), 50);
  };

  const check = async (c = code) => {
    if (c.length !== 6) return;
    setErr(null);
    setBusy("check");
    const r = await submitCode(phone, c);
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    router.replace(`${next}${next.includes("?") ? "&" : "?"}m=${encodeURIComponent("휴대폰 인증을 마쳤어요")}`);
  };

  return (
    <div className="pb-32">
      <h2 className="mt-4 text-[24px] font-bold leading-snug tracking-[-0.02em]">
        모임 안내를 받을
        <br />
        휴대폰 번호를 인증해 주세요
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">매칭 결과와 식당 안내를 이 번호로 보내요. 다른 참가자에게는 보이지 않아요.</p>

      <div className="mt-8 space-y-3">
        <div className="flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(fmt(e.target.value))}
            inputMode="tel"
            autoComplete="tel"
            placeholder="010-0000-0000"
            aria-label="휴대폰 번호"
            disabled={busy !== null}
            className={input}
          />
          <button
            type="button"
            onClick={send}
            disabled={busy !== null || phone.replace(/\D/g, "").length < 10 || !canResend}
            className="h-[54px] shrink-0 rounded-2xl border border-line bg-card px-4 text-[15px] font-semibold transition disabled:text-muted"
          >
            {busy === "send" ? "보내는 중" : sent ? (canResend ? "다시 받기" : `${Math.ceil((sent.resendAt - now) / 1000)}초`) : "인증번호 받기"}
          </button>
        </div>

        {sent && (
          <div className="relative">
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                if (v.length === 6) check(v);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="인증번호 6자리"
              aria-label="인증번호"
              disabled={busy === "check" || left === 0}
              className={`${input} pr-16 tracking-[0.2em]`}
            />
            <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold tabular-nums ${left < 30 ? "text-danger" : "text-accent"}`}>
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </span>
          </div>
        )}

        {sent?.demoCode && (
          <p className="rounded-2xl bg-candle/15 px-4 py-3 text-[14px] text-[#7a4f00]">
            문자 발송을 연결하기 전이라 시연 모드로 인증번호를 여기 보여드려요: <b className="tracking-[0.15em]">{sent.demoCode}</b>
          </p>
        )}
        {sent && !sent.demoCode && <p className="text-[13px] text-muted">문자가 오지 않으면 번호를 확인하고 30초 뒤 다시 받아 주세요.</p>}
        {err && <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-[14px] font-medium text-danger">{err}</p>}
        {demo && !sent && <p className="text-[12px] text-muted">지금은 시연 모드예요. 실제 문자는 보내지 않아요.</p>}
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md bg-gradient-to-t from-paper via-paper to-paper/0 px-5 pt-6">
        <div className="pb-3">
          <button
            type="button"
            onClick={() => check()}
            disabled={!sent || code.length !== 6 || busy !== null || left === 0}
            className="flex h-[54px] w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-semibold text-white transition active:scale-[.985] disabled:opacity-40"
          >
            {busy === "check" ? "확인하는 중" : "인증하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
