// <ktp-capture>: camera guidance, upload, on-device reading and an editable result form, styled by default.
//
//   <ktp-capture base="/ktp-kit/" lang="id"></ktp-capture>
//   el.addEventListener("ktp-result", e => save(e.detail))   // fields, card image (Blob), timing
//
// Attributes: base (where `npx ktp-kit assets` put the files), lang ("id" | "en"), form="false" (no built-in
// form: just emit the result), upload="false" (hide the upload button), check-ktp (also say when the photo doesn't look like a KTP;
// experimental), unstyled (keep only layout).
// Styling: CSS variables (--ktp-accent, --ktp-ok, --ktp-warn, --ktp-bg, --ktp-fg, --ktp-panel, --ktp-surface, --ktp-muted,
// --ktp-line, --ktp-field, --ktp-radius, --ktp-font, --ktp-mono), ::part(video | hint | badge | actions | button | upload |
// shutter | retake | result | notice | card | form | field | label | input | nik), and the host's data-state
// attribute (searching | adjust | hold | reading | done | error) for Tailwind: data-[state=hold]:ring-green-500.
// Events: ktp-result (detail: result), ktp-state (detail: state), ktp-error (detail: {error, detail}).
import * as ort from "onnxruntime-web/wasm";
import {createKtpReader} from "./engine.js";
import {createCapture, MESSAGES} from "./capture.js";

const FIELDS = [
  ["nik", "NIK"], ["nama", "Nama"], ["tempat_lahir", "Tempat lahir"], ["tanggal_lahir", "Tanggal lahir"],
  ["jenis_kelamin", "Jenis kelamin"], ["gol_darah", "Gol. darah"], ["alamat", "Alamat"], ["rt_rw", "RT/RW"],
  ["kel_desa", "Kel/Desa"], ["kecamatan", "Kecamatan"], ["kabupaten_kota", "Kabupaten/Kota"], ["provinsi", "Provinsi"],
  ["agama", "Agama"], ["status_perkawinan", "Status perkawinan"], ["pekerjaan", "Pekerjaan"],
  ["kewarganegaraan", "Kewarganegaraan"], ["berlaku_hingga", "Berlaku hingga"], ["kota_terbit", "Kota terbit"],
  ["tanggal_terbit", "Tanggal terbit"],
];

// Lucide icons (ISC licence), inlined so the component needs no extra files.
const svg = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  upload: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>'),
  retake: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
};

const STYLE = `
:host { --ktp-accent: #2563eb; --ktp-ok: #16a34a; --ktp-warn: #f59e0b; --ktp-bg: #000; --ktp-fg: #fff;
  --ktp-panel: rgba(0,0,0,.6); --ktp-surface: #111; --ktp-muted: #a3a3a3; --ktp-line: #333; --ktp-field: #1c1c1c;
  --ktp-radius: 12px; --ktp-font: system-ui, sans-serif; --ktp-mono: ui-monospace, monospace;
  display: block; position: relative; overflow: hidden; background: var(--ktp-bg); color: var(--ktp-fg);
  font: 16px/1.4 var(--ktp-font); min-height: 320px; aspect-ratio: var(--ktp-ratio, 3 / 4); }
video, canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
/* the hint: a small label at the top, like a phone camera app; the buttons own the bottom */
.hint { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: max-content;
  max-width: calc(100% - 24px); box-sizing: border-box; padding: 8px 14px; border-radius: 999px; background: var(--ktp-panel);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); text-align: center; font-size: 14px; font-weight: 500;
  line-height: 1.35; transition: background-color .25s, color .25s; }
.hint:empty { display: none; }
:host([data-state=adjust]) .hint { color: var(--ktp-warn); }
:host([data-state=hold]) .hint, :host([data-state=reading]) .hint { background: var(--ktp-ok); color: #fff; }
.badge { position: absolute; top: 52px; right: 8px; padding: 4px 10px; border-radius: 999px; font-size: 12px;
  background: var(--ktp-panel); }
.badge:empty { display: none; }
.actions { position: absolute; left: 16px; right: 16px; bottom: 16px; display: grid; grid-template-columns: 1fr auto 1fr;
  align-items: center; }
button { font: inherit; border: 0; padding: 0; cursor: pointer; color: var(--ktp-fg); display: grid; place-items: center;
  -webkit-tap-highlight-color: transparent; transition: transform .15s, background-color .15s, opacity .15s; }
button:hover { opacity: .9; }
button.icon:active { transform: scale(.92); }
button.icon { width: 48px; height: 48px; border-radius: 50%; background: var(--ktp-panel); }
button.shutter { width: 64px; height: 64px; border-radius: 50%; background: var(--ktp-fg);
  box-shadow: 0 0 0 4px var(--ktp-panel), 0 0 0 6px var(--ktp-fg); }
button.shutter:active { transform: scale(.94); }
button:focus-visible { outline: 3px solid var(--ktp-accent); outline-offset: 3px; }
.result { position: absolute; inset: 0; display: none; flex-direction: column; gap: 12px; padding: 12px 16px 16px;
  overflow: auto; background: var(--ktp-surface); }
:host([data-state=reading]) .result, :host([data-state=done]) .result { display: flex; animation: ktp-in .28s ease-out; }
.card { animation: ktp-in .3s ease-out; }
label { animation: ktp-in .3s ease-out both; animation-delay: calc(var(--i, 0) * 25ms); }
@keyframes ktp-in { from { opacity: 0; transform: translateY(8px); } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
.bar { display: flex; align-items: center; gap: 12px; }
.notice { flex: 1; white-space: pre-line; font-size: 14px; color: var(--ktp-muted); }
.card { display: block; position: static; flex: none; width: 100%; height: auto; border-radius: 8px; }  /* not the full-frame canvas rule above */
form { display: grid; gap: 10px; }
label { display: grid; gap: 4px; font-size: 13px; color: var(--ktp-muted); }
input { font: inherit; font-size: 16px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--ktp-line);
  background: var(--ktp-field); color: var(--ktp-fg); width: 100%; box-sizing: border-box; }
input:focus-visible { outline: 2px solid var(--ktp-accent); outline-offset: 0; }
input[name=nik] { font-family: var(--ktp-mono); letter-spacing: .04em; }
label.check input { border-color: var(--ktp-warn); }
label.check span::after { content: ": " attr(data-check); color: var(--ktp-warn); }
[hidden] { display: none !important; }
`;
const LAYOUT_ONLY = `:host { display: block; position: relative; } video, canvas { width: 100%; }
.result { display: none; } :host([data-state=reading]) .result, :host([data-state=done]) .result { display: block; }
[hidden] { display: none !important; }`;

