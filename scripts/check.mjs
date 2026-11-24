// Syntax-checks every source file, then imports the Node-safe entry points (no models needed).
import {execFileSync} from "node:child_process";
import fs from "node:fs";
const files = ["packages/ktp-kit/bin/cli.js", "packages/react/index.js", "packages/vue/index.js", "apps/demo/serve.mjs",
  ...fs.readdirSync("packages/ktp-kit/src").map(f => `packages/ktp-kit/src/${f}`)];
for (const f of files) execFileSync(process.execPath, ["--check", f], {stdio: "inherit"});
const kit = await import("ktp-kit");
const fields = await kit.extractFields([["3171234567890123", [[300, 90], [700, 90], [700, 120], [300, 120]]]]);
if (fields.nik !== "3171234567890123" || fields.nik_valid) throw new Error("parser smoke test failed");
const oracle = await kit.extractFields([], "3171234567890123", null, {skip: ["rows", "parse", "nik", "wilayah"],
  rows: {nama: "SITI CONTOH"}, parsed: {nik: "3171234567890123", nama: "SITI CONTOH", nik_valid: false}});
if (oracle.nama !== "SITI CONTOH" || oracle.layers.rows.nama !== "SITI CONTOH" || !oracle.layers.wilayah)
  throw new Error("parser oracle input failed");
const p = kit.parseNik("3171014501909001");  // made-up NIK (sequence 9001, never real): region 317101, born 05-01-1990, female
if (!p.valid || p.jenis_kelamin !== "PEREMPUAN" || p.tanggal_lahir !== "05-01-1990" || kit.parseNik("3171234567890123").valid)
  throw new Error("parseNik smoke test failed");
if (!kit.nikValid("9503020501909001") || !kit.nikValid("9604040501909001"))
  throw new Error("nikValid Papua Pegunungan / Papua Barat Daya (95-96) failed");
if (kit.parseFields({rt_rw: "007I002"}, null).rt_rw !== "007/002")
  throw new Error("rt_rw slash-as-I parse failed");
const pkg = JSON.parse(fs.readFileSync("packages/ktp-kit/package.json", "utf8"));
if (kit.VERSION !== pkg.version) throw new Error(`engine.js VERSION ${kit.VERSION} != package.json ${pkg.version}`);
console.log(`ok: ${files.length} files, exports: ${Object.keys(kit).join(", ")}`);
