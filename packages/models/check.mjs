// prepack guard: refuse to publish @ktp-kit/models unless every model file is present.
import fs from "node:fs";
const need = ["corners.onnx", "det.onnx", "rec.onnx", "wilayah.csv"];
const missing = need.filter(f => !fs.existsSync(f) || fs.statSync(f).size < 1000);
if (missing.length) {
  console.error(`@ktp-kit/models: missing ${missing.join(", ")}. Add the release models before packing.`);
  process.exit(1);
}
