// KTP field parser for the browser: a line-by-line port of extract_fields and its helpers in ktp.py.
// Keep the two in sync; `node web/parity.mjs` checks this file against Python on real cards.
// Items are [text, [[x, y] x4]] on a flattened, upright 856x540 card.

export const CARD_W = 856, CARD_H = 540;
const TO_DIGIT = Object.fromEntries([..."OoDQIl|!SsBZzbG"].map((c, i) => [c, "000011115582266"[i]]));
const translate = (s, map) => [...s].map(c => map[c] ?? c).join("");
const strip = (s, chars) => {
  let a = 0, b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
};
const pyRound = x => { // Python's round(): halves go to the even neighbour
  const f = Math.floor(x), d = x - f;
  return d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f;
};
const pad = (n, w) => String(n).padStart(w, "0");
const argmax = (xs, key) => { // first best, like Python's max()
  let best = xs[0], bs = key(best);
  for (const x of xs.slice(1)) { const s = key(x); if (s > bs) { best = x; bs = s; } }
  return best;
};

export function nikValid(nik) {
  if (!/^\d{16}$/.test(nik)) return false;
  let day = +nik.slice(6, 8);
  const month = +nik.slice(8, 10);
  if (day > 40) day -= 40;
  return +nik.slice(0, 2) >= 11 && +nik.slice(0, 2) <= 94 && day >= 1 && day <= 31 && month >= 1 && month <= 12
    && nik.slice(12) !== "0000";
}

export function extractNik(lines) {
  const cands = [];
  for (const line of lines) {
    const compact = line.replace(/[\s:.,\-]/g, "");
    if ([...compact].filter(c => c >= "0" && c <= "9").length < 8) continue;
    cands.push(...(translate(compact, TO_DIGIT).match(/\d{16}/g) || []));
  }
  return cands.find(nikValid) ?? cands[0] ?? null;
}

const geo = box => { // left x, right x, center y, height
  const xs = box.map(p => p[0]), ys = box.map(p => p[1]);
  return [Math.min(...xs), Math.max(...xs), ys.reduce((a, b) => a + b) / 4, Math.max(...ys) - Math.min(...ys)];
};

const BODY_FIELDS = ["nama", "tempat_tgl_lahir", "jenis_kelamin", "alamat", "rt_rw", "kel_desa", "kecamatan", "agama",
  "status_perkawinan", "pekerjaan", "kewarganegaraan", "berlaku_hingga"];
const FIELD_LABEL = {nama: "NAMA", tempat_tgl_lahir: "TEMPATTGLLAHIR", jenis_kelamin: "JENISKELAMIN", alamat: "ALAMAT",
  rt_rw: "RTRW", kel_desa: "KELDESA", kecamatan: "KECAMATAN", agama: "AGAMA", status_perkawinan: "STATUSPERKAWINAN",
  pekerjaan: "PEKERJAAN", kewarganegaraan: "KEWARGANEGARAAN", berlaku_hingga: "BERLAKUHINGGA"};
