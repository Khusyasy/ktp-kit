# ktp-kit

Read Indonesian ID cards (KTP) **offline in the browser or Node** with JavaScript and WebAssembly. Camera guidance, all 16 printed fields, official region codes and NIK checks, all on the user's device. The photo is never uploaded, and after the first load it works without internet.

> **Bahasa Indonesia:** ktp-kit adalah library JavaScript OCR KTP offline yang jalan langsung di browser. Ambil NIK, nama, alamat dan 16 kolom KTP
> dari foto langsung di HP atau laptop user, lengkap dengan panduan kamera, kode wilayah resmi dan pengecekan NIK.
> Hasilnya JSON.
>
> - **Privasi:** foto KTP tidak di-upload ke server mana pun, tanpa API dan tanpa pihak ketiga. Lebih mudah sesuai
>   UU PDP karena data tidak berpindah tangan.
> - **Offline:** setelah model diunduh sekali (7,1 MB), tetap jalan tanpa internet.
> - **Gratis:** tanpa biaya per scan, Apache-2.0, boleh untuk komersial.
>
> Coba [demo](https://ktp-kit.khusyasy.my.id) atau baca [docs](https://ktp-kit.khusyasy.my.id/docs) dalam bahasa Indonesia. Cerita pembuatannya ada di [write-up dev.to](https://dev.to/khusyasy/how-i-built-a-fully-offline-id-card-ocr-trained-on-synthetic-data-1bb3).

- **Private by design:** no API, no third party, nothing to send. Your users' KTP never leaves their device, which
  keeps you out of cross-border transfers and processor contracts under UU PDP.
- **Guided capture:** live corner detection, checks for distance, tilt, blur and glare, then auto-capture.
- **Uploads too:** gallery photos, including ones already cropped to the card.
- **16 fields + region code:** NIK, nama, tempat/tanggal lahir, jenis kelamin, golongan darah, alamat, RT/RW,
  kelurahan/desa, kecamatan, kabupaten/kota, provinsi, agama, status perkawinan, pekerjaan, kewarganegaraan, berlaku
  hingga, plus issue city/date and the official Kemendagri region code. Fields worth a second look are flagged, with
  the reason.
- **Plug and play, or headless:** a styled `<ktp-capture>` web component, React and Vue adapters, or the headless
  controller for your own UI. You get the result once, as JSON. Your form decides which fields to use and edit.
- **Free and open source:** Apache-2.0, commercial use included (see [License](#license)).

Status: **0.4.0.** Public synthetic benchmark numbers are below and in [benchmark/](benchmark/README.md).

## Install

```bash
npm install ktp-kit                 # web component, engine, CLI
npm install @ktp-kit/react          # or @ktp-kit/vue
npx ktp-kit assets public/ktp-kit   # copy the models + runtime (7.1 MB, pre-compressed) to where your app serves static files
```

## Use

**Any page (plain HTML, Laravel Blade, Angular, Svelte...)**

```html
<script type="module">import "ktp-kit/element";</script>
<ktp-capture base="/ktp-kit/" lang="id"></ktp-capture>
<script>
  document.querySelector("ktp-capture").addEventListener("ktp-result", e => {
    const { nik, nama, perlu_dicek, card } = e.detail;   // card: JPEG Blob of the straightened card
  });
</script>
```

To fill your own form, give its inputs the result's field names and keep only the ones you need:

```js
for (const [k, v] of Object.entries(e.detail)) if (form.elements[k]) form.elements[k].value = v ?? "";
```

**React**

```jsx
import { KtpCapture } from "@ktp-kit/react";
<KtpCapture base="/ktp-kit/" onResult={r => save(r)} />
```

**Vue**

```vue
<script setup>import { KtpCapture } from "@ktp-kit/vue";</script>
<template><KtpCapture base="/ktp-kit/" @result="save" /></template>
```

**Headless (your own UI)**

```jsx
import { useKtpCapture } from "@ktp-kit/react";   // same in @ktp-kit/vue
const { videoRef, state, shoot, retake, readFile } = useKtpCapture();
// state.status: searching | adjust | hold | reading | done | error
// state.hint, state.corners, state.download {loaded, total}, state.offline {ready, bytes}, state.result
```

**Just the NIK** (birth date, gender, region names from the current Kemendagri table, including re-coded regions)

```js
import { createKtpReader } from "ktp-kit";
import * as ort from "ktp-kit/ort";
const engine = createKtpReader({ ort });               // loads only the region table (0.5 MB) for this
await engine.parseNik("3171014501909001");
// { valid: true, jenis_kelamin: "PEREMPUAN", tanggal_lahir: "05-01-1990", provinsi: "DAERAH KHUSUS IBUKOTA JAKARTA", ... }
```

`readImage` and `readFrame` take a last argument `{ debug: true }` to add each layer's output (lines, rows, fields) under `debug`, and `{ skip: ["wilayah"] }` or `["nik"]` to bypass the region or NIK layer.

TypeScript types are included (`KtpResult`, `KtpCaptureState`, ...).

Server rendering (Next.js, Nuxt) works: the component renders as an empty `<ktp-capture>` and the camera and models start in the browser.

## The result

Field names follow Indonesian KTP OCR APIs (VIDA, GLAIR), so existing code usually fits. Dates are `DD-MM-YYYY`, as
on the card. Unreadable fields are `null`.

```json
{
  "nik": "3171014501909001", "nik_valid": true, "nama": "NAMA CONTOH",
  "tempat_lahir": "JAKARTA", "tanggal_lahir": "05-01-1990", "jenis_kelamin": "PEREMPUAN", "golongan_darah": "O",
  "alamat": "JL. CONTOH NO. 1", "rt_rw": "001/002", "kelurahan_desa": "GAMBIR", "kecamatan": "GAMBIR",
  "kabupaten_kota": "KOTA ADMINISTRASI JAKARTA PUSAT", "provinsi": "DAERAH KHUSUS IBUKOTA JAKARTA",
  "agama": "ISLAM", "status_perkawinan": "KAWIN", "pekerjaan": "KARYAWAN SWASTA", "kewarganegaraan": "WNI",
  "berlaku_hingga": "SEUMUR HIDUP", "kota_terbit": "KOTA ADMINISTRASI JAKARTA PUSAT", "tanggal_terbit": "12-08-2020",
  "kode_wilayah": "3171011001",
  "perlu_dicek": { "tanggal_lahir": ["from_nik"] },
  "info": { "ktp_score": 1, "ktp_check": { "nik_valid": true, "tanggal_lahir_nik": true, "...": true }, "ms": 2300, "versi": "0.4.0", "confidence": { "nama": 0.93, "alamat": 0.88 } },
  "card": "Blob (image/jpeg)"
}
```

`perlu_dicek` lists fields worth a second look, with reason codes. Your app words them for its users:

| Code | Meaning |
|---|---|
| `nik_mismatch` | The card doesn't match the NIK (birth date or sex). |
| `from_nik` | Unreadable on the card, so filled from the NIK. |
| `low_confidence` | Some letters in the name or address are unclear. |
| `unstable` | The name or address read differently on a second try. |
| `not_read` | The NIK or name wasn't read. |
| `region_mismatch` | The NIK's first digit may be misread. |
| `region_unknown` | The NIK's region code isn't in the Kemendagri table. |

`info.ktp_score` (0-1) is the share of 10 checks that pass. A NIK encodes the region, birth date and sex, so the card
can be checked against it. Values filled from the NIK don't count. Each result is in `info.ktp_check`.

| Check | Passes when |
|---|---|
| `nik_valid` | 16-digit NIK with a valid date |
| `tanggal_lahir_nik` | Birth date matches the NIK |
| `jenis_kelamin_nik` | Sex matches the NIK |
| `provinsi` | Province is in the Kemendagri table |
| `provinsi_nik` | Province matches the NIK's region code |
| `kecamatan` | Kecamatan is under its kabupaten |
| `agama` | Agama is on the official list |
| `status_perkawinan` | Status perkawinan is on the official list |
| `pekerjaan` | Pekerjaan is on the official list |
| `berlaku_hingga` | SEUMUR HIDUP or a date |

Below 0.5 the element and `createCapture` ask for a retake (`minKtpScore`, attribute `min-ktp-score`). `readImage` and
`readFrame` always return what they read.

Treat the result as user input on your server: users can edit your form. `nikValid` and `nikConflicts` from
`ktp-kit` run in Node for the same checks. The [docs page](https://ktp-kit.khusyasy.my.id/docs) has the full field table and
recipes for forms and servers.

**Node / command line**

```bash
npx ktp-kit read photos/*.jpg          # one JSON line per photo
npx ktp-kit read photos/*.jpg --csv > ktp.csv
```

## Styling

The element ships with a default look, with icon buttons (each has a label for screen readers). Change it with:

- CSS variables: `--ktp-accent`, `--ktp-ok`, `--ktp-warn`, `--ktp-bg`, `--ktp-fg`, `--ktp-panel` (buttons and hint
  over the camera), `--ktp-surface` (result background), `--ktp-muted`, `--ktp-font`
- `::part(...)`: video, hint, badge, actions, button, upload, shutter, retake, result, notice, card
- the `data-state` attribute (searching, adjust, hold, reading, done, error).

With Tailwind v4, all three work from classes:

```html
<ktp-capture class="rounded-2xl ring-4 ring-transparent data-[state=hold]:ring-green-500
  [--ktp-accent:var(--color-sky-500)] [--ktp-surface:var(--color-slate-900)]
  [&::part(shutter)]:bg-sky-100"></ktp-capture>
```

The frame takes the camera's shape. It also sets `--ktp-aspect` (width ÷ height, a number) for sizing with `calc()`.

Add `min-ktp-score="0"` to accept every read (see `ktp_score`, React and Vue prop `minKtpScore`), `unstyled` to keep only the layout, `upload="false"` to hide uploads.

## Speed: allow several cores

Reading takes about 2-4 s on a mid-range phone when the page is **cross-origin isolated**, and about 3× longer
without. Send these headers on your page:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Offline

`ktp-kit` stores the models and runtime on the device (Cache API, persistent storage requested) the first time. The
download is 7.1 MB: the CLI compresses the files (brotli) and the browser unpacks them, so the size is the same on any host. The
element shows the download progress and then "Siap offline". To test: read a card, turn on airplane mode, read again.

Reading keeps working offline while the page is open. For the page to also **reload** offline, your app needs a
service worker that keeps the page itself (HTML, scripts, styles), the same as any offline web app. ktp-kit's files are
already stored. The demo's worker is a short example: `apps/demo/sw.js`.

## Privacy

Nothing about the card leaves the device. The only requests are downloads of ktp-kit's own files. See
[PRIVACY.md](PRIVACY.md) for details for compliance teams.

## How it works

Card corners (DocAligner, Apache-2.0) → straighten → text lines (PP-OCRv6 small det, Apache-2.0) → each line read by a
PP-OCRv6 small reader fine-tuned for KTP text → fields matched to the fixed KTP layout, snapped to official lists and
region names, and checked against the NIK.

The full story, from synthetic training data to the browser build, is in the [dev.to write-up](https://dev.to/khusyasy/how-i-built-a-fully-offline-id-card-ocr-trained-on-synthetic-data-1bb3).

### How the reader was trained

The text reader learned from generated KTP text lines only. A script draws lines in the KTP layout: labels,
values, NIKs and headers. Names come from a hand-written list of common Indonesian name parts plus made-up syllables
and random letters. Regions come from the public region code list. Lines are drawn in many fonts, then blurred,
tilted, darkened and given glare, like phone photos. Training started from the stock PP-OCRv6 small weights. No real
KTP photo, NIK or name was used to train it, so the model files hold no one's data.

On 2,400 generated lines never used for training or for choosing the model, ktp-kit reads 96.2% of NIK lines and 85.0%
of all text lines exactly. The general PaddleOCR PP-OCRv6 small model reads 91.6% and 51.4% of the same lines. The data,
labels and scripts are in [benchmark/](benchmark/), so you can rerun this or test another reader. The generator makes
lines hard on purpose (blur, fading, worn print), and real photos vary in other ways, so try it on your own cards before
you rely on it. Names are the weakest field: check `perlu_dicek` and
let users correct them.

## License

[Apache-2.0](LICENSE): free for any use, commercial included, the same license as the PaddleOCR and DocAligner
models it builds on. Third-party parts: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
