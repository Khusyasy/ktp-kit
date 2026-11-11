// The engine: downloads the models once (stored on the device with the Cache API), then reads KTPs locally.
// Works in the browser and in Node (pass `load` to read files from disk). Nothing is ever uploaded.
import {readCard, readUpload, warpCard, orderCorners} from "./reader.js";
import {Wilayah, nikConflicts, ktpLabels} from "./ktp.js";
import {parseNik} from "./nik.js";

// Files expected under `base` (copy them with `npx ktp-kit assets <dir>`).
export const FILES = {
  corners: "corners.onnx",                 // card corner detector (DocAligner lcnet100, Apache-2.0)
  det: "det.onnx",                         // text-line finder (PP-OCRv6 small det, Apache-2.0)
  rec: "rec.onnx",                         // line reader (PP-OCRv6 tiny, fine-tuned on synthetic KTP lines)
  wilayah: "wilayah.csv",                  // official region codes (cahyadsn/wilayah, MIT)
  wasm: "ort/ort-wasm-simd-threaded.wasm", // onnxruntime-web runtime (engine)
  mjs: "ort/ort-wasm-simd-threaded.mjs",   // onnxruntime-web runtime (loader)
};
// Bump with every model change, or devices keep the old files.
const CACHE = "ktp-kit-v2";
// Stored on the device; the 24 KB runtime loader is left to the HTTP cache (it can't run from a blob: URL).
const CACHED = Object.values(FILES).filter(f => f !== FILES.mjs);

