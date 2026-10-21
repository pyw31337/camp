// 모여라캠핑 오프라인 보관(t39 #42). 원칙: 항상 네트워크 먼저(최신 데이터가 우선), 끊겼을 때만 마지막으로 받은 사본을 보여 준다.
// 같은 출처 GET만 다룬다. 외부(지도 타일·예약 사이트·Supabase)는 건드리지 않는다.
const CACHE = "camp-offline-v1";
const BASE = new URL("./", self.location).pathname; // /camp/
const KEEP = (u) => u.origin === self.location.origin && u.pathname.startsWith(BASE) && !u.pathname.includes("/media/") &&
  (/\.(js|css|json|svg|webmanifest|png)$/.test(u.pathname) || !/\.[a-z0-9]+$/i.test(u.pathname));
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("camp-offline-") && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || !KEEP(u)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === "navigate" ? BASE : u.origin + u.pathname; // 앱 화면은 하나(경로 라우팅), 쿼리(?t=)는 무시
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(key, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(key);
      if (hit) return hit;
      throw err;
    }
  })());
});
