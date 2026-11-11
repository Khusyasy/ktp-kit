# ktp-kit design

How ktp-kit looks and talks, for the demo site, docs, and the default look of `<ktp-capture>`. Tokens live in
`apps/demo/tokens.css`.

## Idea

**Proof first.** The best developer-tool sites let the product prove itself above the fold: Stripe and Resend run
code next to a live result, Vercel and Linear let the site's own speed and restraint be the argument. ktp-kit's proof
is that reading happens on the device, so the working reader sits beside the headline, and a live strip shows what
can be measured: requests made while reading (0), read time, fields found, offline readiness. No adjectives the
reader can't check.

**One signature move: resolve.** Text goes from blurred and light to sharp and bold, the way a fuzzy photo becomes
text. It is used twice: the headline on load, and the extracted fields when a card is read. Nowhere else. With
`prefers-reduced-motion` the text simply appears.

## Colour

Cool neutrals with a slight blue bias, one confident blue (`--accent`) for links, the primary action and focus.
Semantic colours are separate from the accent: `--ok` for proof (0 uploads, ready offline), `--warn` for "perlu
dicek" (a field that disagrees with the NIK). Dark mode is designed, not inverted: the accent lightens to keep
contrast on dark surfaces. Body text keeps at least 4.5:1 contrast in both themes.

## Type

- **Plus Jakarta Sans** (variable, 200–800; by Tokotype, originally made for Jakarta's city identity): everything
  readable. Weight is the expressive axis; the resolve move animates it.
- **IBM Plex Mono**: NIKs, numbers, code. Numbers use tabular figures so they don't jump.
- Scale: 13 / 16 / 20 / 28 / 36–60. One big headline per page. Headings balance their lines; running text stays
  near 62 characters wide.

## Layout and components

- Proof-first hero: headline, one-line positioning ("OCR KTP tanpa API, tanpa upload"), proof strip, install
  snippet; the demo beside it on wide screens, below it on phones.
- Borders and shadows mark separate objects only: the demo frame, the code block, inputs. Sections are separated
  by space and a hairline, not by cards.
- Code snippets are tabbed by platform (HTML, React, Vue, CLI), copyable, and run as written.
- Numbered steps only where order is real (how a card is read).
- Every control has a visible focus ring in `--accent`.

## Voice

Indonesian first on the demo, English in the README. Plain, specific, active: "Baca KTP", "Salin", "Foto tidak
dikirim ke mana pun." Name what it replaces ("tanpa API OCR, tanpa upload"). Real numbers instead of claims; no
"tercepat", no "blazing fast".

## Don'ts

No purple-blue gradient heroes, no emoji section markers, no card-on-card grids, no ID-card costume (fake card
backgrounds, guilloche wallpaper), no animation that isn't the resolve move or direct feedback.
