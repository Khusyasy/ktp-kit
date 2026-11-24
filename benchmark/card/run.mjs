// Full card benchmark runner. Reads the public card set through the shipped readImage path.
//   node benchmark/card/run.mjs <images-dir> <labels.jsonl> <predictions.jsonl>
// Needs the ktp-kit workspace installed (jpeg-js and onnxruntime-web are package dependencies).
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";

const [images, labelsFile, outFile] = process.argv.slice(2);
if (!images || !labelsFile || !outFile) {
  console.error("usage: node benchmark/card/run.mjs <images-dir> <labels.jsonl> <predictions.jsonl>");
  process.exit(1);
}
const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(pathToFileURL(path.join(root, "package.json")));
const {createKtpReader} = await import(pathToFileURL(path.join(root, "packages/ktp-kit/src/engine.js")).href);
const jpeg = require("jpeg-js");
const ort = require("onnxruntime-web");
const models = path.join(root, "packages/models");
const engine = createKtpReader({ort, load: name => fs.promises.readFile(path.join(models, name))});
const labels = fs.readFileSync(labelsFile, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const t0 = Date.now();
const out = fs.createWriteStream(outFile);

for (const [i, lab] of labels.entries()) {
  let r = null, error = null;
  try {
    const {width: w, height: h, data} = jpeg.decode(fs.readFileSync(path.join(images, path.basename(lab.file))),
      {useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024});
    r = await engine.readImage({w, h, data}, undefined, {debug: true});
  } catch (e) {
    error = String(e.message || e);
  }
  const d = r?.debug || {};
  out.write(JSON.stringify({
    file: lab.file, variant: lab.variant, error,
    fields: r ? Object.fromEntries(Object.entries(lab.fields).map(([k]) => [k, r[k] ?? null])) : null,
    ktp_score: r?.info?.ktp_score ?? null,
    debug: r ? {step: d.step, turned: d.orient?.turned, corners: d.corners ?? null,
      lines: d.lines?.map(x => x.text) ?? [], rowsFound: d.rows?._found ?? [],
      layers: {rows: d.rows ?? null, parse: d.parse ?? null, nik: d.nik ?? null}} : null
  }) + "\n");
  if ((i + 1) % 10 === 0 || i + 1 === labels.length) {
    const eta = Math.round((Date.now() - t0) / (i + 1) * (labels.length - i - 1) / 1000);
    console.log(`${i + 1}/${labels.length} eta ${eta}s`);
  }
}
out.end();
