// On-device KTP reading: straighten the card, find text lines (PP-OCRv6 small det), read them (our fine-tuned
// reader), parse with ktp.js. No DOM: images are {w, h, data} with RGBA bytes, so Node can test this file
// (web/devicetest.mjs) against the Python pipeline. Mirrors RapidOCR's det settings and train_rec.to_input.
import {CARD_W, CARD_H, extractFields, extractNik, nikValid} from "./ktp.js";

const CHARS = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/-.,:'()+"; // train_rec.CHARS; index 0 of the output is blank
const LINE_H = 48, MAX_W = 960;

// --- geometry ---------------------------------------------------------------------------------------------
function homography(src, dst) { // 3x3 (row-major, h33 = 1) mapping 4 src points onto 4 dst points
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) { // Gaussian elimination with partial pivoting
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return [...b.map((v, i) => v / A[i][i]), 1];
}

// Flatten the card inside the 4 corners (tl, tr, br, bl) to CARD_W x CARD_H, bilinear like cv2.warpPerspective.
export function warpCard(img, corners) {
  const H = homography([[0, 0], [CARD_W, 0], [CARD_W, CARD_H], [0, CARD_H]], corners); // card -> photo
  const out = new Uint8ClampedArray(CARD_W * CARD_H * 4), {w, h, data} = img;
  for (let y = 0; y < CARD_H; y++) for (let x = 0; x < CARD_W; x++) {
    const z = H[6] * x + H[7] * y + H[8], sx = (H[0] * x + H[1] * y + H[2]) / z, sy = (H[3] * x + H[4] * y + H[5]) / z;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, o = (y * CARD_W + x) * 4;
    for (let c = 0; c < 3; c++) {
      const at = (xx, yy) => data[(Math.min(Math.max(yy, 0), h - 1) * w + Math.min(Math.max(xx, 0), w - 1)) * 4 + c];
      out[o + c] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
    }
    out[o + 3] = 255;
  }
  return {w: CARD_W, h: CARD_H, data: out};
}

export function rotate180({w, h, data}) {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < w * h; i++) out.set(data.subarray(i * 4, i * 4 + 4), (w * h - 1 - i) * 4);
  return {w, h, data: out};
}

// One channel resampled to (W, H): area average when shrinking (cv2 INTER_AREA), linear when growing.
function resize(src, sw, sh, W, H) {
  const axis = (n, N) => { // per output index: list of [source index, weight]
    const s = n / N, taps = [];
    for (let i = 0; i < N; i++) {
      if (s > 1) {
        const a = i * s, b = a + s, t = [];
        for (let k = Math.floor(a); k < Math.ceil(b); k++) t.push([Math.min(k, n - 1), (Math.min(b, k + 1) - Math.max(a, k)) / s]);
        taps.push(t);
      } else {
        const x = Math.max((i + 0.5) * s - 0.5, 0), k = Math.min(Math.floor(x), n - 1), f = x - k;
        taps.push([[k, 1 - f], [Math.min(k + 1, n - 1), f]]);
      }
    }
    return taps;
  };
  const tx = axis(sw, W), ty = axis(sh, H), tmp = new Float32Array(W * sh), out = new Float32Array(W * H);
  for (let y = 0; y < sh; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (const [k, f] of tx[x]) v += src[y * sw + k] * f;
    tmp[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (const [k, f] of ty[y]) v += tmp[k * W + x] * f;
    out[y * W + x] = v;
  }
  return out;
}

const channel = ({w, h, data}, c) => Float32Array.from({length: w * h}, (_, i) => data[i * 4 + c]);
const grey = ({w, h, data}) => Float32Array.from({length: w * h},
  (_, i) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);

// Smallest rotated rectangle around points (cv2.minAreaRect): rotating calipers over the convex hull.
// Returns {corners: 4 points, short: shorter side}.
function minAreaRect(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => {
    const h = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    return h.slice(0, -1);
  };
  const hull = pts.length < 3 ? pts : [...half(pts), ...half(pts.slice().reverse())];
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = len ? (b[0] - a[0]) / len : 1, uy = len ? (b[1] - a[1]) / len : 0;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of hull) {
      const u = x * ux + y * uy, v = -x * uy + y * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = {area, ux, uy, u0, u1, v0, v1};
  }
  const {ux, uy, u0, u1, v0, v1} = best, at = (u, v) => [u * ux - v * uy, u * uy + v * ux];
  return {corners: [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], w: u1 - u0, h: v1 - v0};
}