const WRAPS = new Set(["nama", "alamat", "pekerjaan"]);
export const JENIS_KELAMIN = ["LAKI-LAKI", "PEREMPUAN"];
export const AGAMA = ["ISLAM", "KRISTEN", "KATOLIK", "HINDU", "BUDDHA", "KONGHUCU", "KEPERCAYAAN TERHADAP TUHAN YME"];
export const STATUS_PERKAWINAN = ["BELUM KAWIN", "KAWIN", "CERAI HIDUP", "CERAI MATI"];
// Same list as PEKERJAAN in ktp.py (Permendagri 6/2026 plus older wording).
export const PEKERJAAN = `Belum/Tidak Bekerja|Mengurus Rumah Tangga|Pelajar/Mahasiswa|Pensiunan|
Pegawai Negeri Sipil (PNS)|Pegawai Negeri Sipil|Aparatur Sipil Negara (ASN)|Tentara Nasional Indonesia (TNI)|
Tentara Nasional Indonesia|Kepolisian RI (POLRI)|Kepolisian RI|Perdagangan|Petani/Pekebun|Peternak|Nelayan/Perikanan|
Industri|Konstruksi|Transportasi|Karyawan Swasta|Karyawan BUMN|Karyawan BUMD|Karyawan Honorer|Buruh Harian Lepas|
Buruh Tani/Perkebunan|Buruh Nelayan/Perikanan|Buruh Peternakan|Pembantu Rumah Tangga|Tukang Cukur|Tukang Listrik|
Tukang Batu|Tukang Kayu|Tukang Sol Sepatu|Tukang Las/Pandai Besi|Tukang Jahit|Tukang Gigi|Penata Rias|Penata Busana|
Penata Rambut|Mekanik|Seniman|Tabib|Paraji|Perancang Busana|Penerjemah|Imam Masjid|Pendeta|Pastor|Wartawan|
Ustadz/Mubaligh|Juru Masak|Promotor Acara|Anggota DPR-RI|Anggota DPD|Anggota BPK|Presiden|Wakil Presiden|
Anggota Mahkamah Konstitusi|Anggota Kabinet/Kementerian|Duta Besar/Kepala Perwakilan|Gubernur|Wakil Gubernur|Bupati|
Wakil Bupati|Walikota|Wakil Walikota|Anggota DPRD Provinsi|Anggota DPRD Kab/Kota|Dosen|Guru|Pilot|Pengacara|Notaris|
Arsitek|Akuntan|Konsultan|Dokter|Bidan|Perawat|Apoteker|Psikiater/Psikolog|Penyiar Televisi|Penyiar Radio|Pelaut|
Peneliti|Sopir|Pialang|Paranormal|Pedagang|Perangkat Desa|Kepala Desa|Biarawati|Wiraswasta|
Anggota Lembaga Tinggi Lainnya|Artis|Atlet|Chef|Manajer|Tenaga Tata Usaha|Operator|Pekerja Pengolahan, Kerajinan|
Teknisi|Asisten Ahli Lainnya|Gembala|Uskup|Biarawan|Pandita|Pinandita|Bhikkhu|Xueshi|Wenshi|Jiaosheng|Lainnya`
  .replace(/\n/g, "").toUpperCase().split("|");
const DATE = /(\d{1,2})\s*[-.,/ ]\s*(\d{1,2})\s*[-.,/ ]\s*(\d{4})/;

const letters = s => (s || "").toUpperCase().replace(/[^A-Z]/g, "");

// difflib.SequenceMatcher(None, a, b).ratio(). ponytail: no autojunk, which only kicks in at 200+ chars.
function seqRatio(a, b) {
  const b2j = new Map();
  [...b].forEach((c, j) => { if (!b2j.has(c)) b2j.set(c, []); b2j.get(c).push(j); });
  const longest = (alo, ahi, blo, bhi) => {
    let bi = alo, bj = blo, bs = 0, j2len = new Map();
    for (let i = alo; i < ahi; i++) {
      const next = new Map();
      for (const j of b2j.get(a[i]) || []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) || 0) + 1;
        next.set(j, k);
        if (k > bs) { bi = i - k + 1; bj = j - k + 1; bs = k; }
      }
      j2len = next;
    }
    return [bi, bj, bs];
  };
  let matches = 0;
  const queue = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop();
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (k) {
      matches += k;
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  return a.length + b.length ? 2 * matches / (a.length + b.length) : 1;
}

const ratioCache = new Map();
export function ratio(a, b) { // better of difflib ratio and 1 - edit distance / length (see _ratio in ktp.py)
  if (!a || !b) return 0;
  const key = a + "\u0000" + b;
  let r = ratioCache.get(key);
  if (r !== undefined) return r;
  let prev = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1])));
    prev = cur;
  }
  r = Math.max(seqRatio(a, b), 1 - prev[b.length] / Math.max(a.length, b.length));
  if (ratioCache.size > 200000) ratioCache.clear();
  ratioCache.set(key, r);
  return r;
}

export function snap(text, vocab, minRatio) {
  const t = letters(text);
  if (!t) return null;
  const best = argmax(vocab, v => ratio(t, letters(v)));
  return ratio(t, letters(best)) >= minRatio ? best : null;
}

