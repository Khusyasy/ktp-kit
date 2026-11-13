// The engine: downloads the models once (stored on the device with the Cache API), then reads KTPs locally.
// Works in the browser and in Node (pass `load` to read files from disk). Nothing is ever uploaded.
import {readCard, readUpload, warpCard, orderCorners} from "./reader.js";
import {Wilayah, fieldNotes, fieldConfidence, ktpLabels} from "./ktp.js";
import {parseNik} from "./nik.js";

// Files expected under `base` (copy them with `npx ktp-kit assets <dir>`). The CLI compresses them (.br brotli,
// .gz gzip) and they are unpacked here, so the download is small on any host, whether or not it compresses.
export const FILES = {
  corners: "corners.onnx.br",                 // card corner detector (DocAligner lcnet100, Apache-2.0)
  det: "det.onnx.br",                         // text-line finder (PP-OCRv6 small det, Apache-2.0)
  rec: "rec.onnx.br",                         // line reader (PP-OCRv6 tiny, fine-tuned on synthetic KTP lines)
  wilayah: "wilayah.csv.br",                  // official region codes (cahyadsn/wilayah, MIT)
  wasm: "ort/ort-wasm-simd-threaded.wasm.br", // onnxruntime-web runtime (engine)
  mjs: "ort/ort-wasm-simd-threaded.mjs",      // onnxruntime-web runtime (loader)
  brotli: "brotli-dec.wasm.gz",               // brotli decoder for browsers without DecompressionStream("brotli")
};
// Bump with every model change, or devices keep the old files.
const CACHE = "ktp-kit-v5";
export const VERSION = "0.1.2";  // = package.json (scripts/check.mjs), reported in each result for audit logs

// Result keys in card order. Names follow Indonesian KTP OCR APIs (VIDA, GLAIR); the parser's own names differ for
// two fields, kept so it stays line-for-line with ktp.py.
const KEYS = ["nik", "nik_valid", "nama", "tempat_lahir", "tanggal_lahir", "jenis_kelamin", "golongan_darah", "alamat",
  "rt_rw", "kelurahan_desa", "kecamatan", "kabupaten_kota", "provinsi", "agama", "status_perkawinan", "pekerjaan",
  "kewarganegaraan", "berlaku_hingga", "kota_terbit", "tanggal_terbit", "kode_wilayah"];
const RENAME = {gol_darah: "golongan_darah", kel_desa: "kelurahan_desa"};
const outName = f => RENAME[f] || f;
// Below this, name and address get "low_confidence". Held-out photos: catches 73% of wrong names while flagging 13%
// of right ones. Hand-read cards: 14 of 15 wrong addresses, 9 of 43 right ones.
const LOW_CONFIDENCE = 0.6;

// gzip starts with 1f 8b. Hosts that already unpacked a .gz (Content-Encoding) hand over plain bytes: keep them.
async function gunzip(b) {
  const u = new Uint8Array(b);
  if (u[0] !== 0x1f || u[1] !== 0x8b) return b;
  return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}
const stored = name => name.replace(/\.(gz|br)$/, "");  // the file's own name, before compression
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
 * @property {string|null} golongan_darah A, B, AB, O (+/-) or "-"
 * @property {string|null} alamat
 * @property {string|null} rt_rw          000/000
 * @property {string|null} kelurahan_desa
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
 * @property {string|null} kode_wilayah    official region code of the most specific region matched
 * @property {Object<string, string[]>} perlu_dicek  fields worth a second look, with reasons:
 *   nik_mismatch (disagrees with the NIK), from_nik (unreadable, filled from the NIK), low_confidence (name or
 *   address: the reader was unsure of at least one character)
 * @property {{is_ktp: boolean, ms: number, versi: string, confidence: {nama?: number, alamat?: number, tempat_lahir?: number, rt_rw?: number}}} info
 *   is_ktp (experimental): false when the card shows few KTP labels and no valid NIK. ms: reading time on this
 *   device. versi: ktp-kit version. confidence: lowest character probability for name, address, birthplace and RT/RW (0-1),
 *   name and address below 0.6 get "low_confidence". Use your own limit if that suits your app better.
 * @property {RgbaImage} card               the straightened 856x540 card (the element turns it into a JPEG Blob)
 */

/**
 * @param {object} o
 * @param {string} [o.base="/ktp-kit/"]  where the files from `npx ktp-kit assets` are served
 * @param {object} o.ort                 `import * as ort from "ktp-kit/ort"` (browser only)
 * @param {(name: string) => Promise<ArrayBuffer|Uint8Array>} [o.load]  custom loader (Node, tests); skips caching
 * @param {number} [o.threads]           WebAssembly threads; default 4 when the page is cross-origin isolated, else 1
 */
