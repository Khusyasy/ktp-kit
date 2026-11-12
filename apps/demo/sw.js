// Keeps the demo page itself on the device, so it reloads with no internet. ktp-kit already stores its models
// (Cache API, "ktp-kit-*"). This worker adds the page, its scripts, styles and fonts.
// Network first, so a deploy shows at once. Cache second, so offline still works.
const CACHE = "ktp-kit-demo-v1";
const BIG = /\.(onnx|wasm|csv)(\.gz|\.br)?$/;  // kept by ktp-kit's own cache, not copied again here

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// The page sends the files it already loaded (they were fetched before this worker took over).
self.addEventListener("message", e => {
  const urls = (e.data?.cache || []).filter(u => new URL(u, self.location).origin === self.location.origin && !BIG.test(u));
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(urls.map(u => c.add(u).catch(() => {})))));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  // no-store: the page's own "am I offline?" check must really reach the network
  if (req.method !== "GET" || req.cache === "no-store" || new URL(req.url).origin !== self.location.origin) return;
  if (BIG.test(req.url)) return;  // models: ktp-kit's engine handles them (and a slow download must not be cut off)
  e.respondWith((async () => {
    try {
      // Wi-Fi with no internet can hang: give up after 4 s without an answer (a slow body is fine)
      const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 4000))]);
      if (res.ok && !BIG.test(req.url)) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await caches.match(req, {ignoreSearch: req.mode === "navigate"});  // also finds ktp-kit's model cache
      if (hit) return hit;
      throw err;
    }
  })());
});
