# ktp-kit

Read Indonesian ID cards (KTP) **on the user's device**. Camera guidance, all 16 printed fields, official region
codes and NIK checks, in the browser or Node. The photo is never uploaded, and after the first load it works offline.

> **Bahasa Indonesia:** ktp-kit membaca KTP langsung di HP/laptop pengguna: panduan kamera, 16 kolom KTP, kode
> wilayah resmi, dan pengecekan NIK. Foto tidak dikirim ke server mana pun, dan setelah dimuat sekali bisa offline.

- **Private by design:** no API, no third party, nothing to send. Your users' KTP never leaves their device, which
  keeps you out of cross-border transfers and processor contracts under UU PDP.
- **Guided capture:** live corner detection, checks for distance, tilt, blur and glare, then auto-capture.
- **Uploads too:** gallery photos, including ones already cropped to the card.
- **16 fields + region code:** NIK, nama, tempat/tanggal lahir, jenis kelamin, gol. darah, alamat, RT/RW, kel/desa,
  kecamatan, kabupaten/kota, provinsi, agama, status perkawinan, pekerjaan, kewarganegaraan, berlaku hingga, plus
  issue city/date and the official Kemendagri region code. Fields that disagree with the NIK are flagged.
- **Plug and play, or headless:** a styled `<ktp-capture>` web component, React and Vue adapters, or the headless
  controller for your own UI.
- **Free for developers and small companies** (see [License](#license)).

Status: **0.1, preview.** Accuracy numbers will be published from a consented test set.

## Install

```bash
npm install ktp-kit                 # web component, engine, CLI
npm install @ktp-kit/react          # or @ktp-kit/vue
npx ktp-kit assets public/ktp-kit   # copy the models + runtime (~27 MB) to where your app serves static files
```

## Use

**Any page (plain HTML, Laravel Blade, Angular, Svelte...)**

```html
<script type="module">import "ktp-kit/element";</script>
<ktp-capture base="/ktp-kit/" lang="id"></ktp-capture>
<script>
  document.querySelector("ktp-capture").addEventListener("ktp-result", e => {
    const { nik, nama, card } = e.detail;   // card: JPEG Blob of the straightened card
  });
</script>
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
const engine = createKtpReader({ ort });               // loads only the 2 MB region table for this
await engine.parseNik("3171014501909001");
// { valid: true, jenis_kelamin: "PEREMPUAN", tanggal_lahir: "05-01-1990", provinsi: "DAERAH KHUSUS IBUKOTA JAKARTA", ... }
```

TypeScript types are included (`KtpResult`, `KtpCaptureState`, ...).

**Node / command line**

```bash
npx ktp-kit read photos/*.jpg          # one JSON line per photo
npx ktp-kit read photos/*.jpg --csv > ktp.csv
```

## Styling

The element ships with a default look. Change it with CSS variables (`--ktp-accent`, `--ktp-ok`, `--ktp-warn`,
`--ktp-bg`, `--ktp-fg`, `--ktp-radius`, `--ktp-font`), `::part(...)` (video, hint, badge, button, result, card,
notice, field, input), or the `data-state` attribute, Tailwind style:

```html
<ktp-capture class="rounded-2xl ring-4 ring-transparent data-[state=hold]:ring-green-500"></ktp-capture>
```

Add `unstyled` to keep only the layout, `form="false"` to skip the built-in form, `upload="false"` to hide uploads.

## Speed: allow several cores

Reading takes about 2–4 s on a mid-range phone when the page is **cross-origin isolated**, and about 3× longer
without. Send these headers on your page:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Offline

`ktp-kit` stores the models and runtime on the device (Cache API, persistent storage requested) the first time. The
element shows the download progress and then "Siap offline". To test: read a card, turn on airplane mode, read again.

## Privacy

Nothing about the card leaves the device; the only requests are downloads of ktp-kit's own files. See
[PRIVACY.md](PRIVACY.md) for details for compliance teams.

## How it works

Card corners (DocAligner, Apache-2.0) → straighten → text lines (PP-OCRv6 small det, Apache-2.0) → each line read by a
PP-OCRv6 tiny reader fine-tuned for KTP text → fields matched to the fixed KTP layout, snapped to official lists and
region names, and checked against the NIK. The reader was trained only on generated (synthetic) KTP text lines.

## License

Source-available, **free** under either:

- [PolyForm Noncommercial 1.0.0](LICENSES/PolyForm-Noncommercial-1.0.0.md): personal, research, education, charity, government.
- [PolyForm Small Business 1.0.0](LICENSES/PolyForm-Small-Business-1.0.0.md): companies with fewer than 100 people and under USD 1M revenue.

Larger companies: commercial license, contact luthfik.job@gmail.com. Third-party parts: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
