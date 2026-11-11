// Syntax-checks every source file, then imports the Node-safe entry points (no models needed).
import {execFileSync} from "node:child_process";
import fs from "node:fs";
const files = ["packages/ktp-kit/bin/cli.js", "packages/react/index.js", "packages/vue/index.js", "apps/demo/serve.mjs",
  ...fs.readdirSync("packages/ktp-kit/src").map(f => `packages/ktp-kit/src/${f}`)];
for (const f of files) execFileSync(process.execPath, ["--check", f], {stdio: "inherit"});
const kit = await import("ktp-kit");
const fields = await kit.extractFields([["3171234567890123", [[300, 90], [700, 90], [700, 120], [300, 120]]]]);
if (fields.nik !== "3171234567890123" || fields.nik_valid) throw new Error("parser smoke test failed");
console.log(`ok: ${files.length} files, exports: ${Object.keys(kit).join(", ")}`);
