"""Score a predictions file against labels.jsonl.
  python score.py predictions.json            {"lines/0000.jpg": "TEXT READ", ...}
A line counts when the read text equals the label after upper-casing and collapsing spaces. A blank strip counts when
nothing is read."""
import json, re, sys
from pathlib import Path

norm = lambda s: re.sub(r"\s+", " ", (s or "").upper()).strip()
labels = [json.loads(l) for l in open(Path(__file__).with_name("labels.jsonl"), encoding="utf-8")]
pred = json.load(open(sys.argv[1], encoding="utf-8"))
score = {"nik": [0, 0], "all text": [0, 0], "blank": [0, 0]}
for r in labels:
    ok = norm(pred.get(r["file"])) == norm(r["text"])
    for k in [r["kind"]] if r["kind"] != "text" else []:
        score[k][0] += ok; score[k][1] += 1
    if r["kind"] != "blank":
        score["all text"][0] += ok; score["all text"][1] += 1
print("  ".join(f"{k} {a / n:.1%} ({a}/{n})" for k, (a, n) in score.items()))
