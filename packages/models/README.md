# @ktp-kit/models

Model files used by [ktp-kit](../ktp-kit). You normally don't install this yourself: `ktp-kit` depends on it, and
`npx ktp-kit assets public/ktp-kit` copies the files to where your app serves them.

| File | What | Source and license |
|---|---|---|
| `corners.onnx` | finds the card's 4 corners | DocAligner lcnet100, Apache-2.0, **modified**: weights compressed to int8 |
| `det.onnx` | finds the text lines | PP-OCRv6 small det (PaddleOCR via RapidOCR), Apache-2.0, **modified**: weights compressed to int8 |
| `rec.onnx` | reads each line | PP-OCRv6 tiny rec, Apache-2.0, **modified**: output cut to KTP characters and fine-tuned on synthetic KTP text lines only. Carries a watermark. |
| `wilayah.csv` | official region codes | cahyadsn/wilayah, MIT |
| `ort/` | onnxruntime-web 1.20.1 engine | Microsoft, MIT. Built from the unmodified source with only the operators these models use |

The reader was trained only on generated (synthetic) text lines. No real person's KTP data is in these files.
