"use client";

import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * 폼을 보내는 동안 '처리 중' 상태. 같은 폼에 name/value 버튼이 여럿이면 누른 버튼에만 표시한다.
 * 보내는 동안에는 다시 누르지 못하게 막는다(두 번 처리 방지)
 */
function usePending(name?: string, value?: Props["value"]) {
  const { pending, data } = useFormStatus();
  if (!pending) return false;
  if (!name || value === undefined || !data) return true;
  return data.get(name) === String(value);
}

function Inner({ children, pending }: { children: Props["children"]; pending: boolean }) {
  return (
    <>
      {pending && <LoaderCircle size={16} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {children}
    </>
  );
}

/** 보내기 버튼(확인 없이). 서버 액션 폼 안에서 쓴다 */
export function SubmitButton({ children, disabled, ...rest }: Props) {
  const { pending: formPending } = useFormStatus();
  const mine = usePending(rest.name, rest.value);
  return (
    <button {...rest} className={`${rest.className ?? ""} disabled:opacity-60`} disabled={disabled || formPending} aria-busy={mine || undefined} data-pending={mine || undefined}>
      <Inner pending={mine}>{children}</Inner>
    </button>
  );
}

/**
 * 되돌릴 수 없는 동작(환불·제한·긴급 수정·초기화)용 버튼. 누르면 한 번 더 묻고, 취소하면 폼을 보내지 않는다.
 * name/value는 그대로 폼에 실린다. 보내는 동안 '처리 중'으로 바뀐다
 */
export function ConfirmButton({ confirm, onClick, children, disabled, ...rest }: Props & { confirm: string }) {
  const { pending: formPending } = useFormStatus();
  const mine = usePending(rest.name, rest.value);
  return (
    <button
      {...rest}
      className={`${rest.className ?? ""} disabled:opacity-60`}
      disabled={disabled || formPending}
      aria-busy={mine || undefined}
      data-pending={mine || undefined}
      onClick={(e) => {
        // 필수 칸이 비어 있으면 브라우저 안내가 먼저 뜨게 한다
        const form = e.currentTarget.form;
        if (form && !form.checkValidity()) return;
        if (!window.confirm(confirm)) e.preventDefault();
        onClick?.(e);
      }}
    >
      <Inner pending={mine}>{children}</Inner>
    </button>
  );
}
