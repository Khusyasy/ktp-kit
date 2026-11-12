// Headless capture: camera, live card detection, quality checks and auto-capture. No UI: subscribe to the state
// and draw whatever you like (the <ktp-capture> element, the React and Vue adapters all use this).
//
// state.status: "idle" | "starting" | "searching" | "adjust" | "hold" | "reading" | "done" | "error"
// state.hint:   message key (see MESSAGES) for searching / adjust / hold / reading
import {orderCorners, warpCard} from "./reader.js";

// Thresholds measured on real KTP photos and a synthetic blur/glare test (see the project notes).
export const DEFAULTS = {
  minConf: 0.3,         // heatmap peak needed for each corner
  margin: 0.02,         // corners must be this far inside the frame (fraction of width/height)
  minArea: 0.20,        // the card must fill this much of the frame
  ratio: [1.45, 1.8],   // long/short side (a flat KTP is 1.585)
  parallel: 0.85,       // shorter/longer of opposite edges; lower = tilted
  sharp: 0.015,         // worst-direction sharpness / contrast on the card interior
  glare: 0.05,          // max share of near-white pixels on the card
  stableFrames: 4,      // frames in a row with corners barely moving before auto-capture
  stableMove: 0.015,    // max corner movement per frame (fraction of the frame diagonal)
};

export const MESSAGES = {
  id: {
    loading: "Memuat model...", noCamera: "Kamera tidak bisa dibuka. Izinkan akses kamera lalu muat ulang.",
    find: "Arahkan kamera ke KTP", frame: "Pastikan seluruh KTP masuk ke bingkai", closer: "Dekatkan kamera ke KTP",
    flat: "Pegang kamera sejajar dengan KTP", glare: "Ada pantulan cahaya, geser posisi KTP",
    blur: "Gambar buram, tahan kamera", hold: "Tahan sebentar...", reading: "Membaca KTP di perangkat ini...",
    noCard: "KTP tidak terdeteksi, coba lagi", noCardPhoto: "KTP tidak ditemukan di foto ini. Coba foto lain.",
    failed: "Gagal membaca, coba lagi", badNik: "NIK tidak terbaca. Silakan ambil ulang.",
    invalidNik: "NIK terbaca tapi tidak valid. Periksa KTP lalu ambil ulang.", notKtp: "Sepertinya ini bukan KTP.", notImage: "Berkas ini bukan foto. Pilih foto JPEG atau PNG.",
    local: s => `Dibaca di perangkat ini dalam ${s} detik. Foto tidak dikirim ke mana pun.`,
    offline: mb => `Siap offline · ${mb} MB tersimpan di perangkat`, download: (p, mb) => `Mengunduh pembaca KTP ${p}% (${mb} MB)`,
    shutter: "Ambil foto", upload: "Unggah foto", retake: "Ambil ulang", check: "cek lagi, tidak cocok dengan NIK",
  },
  en: {
    loading: "Loading models...", noCamera: "Can't open the camera. Allow camera access and reload.",
    find: "Point the camera at the KTP", frame: "Fit the whole KTP inside the frame", closer: "Move closer to the KTP",
    flat: "Hold the camera parallel to the KTP", glare: "Glare on the card, move it a little",
    blur: "Image is blurry, hold still", hold: "Hold still...", reading: "Reading the KTP on this device...",
    noCard: "No KTP found, try again", noCardPhoto: "No KTP found in this photo. Try another one.",
    failed: "Couldn't read it, try again", badNik: "NIK not readable. Please retake.",
    invalidNik: "NIK read but not valid. Check the card and retake.", notKtp: "This doesn't look like a KTP.", notImage: "This file isn't a photo. Pick a JPEG or PNG.",
    local: s => `Read on this device in ${s} s. The photo was not sent anywhere.`,
    offline: mb => `Ready offline · ${mb} MB stored on this device`, download: (p, mb) => `Downloading KTP reader ${p}% (${mb} MB)`,
    shutter: "Take photo", upload: "Upload photo", retake: "Retake", check: "check again, doesn't match the NIK",
  },
};

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const canvas = (w, h) => Object.assign(document.createElement("canvas"), {width: w, height: h});

/**
 * @param {object} o
 * @param {HTMLVideoElement} o.video
 * @param {ReturnType<import("./engine.js").createKtpReader>} o.engine
 * @param {Partial<typeof DEFAULTS>} [o.config]
 */
