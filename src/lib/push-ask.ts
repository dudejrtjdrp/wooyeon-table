// 휴대폰 알림을 '처음 들어왔을 때 한 번' 물어볼지 정한다 (성효님 결정 2026-10-21: 홈에 카드를 계속 두지 않는다).
// DB 없이 계산만 한다 (push-ask.test.ts)

export type PushEnv = {
  /** 이 브라우저가 웹 푸시를 지원하는지 */
  supported: boolean;
  /** Notification.permission */
  permission: "default" | "granted" | "denied";
  /** 이미 이 기기로 구독했는지 */
  subscribed: boolean;
  /** 이 기기·이 방식(앱/브라우저)에서 이미 물어봤는지 */
  asked: boolean;
};

/** 물어볼지. 이미 켰거나 막았거나 물어본 적 있으면 다시 묻지 않는다. 지원 안 하는 곳(아이폰 Safari 탭 등)은 묻지 않는다 */
export function shouldAskPush(e: PushEnv): boolean {
  if (!e.supported || e.asked || e.subscribed) return false;
  return e.permission === "default";
}

/** 물어봤다는 표시. 아이폰은 홈 화면에 추가한 앱에서만 알림이 되니, 앱으로 처음 열 때 한 번 더 물을 수 있게 방식별로 따로 둔다 */
export const askedKey = (standalone: boolean) => `wt_push_asked:${standalone ? "app" : "web"}`;
