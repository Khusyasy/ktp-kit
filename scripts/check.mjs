// Syntax-checks every source file, then imports the Node-safe entry points (no models needed).
import {execFileSync} from "node:child_process";
import fs from "node:fs";
const files = ["packages/ktp-kit/bin/cli.js", "packages/react/index.js", "packages/vue/index.js", "apps/demo/serve.mjs",
  ...fs.readdirSync("packages/ktp-kit/src").map(f => `packages/ktp-kit/src/${f}`)];
for (const f of files) execFileSync(process.execPath, ["--check", f], {stdio: "inherit"});
const kit = await import("ktp-kit");
const fields = await kit.extractFields([["3171234567890123", [[300, 90], [700, 90], [700, 120], [300, 120]]]]);
if (fields.nik !== "3171234567890123" || fields.nik_valid) throw new Error("parser smoke test failed");
const p = kit.parseNik("3171014501909001");  // made-up NIK: region 317101, born 05-01-1990, female
if (!p.valid || p.jenis_kelamin !== "PEREMPUAN" || p.tanggal_lahir !== "05-01-1990" || kit.parseNik("3171234567890123").valid)
  throw new Error("parseNik smoke test failed");
console.log(`ok: ${files.length} files, exports: ${Object.keys(kit).join(", ")}`);
