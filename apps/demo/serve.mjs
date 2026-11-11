// Demo server: `npm run demo`, then open http://localhost:5173 (phones need HTTPS, e.g. a tunnel).
// Sends COOP/COEP so WebAssembly can use several cores, serves the repo files and the assets under /ktp-kit/.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const assets = path.join(root, "apps/demo/ktp-kit");  // filled by: npx ktp-kit assets apps/demo/ktp-kit
const types = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".wasm": "application/wasm", ".csv": "text/csv", ".json": "application/json"};

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = url === "/" ? path.join(root, "apps/demo/index.html")
    : url.startsWith("/ktp-kit/") ? path.join(assets, url.slice(9)) : path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {"Content-Type": types[path.extname(file)] || "application/octet-stream",
    "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp", "Cache-Control": "no-cache"});
  fs.createReadStream(file).pipe(res);
}).listen(5173, "127.0.0.1", () => console.log("ktp-kit demo on http://localhost:5173"));
