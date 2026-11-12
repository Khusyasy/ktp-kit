"""Stock PaddleOCR PP-OCRv6 recognisers (through RapidOCR) on the benchmark lines: recogniser only, no detection, no
angle classifier, default settings.
  python run_paddleocr.py small|tiny <out.json>
Needs: pip install rapidocr==3.10.0 onnxruntime opencv-python"""
import json, sys
from pathlib import Path
import cv2
from rapidocr import ModelType, RapidOCR

here = Path(__file__).parent
params = {"Global.log_level": "error", "Global.use_det": False, "Global.use_cls": False}
if sys.argv[1] == "tiny":
    params["Rec.model_type"] = ModelType.TINY
engine = RapidOCR(params=params)
labels = [json.loads(l) for l in open(here / "labels.jsonl", encoding="utf-8")]
json.dump({r["file"]: (engine(cv2.imread(str(here / r["file"]))).txts or [""])[0] for r in labels},
          open(sys.argv[2], "w", encoding="utf-8"))
