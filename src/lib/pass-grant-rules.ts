// 운영자가 회원 상세에서 이용권을 직접 처리할 때의 판단 (보상·CS용). DB를 읽지 않는 순수 함수만 둔다 (pass-grant-rules.test.ts)
//
// - 횟수 더하기: 1~5회. 돈으로 산 이용권에는 더하지 않는다. 그 결제를 환불하면 이용권 남은 횟수를 0으로 지우는데
//   (payments.ts refundPayment), 거기에 얹은 보상 횟수까지 같이 사라지기 때문이다.
//   그래서 예전에 운영자가 준 이용권(결제와 이어지지 않은 1회권)이 아직 쓸 수 있으면 거기에 더하고, 없으면 새로 만든다.
//   이용권이 하나도 없는 회원도 같은 방식으로 새로 만든다(돈이 오가지 않는 보상이라 결제 기록은 만들지 않는다).
// - 멤버십 기간 늘리기: 1~30일. 멤버십이 없는 회원에게 새 멤버십을 만들어 주지는 않는다(유료 상품을 새로 주는 일이라 '연장'이 아니다).
//   기한이 이미 지났으면 오늘부터 늘린다(지난 날짜에 더하면 늘려도 못 쓴다).
import { isMembership } from "./constants";

export const GRANT_MAX = 5;
export const EXTEND_MAX_DAYS = 30;
/** 운영자가 준 횟수를 쓸 수 있는 기간. 1회권 유효기간(결제 후 60일)과 같다 */
export const GRANT_VALID_DAYS = 60;
const DAY_MS = 86_400_000;

export type PassRow = { id: string; pass_type: string; remaining: number; total_count: number; expires_at: string | null };

const int = (v: unknown, lo: number, hi: number) => {
  const s = String(v ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= lo && n <= hi ? n : null;
};
/** 더할 횟수 1~5 */
export const parseGrantCount = (v: unknown) => int(v, 1, GRANT_MAX);
/** 늘릴 날 1~30 */
export const parseExtendDays = (v: unknown) => int(v, 1, EXTEND_MAX_DAYS);

export const isLive = (p: Pick<PassRow, "expires_at">, at: Date) => !p.expires_at || Date.parse(p.expires_at) > at.getTime();

/**
 * 화면을 연 때의 이용권 상태. 폼에 실어 보내고 액션이 다시 계산해 다르면 멈춘다
 * (두 번 누르거나 그 사이 다른 운영자가 바꿨을 때 두 번 더해지지 않게)
 */
export function passStamp(passes: PassRow[]): string {
  return [...passes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => `${p.id}:${p.remaining}:${p.total_count}:${p.expires_at ? Date.parse(p.expires_at) : ""}`)
    .join("|");
}

export type GrantPlan =
  | { kind: "add"; passId: string; from: { remaining: number; total: number; expiresAt: string | null }; to: { remaining: number; total: number; expiresAt: string | null } }
  | { kind: "new"; to: { remaining: number; total: number; expiresAt: string } };

/**
 * 횟수를 어디에 더할지. moneyPassIds는 돈을 내고 산 결제(금액 0원 초과)와 이어진 이용권 id.
 * 더한 횟수도 오늘부터 60일은 쓸 수 있게 기한을 맞춘다(원래 기한이 더 길면 그대로)
 */
export function planGrant(passes: PassRow[], moneyPassIds: Set<string>, n: number, at: Date): GrantPlan {
  const minEnd = at.getTime() + GRANT_VALID_DAYS * DAY_MS;
  const target = passes
    .filter((p) => isLive(p, at) && p.pass_type === "single" && !moneyPassIds.has(p.id))
    .sort((a, b) => (b.expires_at ? Date.parse(b.expires_at) : Infinity) - (a.expires_at ? Date.parse(a.expires_at) : Infinity))[0];
  if (!target) return { kind: "new", to: { remaining: n, total: n, expiresAt: new Date(minEnd).toISOString() } };
  // 기한이 없는 이용권이면 그대로 둔다
  const expiresAt = target.expires_at ? (Date.parse(target.expires_at) >= minEnd ? target.expires_at : new Date(minEnd).toISOString()) : null;
  return {
    kind: "add",
    passId: target.id,
    from: { remaining: target.remaining, total: target.total_count, expiresAt: target.expires_at },
    to: { remaining: target.remaining + n, total: target.total_count + n, expiresAt },
  };
}

export type ExtendPlan = { ok: true; passId: string; from: string; to: string; fromToday: boolean } | { ok: false; message: string };

/** 멤버십 기간을 어느 이용권에서 얼마나 늘릴지. 쓸 수 있는 멤버십 중 기한이 가장 늦은 것, 없으면 가장 최근에 끝난 것 */
export function planExtend(passes: PassRow[], days: number, at: Date): ExtendPlan {
  const ms = passes.filter((p) => isMembership(p.pass_type));
  if (!ms.length) return { ok: false, message: "멤버십이 없는 회원이에요. 보상은 '횟수 더하기'로 해 주세요" };
  const pick = [...ms].sort((a, b) => (b.expires_at ? Date.parse(b.expires_at) : 0) - (a.expires_at ? Date.parse(a.expires_at) : 0))[0];
  if (!pick.expires_at) return { ok: false, message: "기한이 없는 멤버십이라 늘릴 필요가 없어요" };
  const end = Date.parse(pick.expires_at);
  const fromToday = end <= at.getTime();
  const base = fromToday ? at.getTime() : end;
  return { ok: true, passId: pick.id, from: pick.expires_at, to: new Date(base + days * DAY_MS).toISOString(), fromToday };
}
