# @ktp-kit/react

React component and hook for [ktp-kit](https://www.npmjs.com/package/ktp-kit): read Indonesian KTPs on the user's
device, no upload, works offline.

```bash
npm install @ktp-kit/react
npx ktp-kit assets public/ktp-kit
```

```jsx
import { KtpCapture, useKtpCapture } from "@ktp-kit/react";

<KtpCapture base="/ktp-kit/" lang="id" onResult={r => save(r)} />          // ready-made UI

const { videoRef, state, shoot, retake, readFile } = useKtpCapture();      // headless: your own UI
```

Full docs, styling, speed headers and license: see the [ktp-kit README](https://www.npmjs.com/package/ktp-kit).
