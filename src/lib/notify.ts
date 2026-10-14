import { pushNotifications } from "./push";
import { db } from "./supabase";

// 앱 내 알림. 바로 보내는 알림은 등록된 휴대폰으로 푸시도 함께 보낸다.
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
  const { data } = n.dedupeKey
    ? await db().from("notifications").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id")
    : await db().from("notifications").insert(row).select("id");
  if (!n.scheduledAt && data?.length) await pushNotifications(data.map((d) => d.id)).catch(() => null);
}
