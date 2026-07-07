/* eslint-disable */
// ============================================================================
// 📱 ZONO — Service Worker — offline READ cache. PHASE 57.0.
// Network-first for navigations/pages (fresh when online, cached fallback when
// offline), cache-first for static assets. NEVER caches API/auth/mutating
// requests — writes go through the app's approved offline QUEUE, never the SW.
// ============================================================================
const CACHE = "zono-cache-v1";
const OFFLINE_URLS = ["/today", "/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

function isCacheable(req) {
  if (req.method !== "GET") return false;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;
  // Never touch API / auth / mutations — those must stay online + approval-gated.
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/auth/")) return false;
  return true;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!isCacheable(req)) return; // let the network handle it (no offline writes)

  const isNavigation = req.mode === "navigate";
  if (isNavigation) {
    // Network-first: fresh page online, cached fallback offline.
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((m) => m || caches.match("/today"))),
    );
    return;
  }

  // Static assets: cache-first, then network.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => cached)),
  );
});

// Push (mock-safe): only reacts if a real push arrives; no keys bundled.
self.addEventListener("push", (event) => {
  let data = { title: "ZONO", body: "עדכון חדש" };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title || "ZONO", { body: data.body || "", dir: "rtl", lang: "he" }));
});
