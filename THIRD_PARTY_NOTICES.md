# Third-party notices

| Part | Source | License | Use here |
|---|---|---|---|
| PP-OCRv6 tiny text recognizer | PaddlePaddle/PaddleOCR, weights via RapidOCR | Apache-2.0 | **Modified**: the 6,906-class output was cut to 47 classes (46 KTP characters + blank) and the model was fine-tuned on synthetic KTP text lines. Shipped as `rec.onnx`. |
| PP-OCRv6 small text detector | PaddlePaddle/PaddleOCR via RapidOCR | Apache-2.0 | **Modified**: weights compressed to int8 (weight-only), shipped as `det.onnx`. `reader.js` re-implements RapidOCR's pre- and post-processing. |
| DocAligner lcnet100 card-corner model | DocsaidLab/DocAligner | Apache-2.0 | **Modified**: weights compressed to int8 (weight-only), shipped as `corners.onnx`. |
| Indonesian region codes | cahyadsn/wilayah | MIT, see [LICENSES/MIT-wilayah.txt](LICENSES/MIT-wilayah.txt) | `wilayah.csv`, converted. |
| onnxruntime-web | Microsoft | MIT | Runtime dependency. Its WebAssembly engine (`ort/` in @ktp-kit/models) is built from the unmodified v1.20.1 source with only the operators these models use (`--include_ops_by_config`). |
| brotli-dec-wasm | Yulong Ming (myl7) | MIT or Apache-2.0 | Brotli decoder for browsers without native brotli, shipped as `brotli-dec.js` and `brotli-dec.wasm`. |
| jpeg-js | jpeg-js contributors | BSD-3-Clause | JPEG decoding in the CLI. |

The Apache-2.0 text is in [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt).
