// 예외 처리함 노쇼 후보 카드에 보일 근거(같은 테이블 체크인·'늦을 것 같아요'·단체방 마지막 말)와 추천 조치.
// DB를 읽지 않는 순수 함수만 둔다 (noshow-view.test.ts)
import { fmtClock } from "./format";

export interface NoShowInput {
  /** 이 테이블의 확정 참가자 출석 상태 (본인 포함) */
  members: { userId: string; attendance: string | null }[];
  userId: string;
  startsAt?: string | null;
  /** 이 사람이 '늦을 것 같아요'를 누른 시각 */
  lateAt?: string | null;
  /** 이 사람이 단체방에 마지막으로 쓴 말 */
  lastChat?: { at: string; body: string } | null;
  /** 본인이 '참석했는데 체크인을 못 했어요'라고 알렸나 */
  claimed?: boolean;
}

/** 모임 시작 기준 몇 분 전·뒤 */
export function fromStart(iso: string, startsAt?: string | null): string {
  if (!startsAt) return "";
  const min = Math.round((Date.parse(iso) - Date.parse(startsAt)) / 60_000);
  if (min === 0) return "시작 시각";
  const abs = Math.abs(min);
  const len = abs < 60 ? `${abs}분` : abs % 60 ? `${Math.floor(abs / 60)}시간 ${abs % 60}분` : `${abs / 60}시간`;
  return `시작 ${len} ${min < 0 ? "전" : "뒤"}`;
}

const when = (iso: string, startsAt?: string | null) => {
  const rel = fromStart(iso, startsAt);
  return `${fmtClock(iso)}${rel ? ` (${rel})` : ""}`;
};

const clip = (s: string, n = 40) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

export type NoShowLean = "attended" | "noshow" | "check";

export interface NoShowFacts {
  checkin: string;
  late: string;
  chat: string;
  lean: NoShowLean;
  advice: string;
}

/**
 * 카드 세 줄과 추천. '왜' 칸(체크인 기록이 없어요)을 되풀이하지 않고, 고를 근거와 누를 버튼만 말한다.
 * - 늦는다고 알렸거나 모임 시작 뒤 단체방에서 말했으면: 왔을 가능성이 높다 → 참석으로 정정 쪽
 * - 같은 테이블 다른 사람은 체크인했는데 이 사람만 아무 흔적이 없으면: 노쇼 확정 쪽
 * - 테이블 전원이 체크인을 안 했으면: 체크인이 안 됐을 수 있다 → 먼저 확인
 */
export function noShowFacts(i: NoShowInput): NoShowFacts {
  const others = i.members.filter((m) => m.userId !== i.userId);
  const total = i.members.length || others.length + 1;
  const checked = i.members.filter((m) => m.attendance === "ATTENDED").length;
  const othersChecked = others.filter((m) => m.attendance === "ATTENDED").length;
  const checkin = `같은 테이블 ${total}명 중 ${checked}명 체크인`;
  const late = i.lateAt ? `'늦을 것 같아요' 남김 · ${when(i.lateAt, i.startsAt)}` : "'늦을 것 같아요' 기록 없음";
  const chat = i.lastChat ? `단체방 마지막 말 ${when(i.lastChat.at, i.startsAt)} · "${clip(i.lastChat.body)}"` : "단체방에서 말한 적 없음";
  const spokeDuring = !!(i.lastChat && i.startsAt && Date.parse(i.lastChat.at) >= Date.parse(i.startsAt) - 30 * 60_000);

  let lean: NoShowLean;
  let advice: string;
  if (others.length && othersChecked === 0) {
    lean = "check";
    advice = "같은 테이블 누구도 체크인하지 않았어요. 체크인이 안 됐을 수 있으니 테이블 상세에서 식당 예약과 단체방을 먼저 보고 골라요.";
  } else if (i.claimed || i.lateAt || spokeDuring) {
    lean = "attended";
    const why = [i.claimed && "본인이 참석했다고 알렸어요.", i.lateAt && "늦는다고 미리 알렸어요.", spokeDuring && "모임 무렵 단체방에서 말했어요."].filter(Boolean).join(" ");
    advice = `${why} 왔을 가능성이 높으니 맞으면 '참석으로 정정'을 눌러요. 정정하면 곧 후기 요청이 자동으로 가요.`;
  } else {
    lean = "noshow";
    advice = `늦는다는 연락도, 모임 무렵 단체방 대화도 없어요${othersChecked ? `. 같은 테이블 ${othersChecked}명은 체크인했어요` : ""}. 소명이 없으면 '노쇼 확정'을 눌러요. 확정하면 횟수에 따라 경고·신청 제한이 자동으로 걸려요.`;
  }
  return { checkin, late, chat, lean, advice };
}