// RapidOCR get_mini_boxes ordering: by x, then top/bottom within the left pair and the right pair.
function miniBox(corners) {
  const p = corners.slice().sort((a, b) => a[0] - b[0]);
  const [i1, i4] = p[1][1] > p[0][1] ? [0, 1] : [1, 0], [i2, i3] = p[3][1] > p[2][1] ? [2, 3] : [3, 2];
  return [p[i1], p[i2], p[i3], p[i4]];
}

// Grow a rectangle by d on every side (pyclipper round offset, then minAreaRect again, = sides + 2d).
function grow(corners, d) {
  const cx = corners.reduce((s, p) => s + p[0], 0) / 4, cy = corners.reduce((s, p) => s + p[1], 0) / 4;
  const ex = [corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]], ey = [corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]];
  const lx = Math.hypot(...ex) || 1, ly = Math.hypot(...ey) || 1;
  const ux = ex.map(v => v / lx), uy = ey.map(v => v / ly), hx = lx / 2 + d, hy = ly / 2 + d;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
    [cx + sx * hx * ux[0] + sy * hy * uy[0], cy + sx * hx * ux[1] + sy * hy * uy[1]]);
}

// --- text lines: PP-OCRv6 det with RapidOCR's settings (limit_side_len 736 min, thresh 0.3, box_thresh 0.5,
// unclip 1.6, 2x2 dilation, fast score) and its box steps. Returns 4-point boxes (tl, tr, br, bl) on the card.
async function findLines(card, det, ort) {
  const {w, h} = card, ratio = Math.min(w, h) < 736 ? 736 / Math.min(w, h) : 1;
  const W = Math.max(Math.round(Math.floor(w * ratio) / 32) * 32, 32), H = Math.max(Math.round(Math.floor(h * ratio) / 32) * 32, 32);
  const x = new Float32Array(3 * W * H);
  [2, 1, 0].forEach((c, k) => { // BGR planes, (v / 255 - 0.5) / 0.5
    const r = resize(channel(card, c), w, h, W, H);
    for (let i = 0; i < W * H; i++) x[k * W * H + i] = r[i] / 127.5 - 1;
  });
  const out = await det.run({x: new ort.Tensor("float32", x, [1, 3, H, W])});
  const prob = out[det.outputNames[0]].data;
  const bit = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) // 2x2 dilation of prob > 0.3
    bit[y * W + xx] = prob[y * W + xx] > 0.3 || (xx && prob[y * W + xx - 1] > 0.3) ||
      (y && prob[(y - 1) * W + xx] > 0.3) || (xx && y && prob[(y - 1) * W + xx - 1] > 0.3) ? 1 : 0;
  const seen = new Uint8Array(W * H), boxes = [];
  for (let s = 0; s < W * H; s++) {
    if (!bit[s] || seen[s]) continue;
    const rows = new Map(), stack = [s]; // per row: [min x, max x] (enough for the convex hull)
    seen[s] = 1;
    while (stack.length) { // 8-connected blob
      const p = stack.pop(), px = p % W, py = (p - px) / W, r = rows.get(py);
      if (r) { r[0] = Math.min(r[0], px); r[1] = Math.max(r[1], px); } else rows.set(py, [px, px]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = px + dx, qy = py + dy, q = qy * W + qx;
        if (qx >= 0 && qy >= 0 && qx < W && qy < H && bit[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    const pts = [...rows].flatMap(([y, [a, b]]) => [[a, y], [b, y]]);
    const r = minAreaRect(pts);
    if (Math.min(r.w, r.h) < 3) continue;
    const box = miniBox(r.corners);
    // fast score: mean probability inside the box (fillPoly of the int-cast corners)
    const ib = box.map(([x, y]) => [Math.trunc(x), Math.trunc(y)]);
    const bx0 = Math.min(Math.max(Math.floor(Math.min(...box.map(p => p[0]))), 0), W - 1);
    const bx1 = Math.min(Math.max(Math.ceil(Math.max(...box.map(p => p[0]))), 0), W - 1);
    const by0 = Math.min(Math.max(Math.floor(Math.min(...box.map(p => p[1]))), 0), H - 1);
    const by1 = Math.min(Math.max(Math.ceil(Math.max(...box.map(p => p[1]))), 0), H - 1);
    const inside = (x, y) => { // point in convex quad (either winding)
      let pos = 0, neg = 0;
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = ib[i], [bx, by] = ib[(i + 1) % 4], c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        if (c > 0) pos++; else if (c < 0) neg++;
      }
      return !(pos && neg);
    };
    let sum = 0, cnt = 0;
    for (let y = by0; y <= by1; y++) for (let xx = bx0; xx <= bx1; xx++)
      if (inside(xx, y)) { sum += prob[y * W + xx]; cnt++; }
    if (!cnt || sum / cnt < 0.5) continue;
    const d = r.w * r.h * 1.6 / (2 * (r.w + r.h));
    if (Math.min(r.w, r.h) + 2 * d < 5) continue;
    const big = miniBox(grow(box, d)).map(([x, y]) =>
      [Math.min(Math.max(Math.round(x / W * w), 0), w), Math.min(Math.max(Math.round(y / H * h), 0), h)]);
    // filter_det_res: clockwise from top-left (left pair by y, right pair by y), clip to the image, int
    const byX = big.slice().sort((a, b) => a[0] - b[0]);
    const [tl, bl] = byX.slice(0, 2).sort((a, b) => a[1] - b[1]), [tr, br] = byX.slice(2).sort((a, b) => a[1] - b[1]);
    const q = [tl, tr, br, bl].map(([x, y]) => [Math.trunc(Math.min(Math.max(x, 0), w - 1)), Math.trunc(Math.min(Math.max(y, 0), h - 1))]);
    if (Math.trunc(Math.hypot(q[0][0] - q[1][0], q[0][1] - q[1][1])) <= 3 ||
        Math.trunc(Math.hypot(q[0][0] - q[3][0], q[0][1] - q[3][1])) <= 3) continue;
    boxes.push(q);
  }
  // RapidOCR sorted_boxes: stable sort by top-left y, a gap >= 10 px starts a new row, then by x within a row
  boxes.sort((a, b) => a[0][1] - b[0][1]);
  let row = 0;
  const keyed = boxes.map((b, i) => [i && b[0][1] - boxes[i - 1][0][1] >= 10 ? ++row : row, b]);
  keyed.sort((a, b) => a[0] - b[0] || a[1][0][0] - b[1][0][0]);
  return keyed.map(([, b]) => b);
}

// --- reading lines -----------------------------------------------------------------------------------------
function lineInput(g, cw, ch, b) { // train_rec.line_crop + to_input("tiny") on a grey card: straighten the box
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const w = Math.trunc(Math.max(d(b[0], b[1]), d(b[3], b[2]))), h = Math.trunc(Math.max(d(b[0], b[3]), d(b[1], b[2])));
  if (w < 4 || h < 4) return null;
  const Hm = homography([[0, 0], [w, 0], [w, h], [0, h]], b), crop = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const z = Hm[6] * x + Hm[7] * y + Hm[8], sx = (Hm[0] * x + Hm[1] * y + Hm[2]) / z, sy = (Hm[3] * x + Hm[4] * y + Hm[5]) / z;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    const at = (xx, yy) => g[Math.min(Math.max(yy, 0), ch - 1) * cw + Math.min(Math.max(xx, 0), cw - 1)];
    crop[y * w + x] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  }
  const W = Math.min(Math.max(Math.floor(w * LINE_H / h), 8), MAX_W);
  const r = resize(crop, w, h, W, LINE_H), x = new Float32Array(3 * W * LINE_H);
  for (let i = 0; i < W * LINE_H; i++) x[i] = x[W * LINE_H + i] = x[2 * W * LINE_H + i] = Math.round(r[i]) / 127.5 - 1;
  return [x, W];
}

function decode(logp, T, C) { // greedy CTC
  let out = "", prev = 0;
  for (let t = 0; t < T; t++) {
    let k = 0;
    for (let c = 1; c < C; c++) if (logp[t * C + c] > logp[t * C + k]) k = c;
    if (k !== prev && k !== 0) out += CHARS[k - 1];
    prev = k;
  }
  return out;
}

const breathe = () => new Promise(r => setTimeout(r, 0)); // let the page repaint between steps

async function readLine(g, card, b, {rec, ort}) {
  const input = lineInput(g, card.w, card.h, b);
  if (!input) return null;
  const [x, W] = input, y = (await rec.run({x: new ort.Tensor("float32", x, [1, 3, LINE_H, W])})).logp;
  return decode(y.data, y.dims[1], y.dims[2]);
}

async function items(card, g, models, progress) {
  progress("Mencari teks...");
  await breathe();
  const boxes = await findLines(card, models.det, models.ort), out = [];
  for (const [i, b] of boxes.entries()) {
    if (i % 4 === 0) { progress(`Membaca baris ${i + 1}/${boxes.length}...`); await breathe(); }
    const text = await readLine(g, card, b, models);
    if (text !== null) out.push([text, b]);
  }
  return out;
}

// Reader.respace: re-read the boxes that make up a free-text value with 30% of the text height as margin; keep
// the new reading only if its letters and digits are identical, so it can only add or move spaces. ponytail: no 2x
// upscale like Python, because the reader scales every line to 48 px high anyway.
function respacer(card, g, lines, models) {
  const trim = s => s.replace(/^[: ']+|[: ']+$/g, ""), alnum = s => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return async text => {
    if (!text) return text;
    for (const [raw, b] of lines) {
      const t = trim(raw);
      if (!t || !text.includes(t)) continue;
      const xs = b.map(p => p[0]), ys = b.map(p => p[1]), pad = Math.trunc((Math.max(...ys) - Math.min(...ys)) * 0.3);
      const x0 = Math.max(Math.trunc(Math.min(...xs)) - pad, 0), x1 = Math.min(Math.trunc(Math.max(...xs)) + pad, card.w - 1);
      const y0 = Math.max(Math.trunc(Math.min(...ys)) - pad, 0), y1 = Math.min(Math.trunc(Math.max(...ys)) + pad, card.h - 1);
      let got = await readLine(g, card, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], models);
      got = trim(got || "").replace(/\s+/g, " ");
      const spaces = s => s.split(" ").length;
      if (got && spaces(got) > spaces(t) && alnum(got) === alnum(t)) text = text.replace(t, () => got);
    }
    return text;
  };
}

