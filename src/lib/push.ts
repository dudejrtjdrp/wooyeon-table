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

type Payload = { title: string; body: string; url?: string | null; tag?: string; badge?: number };

// 애플 푸시 서버는 subject가 실제 연락처여야 받는다 (localhost 등은 거절)
const subject = () => (process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL : "mailto:help@wooyeon-table.app");

export type PushResult = { devices: number; ok: number; failed: number; error: string | null };

/** 한 사람의 모든 기기로 보낸다. 만료된 구독(404·410)은 지우고 실패로 세지 않는다 */
export async function sendPush(userIds: string[], payload: Payload | ((uid: string) => Payload)): Promise<PushResult> {
  const r: PushResult = { devices: 0, ok: 0, failed: 0, error: null };
  if (!userIds.length) return r;
  const { data: subs, error: subErr } = await db().from("push_subscriptions").select("endpoint,user_id,p256dh,auth").in("user_id", [...new Set(userIds)]);
  if (subErr) return { ...r, failed: 1, error: `구독 조회 실패: ${subErr.message}` };
  if (!subs?.length) return r;
  r.devices = subs.length;
  const k = await vapid();
  webpush.setVapidDetails(subject()!, k.publicKey, k.privateKey);
  await Promise.allSettled(
    subs.map(async (s) => {
      const p = typeof payload === "function" ? payload(s.user_id) : payload;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 24 * 3600, urgency: "high", timeout: 8000 });
        r.ok++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          r.devices--;
          await db().from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          r.failed++;
          r.error = `${code ?? "네트워크"} ${(e as Error).message ?? ""}`.trim().slice(0, 200);
        }
      }
    }),
  );
  return r;
}

/** 예전 호출부용: 보낸 기기 수만 돌려준다 */
export async function pushToUsers(userIds: string[], payload: Payload | ((uid: string) => Payload)) {
  return (await sendPush(userIds, payload)).ok;
}

/**
 * 방금 보낸 상태가 된 알림들을 푸시로도 보낸다 (INF-01, INF-08).
 * 기기가 있는데 한 대도 못 받으면 실패로 기록해 스케줄러가 다시 보내게 한다. 기기가 없는 사람은 앱 알림함만으로 끝.
 */
export async function pushNotifications(ids: string[]) {
  if (!ids.length) return;
  const { recordPushFailure, recordPushRecovered } = await import("./delivery");
  const { QUIET_TEMPLATES } = await import("./templates");
  const { data: rows } = await db().from("notifications").select("id,user_id,template,title,body,link,attempts,last_error").in("id", ids);
  // 알림함에만 남기는 알림(방금 직접 한 일의 확인 등)은 휴대폰으로 보내지 않는다
  const data = (rows ?? []).filter((n) => !QUIET_TEMPLATES.has(n.template));
  // 아이콘 배지에 띄울 안 읽은 알림 수 (사람별)
  const users = [...new Set((data ?? []).map((n) => n.user_id))];
  const unread = new Map<string, number>();
  await Promise.all(
    users.map(async (u) => {
      const { count } = await db().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", u).eq("status", "sent").is("read_at", null);
      unread.set(u, count ?? 0);
    }),
  );
  await Promise.allSettled(
    (data ?? []).map(async (n) => {
      let r: PushResult;
      try {
        r = await sendPush([n.user_id], { title: n.title, body: n.body, url: n.link, tag: n.id, badge: unread.get(n.user_id) });
      } catch (e) {
        r = { devices: 1, ok: 0, failed: 1, error: e instanceof Error ? e.message : String(e) };
      }
      if (r.ok > 0) {
        if (n.last_error?.startsWith("푸시 실패")) await recordPushRecovered(n);
      } else if (r.failed > 0) {
        await recordPushFailure(n, r.error ?? "알 수 없는 오류");
      }
    }),
  );
}
