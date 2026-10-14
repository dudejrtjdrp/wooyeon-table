import { db } from "./supabase";

// 앱 내 알림. 푸시는 MVP에서 앱 내 알림함과 같은 내용으로 대신한다.
// dedupeKey가 같으면 두 번 만들지 않는다 (중복 발송 방지)
export async function notify(n: {
  userId: string;
  template: string;
  title: string;
  body: string;
  link?: string;
  dedupeKey?: string;
  scheduledAt?: Date;
}) {
  const row = {
    user_id: n.userId,
    template: n.template,
    title: n.title,
    body: n.body,
    link: n.link ?? null,
    dedupe_key: n.dedupeKey ?? null,
    scheduled_at: (n.scheduledAt ?? new Date()).toISOString(),
    status: n.scheduledAt ? "pending" : "sent",
    sent_at: n.scheduledAt ? null : new Date().toISOString(),
  };
  if (n.dedupeKey) {
    await db().from("notifications").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true });
  } else {
    await db().from("notifications").insert(row);
  }
}
