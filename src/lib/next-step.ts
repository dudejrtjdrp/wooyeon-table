// 참가자가 '다음에 무슨 일이 생기지, 지금 뭘 하면 되지'를 고민하지 않게, 상태마다 다음 일과 그 시각, 지금 할 수 있는 일을 한 문장씩 정한다.
// 홈 카드와 신청 상세가 같은 문장을 쓴다. DB 없이 계산만 한다 (next-step.test.ts)
import { CHECKIN_OPEN_BEFORE } from "./attendance-rules";
import { fmtSlot } from "./format";
import { beforeMatchCutoff } from "./cancel-rules";
import { refundCutoff } from "./policy";

export type NextInput = {
  application_status: string;
  payment_status: string;
  match_status: string;
  attendance_status: string | null;
  resolution?: string | null;
  /** 회차: 결과 나오는 시각(= 매칭 마감), 신청 마감 */
  matchAt: string;
  applyDeadline?: string | null;
  /** 회차 상태. 매칭이 이미 끝났는데 대기로 남은 신청은 운영팀이 확인 중이라 여기서 따로 약속하지 않는다 (status.ts headline과 같은 기준) */
  roundStatus?: string | null;
  /** 확정된 테이블의 모임 시각 */
  startsAt?: string | null;
  endsAt?: string | null;
  /** 고른 일정들의 시작 시각 (매칭 전 취소 마감 = 매칭 시각과 환불 마감 중 이른 쪽) */
  starts?: string[];
  /** 멤버십으로 낸 신청. 매칭 실패 때 보관·환불 대신 기간 연장 */
  membership?: boolean;
  /** 매칭 실패 뒤 고르지 않으면 정리되는 시각 */
  keepAt?: string | null;
};

export type NextStep = {
  /** 다음에 일어날 일. when이 있으면 그 시각에, 없으면 '정해지는 대로' */
  next: { when: string | null; text: string } | null;
  /** 지금 할 수 있는 일 (없으면 '지금은 하실 일이 없어요' 한 줄) */
  can: string;
};

const IDLE = "지금은 하실 일이 없어요. 바뀌면 알림으로 먼저 알려 드려요.";

export function nextStep(a: NextInput, t: Date): NextStep | null {
  if (a.application_status === "CANCELED" || a.attendance_status?.startsWith("CANCELED")) return null;
  if (["TRANSFERRED", "NO_MATCH", "EXCEPTION"].includes(a.match_status)) return null;
  const matchAt = new Date(a.matchAt);
  const unpaid = a.payment_status === "PENDING" || a.payment_status === "FAILED";

  if (unpaid) {
    if (matchAt <= t) return null; // 결제 전 마감: 화면이 따로 안내한다
    const dl = a.applyDeadline && new Date(a.applyDeadline) > t && new Date(a.applyDeadline) <= matchAt ? a.applyDeadline : a.matchAt;
    return {
      next: { when: fmtSlot(dl), text: `까지 결제해야 이번 테이블에 들어가요. 결제를 마치면 ${fmtSlot(a.matchAt)}에 테이블이 정해져요.` },
      can: "결제를 이어서 해 주세요. 결제 전이라 취소해도 빠져나가는 돈이 없어요.",
    };
  }
  // 환불 중·끝(환불 가능 REFUND_AVAILABLE은 아직 고르는 중이라 빼지 않는다)
  if (["REFUND_REQUESTED", "REFUND_PROCESSING", "REFUNDED", "REFUND_FAILED"].includes(a.payment_status)) return null;

  switch (a.match_status) {
    case "WAITING":
    case "MATCHING":
      if (a.roundStatus && a.roundStatus !== "open" && a.roundStatus !== "matching") return null;
      if (matchAt > t) {
        const cut = beforeMatchCutoff(a.matchAt, a.starts ?? []);
        const refund = a.membership ? "횟수 차감 없이 취소돼요" : "전액 돌려드려요";
        return {
          next: { when: fmtSlot(a.matchAt), text: "에 신청한 분들을 한 번에 4~6명 테이블로 나눠요. 인원이 먼저 찬다고 일찍 열리지 않아요. 정해지면 바로 알림이 가고, 식당·주소와 단체방도 그때 함께 열려요." },
          can: cut > t
            ? `${fmtSlot(cut.toISOString())}까지는 신청을 취소하면 ${refund}. 동네나 날짜를 바꾸려면 취소하고 다시 신청해 주세요.`
            : "환불 마감(모임 주 화요일 밤 12시)이 지나 이제는 신청을 취소할 수 없어요. 결과가 나오면 바로 알려 드려요.",
        };
      }
      return {
        next: { when: null, text: "테이블을 다 꾸리면 바로 알림을 보내 드려요. 식당·주소와 단체방도 그때 함께 열려요." },
        can: IDLE,
      };
    case "REALLOCATING":
      return {
        next: { when: null, text: "고른 날짜·동네 안에서 다른 테이블을 찾는 대로 알림을 보내 드려요. 끝내 없으면 다른 일정·이용권 보관·환불 중에 고를 수 있어요." },
        can: IDLE,
      };
    case "ALTERNATIVE_OFFERED":
      if (a.membership) {
        const by = a.keepAt ? `${fmtSlot(a.keepAt)}까지` : "안내를 받은 뒤 3일 안에";
        return a.resolution === "wait"
          ? { next: { when: null, text: "고른 일정에 자리가 나면 알림으로 먼저 여쭤봐요. 끝내 자리가 없으면 이번 일정은 넘긴 것으로 할게요. 멤버십 기간은 7일 늘려 드렸어요." }, can: "기다리지 않고 빈자리에 앉거나 다른 일정으로 옮길 수 있어요." }
          : { next: { when: null, text: `${by} 고르지 않으면 이번 일정은 넘긴 것으로 할게요. 멤버십 기간은 7일 늘려 드렸어요.` }, can: "빈자리에 앉거나 다른 일정으로 옮기거나, 이번은 넘기고 다음에 신청해 주세요." };
      }
      if (a.resolution === "wait")
        return {
          next: { when: null, text: "고른 일정에 자리가 나면 알림으로 먼저 여쭤봐요. 끝내 자리가 없으면 이용권으로 보관해 드려요." },
          can: "기다리지 않고 다른 방법(일정 옮기기·보관·환불)으로 바꿀 수 있어요.",
        };
      return {
        next: { when: null, text: `${a.keepAt ? `${fmtSlot(a.keepAt)}까지` : "안내를 받은 뒤 3일 안에"} 고르지 않으면 이용권으로 보관해 드려요. 빠져나가는 돈은 없어요.` },
        can: "다른 일정으로 옮기기·이용권 보관·환불 중에 골라 주세요. 옮기면 다시 결제하지 않아요.",
      };
    case "CONFIRMED":
      return confirmedStep(a, t);
  }
  return null;
}

