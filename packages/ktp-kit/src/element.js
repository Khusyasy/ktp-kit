// <ktp-capture>: camera guidance, upload, on-device reading and an editable result form, styled by default.
//
//   <ktp-capture base="/ktp-kit/" lang="id"></ktp-capture>
//   el.addEventListener("ktp-result", e => save(e.detail))   // fields, card image (Blob), timing
//
// Attributes: base (where `npx ktp-kit assets` put the files), lang ("id" | "en"), form="false" (no built-in
// form: just emit the result), upload="false" (hide the upload button), unstyled (keep only layout).
// Styling: CSS variables (--ktp-accent, --ktp-ok, --ktp-warn, --ktp-bg, --ktp-fg, --ktp-radius, --ktp-font),
// ::part(video | hint | badge | button | result | card | notice | field | input), and the host's data-state
// attribute (searching | adjust | hold | reading | done | error) for Tailwind: data-[state=hold]:ring-green-500.
// Events: ktp-result (detail: result), ktp-state (detail: state), ktp-error (detail: {error, detail}).
import * as ort from "onnxruntime-web/wasm";
import {createKtpReader} from "./engine.js";
import {createCapture, MESSAGES} from "./capture.js";

const FIELDS = [
  ["nik", "NIK"], ["nama", "Nama"], ["tempat_lahir", "Tempat Lahir"], ["tanggal_lahir", "Tanggal Lahir"],
  ["jenis_kelamin", "Jenis Kelamin"], ["gol_darah", "Gol. Darah"], ["alamat", "Alamat"], ["rt_rw", "RT/RW"],
  ["kel_desa", "Kel/Desa"], ["kecamatan", "Kecamatan"], ["kabupaten_kota", "Kabupaten/Kota"], ["provinsi", "Provinsi"],
  ["agama", "Agama"], ["status_perkawinan", "Status Perkawinan"], ["pekerjaan", "Pekerjaan"],
  ["kewarganegaraan", "Kewarganegaraan"], ["berlaku_hingga", "Berlaku Hingga"], ["kota_terbit", "Kota Terbit"],
  ["tanggal_terbit", "Tanggal Terbit"],
];

const STYLE = `
:host { --ktp-accent: #2563eb; --ktp-ok: #16a34a; --ktp-warn: #f59e0b; --ktp-bg: #000; --ktp-fg: #fff;
  --ktp-panel: rgba(0,0,0,.65); --ktp-radius: 12px; --ktp-font: system-ui, sans-serif;
  display: block; position: relative; overflow: hidden; background: var(--ktp-bg); color: var(--ktp-fg);
  font: 16px/1.4 var(--ktp-font); min-height: 320px; aspect-ratio: 3 / 4; }
video, canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.hint { position: absolute; left: 12px; right: 12px; bottom: 12px; padding: 12px 16px; border-radius: var(--ktp-radius);
  background: var(--ktp-panel); text-align: center; font-weight: 600; }
:host([data-state=hold]) .hint, :host([data-state=reading]) .hint { background: var(--ktp-ok); }
.badge { position: absolute; top: 8px; right: 8px; padding: 4px 10px; border-radius: 999px; font-size: 12px;
  background: var(--ktp-panel); }
.badge:empty { display: none; }
.actions { position: absolute; left: 12px; right: 12px; bottom: 72px; display: flex; justify-content: space-between; }
button { font: inherit; font-weight: 600; padding: 10px 16px; border: 0; border-radius: var(--ktp-radius);
  background: var(--ktp-accent); color: #fff; cursor: pointer; }
button.secondary { background: var(--ktp-panel); }
.result { position: absolute; inset: 0; display: none; flex-direction: column; gap: 12px; padding: 16px; overflow: auto;
  background: #111; }
:host([data-state=reading]) .result, :host([data-state=done]) .result { display: flex; }
.card { width: 100%; border-radius: 8px; }
.notice { white-space: pre-line; }
.notice:empty { display: none; }
form { display: grid; gap: 10px; }
label { display: grid; gap: 4px; font-size: 13px; color: #aaa; }
input { font: inherit; font-size: 16px; padding: 10px 12px; border-radius: 8px; border: 1px solid #333;
  background: #1c1c1c; color: #fff; width: 100%; box-sizing: border-box; }
label.check input { border-color: var(--ktp-warn); }
label.check span::after { content: " — " attr(data-check); color: var(--ktp-warn); }
[hidden] { display: none !important; }
`;
const LAYOUT_ONLY = `:host { display: block; position: relative; } video, canvas { width: 100%; }
.result { display: none; } :host([data-state=reading]) .result, :host([data-state=done]) .result { display: block; }
[hidden] { display: none !important; }`;

