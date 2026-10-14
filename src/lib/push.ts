// 웹 푸시. 알림함에 쌓이는 알림을 같은 내용으로 휴대폰에도 보낸다.
// VAPID 키는 처음 필요할 때 서버에서 만들어 settings에 보관한다 (외부 키 발급 없이 바로 동작).
import webpush from "web-push";
import { db } from "./supabase";

let cached: { publicKey: string; privateKey: string } | null = null;

export async function vapid() {
  if (cached) return cached;
  const { data } = await db().from("settings").select("value").eq("key", "push.vapid").maybeSingle();
  if (data?.value?.publicKey) {
    cached = data.value;
    return cached!;
  }
  const keys = webpush.generateVAPIDKeys();
  // 동시에 두 곳에서 만들면 먼저 저장된 쪽을 쓴다
  await db().from("settings").upsert({ key: "push.vapid", value: keys }, { onConflict: "key", ignoreDuplicates: true });
  const { data: again } = await db().from("settings").select("value").eq("key", "push.vapid").single();
  cached = again!.value;
  return cached!;
}

type Payload = { title: string; body: string; url?: string | null; tag?: string };

/** 한 사람의 모든 기기로 보낸다. 만료된 구독은 지운다 */
export async function pushToUsers(userIds: string[], payload: Payload | ((uid: string) => Payload)) {
  if (!userIds.length) return 0;
  const { data: subs } = await db().from("push_subscriptions").select("endpoint,user_id,p256dh,auth").in("user_id", [...new Set(userIds)]);
  if (!subs?.length) return 0;
  const k = await vapid();
  webpush.setVapidDetails("mailto:help@wooyeon-table.app", k.publicKey, k.privateKey);
  let ok = 0;
  await Promise.allSettled(
    subs.map(async (s) => {
      const p = typeof payload === "function" ? payload(s.user_id) : payload;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 3600, timeout: 5000 });
        ok++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db().from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }),
  );
  return ok;
}

/** 방금 보낸 상태가 된 알림들을 푸시로도 보낸다 */
export async function pushNotifications(ids: string[]) {
  if (!ids.length) return;
  const { data } = await db().from("notifications").select("id,user_id,title,body,link").in("id", ids);
  await Promise.allSettled(
    (data ?? []).map((n) => pushToUsers([n.user_id], { title: n.title, body: n.body, url: n.link, tag: n.id })),
  );
}
