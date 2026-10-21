// 자동 메시지 문구를 비슷한 주제끼리 묶는다. 템플릿 키 이름(접두어)으로 나눈다. DB를 읽지 않는 순수 함수 (message-groups.test.ts)

export const MESSAGE_GROUPS = [
  { key: "apply", label: "신청·결제" },
  { key: "match", label: "매칭" },
  { key: "meet", label: "모임 안내" },
  { key: "refund", label: "취소·환불" },
  { key: "after", label: "후기·다음 모임" },
  { key: "ops", label: "운영 공지" },
  { key: "etc", label: "기타" },
] as const;
export type MessageGroupKey = (typeof MESSAGE_GROUPS)[number]["key"];

// 이름만 봐서는 갈래가 애매한 키는 직접 정한다
const EXACT: Record<string, MessageGroupKey> = {
  applied: "apply",
  confirmed: "match", joined: "match", waiting: "match", transferred: "match", membership_extended: "match",
  checkin_nudge: "meet", meeting_start: "meet",
  canceled: "refund", attendance_canceled: "refund", round_canceled: "refund", kept: "refund",
  next_round: "after", region_open: "after", pass_expiry: "after",
  announcement: "ops", round_changed: "ops", pass_granted: "ops", membership_granted: "ops", noshow_warn: "ops", noshow_restrict: "ops", admin_removed: "ops",
};
// 나머지는 앞부분으로 (앞에서부터 처음 맞는 것)
const PREFIX: [string, MessageGroupKey][] = [
  ["paid", "apply"], ["payment", "apply"],
  ["alternative", "match"], ["realloc", "match"], ["seat_offer", "match"],
  ["reminder", "meet"], ["venue", "meet"],
  ["refund", "refund"],
  ["feedback", "after"],
];

/** 템플릿 키가 어느 묶음인지. 모르는 키는 '기타' */
export function groupOf(key: string): MessageGroupKey {
  if (EXACT[key]) return EXACT[key];
  return PREFIX.find(([p]) => key.startsWith(p))?.[1] ?? "etc";
}

export const groupLabel = (g: MessageGroupKey) => MESSAGE_GROUPS.find((x) => x.key === g)!.label;

export type MessageGroup = {
  key: MessageGroupKey;
  label: string;
  keys: string[];
  /** 최근 실패한 알림 수 (묶음 전체) */
  failed: number;
  /** 최근에 문구를 고친 템플릿 수 */
  changed: number;
  /** 처음부터 펼쳐 둘지: 실패나 최근 수정이 있으면 */
  open: boolean;
};

/**
 * 템플릿 키를 묶음 순서대로 나눈다. 빈 묶음은 뺀다. 묶음 안 순서는 들어온 순서 그대로.
 * failed: 키별 최근 실패 수, changed: 최근에 고친 키
 */
export function groupTemplates(keys: string[], opts: { failed?: Record<string, number>; changed?: Iterable<string> } = {}): MessageGroup[] {
  const failed = opts.failed ?? {};
  const changed = new Set(opts.changed ?? []);
  return MESSAGE_GROUPS.map(({ key, label }) => {
    const ks = keys.filter((k) => groupOf(k) === key);
    const f = ks.reduce((n, k) => n + (failed[k] ?? 0), 0);
    const c = ks.filter((k) => changed.has(k)).length;
    return { key, label, keys: ks, failed: f, changed: c, open: f > 0 || c > 0 };
  }).filter((g) => g.keys.length > 0);
}