// Birth date from a valid NIK (digits 7-12 = DDMMYY, day + 40 for women), for when the printed date was misread
// (see nik_birth_date in ktp.py). Century: a '19'/'20' still readable in the line, else the later one that makes the
// holder at least 17, never a year in the future.
export function nikBirthDate(nik, text, now = new Date().getFullYear()) {
  let day = +nik.slice(6, 8);
  const yy = +nik.slice(10, 12);
  if (day > 40) day -= 40;
  const seen = [...translate(text || "", TO_DIGIT).matchAll(/(?<!\d)(19|20)(?=\d)/g)];
  let century = seen.length ? +seen.at(-1)[1] * 100 : (2000 + yy <= now - 17 ? 2000 : 1900);
  if (century + yy > now) century = 1900;
  return `${pad(day, 2)}-${nik.slice(8, 10)}-${century + yy}`;
}

function date(s) {
  const m = DATE.exec(translate(s || "", TO_DIGIT));
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 1900 && y <= 2100 ? `${pad(d, 2)}-${pad(mo, 2)}-${y}` : null;
}

function place(s) {
  const m = DATE.exec(translate(s || "", TO_DIGIT));
  return strip(m ? s.slice(0, m.index) : s || "", " ,.:;-");
}

const typesCache = new Map();
function valueTypes(v) {
  if (typesCache.has(v)) return typesCache.get(v);
  const t = new Set(), compact = letters(v);
  if (date(v) && /[A-Za-z]{3}/.test(place(v))) t.add("tempat_tgl_lahir");
  if ((date(v) && !/[A-Za-z]{3}/.test(v)) || ratio(compact, "SEUMURHIDUP") >= 0.8) t.add("berlaku_hingga");
  if (/^\W*[\dOoIl|]{2,3}\s*[/Il|1\\]\s*[\dOoIl|]{2,3}\W*$/.test(v)) t.add("rt_rw");
  for (const [field, vocab, r] of [["jenis_kelamin", JENIS_KELAMIN, 0.75], ["agama", AGAMA, 0.8],
    ["status_perkawinan", STATUS_PERKAWINAN, 0.8], ["pekerjaan", PEKERJAAN, 0.85]])
    if (snap(v, vocab, r)) t.add(field);
  if (["WNI", "WNA", "WN1", "VNI"].includes(compact)) t.add("kewarganegaraan");
  typesCache.set(v, t);
  return t;
}

const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function cardRows(items) {
  const W = CARD_W, H = CARD_H;
  const nik = items.find(([t]) => extractNik([t])) ?? null;
  const [nikCy, nikH] = nik ? [geo(nik[1])[2], geo(nik[1])[3]] : [0.19 * H, 0.06 * H];
  const vals = items.map(([, b]) => geo(b)).filter(g => 0.17 * W < g[0] && g[0] < 0.33 * W && g[2] > nikCy + nikH / 2)
    .map(g => g[0]).sort((a, b) => a - b);
  const vx = vals.length ? vals[Math.floor(vals.length / 2)] : 0.237 * W;

  const header = items.filter(([, b]) => geo(b)[2] < nikCy - nikH / 2).sort((p, q) => geo(p[1])[2] - geo(q[1])[2]);
  const issue = items.filter(([, b]) => geo(b)[0] >= 0.66 * W && geo(b)[2] > 0.55 * H);
  const pieces = [];
  for (const [t, b] of items) {
    const [x0, x1, cy] = geo(b);
    if (cy < nikCy + nikH / 2 || cy > 0.95 * H || x0 >= 0.66 * W || (nik && b === nik[1])) continue;
    if (x0 >= vx - 0.03 * W) pieces.push([cy, x0, "value", t]);
    else if (x1 <= vx + 0.04 * W) pieces.push([cy, x0, "label", t]);
    else {
      let lab, val;
      const colon = t.indexOf(":");
      if (colon >= 0) [lab, val] = [t.slice(0, colon), t.slice(colon + 1)];
      else {
        let cut = pyRound(t.length * (vx - x0) / Math.max(x1 - x0, 1));
        const spaces = [...t].map((c, i) => c === " " && Math.abs(i - cut) <= 3 ? i : -1).filter(i => i >= 0);
        if (spaces.length) cut = argmax(spaces, i => -Math.abs(i - cut));
        [lab, val] = [t.slice(0, cut), t.slice(cut)];
      }
      pieces.push([cy, x0, "label", lab]);
      pieces.push([cy, vx, "value", val]);
    }
  }
  const heights = items.map(([, b]) => geo(b)[3]).sort((a, b) => a - b);
  const tol = 0.55 * (heights.length ? heights[Math.floor(heights.length / 2)] : 0.05 * H);
  const rows = [];
  pieces.sort((p, q) => cmp(p[0], q[0]) || cmp(p[1], q[1]) || cmp(p[2], q[2]) || cmp(p[3], q[3]));
  for (const p of pieces) {
    if (rows.length && Math.abs(p[0] - rows.at(-1).cy) < tol) rows.at(-1).pieces.push(p);
    else rows.push({cy: p[0], pieces: [p]});
  }
  const out = rows.map(r => {
    const ps = r.pieces.slice().sort((p, q) => p[1] - q[1]);
    const join = f => strip(ps.filter(f).map(p => p[3]).join(" "), " :'");
    const left = join(p => p[2] === "value" && p[1] < 0.45 * W), right = join(p => p[2] === "value" && p[1] >= 0.45 * W);
    return {label: join(p => p[2] === "label"), value: (left + " " + right).trim(), left, right};
  });
  return [header.map(([t]) => t), out.filter(r => r.label || r.value), issue];
}

