// Puts the page's Indonesian copy into the HTML itself, so it shows on first paint instead of popping in when the
// page script runs (which would shift the layout). The copy stays defined once, in the page's T object; the script
// still sets it again on load and on a language switch. Used by serve.mjs and scripts/build-demo.mjs.
const esc = s => s.replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);

export function prefill(html) {
  const a = html.indexOf("const T = {"), b = html.indexOf("\n  };", a);
  const T = new Function(`return ${html.slice(a + 10, b + 4)}`)();  // our own page source
  const id = T.id;
  return html
    // text-only elements with data-t="key" (empty, or an old placeholder): the Indonesian string
    .replace(/(<(\w+)\b[^>]*\bdata-t="(\w+)"[^>]*>)[^<]*(<\/\2>)/g, (m, open, tag, key, close) =>
      typeof id[key] === "string" ? open + esc(id[key]) + close : m)
    // the accuracy table: percentages with the Indonesian decimal comma
    .replace(/(<td\b[^>]*\bdata-pct="([\d.]+)"[^>]*>)(<\/td>)/g, (m, open, v, close) => `${open}${v.replace(".", id.decimal)}%${close}`)
    .replace(/(<td\b[^>]*\bdata-mb="([\d.]+)"[^>]*>)(<\/td>)/g, (m, open, v, close) => `${open}${v.replace(".", id.decimal)} MB${close}`)
    // the sample result's flagged field, so the form doesn't grow a line when the script runs
    .replace(/(<span\b[^>]*\bdata-why="alamat"[^>]*>)(<\/span>)/, (m, open, close) => open + esc(id.why.low_confidence) + close);
}