// All fields from a flattened card. Tries it upright, then turned 180 degrees if no NIK was read at all.
// Unlike Reader.read_card, a 16-digit but invalid NIK (a misread, or a specimen card) doesn't trigger the
// second read: on a phone each read takes seconds, and an upside-down card reads no NIK.
// progress(text) is called between steps. Returns {fields, lines (OCR items), card, ms}.
export async function readCard(card, models, progress = () => {}) {
  const t0 = performance.now(), tries = [];
  for (const c of [card, rotate180(card)]) {
    const g = grey(c), lines = await items(c, g, models, progress);
    const fields = await extractFields(lines, null, models.wilayah, models.respace === false ? null : respacer(c, g, lines, models));
    tries.push({fields, lines, card: c, score: (fields.nik_valid ? 2 : 0) + (fields.nik ? 1 : 0)});
    if (fields.nik) break;
    progress("Membalik KTP...");
  }
  const best = tries.reduce((a, b) => b.score > a.score ? b : a);
  return {...best, ms: Math.round(performance.now() - t0)};
}

// --- uploads: ktp.read_upload ---------------------------------------------------------------------------------

// order_corners in ktp.py: tl, tr, br, bl clockwise with a long edge on top.
export function orderCorners(pts) {
  const cx = pts.reduce((a, p) => a + p[0], 0) / 4, cy = pts.reduce((a, p) => a + p[1], 0) / 4;
  let q = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let s = 0;
  q.forEach((p, i) => { if (p[0] + p[1] < q[s][0] + q[s][1]) s = i; });
  q = [...q.slice(s), ...q.slice(0, s)];
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return d(q[1], q[0]) < d(q[3], q[0]) ? [...q.slice(1), q[0]] : q;
}

