# CLAUDE.md

Guidance for Claude Code in this repository.

ktp-kit reads Indonesian KTPs on the user's device (browser or Node). npm workspaces:

- `packages/ktp-kit`: `src/engine.js` (model loading + device cache, `readImage`/`readFrame`), `src/capture.js`
  (headless camera controller), `src/element.js` (`<ktp-capture>`), `src/reader.js` (card straightening, text-line
  finding, line reading), `src/ktp.js` (field parser), `bin/cli.js` (`assets`, `read`).
- `packages/react`, `packages/vue`: thin adapters over the element and the headless controller.
- `packages/models`: model files, added at release (gitignored).
- `apps/demo`: `npm run demo` (needs `npx ktp-kit assets apps/demo/ktp-kit` first).

Rules:
- Plain JavaScript with JSDoc, no build step. `.d.ts` files are generated at release.
- `reader.js` mirrors RapidOCR's detector settings and box steps, and `ktp.js` is checked field-by-field against a
  reference implementation. Keep their behaviour unchanged unless a measured test says otherwise.
- Never add real KTP photos, NIKs or names to the repo, tests or docs. Use the specimen NIK 3171234567890123 or made-up data.
- Run `npm run check` (syntax) before committing.
