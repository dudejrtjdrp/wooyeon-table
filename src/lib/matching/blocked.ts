import { fmtDay } from "../format";

/**
 * 계정 상태 때문에 매칭에서 빼야 하면 그 까닭(운영자용 문구), 아니면 null.
 * 영구 제한, 또는 기한이 남았거나 기한이 없는 신청 제한. 기한이 지난 제한은 풀린 것으로 본다(정상 참가자를 빼지 않게)
 */
export function blockedReason(status: string | undefined, restrictedUntil: string | null, at: Date): string | null {
  if (status === "banned") return "영구 제한된 계정이라 매칭에서 뺐어요. 결제를 돌려주고 안내해 주세요";
  if (status !== "restricted") return null;
  if (restrictedUntil && new Date(restrictedUntil) <= at) return null;
  return `신청 제한 중(${restrictedUntil ? `${fmtDay(restrictedUntil)}까지` : "기한 없음"})이라 매칭에서 뺐어요. 환불하거나 제한을 풀고 다른 일정으로 안내해 주세요`;
}