// Bilinear sample with edge pixels repeated (cv2 BORDER_REPLICATE); outside=null repeats, else returns that value.
function sampler({w, h, data}, outside = null) {
  return (sx, sy, c) => {
    if (outside !== null && (sx < -0.5 || sy < -0.5 || sx > w - 0.5 || sy > h - 0.5)) return outside;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    const at = (x, y) => data[(Math.min(Math.max(y, 0), h - 1) * w + Math.min(Math.max(x, 0), w - 1)) * 4 + c];
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
}

// CardDetector in ktp.py: DocAligner lcnet100, 256x256 BGR in [0, 1], centroid of the biggest blob >= 0.3 per
// heatmap. pad = black border per side (fraction), square = letterbox first. The padded photo is never built:
// the 256x256 input samples it directly (cv2.resize-style centres). Returns 4 unordered corners or null.
export async function detectCorners(img, session, ort, {pad = 0, square = false} = {}) {
  const {w, h} = img, S = 256;
  let t = Math.trunc(h * pad), b = t, l = Math.trunc(w * pad), r = l;
  if (square) {
    const s = Math.max(w, h);
    t += Math.floor((s - h) / 2); b += s - h - Math.floor((s - h) / 2);
    l += Math.floor((s - w) / 2); r += s - w - Math.floor((s - w) / 2);
  }
  const PW = w + l + r, PH = h + t + b, at = sampler(img, 0), x = new Float32Array(3 * S * S);
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
    const sx = (xx + 0.5) * PW / S - 0.5 - l, sy = (y + 0.5) * PH / S - 0.5 - t;
    [2, 1, 0].forEach((c, k) => { x[k * S * S + y * S + xx] = at(sx, sy, c) / 255; });
  }
  const out = (await session.run({img: new ort.Tensor("float32", x, [1, 3, S, S])})).heatmap;
  const [, , H, W] = out.dims, pts = [];
  for (let k = 0; k < 4; k++) {
    const hm = out.data.subarray(k * H * W, (k + 1) * H * W), seen = new Uint8Array(H * W);
    let best = null;
    for (let s = 0; s < H * W; s++) {
      if (hm[s] < 0.3 || seen[s]) continue;
      let n = 0, sx = 0, sy = 0;
      const stack = [s];
      seen[s] = 1;
      while (stack.length) { // 8-connected, like cv2.connectedComponentsWithStats
        const p = stack.pop(), px = p % W, py = (p - px) / W;
        n++; sx += px; sy += py;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const qx = px + dx, qy = py + dy, q = qy * W + qx;
          if (qx >= 0 && qy >= 0 && qx < W && qy < H && hm[q] >= 0.3 && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
      if (!best || n > best.n) best = {n, cx: sx / n, cy: sy / n};
    }
    if (!best) return null;
    pts.push([(best.cx + 0.5) * PW / W - l, (best.cy + 0.5) * PH / H - t]);
  }
  return pts;
}

// text_angle in ktp.py: median tilt (degrees) of the wide boxes' top edges.
function textAngle(boxes) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const a = boxes.filter(b => d(b[0], b[1]) > 2 * d(b[1], b[2]))
    .map(b => Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]) * 180 / Math.PI).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
}