export class KtpCapture extends HTMLElement {
  static get observedAttributes() { return ["lang"]; }

  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({mode: "open"});
    root.innerHTML = `<style>${this.hasAttribute("unstyled") ? LAYOUT_ONLY : STYLE}</style>
      <video part="video" playsinline muted></video><canvas></canvas>
      <div class="badge" part="badge"></div>
      <div class="actions"><button class="secondary" part="button" data-k="upload"></button>
        <button part="button" data-k="shutter"></button></div>
      <div class="hint" part="hint"></div>
      <input type="file" accept="image/*" hidden>
      <div class="result" part="result"><img class="card" part="card" alt="KTP"><div class="notice" part="notice"></div>
        <form part="form"></form><button part="button" data-k="retake"></button></div>`;
    const $ = s => root.querySelector(s);
    this.ui = {video: $("video"), overlay: $("canvas"), badge: $(".badge"), hint: $(".hint"), file: $("input[type=file]"),
      upload: $("[data-k=upload]"), shutter: $("[data-k=shutter]"), retake: $("[data-k=retake]"), card: $(".card"),
      notice: $(".notice"), form: $("form")};
    if (this.getAttribute("upload") === "false") this.ui.upload.hidden = true;
    this.engine = createKtpReader({base: this.getAttribute("base") || "/ktp-kit/", ort});
    this.capture = createCapture({video: this.ui.video, engine: this.engine});
    this.ui.upload.onclick = () => this.ui.file.click();
    this.ui.file.onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) this.capture.readFile(f); };
    this.ui.shutter.onclick = () => this.capture.shoot();
    this.ui.retake.onclick = () => this.capture.retake();
    this.unsubscribe = this.capture.subscribe(s => this.render(s));
    this.capture.start();
  }

  disconnectedCallback() { this.unsubscribe?.(); this.capture?.stop(); }
  attributeChangedCallback() { if (this.capture) this.render(this.capture.state); }

  get messages() { return MESSAGES[this.getAttribute("lang") === "en" ? "en" : "id"]; }

  render(s) {
    const t = this.messages, ui = this.ui;
    this.dataset.state = s.status;
    ui.upload.textContent = t.upload; ui.shutter.textContent = t.shutter; ui.retake.textContent = t.retake;
    ui.hint.textContent = s.status === "error" ? t[s.error] || t.failed : t[s.hint] || "";
    const mb = b => (b / 1e6).toFixed(0);
    ui.badge.textContent = s.offline?.ready ? t.offline(mb(s.offline.bytes))
      : s.download?.total ? t.download(Math.round(100 * s.download.loaded / s.download.total), mb(s.download.total)) : "";
    this.draw(s.corners, s.status === "hold");
    this.dispatchEvent(new CustomEvent("ktp-state", {detail: s}));
    if (s.status === "reading") {
      if (s.preview && s.preview !== this.previewed) {  // show the card (or photo) at once, before reading finishes
        this.previewed = s.preview;
        ui.card.src = toCanvas(s.preview).toDataURL("image/jpeg", 0.85);
      }
      ui.notice.textContent = s.step || t.reading; ui.form.replaceChildren(); ui.retake.hidden = true;
    }
    if (s.status === "error") {
      this.dispatchEvent(new CustomEvent("ktp-error", {detail: {error: s.error, detail: s.detail}}));
      if (s.error !== "noCamera") setTimeout(() => this.capture.state.status === "error" && this.capture.retake(), 2500);
    }
    if (s.status === "done" && s.result !== this.shown) this.show((this.shown = s.result));
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
    const t = this.messages, ui = this.ui, card = toCanvas(r.card);
    const blob = await new Promise(res => card.toBlob(res, "image/jpeg", 0.9));
    ui.card.src = URL.createObjectURL(blob);
    ui.retake.hidden = false;
    ui.notice.textContent = [!r.isKtp && t.notKtp, !r.nik_valid && (r.nik ? t.invalidNik : t.badNik),
      t.local((r.ms / 1000).toFixed(1))].filter(Boolean).join("\n");
    const detail = {...r, card: blob};
    if (this.getAttribute("form") !== "false") {
      ui.form.replaceChildren(...FIELDS.map(([key, label]) => {
        const row = document.createElement("label"), name = document.createElement("span"), input = document.createElement("input");
        row.setAttribute("part", "field"); input.setAttribute("part", "input");
        name.textContent = label; name.dataset.check = t.check;
        input.name = key; input.value = r[key] || ""; // .value, never innerHTML: OCR text is untrusted
        input.oninput = () => { detail[key] = input.value; };
        row.classList.toggle("check", r.perlu_dicek.includes(key));
        row.append(name, input);
        return row;
      }));
    }
    this.dispatchEvent(new CustomEvent("ktp-result", {detail}));
  }
}

function toCanvas({w, h, data}) {
  const c = Object.assign(document.createElement("canvas"), {width: w, height: h});
  c.getContext("2d").putImageData(new ImageData(data, w, h), 0, 0);
  return c;
}

if (!customElements.get("ktp-capture")) customElements.define("ktp-capture", KtpCapture);
