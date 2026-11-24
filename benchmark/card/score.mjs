// Scores full card predictions. Each field twice: exact text and letters plus digits only.
//   node benchmark/card/score.mjs <labels.jsonl> <predictions.jsonl> [report.json]
import fs from "node:fs";

const [labelsFile, predFile, reportFile] = process.argv.slice(2);
if (!labelsFile || !predFile) {
  console.error("usage: node benchmark/card/score.mjs <labels.jsonl> <predictions.jsonl> [report.json]");
  process.exit(1);
}
const read = f => fs.readFileSync(f, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const labels = read(labelsFile), preds = read(predFile);
const byFile = new Map(preds.map(p => [p.file, p]));
const norm = s => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const alnum = s => norm(s).replace(/[^A-Z0-9]/g, "");
const FIELDS = ["nik", "nama", "tempat_lahir", "tanggal_lahir", "jenis_kelamin", "golongan_darah", "alamat",
  "rt_rw", "kelurahan_desa", "kecamatan", "kabupaten_kota", "provinsi", "agama", "status_perkawinan", "pekerjaan",
  "kewarganegaraan", "berlaku_hingga"];
const fields = {};
for (const f of FIELDS) fields[f] = {n: 0, exact: 0, alnum: 0};
const variants = {};
const layer = {n: 0, noResult: 0, turned: 0, orientCorrect: 0, orientN: 0, cornersFound: 0, cornerErrSum: 0, cornerErrN: 0,
  rowsFound: 0, rowsN: 0, linesSum: 0, steps: {}};
let allExact = 0;

const cornerErr = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 4 || b.length !== 4) return null;
  const diag = Math.hypot(b[2][0] - b[0][0], b[2][1] - b[0][1]) || 1;
  let sum = 0;
  for (const p of a) sum += Math.min(...b.map(q => Math.hypot(p[0] - q[0], p[1] - q[1])));
  return sum / 4 / diag;
};

for (const lab of labels) {
  const p = byFile.get(lab.file);
  const v = lab.variant || "unknown";
  variants[v] ??= {n: 0, exact: 0, alnum: 0, allExact: 0};
  variants[v].n++;
  layer.n++;
  if (!p || p.error || !p.fields) { layer.noResult++; continue; }
  let every = true;
  for (const f of FIELDS) {
    const want = norm(lab.fields[f] ?? ""), got = norm(p.fields[f] ?? "");
    const s = fields[f];
    s.n++;
    if (got === want) s.exact++, variants[v].exact++;
    if (alnum(want) ? alnum(got) === alnum(want) : got === want) s.alnum++, variants[v].alnum++;
    if (got !== want) every = false;
  }
  if (every) allExact++, variants[v].allExact++;
  layer.turned += p.debug?.turned ? 1 : 0;
  layer.orientN++;
  if (Boolean(p.debug?.turned) === (v === "upside_down")) layer.orientCorrect++;
  if (p.debug?.corners) layer.cornersFound++;
  const err = cornerErr(p.debug?.corners, lab.corners);
  if (err !== null) { layer.cornerErrSum += err; layer.cornerErrN++; }
  layer.rowsFound += (p.debug?.rowsFound || []).length;
  layer.rowsN += 12;
  layer.linesSum += (p.debug?.lines || []).length;
  const step = p.debug?.step || "none";
  layer.steps[step] = (layer.steps[step] || 0) + 1;
}

const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : "-";
const table = {};
for (const [f, s] of Object.entries(fields)) table[f] = {exact: `${s.exact}/${s.n} ${pct(s.exact, s.n)}`,
  alnum: `${s.alnum}/${s.n} ${pct(s.alnum, s.n)}`};
const report = {
  images: layer.n, noResult: layer.noResult, allFieldsExact: `${allExact}/${layer.n} ${pct(allExact, layer.n)}`,
  fields: table,
  variants: Object.fromEntries(Object.entries(variants).map(([v, s]) => [v,
    {n: s.n, exact: pct(s.exact, s.n * FIELDS.length), alnum: pct(s.alnum, s.n * FIELDS.length),
      allExact: `${s.allExact}/${s.n}`}])),
  layers: {cornersFound: `${layer.cornersFound}/${layer.n}`,
    cornerMeanErrorPctOfDiagonal: layer.cornerErrN ? +(layer.cornerErrSum / layer.cornerErrN).toFixed(3) : null,
    turnedTotal: `${layer.turned}/${layer.n}`, orientCorrect: `${layer.orientCorrect}/${layer.orientN}`,
    rowsFound: `${layer.rowsFound}/${layer.rowsN}`,
    meanLines: +(layer.linesSum / layer.n).toFixed(1), steps: layer.steps}
};
console.log(JSON.stringify(report, null, 2));
if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
