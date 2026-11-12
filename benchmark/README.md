# KTP line benchmark (synthetic, v1)

2,400 generated images of single KTP text lines, with labels, for comparing text readers. No real person's data: every
line is made up, and every NIK uses a sequence number from 9000 to 9999, which real NIKs don't reach.

- **131 NIK lines**, **2,103 other text lines** (names, places, dates, addresses, labels, headers), **166 blank strips**
  (card background, signature or photo with no text, where the right answer is nothing).
- Drawn by ktp-kit's line generator in KTP fonts and layout, then blurred, faded, worn, tinted and compressed like phone
  photos. Lines are hard on purpose. The generator itself is not public.
- None of these lines, and no line from this seed, was used to train or select ktp-kit's reader.

Download the images: [ktp-kit-bench-synth-v1.zip](https://github.com/Khusyasy/ktp-kit/releases/download/bench-synth-v1/ktp-kit-bench-synth-v1.zip)
(10 MB). Unzip it next to these scripts. `labels.jsonl` here is the same file as in the zip.

## Results

Exact match after upper-casing and collapsing spaces. A blank strip counts when nothing is read.

| Reader | NIK lines | All text lines | Blank strips | Model file |
|---|---|---|---|---|
| ktp-kit 0.1.0 (`rec.onnx`, int8) | 90.8% | **81.5%** | **97.0%** | **0.7 MB** |
| PaddleOCR PP-OCRv6 small (RapidOCR 3.10.0) | **91.6%** | 51.4% | 70.5% | 21.2 MB |
| PaddleOCR PP-OCRv6 tiny (RapidOCR 3.10.0) | 87.8% | 48.7% | 71.1% | 4.5 MB |

PP-OCRv6 tiny is the model ktp-kit's reader was fine-tuned from. All readers get the same cut-out line images and no
hints. On the NIK the general models are about as good. The gain is on names, addresses and other words, and on not
reading text into the card's background pattern.

## Run it

```bash
pip install onnxruntime opencv-python numpy rapidocr==3.10.0
python run_ktpkit.py path/to/@ktp-kit/models/rec.onnx ktpkit.json
python run_paddleocr.py small small.json
python score.py ktpkit.json
```

To test another reader, write `{"lines/0000.jpg": "TEXT READ", ...}` for every line and run `score.py` on it.

## License

The images and labels are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): use them for
anything, credit "ktp-kit KTP line benchmark". The scripts are MIT. ktp-kit itself is Apache-2.0.