export function createKtpReader({base = "/ktp-kit/", ort, load, threads} = {}) {
  if (!ort?.InferenceSession) throw new Error('ktp-kit: pass {ort} (import * as ort from "ktp-kit/ort"). Reading runs in the browser only.');
  const isolated = globalThis.crossOriginIsolated === true;
  ort.env.wasm.numThreads = threads ?? (isolated ? Math.min(4, globalThis.navigator?.hardwareConcurrency || 1) : 1);
  const url = name => new URL(base + name, globalThis.location?.href).href;
  let corners, all, regions;
  // Real file sizes from `npx ktp-kit assets` (sizes.json). Content-Length can't be used for progress: hosts
  // compress on the fly, so it reports compressed bytes while the stream yields uncompressed ones.
  const sizes = load ? Promise.resolve({}) : fetch(url("sizes.json")).then(r => (r.ok ? r.json() : {})).catch(() => ({}));

  // Brotli is ~1.3 MB smaller than gzip here. Firefox and Safari unpack it natively; Chromium (no
  // DecompressionStream("brotli") yet) gets a 100 KB WebAssembly decoder (brotli-dec-wasm, MIT), itself gzipped.
  let decoder;
  async function unbrotli(b) {
    const u = new Uint8Array(b);
    try {
      return await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("brotli"))).arrayBuffer();
    } catch (e) {
      if (!(e instanceof TypeError)) return b;  // not brotli: a host already unpacked it (Content-Encoding)
    }
    decoder ??= Promise.all([import("./brotli-dec.js"), file(FILES.brotli)]).then(([m, wasm]) => {
      m.initSync({module: new Uint8Array(wasm)});
      return m;
    }).catch(e => { decoder = undefined; throw e; });
    const m = await decoder;
    try { return m.decompress(u).buffer; } catch { return b; }  // undecodable: already plain bytes
  }
  const unpack = (name, b) => name.endsWith(".br") ? unbrotli(b) : gunzip(b);

  async function file(name, onBytes = () => {}) {
    if (load) return load(stored(name));  // Node and tests read the plain files
    const cache = globalThis.caches ? await caches.open(CACHE).catch(() => null) : null;
    const hit = cache && await cache.match(url(name));
    if (hit) {
      const b = await hit.arrayBuffer();
      onBytes(b.byteLength, b.byteLength);
      return unpack(name, b);
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
    await cache?.put(url(name), new Response(blob)).catch(() => {});  // stored compressed: less space on the phone
    return unpack(name, await blob.arrayBuffer());
  }

  // The runtime also comes from the device cache, so reading works offline without the app's service worker.
  // Every session waits for it: onnxruntime initialises its backend once, on the first session, and a session
  // created before the paths are set fails for good ("no available backend found").
  let rt;
  const runtime = (onBytes = () => {}) => rt ??= (async () => {
    if (load) return;
    // The 3.6 MB engine comes from the device cache. Its 24 KB loader must load from its real address: it finds its
    // files relative to its own URL, which fails from a blob: URL ("Invalid URL"). The browser's HTTP cache keeps it.
    ort.env.wasm.wasmBinary = await file(FILES.wasm, onBytes);
    ort.env.wasm.wasmPaths = {mjs: url(FILES.mjs), wasm: url(stored(FILES.wasm))};  // plain copy, normally unused
  })().catch(e => { rt = undefined; throw e; });
  const session = async b => {
    await runtime();
    return ort.InferenceSession.create(new Uint8Array(b), {executionProviders: ["wasm"]});
  };

  /** The region table only (0.7 MB): enough for parseNik. @param {(p: Progress) => void} [onProgress] */
  function wilayah(onProgress = () => {}) {
    regions ??= file(FILES.wilayah, (loaded, total) => onProgress({loaded, total}))
      .then(b => new Wilayah(typeof b === "string" ? b : new TextDecoder().decode(b)))
      .catch(e => { regions = undefined; throw e; });
    return regions;
  }

  /** Only the corner detector and runtime (2 MB): enough for live camera guidance while the rest downloads.
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

  /** Everything (4.9 MB the first time, then from the device).
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
      else if (name === FILES.brotli) n++;  // only fetched by browsers that can't unpack brotli, stored with the models
    }
    return {ready: n === CACHED.length, bytes};
  }

  const clearCache = () => globalThis.caches?.delete(CACHE);

  // null when nothing KTP-like was read: uploads always end with a best try, even on a photo of a cat
  const result = r => {
    const isKtp = !!r && (r.fields.nik_valid || ktpLabels(r.lines) >= 3);  // a KTP shows most of its 10 printed labels
    if (!r || (!r.fields.nik && !isKtp)) return null;
    const f = Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [outName(k), v]));
    const notes = fieldNotes(r.fields), conf = fieldConfidence(r.fields, r.lines);
    for (const [k, c] of Object.entries(conf))  // birthplace and RT/RW: value only, the 0.6 flag misfires there
      if ((k === "nama" || k === "alamat") && c < LOW_CONFIDENCE) (notes[k] ||= []).push("low_confidence");
    return {...Object.fromEntries(KEYS.map(k => [k, f[k] ?? null])),
      perlu_dicek: Object.fromEntries(Object.entries(notes).map(([k, v]) => [outName(k), v])),
      info: {is_ktp: isKtp, ms: r.ms, versi: VERSION,
        confidence: Object.fromEntries(Object.entries(conf).map(([k, v]) => [outName(k), Math.round(v * 1000) / 1000]))},
      card: r.card};
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
     * @returns {Promise<KtpResult|null>} */
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
