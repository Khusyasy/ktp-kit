"""ktp-kit's line reader on the benchmark lines, the way the package runs it.
  python run_ktpkit.py <rec.onnx> <out.json>      rec.onnx: from @ktp-kit/models
Needs: pip install onnxruntime opencv-python numpy"""
import json, sys
from pathlib import Path
import cv2, numpy as np, onnxruntime as ort

CHARS = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/-.,:'()+"  # output index 0 is the CTC blank
H, MAX_W = 48, 960
here = Path(__file__).parent
sess = ort.InferenceSession(sys.argv[1], providers=["CPUExecutionProvider"])
name = sess.get_inputs()[0].name


def read(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    w = min(max(int(np.ceil(g.shape[1] * H / g.shape[0])), 8), MAX_W)
    x = cv2.resize(g, (w, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 127.5 - 1
    logp = sess.run(None, {name: np.repeat(x[None], 3, 0)[None]})[0][0]
    out, prev = [], 0
    for k in logp.argmax(-1):
        if k != prev and k != 0:
            out.append(CHARS[k - 1])
        prev = k
    return "".join(out)


labels = [json.loads(l) for l in open(here / "labels.jsonl", encoding="utf-8")]
json.dump({r["file"]: read(cv2.imread(str(here / r["file"]))) for r in labels}, open(sys.argv[2], "w", encoding="utf-8"))
