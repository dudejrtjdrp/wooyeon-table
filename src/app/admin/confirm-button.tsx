"use client";

import type { ButtonHTMLAttributes } from "react";

/**
 * 되돌릴 수 없는 동작(환불·제한·긴급 수정·초기화)용 버튼. 누르면 한 번 더 묻고, 취소하면 폼을 보내지 않는다.
 * name/value는 그대로 폼에 실린다.
 */
export function ConfirmButton({ confirm, onClick, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { confirm: string }) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        // 필수 칸이 비어 있으면 브라우저 안내가 먼저 뜨게 한다
        const form = e.currentTarget.form;
        if (form && !form.checkValidity()) return;
        if (!window.confirm(confirm)) e.preventDefault();
        onClick?.(e);
      }}
    />
  );
}
