// Demo server: `npm run demo`, then open http://localhost:5173 (phones need HTTPS, e.g. a tunnel).
// Sends COOP/COEP so WebAssembly can use several cores, serves the repo files and the assets under /ktp-kit/.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {spawn} from "node:child_process";
import {prefill} from "./prefill.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const assets = path.join(root, "apps/demo/ktp-kit");  // filled by: npx ktp-kit assets apps/demo/ktp-kit
// Self-hosted fonts (cross-origin isolation blocks font CDNs): /fonts/<file> from the @fontsource packages.
const FONT_DIRS = ["node_modules/@fontsource-variable/ibm-plex-sans/files", "node_modules/@fontsource/ibm-plex-mono/files"];
const font = name => FONT_DIRS.map(d => path.join(root, d, name)).find(f => fs.existsSync(f));
const types = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".wasm": "application/wasm", ".csv": "text/csv", ".json": "application/json", ".woff2": "font/woff2", ".css": "text/css"};

// Tailwind rebuilds apps/demo/app.build.css whenever the page or app.css changes.
spawn(process.execPath, [path.join(root, "node_modules/@tailwindcss/cli/dist/index.mjs"), "-i", path.join(root, "apps/demo/app.css"),
  "-o", path.join(root, "apps/demo/app.build.css"), "--watch=always"], {cwd: root, stdio: "inherit"});

// The page's ?debug mode posts what happens on the phone here: /log (JSON lines) and /log/card (the card crop).
// Dev only, kept outside the repo. It can hold a real card, so delete the folder after testing.
const logDir = path.join(os.tmpdir(), "ktp-kit-debug");
fs.mkdirSync(logDir, {recursive: true});

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (req.method === "POST" && (url === "/log" || url === "/log/card")) {
    const parts = [];
    let size = 0;
    req.on("data", c => { size += c.length; if (size <= 10e6) parts.push(c); });
    req.on("end", () => {
      const body = Buffer.concat(parts);
      if (url === "/log") fs.appendFileSync(path.join(logDir, "log.jsonl"), body.toString("utf8").replace(/\n/g, " ") + "\n");
      else fs.writeFileSync(path.join(logDir, `card-${Date.now()}.jpg`), body);
      res.writeHead(204); res.end();
    });
    return;
  }
  const file = url === "/" ? path.join(root, "apps/demo/index.html") : url === "/docs" ? path.join(root, "apps/demo/docs.html")
    : url === "/sw.js" || url === "/favicon.ico" ? path.join(root, "apps/demo", url)
    : url.startsWith("/fonts/") ? font(path.basename(url)) ?? ""
    : url.startsWith("/ktp-kit/") ? path.join(assets, url.slice(9)) : path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {"Content-Type": types[path.extname(file)] || "application/octet-stream",
    "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp", "Cache-Control": "no-cache"});
  if (file.endsWith(path.join("apps", "demo", "index.html"))) return res.end(prefill(fs.readFileSync(file, "utf8")));  // copy in the HTML
  fs.createReadStream(file).pipe(res);
}).listen(5173, "127.0.0.1", () => console.log(`ktp-kit demo on http://localhost:5173 (?debug logs to ${logDir})`));
