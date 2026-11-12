# ktp-kit design

How ktp-kit looks and talks, for the demo site, docs, and the default look of `<ktp-capture>`. The demo page is
Tailwind v4: tokens are the `@theme` block in `apps/demo/app.css`.

## Idea

**The proof is a test the visitor runs.** Download the model, turn on airplane mode, photograph a KTP: it still
reads. The demo sits first, next to a three-row list that ticks itself (saved on the device, offline, read with 0
network requests). Every claim on the page can be checked on the page.

**Made by a person.** The look comes from the author's own site (khusyasy.my.id): dark navy, a soft blue glow in
the top-left corner, a sticky left column with a big underlined menu, a row of icon links.

## Colour

Dark only, on purpose. Navy ground `#161b24`, ink `#e8edf3`, muted `#9aa5b4`, link blue `#579be8`. `ok` green
only for a finished test step, `warn` amber only for a field that disagrees with the NIK.

## Type

**Recursive** (variable, OFL), one file: sans for text, its MONO axis (`mono` utility) for code and the NIK. Same
family, so code sits naturally next to text.

## Layout and components

- Wide screens: sticky left column (name, headline, menu, install command, icons), content on the right.
  Phones: the column becomes a short header and the demo comes first.
- Icons for actions and links (Lucide, Simple Icons), each with a label for screen readers. Text only where an
  icon would be guessing (language switch, code tabs).
- The page styles `<ktp-capture>` with Tailwind classes only (CSS variables, `::part`, `data-state`), as an
  example for developers.
- Numbered or ordered lists only where order is real (the offline test).

## Voice

Indonesian first (Anda where a pronoun is needed, mostly commands without one), English as a switch.
- Every sentence carries something checkable: a number, an action, a limit.
- No mudah, canggih, akurat, andal, aman, solusi, inovatif, no "di era digital", no "Bersama X".
- Developer terms as developers say them (browser, offline, npm, JSON), one language per line.
- Show the weak number too, and say what the numbers were measured on (generated lines until the consented test set exists).
- Sentence case, no exclamation marks, no summary lines.
- No em or en dashes and no semicolons in copy: use full stops and commas. Ranges use a hyphen (2-5 detik).
