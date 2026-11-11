// The engine: downloads the models once (stored on the device with the Cache API), then reads KTPs locally.
// Works in the browser and in Node (pass `load` to read files from disk). Nothing is ever uploaded.
import {readCard, readUpload, warpCard, orderCorners} from "./reader.js";
import {Wilayah, nikConflicts, ktpLabels} from "./ktp.js";

// Files expected under `base` (copy them with `npx ktp-kit assets <dir>`).
export const FILES = {
  corners: "corners.onnx",                 // card corner detector (DocAligner lcnet100, Apache-2.0)
  det: "det.onnx",                         // text-line finder (PP-OCRv6 small det, Apache-2.0)
  rec: "rec.onnx",                         // line reader (PP-OCRv6 tiny, fine-tuned on synthetic KTP lines)
  wilayah: "wilayah.csv",                  // official region codes (cahyadsn/wilayah, MIT)
  wasm: "ort/ort-wasm-simd-threaded.wasm", // onnxruntime-web runtime (engine)
  mjs: "ort/ort-wasm-simd-threaded.mjs",   // onnxruntime-web runtime (loader)
};
const CACHE = "ktp-kit-v1";

/**
 * @param {object} o
 * @param {string} [o.base="/ktp-kit/"]  where the files from `npx ktp-kit assets` are served
 * @param {object} o.ort                 `import * as ort from "onnxruntime-web"`
 * @param {(name: string) => Promise<ArrayBuffer|Uint8Array>} [o.load]  custom loader (Node, tests); skips caching
 * @param {number} [o.threads]           WebAssembly threads; default 4 when the page is cross-origin isolated, else 1
 */
export function createKtpReader({base = "/ktp-kit/", ort, load, threads} = {}) {
  if (!ort) throw new Error('ktp-kit: pass {ort} (import * as ort from "onnxruntime-web")');
  const isolated = globalThis.crossOriginIsolated === true;
  ort.env.wasm.numThreads = threads ?? (isolated ? Math.min(4, globalThis.navigator?.hardwareConcurrency || 1) : 1);
  const url = name => new URL(base + name, globalThis.location?.href).href;
  let corners, all;

  async function file(name, onBytes = () => {}) {
    if (load) return load(name);
    const cache = globalThis.caches ? await caches.open(CACHE).catch(() => null) : null;
    const hit = cache && await cache.match(url(name));
    if (hit) {
      const b = await hit.arrayBuffer();
      onBytes(b.byteLength, b.byteLength);
      return b;
    }
    const res = await fetch(url(name));
    if (!res.ok) throw new Error(`ktp-kit: ${url(name)} returned ${res.status}`);
    const total = Number(res.headers.get("content-length")) || 0, parts = [], rd = res.body.getReader();
    for (let got = 0; ;) {
      const {done, value} = await rd.read();
      if (done) break;
      parts.push(value);
      onBytes(got += value.length, total);
    }
    const blob = new Blob(parts);
    await cache?.put(url(name), new Response(blob)).catch(() => {});
    return blob.arrayBuffer();
  }

  const session = async b => ort.InferenceSession.create(new Uint8Array(b), {executionProviders: ["wasm"]});
  // The runtime also comes from the device cache, so reading works offline without the app's service worker.
  const runtime = async onBytes => {
    if (load || ort.env.wasm.wasmBinary) return;
    const [wasm, mjs] = await Promise.all([file(FILES.wasm, onBytes), file(FILES.mjs)]);
    ort.env.wasm.wasmBinary = wasm;
    ort.env.wasm.wasmPaths = {mjs: URL.createObjectURL(new Blob([mjs], {type: "text/javascript"}))};
  };

  /** Only the corner detector (~5 MB): enough for live camera guidance while the rest downloads. */
  function detector(onProgress = () => {}) {
    corners ??= (async () => {
      const bytes = {};
      const tick = k => (g, t) => { bytes[k] = [g, t || g]; onProgress(sum(bytes)); };
      await runtime(tick("wasm"));
      return session(await file(FILES.corners, tick("corners")));
    })().catch(e => { corners = undefined; throw e; });
    return corners;
  }

  /** Everything (~27 MB the first time, then from the device). onProgress({loaded, total}) in bytes. */
  function preload(onProgress = () => {}) {
    all ??= (async () => {
      const bytes = {}, tick = k => (g, t) => { bytes[k] = [g, t || g]; onProgress(sum(bytes)); };
      const [detector_, det, rec, csv] = await Promise.all([detector(p => { bytes.d = [p.loaded, p.total]; onProgress(sum(bytes)); }),
        file(FILES.det, tick("det")).then(session), file(FILES.rec, tick("rec")).then(session), file(FILES.wilayah, tick("w"))]);
      await globalThis.navigator?.storage?.persist?.().catch(() => {});
      const text = typeof csv === "string" ? csv : new TextDecoder().decode(csv);
      return {detector: detector_, det, rec, ort, wilayah: new Wilayah(text)};
    })().catch(e => { all = undefined; throw e; });
    return all;
  }

  /** {ready, bytes}: whether every file is stored on this device (so reading works offline). */
  async function status() {
    if (load || !globalThis.caches) return {ready: !!load, bytes: 0};
    const cache = await caches.open(CACHE);
    let bytes = 0, n = 0;
    for (const name of Object.values(FILES)) {
      const r = await cache.match(url(name));
      if (r) { n++; bytes += (await r.blob()).size; }
    }
    return {ready: n === Object.keys(FILES).length, bytes};
  }

  const clearCache = () => globalThis.caches?.delete(CACHE);

  const result = r => r && {
    ...r.fields, perlu_dicek: nikConflicts(r.fields), raw: undefined,
    isKtp: r.fields.nik_valid || ktpLabels(r.lines) >= 3, // experimental: a KTP shows most of its 10 printed labels
    card: r.card, ms: r.ms,
  };

  return {
    ort, detector, preload, status, clearCache,
    /** A photo ({w, h, data: RGBA}) with a card somewhere in it: finds the card (with fallbacks), then reads it. */
    async readImage(img, onStep) {
      return result(await readUpload(img, await preload(), onStep));
    },
    /** A camera frame plus the 4 card corners from live detection. */
    async readFrame(frame, cornerPoints, onStep) {
      return result(await readCard(warpCard(frame, orderCorners(cornerPoints)), await preload(), onStep));
    },
  };
}

function sum(bytes) {
  let loaded = 0, total = 0;
  for (const [g, t] of Object.values(bytes)) { loaded += g; total += t; }
  return {loaded, total};
}