function assignRows(rows) {
  const labelScore = (row, f) => !letters(row.label) ? 0 : 2 * (ratio(letters(row.label), FIELD_LABEL[f]) - 0.55);
  const typeScore = (row, f) => {
    const types = valueTypes(f === "jenis_kelamin" ? row.left : row.value);
    if (["nama", "alamat", "kel_desa", "kecamatan"].includes(f)) return types.size ? -1 : 0.2;
    return types.has(f) ? 1.5 : (types.size ? -0.5 : -0.3);
  };
  const n = rows.length, m = BODY_FIELDS.length;
  const best = Array.from({length: n + 1}, () => Array(m + 1).fill(-Infinity));
  const back = Array.from({length: n + 1}, () => Array(m + 1).fill(null));
  best[0][0] = 0;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    const s = best[i][j];
    if (s === -Infinity) continue;
    const moves = [];
    if (i < n) moves.push([i + 1, j, s - 0.6, null]);
    if (j < m) moves.push([i, j + 1, s - 0.8, null]);
    if (i < n && j < m) {
      const f = BODY_FIELDS[j];
      const one = s + 0.5 + labelScore(rows[i], f) + typeScore(rows[i], f);
      moves.push([i + 1, j + 1, one, [i]]);
      const nxt = i + 1 < n ? rows[i + 1] : null;
      if (nxt && !letters(nxt.label)) {
        if (WRAPS.has(f) && !valueTypes(nxt.value).size) moves.push([i + 2, j + 1, one + 0.1, [i, i + 1]]);
        else if (f === "tempat_tgl_lahir" && !date(rows[i].value) && date(nxt.value) && !/[A-Za-z]{3}/.test(nxt.value))
          moves.push([i + 2, j + 1, one + 1.2, [i, i + 1]]);
      }
    }
    for (const [a, b, sc, used] of moves)
      if (sc > best[a][b]) { best[a][b] = sc; back[a][b] = [i, j, used]; }
  }
  const out = {};
  let i = n, j = m;
  while (i || j) {
    const [pi, pj, used] = back[i][j];
    if (used) out[BODY_FIELDS[pj]] = used;
    [i, j] = [pi, pj];
  }
  return out;
}

export class Wilayah {
  static PREFIX = /^(PROVINSI|KABUPATEN|KAB|KOTA ADMINISTRASI|KOTA ADM|KOTA)\b\.?\s*/;

  constructor(csvText) { // data/wilayah.csv: kode,nama
    this.name = new Map();      // a Map keeps file order (object keys like "11" would be re-sorted)
    this.children = new Map();
    for (const line of csvText.split(/\r?\n/).slice(1)) {
      if (!line) continue;
      const i = line.indexOf(","), k = line.slice(0, i);
      let nama = line.slice(i + 1);
      if (nama.startsWith('"')) nama = nama.slice(1, -1).replace(/""/g, '"');
      this.name.set(k, nama.toUpperCase());
      const parent = {2: "", 4: k.slice(0, 2), 6: k.slice(0, 4), 10: k.slice(0, 6)}[k.length];
      if (!this.children.has(parent)) this.children.set(parent, []);
      this.children.get(parent).push(k);
    }
  }