export class KtpCapture extends HTMLElement {
  static get observedAttributes() { return ["lang", "upload"]; }

  connectedCallback() {
    if (!this.shadowRoot) this.setup();
    // (re)start on every attach: frameworks may move the element, which detaches it and stops the camera
    this.unsubscribe = this.capture.subscribe(s => this.render(s));
    this.capture.start();
  }

  setup() {
    const root = this.attachShadow({mode: "open"});
    root.innerHTML = `<style>${this.hasAttribute("unstyled") ? LAYOUT_ONLY : STYLE}</style>
      <video part="video" playsinline muted></video><canvas></canvas>
      <div class="badge" part="badge"></div>
      <div class="actions" part="actions"><button class="icon" part="button upload" data-k="upload" type="button">${ICONS.upload}</button>
        <button class="shutter" part="button shutter" data-k="shutter" type="button"></button></div>
      <div class="hint" part="hint"></div>
      <input type="file" accept="image/*" hidden>
      <div class="result" part="result">
        <div class="bar"><div class="notice" part="notice" aria-live="polite"></div>
          <button class="icon" part="button retake" data-k="retake" type="button">${ICONS.retake}</button></div>
        <canvas class="card" part="card" role="img" aria-label="KTP"></canvas><form part="form"></form></div>`;
    const $ = s => root.querySelector(s);
    this.ui = {video: $("video"), overlay: $("canvas"), badge: $(".badge"), hint: $(".hint"), file: $("input[type=file]"),
      upload: $("[data-k=upload]"), shutter: $("[data-k=shutter]"), retake: $("[data-k=retake]"), card: $(".card"),
      notice: $(".notice"), form: $("form")};
    this.engine = createKtpReader({base: this.getAttribute("base") || "/ktp-kit/", ort});
    this.capture = createCapture({video: this.ui.video, engine: this.engine});
    // the frame takes the camera's own shape, so there are no black bars
    this.ui.video.addEventListener("loadedmetadata", () => {
      const {videoWidth: w, videoHeight: h} = this.ui.video;
      this.style.setProperty("--ktp-ratio", `${w} / ${h}`);
      this.style.setProperty("--ktp-aspect", String(w / h));  // as a number, for sizing with calc()
    });
    this.ui.upload.onclick = () => this.ui.file.click();
    this.ui.file.onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) this.capture.readFile(f); };
    this.ui.shutter.onclick = () => this.capture.shoot();
    this.ui.retake.onclick = () => this.capture.retake();
  }

  disconnectedCallback() { this.unsubscribe?.(); this.capture?.stop(); }
  attributeChangedCallback() { if (this.capture) this.render(this.capture.state); }

  get messages() { return MESSAGES[this.getAttribute("lang") === "en" ? "en" : "id"]; }

  render(s) {
    const t = this.messages, ui = this.ui;
    this.dataset.state = s.status;
    ui.upload.hidden = this.getAttribute("upload") === "false";
    for (const k of ["upload", "shutter", "retake"]) { ui[k].setAttribute("aria-label", t[k]); ui[k].title = t[k]; }  // icon buttons
    ui.hint.textContent = s.status === "error" ? t[s.error] || t.failed : t[s.hint] || "";
    const mb = b => (b / 1e6).toFixed(0);
    ui.badge.textContent = s.offline?.ready ? t.offline(mb(s.offline.bytes))
      : s.download?.total ? t.download(Math.round(100 * s.download.loaded / s.download.total), mb(s.download.total)) : "";
    this.draw(s.corners, s.status === "hold");
    this.dispatchEvent(new CustomEvent("ktp-state", {detail: s}));
    if (s.status === "reading") {
      if (s.preview && s.preview !== this.previewed) {  // show the card (or photo) at once, before reading finishes
        this.previewed = s.preview;
        paint(ui.card, s.preview);  // a canvas paints at once (an <img> would keep the old picture until it decodes)
      }
      ui.notice.textContent = s.step || t.reading; ui.form.replaceChildren(); ui.retake.hidden = true;
    }
    if (s.status === "error") {
      this.dispatchEvent(new CustomEvent("ktp-error", {detail: {error: s.error, detail: s.detail}}));
      if (s.error !== "noCamera") setTimeout(() => this.capture.state.status === "error" && this.capture.retake(), 2500);
    }
    if (s.status === "done" && s.result !== this.shown) this.show((this.shown = s.result));
    else if (s.status === "done") ui.notice.textContent = this.notice(s.result);  // e.g. after a language change
  }

  notice(r) {
    const t = this.messages, en = this.getAttribute("lang") === "en";
    return [this.hasAttribute("check-ktp") && !r.isKtp && t.notKtp, !r.nik_valid && (r.nik ? t.invalidNik : t.badNik),
      t.local((r.ms / 1000).toFixed(1).replace(".", en ? "." : ","))].filter(Boolean).join("\n");
  }

  draw(q, ok) {
    const c = this.ui.overlay, v = this.ui.video, x = c.getContext("2d");
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
    x.clearRect(0, 0, c.width, c.height);
    if (!q) return;
    x.lineWidth = Math.max(4, c.width / 150);
    x.strokeStyle = getComputedStyle(this).getPropertyValue(ok ? "--ktp-ok" : "--ktp-warn") || (ok ? "#16a34a" : "#f59e0b");
    x.beginPath();
    q.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py));
    x.closePath();
    x.stroke();
  }

  async show(r) {
    const t = this.messages, ui = this.ui;
    paint(ui.card, r.card);
    const blob = await new Promise(res => toCanvas(r.card).toBlob(res, "image/jpeg", 0.9));
    ui.retake.hidden = false;
    ui.notice.textContent = this.notice(r);
    const detail = {...r, card: blob};
    if (this.getAttribute("form") !== "false") {
      ui.form.replaceChildren(...FIELDS.map(([key, label]) => {
        const row = document.createElement("label"), name = document.createElement("span"), input = document.createElement("input");
        row.setAttribute("part", "field"); name.setAttribute("part", "label"); input.setAttribute("part", key === "nik" ? "input nik" : "input");
        name.textContent = label; name.dataset.check = t.check;
        input.name = key; input.value = r[key] || ""; // .value, never innerHTML: OCR text is untrusted
        input.oninput = () => { detail[key] = input.value; };
        row.classList.toggle("check", r.perlu_dicek.includes(key));
        row.style.setProperty("--i", String(FIELDS.findIndex(f => f[0] === key)));  // fields appear one after another
        row.append(name, input);
        return row;
      }));
    }
    this.dispatchEvent(new CustomEvent("ktp-result", {detail}));
  }
}

function paint(c, {w, h, data}) {
  c.width = w; c.height = h;
  c.getContext("2d").putImageData(new ImageData(data, w, h), 0, 0);
}

function toCanvas({w, h, data}) {
  const c = Object.assign(document.createElement("canvas"), {width: w, height: h});
  c.getContext("2d").putImageData(new ImageData(data, w, h), 0, 0);
  return c;
}

if (!customElements.get("ktp-capture")) customElements.define("ktp-capture", KtpCapture);
