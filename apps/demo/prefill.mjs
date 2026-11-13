// Puts the page's copy into the HTML itself, so it shows on first paint instead of popping in when the page script
// runs (which would shift the layout), and so search engines and link previews see it. The copy stays defined once,
// in the page's T object; the script still sets it again on load and on a language switch.
// lang "id" is served at /, "en" at /en. Used by serve.mjs and scripts/build-demo.mjs.
const esc = s => s.replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
const SITE = "https://ktp-kit.khusyasy.my.id";

export function prefill(html, lang = "id") {
  const a = html.indexOf("const T = {"), b = html.indexOf("\n  };", a);
  const T = new Function(`return ${html.slice(a + 10, b + 4)}`)();  // our own page source
  const L = T[lang];
  return html
    // per-language values in the head: <html lang>, canonical and og:url, og:locale, og:image
    .replaceAll("%LANG%", lang).replaceAll("%URL%", lang === "en" ? `${SITE}/en` : `${SITE}/`)
    .replaceAll("%LOCALE%", lang === "en" ? "en_US" : "id_ID")
    // meta tags with data-t-content="key": the string goes in their content attribute
    .replace(/(<meta\b[^>]*\bdata-t-content="(\w+)"[^>]*\bcontent=")[^"]*(")/g, (m, open, key, close) =>
      typeof L[key] === "string" ? open + esc(L[key]) + close : m)
    // text-only elements with data-t="key" (empty, or an old placeholder): the string
    .replace(/(<(\w+)\b[^>]*\bdata-t="(\w+)"[^>]*>)[^<]*(<\/\2>)/g, (m, open, tag, key, close) =>
      typeof L[key] === "string" ? open + esc(L[key]) + close : m)
    // the accuracy table: percentages with the language's decimal mark
    .replace(/(<td\b[^>]*\bdata-pct="([\d.]+)"[^>]*>)(<\/td>)/g, (m, open, v, close) => `${open}${v.replace(".", L.decimal)}%${close}`)
    .replace(/(<td\b[^>]*\bdata-mb="([\d.]+)"[^>]*>)(<\/td>)/g, (m, open, v, close) => `${open}${v.replace(".", L.decimal)} MB${close}`)
    // the sample result's flagged field, so the form doesn't grow a line when the script runs
    .replace(/(<span\b[^>]*\bdata-why="alamat"[^>]*>)(<\/span>)/, (m, open, close) => open + esc(L.why.low_confidence) + close)
    // links to the docs go to the docs in the same language
    .replaceAll('href="/docs"', lang === "en" ? 'href="/en/docs"' : 'href="/docs"')
    // the language button shows the other language
    .replace(/(<button\b[^>]*\bid="lang"[^>]*\baria-label=")[^"]*(">)[^<]*(<\/button>)/, (m, open, mid, close) =>
      open + esc(L.otherLabel) + mid + esc(L.other) + close);
}