  kids(code) { return this.children.get(code) || []; }

  places() { // what a birthplace is printed as: regency/city names without KABUPATEN/KOTA, district names, JAKARTA
    if (!this._places) {
      const ps = new Set(["JAKARTA"]);
      for (const [k, n] of this.name) {
        if (k.length === 4) ps.add(n.replace(Wilayah.PREFIX, ""));
        if (k.length === 6) ps.add(n);
      }
      this._places = [...ps].sort();
      this._placeSet = ps;
    }
    return this._places;
  }

  best(text, codes, minRatio, loose = false) {
    text = strip((text || "").toUpperCase(), " :.,");
    const bare = s => letters(s.replace(Wilayah.PREFIX, ""));
    const key = /^(KABUPATEN|KAB\b|KOTA)/.test(text) ? letters : bare;
    const t = key(text);
    if (!t || !codes.length) return null;
    const score = loose
      ? c => Math.max(ratio(letters(text), letters(this.name.get(c))), ratio(bare(text), bare(this.name.get(c))))
      : c => ratio(t, key(this.name.get(c)));
    const k = argmax(codes, score);
    return score(k) >= minRatio ? k : null;
  }
}

export function tidyAddress(s) {
  if (!s) return s;
  s = s.replace(/\b(JL|JLN|GG|KP|KOMP|PERUM|DSN|DUSUN)\b\.?\s*(?=[A-Z0-9])/g, m => m.trimEnd() + " ");
  s = s.replace(/^(JL|JLN|GG|KP|KOMP|PERUM)(\.?)(?=[A-Z]{3})/, "$1$2 ");
  s = s.replace(/(?<=[A-Z0-9])(NO)(\.?)\s*(?=\d)/g, " $1$2 ");
  s = s.replace(/(?<=[A-Z])BLOK(?=[A-Z0-9])/g, " BLOK ");
  s = s.replace(/\bBLOK(?=[A-Z0-9])/g, "BLOK ");
  return s.replace(/\s+/g, " ").trim();
}

// split_muhammad in ktp.py: 'MUHAMMADLUTHFI' -> 'MUHAMMAD LUTHFI' (never glued in 132 labelled names).
const MUHAMMAD = /\b(MUHAMMAD|MUHAMAD|MOHAMMAD|MOHAMAD|MOCHAMMAD|MOCHAMAD|MUCHAMMAD|MUCHAMAD|MOHAMMED|MUHAMMED)(?=[A-Z]{3})/g;
export const splitMuhammad = name => name ? name.replace(MUHAMMAD, "$1 ") : name;

export function nikConflicts(out) {
  const nik = out.nik;
  if (!(nik && nikValid(nik))) return [];
  const day = +nik.slice(6, 8), female = day > 40, bad = [];
  const tl = out.tanggal_lahir;
  if (tl && (tl.slice(0, 5) !== `${pad(female ? day - 40 : day, 2)}-${nik.slice(8, 10)}` || tl.slice(-2) !== nik.slice(10, 12)))
    bad.push("tanggal_lahir");
  if (out.jenis_kelamin && out.jenis_kelamin !== (female ? "PEREMPUAN" : "LAKI-LAKI")) bad.push("jenis_kelamin");
  return bad;
}

function provinceAlias(s) {
  s = (s || "").toUpperCase();
  s = s.replace(/^D\.?K\.?I\.?\s*/, "DAERAH KHUSUS IBUKOTA ");
  s = s.replace(/^D\.?I\.?\s*(?=YOG)/, "DAERAH ISTIMEWA ");
  return s.replace(/^KEP\.?\s*(?!ULAUAN)/, "KEPULAUAN ");
}

// How many of the KTP's printed labels the OCR lines show (0-10), fuzzy. Other cards (SIM, NPWP, bank cards)
// show few; the cutoff is measured in web/devicetest.mjs. Browser-only, so there is no Python twin.
const KTP_LABELS = ["PROVINSI", "NIK", "NAMA", "TEMPATTGLLAHIR", "JENISKELAMIN", "ALAMAT", "AGAMA", "PEKERJAAN",
  "KEWARGANEGARAAN", "BERLAKUHINGGA"];
