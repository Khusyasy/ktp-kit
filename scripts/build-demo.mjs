// Builds the public demo into apps/demo/dist, ready for static hosting with custom headers (Cloudflare Pages:
// `npx wrangler pages deploy apps/demo/dist --project-name ktp-kit`). Everything is served from the same origin,
// which cross-origin isolation (COOP/COEP, needed for multi-threaded WebAssembly) requires.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, ".."), dist = path.join(root, "apps/demo/dist");
fs.rmSync(dist, {recursive: true, force: true});
fs.mkdirSync(path.join(dist, "lib"), {recursive: true});

// 1. Library code and the onnxruntime-web browser build.
fs.cpSync(path.join(root, "packages/ktp-kit/src"), path.join(dist, "lib/ktp-kit"), {recursive: true});
fs.copyFileSync(path.join(root, "node_modules/onnxruntime-web/dist/ort.wasm.min.mjs"), path.join(dist, "lib/ort.wasm.min.mjs"));

// 2. Models + runtime under /ktp-kit/ (fails clearly if @ktp-kit/models has no model files yet).
try {
  execFileSync(process.execPath, [path.join(root, "packages/ktp-kit/bin/cli.js"), "assets", path.join(dist, "ktp-kit")], {stdio: "inherit"});
} catch {
  process.exit(1);  // the CLI already said what is missing
}

// 3. Styles (Tailwind v4, minified) and the self-hosted font.
execFileSync(process.execPath, [path.join(root, "node_modules/@tailwindcss/cli/dist/index.mjs"), "-i", path.join(root, "apps/demo/app.css"),
  "-o", path.join(dist, "app.css"), "--minify"], {stdio: "inherit"});
fs.mkdirSync(path.join(dist, "fonts"));
for (const [dir, name] of [["@fontsource-variable/ibm-plex-sans", "ibm-plex-sans-latin-wght-normal.woff2"],
  ["@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-400-normal.woff2"], ["@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-500-normal.woff2"]])
  fs.copyFileSync(path.join(root, "node_modules", dir, "files", name), path.join(dist, "fonts", name));

// 4. The page, with its import map pointed at the copied files.
const html = fs.readFileSync(path.join(root, "apps/demo/index.html"), "utf8")
  .replaceAll("/node_modules/onnxruntime-web/dist/ort.wasm.min.mjs", "/lib/ort.wasm.min.mjs")
  .replaceAll("/packages/ktp-kit/src/", "/lib/ktp-kit/")
  .replaceAll("/apps/demo/app.build.css", "/app.css");
fs.writeFileSync(path.join(dist, "index.html"), html);
fs.copyFileSync(path.join(root, "apps/demo/sw.js"), path.join(dist, "sw.js"));  // keeps the page itself for offline reloads

// 5. Headers: cross-origin isolation everywhere, long caching for the big files (their names change with versions).
fs.writeFileSync(path.join(dist, "_headers"), `/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  X-Content-Type-Options: nosniff
/ktp-kit/*
  Cache-Control: public, max-age=86400
`);

const files = fs.readdirSync(dist, {recursive: true}).filter(f => fs.statSync(path.join(dist, f)).isFile());
const big = files.map(f => [f, fs.statSync(path.join(dist, f)).size]).sort((a, b) => b[1] - a[1])[0];
console.log(`demo built: ${files.length} files in apps/demo/dist; largest ${big[0]} ${(big[1] / 1e6).toFixed(1)} MB (Cloudflare Pages limit 25 MiB)`);
