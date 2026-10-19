"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { cancelAttendance, declineReallocation } from "@/lib/attendance";
import { cancelBeforeMatch } from "@/lib/cancel";

/**
 * 매칭 전 신청 취소. 매칭 시각 전, 매칭 대기 상태일 때만 된다.
 * 결제했으면 이용권 1회를 돌려주거나(정기권) 원결제수단으로 환불(모의)한다. 운영자 대리 취소와 같은 함수(lib/cancel.ts)를 쓴다.
 */
export async function cancelApplication(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const r = await cancelBeforeMatch(appId, { actor: `user:${me.id}`, reason: "매칭 전 취소", ownerId: me.id });
  if (r.notFound) redirect("/");
  if (!r.ok) redirect(`/applications/${appId}?e=${encodeURIComponent(r.message)}`);
  redirect(`/applications/${appId}`);
}

/** 확정된 모임 참석 취소 (모임 주 화요일 24:00 전까지 전액 환불, 그 뒤는 환불 없음, 당일 불가) */
export async function cancelAttendanceAction(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const back = String(form.get("back") ?? `/applications/${appId}`);
  const r = await cancelAttendance(appId, me.id);
  redirect(r.ok ? `/applications/${appId}?m=${encodeURIComponent("참석을 취소했어요")}` : `${back}?e=${encodeURIComponent(r.message)}`);
}

/** 자동으로 옮겨진 테이블이 싫을 때: 매칭 실패 상태로 돌려 다른 방법(이동·기다리기·보관·환불)을 고르게 한다 */
export async function declineReallocationAction(form: FormData) {
  const me = await requireProfile();
  const appId = String(form.get("app_id"));
  const r = await declineReallocation(appId, me.id);
  if (!r.ok) redirect(`/applications/${appId}?e=${encodeURIComponent(r.message)}`);
  redirect(`/applications/${appId}/resolve`);
}