export function ktpLabels(items) {
  const texts = items.map(([t]) => letters(t));
  return KTP_LABELS.filter(l => texts.some(t => t.length >= 3 && ratio(t.slice(0, l.length + 2), l) >= 0.75 ||
    t.length > l.length && ratio(t.slice(0, l.length), l) >= 0.8)).length;
}

// Why a field needs a second look, from extractFields' output: {field: [code, ...]}, internal field names.
//   nik_mismatch: disagrees with what the NIK encodes   from_nik: unreadable, filled from the NIK
// Snapping to official names and lists is not flagged: on 60 hand-read cards it was never wrong (0 of 44).
// Browser API only, so there is no Python twin.
export function fieldNotes(out) {
  const raw = out.raw || {}, notes = {}, add = (f, code) => (notes[f] ||= []).push(code);
  for (const f of nikConflicts(out)) add(f, "nik_mismatch");
  if (out.tanggal_lahir && !date(raw.tempat_tgl_lahir)) add("tanggal_lahir", "from_nik");
  if (out.jenis_kelamin && !snap(raw.jenis_kelamin, JENIS_KELAMIN, 0.6)) add("jenis_kelamin", "from_nik");
  return notes;
}

// Reader confidence for name and address: the lowest of the OCR lines their raw text came from (items [text, box,
// conf]; a line counts when its value part, after any label and ':', is inside the field's raw text). Other fields
// are snapped to official names or lists, which repairs low-confidence reads, so their confidence says little.
export function fieldConfidence(out, items) {
  // Free-text fields with no other check (fixed lists, regions and NIK-linked fields are snapped or cross-checked).
  // Each field's value is matched to the OCR lines it came from, the lowest line confidence wins.
  const raw = out.raw || {}, conf = {}, alnum = s => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const [f, src, key] of [["nama", "nama", letters], ["alamat", "alamat", letters],
    ["tempat_lahir", "tempat_tgl_lahir", letters], ["rt_rw", "rt_rw", alnum]]) {
    const v = key(raw[src]);
    if (!v) continue;
    const cs = items.filter(([t, , c]) => c !== undefined && key(t.replace(/^.*[:;]/, "")).length >= 2 &&
      v.includes(key(t.replace(/^.*[:;]/, "")))).map(([, , c]) => c);
    if (cs.length) conf[f] = Math.min(...cs);
  }
  return conf;
}

