# Privacy notes

For developers and compliance teams evaluating ktp-kit. This describes what the library does; it is not legal advice,
and you remain the controller of the data your users give you.

## What leaves the device

**Nothing about the card.** The photo, the straightened card and the fields read from it are processed in the
browser (or in your own Node process) and are only handed to your code through the `ktp-result` event or the return
value of `readImage` / `readFrame`. What you do with them next (send to your backend, store, discard) is up to you.

The only network requests ktp-kit makes are **downloads of its own files** from the `base` URL you configure (models,
runtime, region table), and only until they are stored on the device. No telemetry, no analytics, no third-party
calls. You can verify this in the browser's Network panel, or by reading a card in airplane mode.

## What is stored on the device

- The model files, runtime and region table (about 27 MB) in the Cache API, under the cache name `ktp-kit-v1`.
  ktp-kit asks the browser for persistent storage so they are not evicted. `engine.clearCache()` removes them.
- **No card images and no field values are stored** by ktp-kit. They live in memory until your page drops them.

## Camera

The camera is opened only while `<ktp-capture>` (or `capture.start()`) is active, and released by `capture.stop()`
or when the element is removed. Browsers show their own camera indicator and permission prompt.

## Why this helps under UU PDP (UU 27/2022)

- **No processor and no cross-border transfer for reading the card:** a cloud OCR service would be a data processor,
  and one abroad a cross-border transfer (Pasal 56). With ktp-kit, reading happens on the user's own device.
- **Data minimisation:** your backend can receive only the fields you need instead of the card photo, if your
  process allows it.
- **You still need** a legal basis and a privacy notice for collecting the KTP data in the first place, and the usual
  security for whatever you store.

## The models

The text reader was trained only on **generated (synthetic) KTP text lines**. The card-corner and text-line models
are unmodified open-source models (Apache-2.0). No real person's KTP data is contained in the model files.
