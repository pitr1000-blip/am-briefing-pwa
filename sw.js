const CACHE_NAME = "am-briefing-v2";
const STATIC_ASSETS = [
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./og-image.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // /api/* 는 실시간 시세·수급·기술적 지표 등 "매 방문마다 새로 조회돼야
  // 하는" 데이터라서, 서비스워커가 아예 관여하지 않고 브라우저가 평소처럼
  // 네트워크로 바로 보내게 둡니다 (캐시하지 않음).
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  const isPage =
    event.request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith("/index.html");

  if (isPage) {
    // 매일 아침 갱신되는 브리핑 본문은 "네트워크 우선"으로 바꿨어요.
    // 예전 버전(캐시 우선)은 한 번 캐시되면 서버가 갱신돼도 계속 옛날
    // 화면을 보여주는 문제가 있었습니다. 온라인일 땐 항상 최신을 받고,
    // 오프라인일 때만 마지막으로 받아둔 캐시로 대체해요.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 아이콘/매니페스트처럼 거의 안 바뀌는 정적 자산은 캐시 우선 유지.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
