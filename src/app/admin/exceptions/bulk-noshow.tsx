"use client";

import { useEffect, useState } from "react";
import { ConfirmButton } from "../confirm-button";

const FORM = "bulk-noshow";
const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name=ids][form=${FORM}]`)];

/**
 * 노쇼 후보 한꺼번에 처리. 카드마다 있는 체크박스(form="bulk-noshow")를 세어 버튼과 확인 문구에 넣는다.
 * 처리는 서버에서 건마다 따로 하고, 건마다 처리 이력이 남는다
 */
export function BulkNoShow({ action, back, total }: { action: (f: FormData) => Promise<void>; back: string; total: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sync = () => setN(boxes().filter((b) => b.checked).length);
    sync();
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  }, []);
  const all = n > 0 && n === total;
  const toggle = () => {
    for (const b of boxes()) b.checked = !all;
    setN(all ? 0 : boxes().length);
  };
  return (
    <form id={FORM} action={action} className="shadow-card mt-4 flex flex-wrap items-center gap-2 rounded-[20px] bg-card p-4 ring-1 ring-warn/40">
      <input type="hidden" name="back" value={back} />
      <p className="min-w-0 flex-1 basis-56 text-[14px] text-ink">
        <b className="font-semibold">노쇼 후보 {total}건</b>
        <span className="text-muted"> · 카드 왼쪽 위 칸을 골라 한꺼번에 처리해요. {n ? `${n}건 고름` : "아직 고른 건이 없어요"}</span>
      </p>
      <button type="button" onClick={toggle} className="h-10 rounded-xl border border-line px-4 text-[13px] font-semibold text-ink">{all ? "모두 풀기" : "모두 고르기"}</button>
      <ConfirmButton name="action" value="attended" disabled={!n} confirm={`고른 ${n}건을 참석으로 정정해요. 곧 후기 요청이 자동으로 가요. 계속할까요?`} className="h-10 rounded-xl border border-accent/40 px-4 text-[13px] font-semibold text-accent">{n ? `${n}건 ` : ""}참석으로 정정</ConfirmButton>
      <ConfirmButton name="action" value="noshow" disabled={!n} confirm={`고른 ${n}건을 노쇼로 확정해요. 사람마다 노쇼 횟수에 따라 경고나 신청 제한이 바로 걸려요. 계속할까요?`} className="h-10 rounded-xl bg-accent px-4 text-[13px] font-semibold text-white">{n ? `${n}건 ` : ""}노쇼 확정</ConfirmButton>
    </form>
  );
}