/**
 * @typedef {{loaded: number, total: number}} Progress  bytes downloaded so far / expected
 * @typedef {{w: number, h: number, data: Uint8ClampedArray}} RgbaImage
 * @typedef {object} KtpResult
 * @property {string|null} nik
 * @property {boolean} nik_valid          16 digits with a plausible region, birth date and sequence
 * @property {string|null} nama
 * @property {string|null} tempat_lahir
 * @property {string|null} tanggal_lahir  DD-MM-YYYY
 * @property {string|null} jenis_kelamin  LAKI-LAKI | PEREMPUAN
 * @property {string|null} gol_darah      A, B, AB, O (+/-) or "-"
 * @property {string|null} alamat
 * @property {string|null} rt_rw          000/000
 * @property {string|null} kel_desa
 * @property {string|null} kecamatan
 * @property {string|null} kabupaten_kota
 * @property {string|null} provinsi
 * @property {string|null} agama
 * @property {string|null} status_perkawinan
 * @property {string|null} pekerjaan
 * @property {string|null} kewarganegaraan  WNI | WNA
 * @property {string|null} berlaku_hingga   SEUMUR HIDUP or DD-MM-YYYY
 * @property {string|null} kota_terbit
 * @property {string|null} tanggal_terbit
 * @property {string|null} [kode_wilayah]   official region code of the most specific region matched
 * @property {string[]} perlu_dicek         fields that disagree with what the NIK encodes
 * @property {boolean} isKtp                experimental: false when the card shows few KTP labels and no valid NIK
 * @property {RgbaImage} card               the straightened 856x540 card (the element turns it into a JPEG Blob)
 * @property {number} ms                    reading time on this device
 */

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
  let corners, all, regions;
  // Real file sizes from `npx ktp-kit assets` (sizes.json). Content-Length can't be used for progress: hosts
  // compress on the fly, so it reports compressed bytes while the stream yields uncompressed ones.
  const sizes = load ? Promise.resolve({}) : fetch(url("sizes.json")).then(r => (r.ok ? r.json() : {})).catch(() => ({}));

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
    const known = (await sizes)[name], parts = [], rd = res.body.getReader();
    for (let got = 0; ;) {
      const {done, value} = await rd.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      onBytes(got, known || got);  // without sizes.json the bar can't know the total: show bytes so far
    }
    const blob = new Blob(parts);
    await cache?.put(url(name), new Response(blob)).catch(() => {});
    return blob.arrayBuffer();
  }

  // The runtime also comes from the device cache, so reading works offline without the app's service worker.
  // Every session waits for it: onnxruntime initialises its backend once, on the first session, and a session
  // created before the paths are set fails for good ("no available backend found").
  let rt;
  const runtime = (onBytes = () => {}) => rt ??= (async () => {
    if (load) return;
    // The 11 MB engine comes from the device cache. Its 24 KB loader must load from its real address: it finds its
    // files relative to its own URL, which fails from a blob: URL ("Invalid URL"). The browser's HTTP cache keeps it.
    ort.env.wasm.wasmBinary = await file(FILES.wasm, onBytes);
    ort.env.wasm.wasmPaths = {mjs: url(FILES.mjs), wasm: url(FILES.wasm)};
  })().catch(e => { rt = undefined; throw e; });
  const session = async b => {
    await runtime();
    return ort.InferenceSession.create(new Uint8Array(b), {executionProviders: ["wasm"]});
  };

  /** The region table only (~2 MB): enough for parseNik. @param {(p: Progress) => void} [onProgress] */
  function wilayah(onProgress = () => {}) {
    regions ??= file(FILES.wilayah, (loaded, total) => onProgress({loaded, total}))
      .then(b => new Wilayah(typeof b === "string" ? b : new TextDecoder().decode(b)))
      .catch(e => { regions = undefined; throw e; });
    return regions;
  }

  /** Only the corner detector (~5 MB): enough for live camera guidance while the rest downloads.
   * @param {(p: Progress) => void} [onProgress] */
  function detector(onProgress = () => {}) {
    corners ??= (async () => {
      const bytes = {};
      const tick = k => (g, t) => { bytes[k] = [g, t || g]; onProgress(sum(bytes)); };
      await runtime(tick("wasm"));
      return session(await file(FILES.corners, tick("corners")));
    })().catch(e => { corners = undefined; throw e; });
    return corners;
  }

  /** Everything (~27 MB the first time, then from the device).
   * @param {(p: Progress) => void} [onProgress] */
  function preload(onProgress = () => {}) {
    all ??= (async () => {
      const bytes = {}, tick = k => (g, t) => { bytes[k] = [g, t || g]; onProgress(sum(bytes)); };
      const [detector_, det, rec, csv] = await Promise.all([detector(p => { bytes.d = [p.loaded, p.total]; onProgress(sum(bytes)); }),
        file(FILES.det, tick("det")).then(session), file(FILES.rec, tick("rec")).then(session),
        wilayah(p => { bytes.w = [p.loaded, p.total]; onProgress(sum(bytes)); })]);
      await globalThis.navigator?.storage?.persist?.().catch(() => {});
      return {detector: detector_, det, rec, ort, wilayah: csv};
    })().catch(e => { all = undefined; throw e; });
    return all;
  }

  /** {ready, bytes}: whether every file is stored on this device (so reading works offline). */
  async function status() {
    if (load || !globalThis.caches) return {ready: !!load, bytes: 0};
    const cache = await caches.open(CACHE);
    let bytes = 0, n = 0;
    for (const name of CACHED) {
      const r = await cache.match(url(name));
      if (r) { n++; bytes += (await r.blob()).size; }
    }
    return {ready: n === CACHED.length, bytes};
  }

  const clearCache = () => globalThis.caches?.delete(CACHE);

  const result = r => r && {
    ...r.fields, perlu_dicek: nikConflicts(r.fields), raw: undefined,
    isKtp: r.fields.nik_valid || ktpLabels(r.lines) >= 3, // experimental: a KTP shows most of its 10 printed labels
    card: r.card, ms: r.ms,
  };

  return {
    ort, detector, preload, status, clearCache, wilayah,
    /** What a NIK encodes (birth date, gender, region names), without reading a card. @param {string} nik */
    async parseNik(nik) { return parseNik(nik, await wilayah()); },
    /** A photo with a card somewhere in it: finds the card (with fallbacks), then reads it.
     * @param {RgbaImage} img @param {(step: string) => void} [onStep] @returns {Promise<KtpResult|null>} */
    async readImage(img, onStep) {
      return result(await readUpload(img, await preload(), onStep));
    },
    /** A camera frame plus the 4 card corners from live detection.
     * @param {RgbaImage} frame @param {number[][]} cornerPoints @param {(step: string) => void} [onStep]
     * @returns {Promise<KtpResult>} */
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