export function createCapture({video, engine, config = {}}) {
  const cfg = {...DEFAULTS, ...config}, listeners = new Set();
  let state = {status: "idle"}, session, prev = null, stable = 0, running = false, stream, gen = 0, paused = false;
  const set = patch => { state = {...state, ...patch}; listeners.forEach(f => f(state)); };

  const S = 256, inX = canvas(S, S).getContext("2d", {willReadFrequently: true}), input = new Float32Array(3 * S * S);
  async function detect() { // DocAligner heatmaps: weighted centroid of strong pixels around each peak
    inX.drawImage(video, 0, 0, S, S);
    const d = inX.getImageData(0, 0, S, S).data;
    for (let i = 0, p = 0; i < S * S; i++, p += 4) { // BGR planes
      input[i] = d[p + 2] / 255; input[S * S + i] = d[p + 1] / 255; input[2 * S * S + i] = d[p] / 255;
    }
    const out = (await session.run({img: new engine.ort.Tensor("float32", input, [1, 3, S, S])})).heatmap;
    const [, , H, W] = out.dims, hm = out.data, vw = video.videoWidth, vh = video.videoHeight, pts = [];
    for (let k = 0; k < 4; k++) {
      const off = k * H * W;
      let best = 0, bi = 0;
      for (let i = 0; i < H * W; i++) if (hm[off + i] > best) { best = hm[off + i]; bi = i; }
      if (best < cfg.minConf) return null;
      const bx = bi % W, by = (bi / W) | 0;
      let sx = 0, sy = 0, sw = 0;
      for (let y = Math.max(0, by - 6); y <= Math.min(H - 1, by + 6); y++)
        for (let x = Math.max(0, bx - 6); x <= Math.min(W - 1, bx + 6); x++) {
          const v = hm[off + y * W + x];
          if (v >= cfg.minConf) { sx += v * x; sy += v * y; sw += v; }
        }
      pts.push([(sx / sw + 0.5) * vw / W, (sy / sw + 0.5) * vh / H]);
    }
    return orderCorners(pts);
  }

  const px = canvas(1, 1).getContext("2d", {willReadFrequently: true});
  function pixelStats(q) { // card interior only (15% inset)
    const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const dx = (x1 - x0) * 0.15, dy = (y1 - y0) * 0.15;
    x0 += dx; x1 -= dx; y0 += dy; y1 -= dy;
    const w = 320, h = Math.max(3, Math.round(w * (y1 - y0) / (x1 - x0)));
    px.canvas.width = w; px.canvas.height = h;
    px.drawImage(video, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h);
    const d = px.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
    let bright = 0, m = 0, m2 = 0, ex = 0, ey = 0, e1 = 0, e2 = 0, n = 0;
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      g[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      if (g[i] > 245) bright++;
      m += g[i]; m2 += g[i] * g[i];
    }
    // Sharpness in the worst direction relative to contrast: camera shake smears one way only.
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const i = y * w + x, a = g[i];
      ex += (g[i + 1] - a) ** 2; ey += (g[i + w] - a) ** 2;
      e1 += (g[i + w + 1] - a) ** 2 / 2; e2 += (g[i + w] - g[i + 1]) ** 2 / 2;
      n++;
    }
    const variance = Math.max(m2 / (w * h) - (m / (w * h)) ** 2, 1e-6);
    return {sharp: Math.min(ex, ey, e1, e2) / n / variance, glare: bright / (w * h)};
  }

  function assess(q) {
    const vw = video.videoWidth, vh = video.videoHeight, m = cfg.margin;
    if (!q) return {hint: "find"};
    if (q.some(([x, y]) => x < m * vw || x > (1 - m) * vw || y < m * vh || y > (1 - m) * vh)) return {hint: "frame"};
    const area = Math.abs(q.reduce((a, p, i) => a + p[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * p[1], 0)) / 2 / (vw * vh);
    if (area < cfg.minArea) return {hint: "closer", area};
    const top = dist(q[0], q[1]), bot = dist(q[3], q[2]), left = dist(q[0], q[3]), right = dist(q[1], q[2]);
    const ratio = (top + bot) / (left + right);
    const par = Math.min(Math.min(top, bot) / Math.max(top, bot), Math.min(left, right) / Math.max(left, right));
    if (ratio < cfg.ratio[0] || ratio > cfg.ratio[1] || par < cfg.parallel) return {hint: "flat", area, ratio, par};
    const {sharp, glare} = pixelStats(q), info = {area, ratio, par, sharp, glare};
    if (glare > cfg.glare) return {hint: "glare", ...info};
    if (sharp < cfg.sharp) return {hint: "blur", ...info};
    return {ok: true, hint: "hold", ...info};
  }

  // Start (or restart) guidance. Each call ends any older loop, so a retake never runs two loops at once.
  const kick = () => { const g = ++gen; requestAnimationFrame(() => loop(g)); };

  async function loop(g) {
    if (g !== gen || !running || state.status === "reading" || state.status === "done") return;
    let q;
    try { q = await detect(); } catch (e) { set({status: "error", error: "failed", detail: e}); return; }
    if (g !== gen) return;
    const a = assess(q);
    const move = q && prev ? Math.max(...q.map((p, i) => dist(p, prev[i]))) / Math.hypot(video.videoWidth, video.videoHeight) : 1;
    prev = q;
    stable = a.ok && move < cfg.stableMove ? stable + 1 : 0;
    set({status: !q ? "searching" : a.ok ? "hold" : "adjust", hint: a.hint, corners: q, quality: a});
    if (stable >= cfg.stableFrames) return shoot(q);
    requestAnimationFrame(() => loop(g));
  }

  // preview: an RGBA image to show at once while reading (the straightened card, or the uploaded photo).
  // miss: the error to show when no card is found
  async function finish(read, preview, miss) {
    set({status: "reading", hint: "reading", step: undefined, preview});
    // let the screen show this photo before the heavy work starts (it keeps the page busy until it ends)
    await new Promise(r => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 100); });  // 100 ms: hidden tabs get no frames
    try {
      const r = await read(text => set({step: text}));
      set(r ? {status: "done", result: r} : {status: "error", error: miss});
      return r;
    } catch (e) {
      set({status: "error", error: "failed", detail: e});
    }
  }

  // One read at a time: a shutter tap just as auto-capture fires, or two uploads, must not start two reads.
  // The flag is set before the first await, so a second call made in the same moment sees it.
  let busy = false;
  const once = fn => async (...a) => {
    if (busy) return null;
    busy = true;
    try { return await fn(...a); } finally { busy = false; }
  };

  /** Take the current frame now (auto-capture calls this too). */
  const shoot = once(async q => {
    q ??= state.corners ?? await detect();
    if (!q) { set({status: "error", error: "noCard"}); return null; }
    const vw = video.videoWidth, vh = video.videoHeight, cx = canvas(vw, vh).getContext("2d");
    cx.drawImage(video, 0, 0);
    const frame = {w: vw, h: vh, data: cx.getImageData(0, 0, vw, vh).data};
    return finish(step => engine.readFrame(frame, q, step), warpCard(frame, orderCorners(q)), "noCard");
  });

  /** Read a photo file (gallery / upload) instead of the camera. */
  const readFile = once(async fileOrBlob => {
    let bmp;
    try { bmp = await createImageBitmap(fileOrBlob, {imageOrientation: "from-image"}); }
    catch (e) { set({status: "error", error: "notImage", detail: e}); return null; }
    const f = Math.min(1, 3000 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * f), h = Math.round(bmp.height * f);
    const cx = canvas(w, h).getContext("2d");
    cx.drawImage(bmp, 0, 0, w, h);
    const img = {w, h, data: cx.getImageData(0, 0, w, h).data};
    return finish(step => engine.readImage(img, step), img, "noCardPhoto");
  });

  async function openCamera() {
    stream = await navigator.mediaDevices.getUserMedia({audio: false,
      video: {facingMode: {ideal: "environment"}, width: {ideal: 1920}, height: {ideal: 1080}}});
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    video.muted = true;
    await video.play();
    running = true; prev = null; stable = 0;
  }
  function closeCamera() { running = false; gen++; stream?.getTracks().forEach(t => t.stop()); stream = undefined; }

  // Turn the camera off while the tab is hidden (battery, and the camera light), back on when it returns.
  async function onVisibility() {
    if (document.hidden && stream) { closeCamera(); paused = true; }
    else if (!document.hidden && paused) {
      paused = false;
      try { await openCamera(); if (state.status !== "reading" && state.status !== "done") kick(); }
      catch (e) { set({status: "error", error: "noCamera", detail: e}); }
    }
  }

  return {
    get state() { return state; },
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    /** Open the camera and start guiding. Downloads the reader in the background meanwhile. */
    async start() {
      set({status: "starting", hint: "loading"});
      // Download the reader right away, camera or not: uploads and the offline badge must work without a camera.
      engine.preload(p => set({download: p})).then(() => engine.status()).then(o => set({offline: o}), () => {});
      document.addEventListener("visibilitychange", onVisibility);
      try {
        session = await engine.detector();
        await openCamera();
        set({status: "searching", hint: "find"});
        kick();
      } catch (e) {
        set({status: "error", error: e.name === "NotAllowedError" || e.name === "NotFoundError" ? "noCamera" : "failed", detail: e});
      }
    },
    stop() {
      document.removeEventListener("visibilitychange", onVisibility);
      closeCamera(); paused = false; set({status: "idle"});
    },
    shoot, readFile,
    /** Back to the camera after a result or an error. */
    retake() { prev = null; stable = 0; set({status: "searching", hint: "find", result: undefined, error: undefined}); kick(); },
  };
}
