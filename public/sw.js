// 우연한 식탁 서비스 워커
// - 푸시 알림을 띄우고, 누르면 해당 화면을 연다 (안드로이드·아이폰 홈 화면 앱 공통)
// - 앱 아이콘 배지에 안 읽은 알림 수를 표시한다
// - 인터넷이 끊기면 오프라인 안내 화면을 보여 준다
const VERSION = "wt-v2";
const OFFLINE = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll([OFFLINE, "/icon-192.png", "/badge-96.png"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// 화면 이동만 가로챈다. 항상 네트워크 먼저, 끊겼을 때만 오프라인 화면
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});

async function setBadge(n) {
  try {
    if (typeof n !== "number") return;
    if (n > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch {}
}

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: "우연한 식탁", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(d.title || "우연한 식탁", {
        body: d.body || "",
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        tag: d.tag,
        renotify: Boolean(d.tag && String(d.tag).startsWith("chat-")),
        timestamp: Date.now(),
        vibrate: [80, 40, 80],
        data: { url: d.url || "/notifications" },
      }),
      setBadge(d.badge),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          return c.focus().then((w) => (w && "navigate" in w ? w.navigate(url) : w));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

// 브라우저가 구독을 바꾸면(만료·갱신) 새 구독을 서버에 다시 등록한다
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const key = old && old.options && old.options.applicationServerKey
        ? old.options.applicationServerKey
        : (await (await fetch("/api/push")).json()).publicKey;
      const sub = event.newSubscription || (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      await fetch("/api/push", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), replaces: old && old.endpoint }) });
    })(),
  );
});