function confirmedStep(a: NextInput, t: Date): NextStep | null {
  if (!a.startsAt) return null;
  const start = new Date(a.startsAt);
  const end = a.endsAt ? new Date(a.endsAt) : new Date(start.getTime() + 150 * 60_000);
  if (t >= end || a.attendance_status === "NO_SHOW") return null; // 끝난 뒤는 홈의 '어땠어요?' 카드가 맡는다
  const cutoff = refundCutoff(a.startsAt);
  const dayBefore = new Date(start.getTime() - 24 * 3600_000);
  const checkInAt = new Date(start.getTime() - CHECKIN_OPEN_BEFORE);
  const attended = a.attendance_status === "ATTENDED";

  if (t < dayBefore)
    return {
      next: { when: fmtSlot(dayBefore.toISOString()), text: "에 시간·장소·예약명을 알림과 단체방으로 한 번 더 보내 드려요." },
      can: t < cutoff
        ? `단체방에서 먼저 인사해 보세요. ${fmtSlot(cutoff.toISOString())}까지는 참석을 취소하면 전액 환불돼요.`
        : "단체방에서 먼저 인사해 보세요. 환불 마감이 지나 이제 취소하면 환불은 안 돼요.",
    };
  if (t < checkInAt)
    return {
      next: { when: fmtSlot(checkInAt.toISOString()), text: "부터 체크인 버튼이 열려요. 식당에 도착하면 눌러 주세요." },
      can: "늦을 것 같으면 단체방의 '늦을 것 같아요'로 미리 알려 주세요. 당일 취소는 안 돼요.",
    };
  if (t < start)
    return {
      next: { when: fmtSlot(a.startsAt), text: "에 모임이 시작되면 오늘의 대화 주제와 아이스브레이킹이 모임 정보와 단체방에 열려요." },
      can: attended ? "체크인했어요. 먼저 온 분들과 인사 나눠 보세요." : "식당에 도착하면 체크인해 주세요.",
    };
  return {
    next: { when: fmtSlot(end.toISOString()), text: "에 모임이 끝나면 오늘 저녁이 어땠는지 묻는 알림을 보내 드려요." },
    can: attended ? "모임 정보의 '지금 테이블에서'에 오늘 나눌 이야기가 있어요." : "도착했다면 체크인해 주세요. 체크인해야 참석으로 남아요.",
  };
}
