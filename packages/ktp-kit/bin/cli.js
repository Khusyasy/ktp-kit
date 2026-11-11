#!/usr/bin/env node
// ktp-kit command line.
//   npx ktp-kit assets public/ktp-kit         copy models + runtime for the browser (serve that folder)
//   npx ktp-kit read photo.jpg [more.jpg ...]  read KTP photos, one JSON line each (--csv for CSV)
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {createKtpReader, FILES} from "../src/engine.js";

const require = createRequire(import.meta.url);
const modelsDir = () => path.dirname(require.resolve("@ktp-kit/models/package.json"));
const ortDir = () => path.join(path.dirname(require.resolve("onnxruntime-web/package.json")), "dist");
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "assets") {
  const out = args[0] || "public/ktp-kit";
  fs.mkdirSync(path.join(out, "ort"), {recursive: true});
  const src = f => f.startsWith("ort/") ? path.join(ortDir(), f.slice(4)) : path.join(modelsDir(), f);
  const missing = Object.values(FILES).filter(f => !fs.existsSync(src(f)));
  if (missing.length) {
    console.error(`ktp-kit assets: missing ${missing.join(", ")} (is @ktp-kit/models installed with its model files?)`);
    process.exit(1);
  }
  for (const f of Object.values(FILES)) fs.copyFileSync(src(f), path.join(out, f));
  const mb = Object.values(FILES).reduce((a, f) => a + fs.statSync(path.join(out, f)).size, 0) / 1e6;
  console.log(`copied ${Object.keys(FILES).length} files (${mb.toFixed(0)} MB) to ${out}; serve it at the "base" URL`);
} else if (cmd === "read" && args.length) {
  const {default: jpeg} = await import("jpeg-js");
  const ort = await import("onnxruntime-web");
  const engine = createKtpReader({ort, load: name => fs.promises.readFile(path.join(modelsDir(), name))});
  const csv = args.includes("--csv"), files = args.filter(a => !a.startsWith("--"));
  const cols = ["file", "nik", "nik_valid", "nama", "tempat_lahir", "tanggal_lahir", "jenis_kelamin", "gol_darah", "alamat",
    "rt_rw", "kel_desa", "kecamatan", "kabupaten_kota", "provinsi", "agama", "status_perkawinan", "pekerjaan",
    "kewarganegaraan", "berlaku_hingga", "kota_terbit", "tanggal_terbit", "kode_wilayah", "perlu_dicek"];
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  if (csv) console.log(cols.join(","));
  for (const file of files) {
    let out;
    try {
      const {width: w, height: h, data} = jpeg.decode(fs.readFileSync(file), {useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024});
      const r = await engine.readImage({w, h, data});
      out = r ? {file, ...r, card: undefined, raw: undefined} : {file, error: "no KTP found"};
    } catch (e) {
      out = {file, error: e.message.includes("SOI") ? "only JPEG photos are supported" : e.message};
    }
    console.log(csv ? cols.map(c => cell(Array.isArray(out[c]) ? out[c].join(" ") : out[c])).join(",") : JSON.stringify(out));
  }
} else {
  console.log(`ktp-kit: read Indonesian KTPs on your own machine (nothing is uploaded)

  ktp-kit assets [dir]           copy models + runtime for the browser (default public/ktp-kit)
  ktp-kit read <photos...>       read KTP photos (JPEG), one JSON line each; --csv for CSV`);
}
