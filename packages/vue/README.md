# @ktp-kit/vue

Vue 3 component and composable for [ktp-kit](https://www.npmjs.com/package/ktp-kit): read Indonesian KTPs on the user's
device, no upload, works offline.

```bash
npm install @ktp-kit/vue
npx ktp-kit assets public/ktp-kit
```

```vue
<script setup>
import { KtpCapture, useKtpCapture } from "@ktp-kit/vue";
const save = r => console.log(r);
</script>

<template>
  <KtpCapture base="/ktp-kit/" lang="id" @result="save" />
</template>
```

Headless: `const { videoRef, state, shoot, retake, readFile } = useKtpCapture()`, bind `ref="videoRef"` to your `<video>`.

Full docs, styling, speed headers and license: see the [ktp-kit README](https://www.npmjs.com/package/ktp-kit).