// The whole photo as the card: portrait turned clockwise to landscape, straightened by the text angle
// (cv2.getRotationMatrix2D + warpAffine, edges repeated), resized to the card size.
async function wholePhoto(img, models) {
  let src = img;
  if (img.h > img.w) { // rotate 90 degrees clockwise
    const {w, h, data} = img, out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.set(data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (x * h + (h - 1 - y)) * 4);
    src = {w: h, h: w, data: out};
  }
  const small = shrink(src, 1600); // the text finder only needs about 736 px on the short side
  const ang = textAngle(await findLines(small, models.det, models.ort)) * Math.PI / 180;
  const at = sampler(src), cx = src.w / 2, cy = src.h / 2, cos = Math.cos(ang), sin = Math.sin(ang);
  const out = new Uint8ClampedArray(CARD_W * CARD_H * 4);
  for (let y = 0; y < CARD_H; y++) for (let x = 0; x < CARD_W; x++) {
    // card pixel -> rotated photo -> original photo (inverse of the rotation by +ang about the centre)
    const rx = (x + 0.5) * src.w / CARD_W - 0.5 - cx, ry = (y + 0.5) * src.h / CARD_H - 0.5 - cy;
    const sx = Math.abs(ang) > 0.5 * Math.PI / 180 ? cos * rx - sin * ry + cx : rx + cx;
    const sy = Math.abs(ang) > 0.5 * Math.PI / 180 ? sin * rx + cos * ry + cy : ry + cy;
    const o = (y * CARD_W + x) * 4;
    for (let c = 0; c < 3; c++) out[o + c] = at(sx, sy, c);
    out[o + 3] = 255;
  }
  return {w: CARD_W, h: CARD_H, data: out};
}