// All fields from a flattened upright card's OCR items. respace (optional, may be async) re-reads free text.
export async function extractFields(items, nik = null, wilayah = null, respace = null) {
  const [header, rows, issue0] = cardRows(items);
  const where = assignRows(rows);
  const raw = {};
  for (const [f, idx] of Object.entries(where)) raw[f] = idx.map(i => rows[i].value).join(" ").trim();
  if (where.jenis_kelamin) {
    const r = rows[where.jenis_kelamin[0]];
    [raw.jenis_kelamin, raw.gol_darah] = [r.left, r.right];
  }
  raw.provinsi = header.length ? header[0].replace(/^\W*PRO\w{0,2}NS\w?\s*/i, "") : "";
  raw.kabupaten_kota = header.length > 1 ? header[1] : "";
  const issue = issue0.slice().sort((p, q) => geo(p[1])[2] - geo(q[1])[2]);
  const dateItem = issue.find(([t]) => date(t)) ?? null;
  const dateY = dateItem ? geo(dateItem[1])[2] : 0.9 * CARD_H;
  raw.tanggal_terbit = dateItem ? dateItem[0] : "";
  raw.kota_terbit = issue.filter(([t, b]) => geo(b)[2] < dateY - 0.01 * CARD_H && !/\d/.test(t)).map(([t]) => t)
    .join(" ").trim();
  if (respace)
    for (const f of ["nama", "alamat", "tempat_tgl_lahir", "kota_terbit"])
      if (raw[f]) raw[f] = await respace(raw[f]);

  const out = {nik: nik || extractNik(items.map(([t]) => t))};
  out.nik_valid = Boolean(out.nik && nikValid(out.nik));
  out.nama = splitMuhammad(raw.nama) || null;
  const ttl = raw.tempat_tgl_lahir || "";
  out.tempat_lahir = place(ttl) || null;
  if (wilayah && out.tempat_lahir && (wilayah.places(), !wilayah._placeSet.has(out.tempat_lahir.toUpperCase())))
    // misread letters in a birthplace: snap to a close official place name (gold cards: 16 fixed, 0 broken)
    out.tempat_lahir = snap(out.tempat_lahir, wilayah.places(), 0.9) || out.tempat_lahir;
  out.tanggal_lahir = date(ttl) || (out.nik_valid ? nikBirthDate(out.nik, ttl) : null);
  out.jenis_kelamin = snap(raw.jenis_kelamin, JENIS_KELAMIN, 0.6);
  if (!out.jenis_kelamin && out.nik_valid) // row not found (6% of held-out cards): the NIK encodes it
    out.jenis_kelamin = +out.nik.slice(6, 8) > 40 ? "PEREMPUAN" : "LAKI-LAKI";
  let gd = translate((raw.gol_darah || "").replace(/G\w*\W*D\w*/gi, "").toUpperCase(), {0: "O", 8: "B"});
  gd = gd.replace(/[^ABO+\-]/g, "");
  out.gol_darah = /^((AB|A|B|O)[+-]?|-)$/.test(gd) ? gd : (where.jenis_kelamin ? "-" : null);
  out.alamat = tidyAddress(raw.alamat) || null;
  const d = translate(raw.rt_rw || "", TO_DIGIT).match(/\d+/g) || [];
  out.rt_rw = d.length >= 2 ? `${pad(parseInt(d[0], 10), 3)}/${pad(parseInt(d[1], 10), 3)}` : null;
  out.agama = snap(raw.agama, AGAMA, 0.7);
  out.status_perkawinan = snap(raw.status_perkawinan, STATUS_PERKAWINAN, 0.7);
  out.pekerjaan = snap(raw.pekerjaan, PEKERJAAN, 0.8) || raw.pekerjaan || null;
  const wn = letters(raw.kewarganegaraan);
  out.kewarganegaraan = wn.endsWith("A") && wn.length <= 4 ? "WNA" : (wn ? "WNI" : null);
  const bh = raw.berlaku_hingga || "";
  out.berlaku_hingga = ratio(letters(bh), "SEUMURHIDUP") >= 0.7 ? "SEUMUR HIDUP" : date(bh);
  out.kota_terbit = raw.kota_terbit || null;
  out.tanggal_terbit = date(raw.tanggal_terbit);
  for (const f of ["provinsi", "kabupaten_kota", "kecamatan", "kel_desa"]) out[f] = raw[f] || null;
  if (wilayah) {
    const w = wilayah, provs = w.kids("");
    const allKabs = () => [...w.name.keys()].filter(k => k.length === 4);
    const prov = w.best(provinceAlias(raw.provinsi), provs, 0.7) ||
      w.best(provinceAlias(raw.provinsi.toUpperCase().replace(/^\W*P?R?O?P?V?I?N?S?I?\s*/, "")), provs, 0.7);
    let kab = w.best(raw.kabupaten_kota, prov ? w.kids(prov) : allKabs(), 0.7);
    if (!kab && out.nik_valid && w.name.has(out.nik.slice(0, 4))) kab = out.nik.slice(0, 4);
    const kec = w.best(raw.kecamatan, kab ? w.kids(kab) : [], 0.75);
    const desa = w.best(raw.kel_desa, kec ? w.kids(kec) : [], 0.75);
    const terbit = w.best(raw.kota_terbit, prov ? w.kids(prov) : allKabs(), 0.7, true);
    if (terbit) out.kota_terbit = w.name.get(terbit);
    out.kode_wilayah = desa || kec;
    for (const [f, code] of [["provinsi", prov], ["kabupaten_kota", kab], ["kecamatan", kec], ["kel_desa", desa]])
      if (code && !(f === "kabupaten_kota" && code === (out.nik || "").slice(0, 4) && !raw.kabupaten_kota))
        out[f] = w.name.get(code);
  }
  out.raw = raw;
  return out;
}
