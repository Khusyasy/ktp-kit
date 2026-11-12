#!/usr/bin/env node
// ktp-kit command line.
//   npx ktp-kit assets public/ktp-kit         copy models + runtime for the browser (serve that folder)
//   npx ktp-kit read photo.jpg [more.jpg | folder | "foto/*.jpg" ...]  read KTP photos (JPEG), one JSON line each (--csv for CSV)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {createRequire} from "node:module";
import {createKtpReader, FILES} from "../src/engine.js";

const require = createRequire(import.meta.url);
const modelsDir = () => path.dirname(require.resolve("@ktp-kit/models/package.json"));
const brotliWasm = () => path.join(path.dirname(require.resolve("brotli-dec-wasm")), "pkg/brotli_dec_wasm_bg.wasm");
const plain = f => f.replace(/\.(gz|br)$/, "");
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "assets") {
  const out = args[0] || "public/ktp-kit";
  fs.mkdirSync(path.join(out, "ort"), {recursive: true});
  const src = f => (f = plain(f)) === plain(FILES.brotli) ? brotliWasm()
    : path.join(modelsDir(), f);  // ort/ holds a reduced onnxruntime-web 1.20.1 build (only the operators these models use)
  const missing = Object.values(FILES).filter(f => !fs.existsSync(src(f)));
  if (missing.length) {
    console.error(`ktp-kit assets: missing ${missing.join(", ")} (is @ktp-kit/models installed with its model files?)`);
    process.exit(1);
  }
  // .br names are brotli-compressed here, .gz names gzipped (the browser unpacks them). The plain engine is kept as
  // onnxruntime's fallback path.
  const pack = (f, b) => f.endsWith(".br") ? zlib.brotliCompressSync(b, {params: {[zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length}}) : f.endsWith(".gz") ? zlib.gzipSync(b, {level: 9}) : b;
  for (const f of Object.values(FILES)) fs.writeFileSync(path.join(out, f), pack(f, fs.readFileSync(src(f))));
  fs.copyFileSync(src(FILES.wasm), path.join(out, plain(FILES.wasm)));
  // Real sizes for the download progress bar (hosts compress on the fly, so Content-Length can't be used).
  fs.writeFileSync(path.join(out, "sizes.json"),
    JSON.stringify(Object.fromEntries(Object.values(FILES).map(f => [f, fs.statSync(path.join(out, f)).size]))));
  const mb = Object.values(FILES).reduce((a, f) => a + fs.statSync(path.join(out, f)).size, 0) / 1e6;
  console.log(`copied ${Object.keys(FILES).length} files (${mb.toFixed(0)} MB) to ${out}; serve it at the "base" URL`);
} else if (cmd === "read" && args.length) {
  const {default: jpeg} = await import("jpeg-js");
  const ort = await import("onnxruntime-web");
  const engine = createKtpReader({ort, load: name => fs.promises.readFile(path.join(modelsDir(), name))});
  // Folders and wildcards are expanded here: Windows shells pass "foto/*.jpg" through as it is.
  const JPEG = /\.jpe?g$/i;
  const list = dir => fs.readdirSync(dir).sort().map(f => path.join(dir, f));
  const expand = a => {
    if (fs.existsSync(a) && fs.statSync(a).isDirectory()) return list(a).filter(f => JPEG.test(f));
    const name = path.basename(a);
    if (!/[*?]/.test(name)) return [a];
    const re = new RegExp("^" + name.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
    return fs.existsSync(path.dirname(a)) ? list(path.dirname(a)).filter(f => re.test(path.basename(f))) : [];
  };
  const csv = args.includes("--csv"), files = args.filter(a => !a.startsWith("--")).flatMap(expand);
  if (!files.length) { console.error("ktp-kit read: no JPEG photos found in " + args.filter(a => !a.startsWith("--")).join(" ")); process.exit(1); }
  const cols = ["file", "nik", "nik_valid", "nama", "tempat_lahir", "tanggal_lahir", "jenis_kelamin", "golongan_darah", "alamat",
    "rt_rw", "kelurahan_desa", "kecamatan", "kabupaten_kota", "provinsi", "agama", "status_perkawinan", "pekerjaan",
    "kewarganegaraan", "berlaku_hingga", "kota_terbit", "tanggal_terbit", "kode_wilayah", "perlu_dicek"];
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  if (csv) console.log(cols.join(","));
  for (const file of files) {
    let out;
    try {
      const {width: w, height: h, data} = jpeg.decode(fs.readFileSync(file), {useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024});
      const r = await engine.readImage({w, h, data});
      out = r ? {file, ...r, card: undefined} : {file, error: "no KTP found"};
    } catch (e) {
      out = {file, error: e.message.includes("SOI") ? "only JPEG photos are supported" : e.message};
    }
    console.log(csv ? cols.map(c => cell(c === "perlu_dicek" && out[c] ? Object.entries(out[c]).map(([f, why]) => `${f}:${why.join("+")}`).join(" ") : out[c])).join(",") : JSON.stringify(out));
  }
} else {
  console.log(`ktp-kit: read Indonesian KTPs on your own machine (nothing is uploaded)

  ktp-kit assets [dir]           copy models + runtime for the browser (default public/ktp-kit)
  ktp-kit read <photos...>       read KTP photos (JPEG files, folders or "foto/*.jpg"), one JSON line each.
                                 Add --csv for CSV.`);
}
