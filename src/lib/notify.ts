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
  const save = () =>
    n.dedupeKey
      ? db().from("notifications").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id")
      : db().from("notifications").insert(row).select("id");
  let { data, error } = await save();
  // 알림함 저장이 실패하면 잠깐 뒤 한 번 더 (INF-08). 그래도 안 되면 운영자 예외로 남긴다
  if (error) {
    await new Promise((r) => setTimeout(r, 400));
    ({ data, error } = await save());
    if (error) {
      console.error("[notify] 알림 저장 실패", n.template, error.message);
      await db()
        .from("exceptions")
        .upsert(
          { kind: "notification", ref_type: "user", ref_id: n.userId, reason: `'${n.title}' 알림을 알림함에 넣지 못했어요 (${error.message})`, dedupe_key: `inbox:${n.dedupeKey ?? `${n.userId}:${n.template}:${Date.now()}`}` },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        )
        .then(() => null, () => null);
      return;
    }
  }
  if (!n.scheduledAt && data?.length) await pushNotifications(data.map((d) => d.id)).catch(() => null);
}
