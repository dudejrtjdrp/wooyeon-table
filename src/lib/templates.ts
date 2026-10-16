// 자동 메시지 템플릿. 운영자가 어드민(자동 메시지)에서 문구를 고칠 수 있고, 비워 두면 기본 문구를 쓴다.
// {중괄호} 자리에는 발송할 때 실제 값이 들어간다.
import { db } from "./supabase";

export const TEMPLATES = {
  confirmed: { label: "테이블 확정", when: "자동 매칭으로 테이블이 확정된 직후", channel: "푸시·알림함", title: "테이블이 확정됐어요", body: "{date} {time} {region}에서 만나요. 식당과 단체방 안내를 확인해 주세요.", vars: ["date", "time", "region"] },
  alternative: { label: "매칭 실패", when: "재배치까지 실패한 직후", channel: "푸시·알림함", title: "이번에는 맞는 테이블이 없었어요", body: "{reason} {alternatives}빈자리에 앉거나, 다른 일정으로 옮기거나, 자리가 나길 기다릴 수 있어요(1회권은 보관·환불도 가능, 멤버십은 기간 7일 연장). 3일 안에 고르지 않으면 이번 일정은 넘긴 것으로 하고 1회권은 이용권으로 보관해 드려요.", vars: ["reason", "alternatives"] },
  alternative_remind: { label: "매칭 실패 다시 알림", when: "실패 안내 2일 뒤까지 고르지 않았을 때 1회", channel: "푸시·알림함", title: "내일까지 다음 방법을 골라 주세요", body: "고르지 않으면 내일 이번 일정은 넘긴 것으로 할게요(1회권은 이용권으로 보관, 금액은 그대로). 빈자리에 앉거나 다른 일정으로 옮기거나, 자리가 나길 기다릴 수도 있어요.", vars: [] },
  reminder: { label: "하루 전 안내", when: "모임 24시간 전", channel: "푸시·알림함", title: "내일 저녁 약속 잊지 마세요", body: "{date} {time} {region}. 예약명은 '{reservation}'이에요. 당일 취소는 할 수 없어요.", vars: ["date", "time", "region", "reservation"] },
  reminder_chat: { label: "하루 전 단체방 공지", when: "모임 24시간 전", channel: "단체방", title: "", body: "내일 {time}, {region}에서 만나요. 예약명은 '{reservation}'이에요.\n당일 취소와 단체방 나가기는 할 수 없어요. 늦을 것 같으면 이 방에 미리 알려 주세요.", vars: ["time", "region", "reservation"] },
  feedback: { label: "후기 요청", when: "모임 종료 직후 (참석자만)", channel: "푸시·알림함", title: "오늘 저녁 어떠셨어요?", body: "1분이면 끝나요. 남겨 주신 후기는 다음 매칭에 반영돼요.", vars: [] },
  feedback_remind: { label: "후기 리마인드", when: "종료 24시간 뒤까지 후기가 없을 때 1회", channel: "푸시·알림함", title: "어제 식탁, 한 줄만 남겨 주세요", body: "누구와 또 만나고 싶은지 알려 주시면 다음 테이블을 더 잘 꾸릴 수 있어요.", vars: [] },
} as const;
export type TemplateKey = keyof typeof TEMPLATES;

export async function loadTemplates(): Promise<Record<string, { title?: string; body?: string }>> {
  const { data } = await db().from("settings").select("value").eq("key", "msg.templates").maybeSingle();
  return (data?.value as Record<string, { title?: string; body?: string }>) ?? {};
}

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

/** 템플릿을 실제 문구로. overrides는 loadTemplates() 결과(여러 번 보낼 때 한 번만 읽으려고 받는다) */
export function render(key: TemplateKey, vars: Record<string, string>, overrides: Record<string, { title?: string; body?: string }> = {}) {
  const d = TEMPLATES[key];
  const o = overrides[key] ?? {};
  return { title: fill(o.title?.trim() || d.title, vars), body: fill(o.body?.trim() || d.body, vars) };
}
