# Full card benchmark plan

This is a plan for a second public benchmark. The existing `bench-synth-v1` stays as it is. It cuts text lines out of a card and scores the reader only. A card benchmark has to score the whole path from photo to fields.

## Order of work

1. Run an external card set through `readImage` and report error groups. No public code or asset changes for this step.
2. Fix the layer contract below and make each layer runnable alone, skippable, or fed known good input.
3. Build `bench-card-v1` only when step 1 shows the whole path has errors worth publishing. Publish images and labels. Keep the generator private.
4. Add a Node runner that calls `readImage`, not a copy of the recognizer.
5. Report per field scores twice, exact text and letters plus digits. Report all fields correct as a separate number.
6. Public release waits for owner approval.

## Layer contract

Each layer has one job. A layer reports its own number and also runs inside the full path. The full path number is the one users feel. The layer number says where to look.

| Layer | Job | Oracle input | Metric |
|---|---|---|---|
| K0 find card | Four corners from a photo | Labelled corner points | Detection rate and mean corner error over the card long side |
| K1 rectify and orient | Upright 856x540 card from corners | Labelled corners and the printed flat card | Orientation accuracy and field box IoU after warp |
| K2 find lines | Text boxes on the upright card | Labelled line boxes | Box IoU at 0.5 and line recall |
| K3 read lines | Text from each line crop | Labelled line text | Exact match and letters plus digits |
| K4 rows and parse | Raw printed text and clean values from OCR items | Labelled field text | Rows found rate, exact field value, letters plus digits |
| K5 nik and wilayah | Fill missing values and snap regions | Labelled fields plus official region table | Exact field value, count of NIK fills and region snaps |
| K6 validate and accept | Flags and the KTP score | Labelled bad cards and wrong fields | Wrong field caught rate, right field flagged rate, accept separation |

The public set does not need every oracle for the first release. Missing oracles are stated as gaps. A metric is never invented after seeing the result.

## Label schema sketch

One JSON object per card.

- `file` image path
- `variant` clean, blur, tilt, dim, compressed, or another named condition
- `corners` four points in image order
- `fields` object with the 16 public content fields and the printed text for each, plus the issue fields
- `lines` optional array of boxes and text
- `seed` and `renderer` version
- `notes` limitations and any overlap with training data

No real KTP photo, NIK, name, or participant path enters this set. Public NIKs use the existing sequence rule with values 9000 to 9999.

## Scoring rules

Exact text means upper case, spaces collapsed, then equal. Letters plus digits means non alphanumeric characters removed first. A blank field is correct only when the reader also leaves it blank. All fields correct is the share of cards where every scored field is exact.

A benchmark made with the same renderer as training flatters the model. State the renderer overlap in the README. If the generator changes after release, keep the old zip and add a new version instead of overwriting labels.
