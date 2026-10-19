"use client";

import { Copy, KeyRound } from "lucide-react";
import { useActionState, useState } from "react";
import { btnLight, btnPrimary, ctl } from "@/components/admin-ui";
import { ConfirmButton } from "../confirm-button";
import { type AccountState, createAdmin, resetAdminPassword } from "./account-actions";

/** 임시 비밀번호를 한 번만 보여 주는 창. 닫으면 다시 볼 수 없다 */
function OneTimePassword({ done, onClose }: { done: NonNullable<AccountState["done"]>; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(done.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="otp-title" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-[20px] bg-card p-6 shadow-card">
        <p id="otp-title" className="flex items-center gap-2 text-[19px] font-bold text-ink"><KeyRound size={20} className="text-accent" />{done.kind === "created" ? "운영자 계정을 만들었어요" : "비밀번호를 초기화했어요"}</p>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {done.name}님에게 아래 임시 비밀번호를 직접 전해 주세요. 이 창을 닫으면 다시 볼 수 없어요. 메신저 단체방처럼 여러 사람이 보는 곳에는 올리지 말아 주세요.
        </p>
        <dl className="mt-4 space-y-2 rounded-xl bg-paper px-4 py-3 text-[14px]">
          <div className="flex justify-between gap-3"><dt className="text-muted">로그인 ID</dt><dd className="font-semibold text-ink">{done.loginId}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-muted">임시 비밀번호</dt><dd className="font-mono text-[18px] font-bold tracking-wider text-ink">{done.password}</dd></div>
        </dl>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={copy} className={`${btnLight} flex-1`}><Copy size={16} />{copied ? "복사했어요" : "복사하기"}</button>
          <button type="button" onClick={onClose} className={`${btnPrimary} flex-1`}>전했어요, 닫기</button>
        </div>
      </div>
    </div>
  );
}

/** 서버 응답(state)이 새로 올 때마다 창을 다시 연다 */
function useOneTime(state: AccountState) {
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const done = state.done;
  return done && closedAt !== done.at ? { done, close: () => setClosedAt(done.at) } : null;
}

export function CreateAdminForm() {
  const [state, action, pending] = useActionState(createAdmin, {});
  const otp = useOneTime(state);
  return (
    <form action={action} className="grid gap-3 rounded-xl bg-paper p-4 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end">
      <label className="block">
        <span className="text-[13px] font-semibold text-ink">이름</span>
        <input name="name" defaultValue={state.values?.name} required minLength={2} maxLength={20} autoComplete="off" className={`${ctl} mt-1.5 w-full`} placeholder="예: 이지은" />
      </label>
      <label className="block">
        <span className="text-[13px] font-semibold text-ink">로그인 ID</span>
        <input name="login_id" defaultValue={state.values?.login_id} required minLength={3} maxLength={30} pattern="[a-z0-9][a-z0-9._\-]{2,29}" title="영문 소문자·숫자·. _ - 로 3~30자" autoCapitalize="none" autoComplete="off" spellCheck={false} className={`${ctl} mt-1.5 w-full`} placeholder="예: jieun.lee" />
      </label>
      <label className="block">
        <span className="text-[13px] font-semibold text-ink">권한</span>
        <select name="level" defaultValue={state.values?.level ?? "full"} className={`${ctl} mt-1.5 w-full`}>
          <option value="full">전체 권한</option>
          <option value="viewer">조회 전용</option>
        </select>
      </label>
      <button disabled={pending} className={`${btnPrimary} disabled:opacity-60`}>{pending ? "만드는 중" : "운영자 추가"}</button>
      <p className="text-[12px] text-muted sm:col-span-4">비밀번호는 자동으로 만들어서 한 번만 보여 줘요.</p>
      {state.error && <p role="alert" className="text-[13px] font-medium text-danger sm:col-span-4">{state.error}</p>}
      {otp && <OneTimePassword done={otp.done} onClose={otp.close} />}
    </form>
  );
}

export function ResetPasswordForm({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState(resetAdminPassword, {});
  const otp = useOneTime(state);
  return (
    <form action={action} className="inline-flex flex-col items-end">
      <input type="hidden" name="user_id" value={userId} />
      <ConfirmButton disabled={pending} confirm={`${name}님 비밀번호를 초기화할까요? 지금 비밀번호로는 더 이상 로그인할 수 없어요.`} className={`${btnLight} disabled:opacity-60`}>
        {pending ? "바꾸는 중" : "비밀번호 초기화"}
      </ConfirmButton>
      {state.error && <p role="alert" className="mt-1 max-w-[220px] text-right text-[12px] text-danger">{state.error}</p>}
      {otp && <OneTimePassword done={otp.done} onClose={otp.close} />}
    </form>
  );
}