function shrink(img, maxSide) { // area-average downscale so the long side is <= maxSide
  const f = Math.max(img.w, img.h) / maxSide;
  if (f <= 1) return img;
  const W = Math.round(img.w / f), H = Math.round(img.h / f), out = new Uint8ClampedArray(W * H * 4);
  for (let c = 0; c < 4; c++) {
    const r = resize(channel(img, c), img.w, img.h, W, H);
    for (let i = 0; i < W * H; i++) out[i * 4 + c] = r[i];
  }
  return {w: W, h: H, data: out};
}

// nik_spot_ok in ktp.py: the NIK's box sits where a full, flat card prints it.
function nikSpotOk(lines, nik) {
  for (const [t, b] of lines) {
    if (!nik || extractNik([t]) !== nik) continue;
    const xs = b.map(p => p[0]), ys = b.map(p => p[1]);
    const cy = ys.reduce((a, v) => a + v) / 4 / CARD_H, wd = (Math.max(...xs) - Math.min(...xs)) / CARD_W;
    return Math.round(cy * 1000) / 1000 >= 0.15 && Math.round(cy * 1000) / 1000 <= 0.23 &&
      Math.round(wd * 1000) / 1000 >= 0.41 && Math.round(wd * 1000) / 1000 <= 0.51;
  }
  return false;
}

// An uploaded photo (no live corners): corners as-is, letterboxed, with a 50% border, then the whole photo;
// stops at a valid NIK in the card's NIK spot, else keeps the best try. models.detector is the DocAligner session.
// Returns {fields, lines, card, ms, step} or null when nothing could be read.
export async function readUpload(img, models, progress = () => {}) {
  const t0 = performance.now(), tries = [];
  const steps = [["kartu", {}], ["kartu (persegi)", {square: true}], ["kartu (bingkai)", {pad: 0.5}], ["foto utuh", null]];
  for (const [step, opt] of steps) {
    progress(`Mencari KTP: ${step}...`);
    let card;
    if (opt) {
      const q = await detectCorners(img, models.detector, models.ort, opt);
      if (!q) continue;
      card = warpCard(img, orderCorners(q));
    } else card = await wholePhoto(img, models);
    const r = await readCard(card, models, progress);
    const spot = nikSpotOk(r.lines, r.fields.nik);
    tries.push({...r, step, rank: (r.fields.nik_valid ? 2 : 0) + (spot ? 1 : 0)});
    if (r.fields.nik_valid && spot) break;
  }
  if (!tries.length) return null;
  const best = tries.reduce((a, b) => b.rank > a.rank ? b : a);
  return {...best, ms: Math.round(performance.now() - t0)};
}

export {nikValid};
