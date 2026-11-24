// KTP field parser for the browser: a line-by-line port of extract_fields and its helpers in ktp.py.
// Keep the two in sync; `node web/parity.mjs` checks this file against Python.
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
  return +nik.slice(0, 2) >= 11 && +nik.slice(0, 2) <= 96 && day >= 1 && day <= 31 && month >= 1 && month <= 12
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

// Issue date with a lost or misread separator ("1308-2012", "05-022013", "3005 2012"): exactly 8 digits that make a
// valid DDMMYYYY with an e-KTP issue year. Only for the issue date, where nothing else on that line has digits.
function issueDate(s) {
  const d = date(s);
  if (d) return d;
  const m = /^(\d\d)(\d\d)(\d{4})$/.exec(translate(s || "", TO_DIGIT).replace(/[^\d]/g, ""));
  return m && +m[3] >= 2009 && +m[3] <= 2040 ? date(`${m[1]}-${m[2]}-${m[3]}`) : null;
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

  best(text, codes, minRatio, loose = false, prefer = null) {
    text = strip((text || "").toUpperCase(), " :.,");
    const bare = s => letters(s.replace(Wilayah.PREFIX, ""));
    const key = /^(KABUPATEN|KAB\b|KOTA)/.test(text) ? letters : bare;
    const t = key(text);
    if (!t || !codes.length) return null;
    const score = loose
      ? c => Math.max(ratio(letters(text), letters(this.name.get(c))), ratio(bare(text), bare(this.name.get(c))))
      : c => ratio(t, key(this.name.get(c)));
    // ties ("KOTA BANDUNG" matches KOTA and KABUPATEN BANDUNG bare): the printed prefix wins, then the card's own city
    const k = argmax(codes, c => score(c) + 0.01 * ratio(letters(text), letters(this.name.get(c))) + 0.005 * (c === prefer));
    return score(k) >= minRatio ? k : null;
  }
}

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

// Layer "accept": how much of the card's content checks out, 0-1 = share of the 10 checks below that pass.
// A NIK encodes region, birth date and sex, so the printed fields can be checked against it, the way passports are
// checked against their MRZ. Values filled from the NIK never count. A receipt or SIM passes at most the NIK check.
export const KTP_CHECKS = ["nik_valid", "tanggal_lahir_nik", "jenis_kelamin_nik", "provinsi", "provinsi_nik", "kecamatan",
  "agama", "status_perkawinan", "pekerjaan", "berlaku_hingga"];
export function accept(out, items) {
  const raw = out.raw || {}, g = out._region || {}, nik = out.nik_valid ? out.nik : "", bad = nikConflicts(out);
  const c = {
    nik_valid: !!nik,
    tanggal_lahir_nik: !!nik && !!date(raw.tempat_tgl_lahir) && !bad.includes("tanggal_lahir"),
    jenis_kelamin_nik: !!nik && !!snap(raw.jenis_kelamin, JENIS_KELAMIN, 0.6) && !bad.includes("jenis_kelamin"),
    provinsi: !!g.prov,
    provinsi_nik: !!g.prov && nik.slice(0, 2) === g.prov,
    kecamatan: !!g.kec,
    agama: AGAMA.includes(out.agama),
    status_perkawinan: STATUS_PERKAWINAN.includes(out.status_perkawinan),
    pekerjaan: PEKERJAAN.includes(out.pekerjaan),
    berlaku_hingga: !!out.berlaku_hingga,
  };
  const passed = KTP_CHECKS.filter(k => c[k]).length;
  return {score: passed / KTP_CHECKS.length, check: c, labels: ktpLabels(items)};
}

// Below these, name and address get "low_confidence" (see fieldConfidence): the most wrong reads caught while at
// least half of the flags are real errors. Confident misreads (thin I/L) stay above any useful cutoff.
export const LOW_CONFIDENCE = {nama: 0.8, alamat: 0.52};

// Layer "validate": flags only, values are never changed here. {notes: {field: [code]}, confidence: {field: p}}
export function validate(out, items) {
  const notes = fieldNotes(out), confidence = fieldConfidence(out, items);
  const add = (f, code) => (notes[f] ||= []).includes(code) || notes[f].push(code);
  for (const f of ["nik", "nama"]) if (!out[f]) add(f, "not_read");  // a missing value always needs a look
  const g = out._region, nik = out.nik || "";
  if (g && nik) {
    // A NIK keeps its first region after a move, so a plain province mismatch is common on right NIKs. A misread
    // first digit keeps the second ("35" read "15"): only that pattern is flagged.
    if (!g.nikProv) add("nik", "region_unknown");
    else if (g.prov && nik[0] !== g.prov[0] && nik[1] === g.prov[1]) add("nik", "region_mismatch");
  }
  for (const [k, c] of Object.entries(confidence))  // birthplace and RT/RW: value only, no flag
    if (c < (LOW_CONFIDENCE[k] ?? 0)) (notes[k] ||= []).push("low_confidence");
  // the same line read 1.2x wider (items[5], from the reader) gives other letters: a confident misread
  for (const [f, src] of [["nama", "nama"], ["alamat", "alamat"]])
    if (sourceLines(out.raw?.[src], items).some(i => typeof items[i][5] === "string" && valuePart(items[i][5]) !== valuePart(items[i][0])))
      add(f, "unstable");
  return {notes, confidence};
}

// How many of the KTP's printed labels the OCR lines show (0-10), fuzzy. Other cards (SIM, NPWP, bank cards)
// show few; the cutoff is measured in web/devicetest.mjs. Browser-only, so there is no Python twin.
const KTP_LABELS = ["PROVINSI", "NIK", "NAMA", "TEMPATTGLLAHIR", "JENISKELAMIN", "ALAMAT", "AGAMA", "PEKERJAAN",
  "KEWARGANEGARAAN", "BERLAKUHINGGA"];
export function ktpLabels(items, which = KTP_LABELS) {
  const texts = items.map(([t]) => letters(t));
  return which.filter(l => texts.some(t => t.length >= 3 && ratio(t.slice(0, l.length + 2), l) >= 0.75 ||
    t.length > l.length && ratio(t.slice(0, l.length), l) >= 0.8)).length;
}

// Why a field needs a second look, from extractFields' output: {field: [code, ...]}, internal field names.
//   nik_mismatch: disagrees with what the NIK encodes   from_nik: unreadable, filled from the NIK
// Snapping to official names and lists is not flagged: it is rarely wrong.
// Browser API only, so there is no Python twin.
export function fieldNotes(out) {
  const raw = out.raw || {}, notes = {}, add = (f, code) => (notes[f] ||= []).push(code);
  for (const f of nikConflicts(out)) add(f, "nik_mismatch");
  if (out.tanggal_lahir && !date(raw.tempat_tgl_lahir)) add("tanggal_lahir", "from_nik");
  if (out.jenis_kelamin && !snap(raw.jenis_kelamin, JENIS_KELAMIN, 0.6)) add("jenis_kelamin", "from_nik");
  return notes;
}

// Indices of the OCR items whose value part (after any label and ':') is inside a field's raw text.
const valuePart = t => letters(t.replace(/^.*[:;]/, ""));
export function sourceLines(rawText, items) {
  const v = letters(rawText);
  return v ? items.flatMap(([t], i) => valuePart(t).length >= 2 && v.includes(valuePart(t)) ? [i] : []) : [];
}

// Reader confidence for name and address: the lowest of the OCR lines their raw text came from (items [text, box,
// conf]; a line counts when its value part, after any label and ':', is inside the field's raw text). Other fields
// are snapped to official names or lists, which repairs low-confidence reads, so their confidence says little.
export function fieldConfidence(out, items) {
  // Free-text fields with no other check (fixed lists, regions and NIK-linked fields are snapped or cross-checked).
  // Each field's value is matched to the OCR lines it came from, only the characters after the label's colon count,
  // the least certain character wins. Address uses each character's first-frame probability (spaces included), the
  // others its peak probability (spaces skipped): the best split of wrong and right reads.
  const raw = out.raw || {}, conf = {}, alnum = s => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const [f, src, key] of [["nama", "nama", letters], ["alamat", "alamat", letters],
    ["tempat_lahir", "tempat_tgl_lahir", letters], ["rt_rw", "rt_rw", alnum]]) {
    const v = key(raw[src]);
    if (!v) continue;
    const ps = items.filter(([t, , , p]) => p && key(t.replace(/^.*[:;]/, "")).length >= 2 && v.includes(key(t.replace(/^.*[:;]/, ""))))
      .flatMap(([t, , , p]) => { const cut = t.search(/[:;]/); return p.map((q, i) => [t[i], ...q]).slice(cut + 1); })
      .map(([ch, first, peak]) => f === "alamat" ? first : ch === " " ? 1 : peak);
    if (ps.length) conf[f] = Math.min(...ps);
  }
  return conf;
}

// The parser runs in layers, each exported so it can be run alone, skipped, or fed known good input:
// readRows (OCR items -> raw text per field) -> parseFields (cleanup) -> checkNik (fills from the NIK) ->
// snapWilayah (official region names). extractFields chains them. Oracle inputs are `rows` and `parsed`
// in the options, so a benchmark can score a later layer without blaming the earlier one.

/** Layer "rows": OCR items -> raw printed text per field, nothing cleaned. raw._found lists the fields whose row was found. */
export function readRows(items) {
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
  // last resort: the same line decoded as digits only (letters in a date line are misreads, e.g. "2O1A")
  const dateItem = issue.find(([t]) => date(t)) ?? issue.find(([t]) => issueDate(t)) ??
    issue.filter(it => it[4] && issueDate(it[4])).map(it => [it[4], ...it.slice(1)])[0] ?? null;
  const dateY = dateItem ? geo(dateItem[1])[2] : 0.9 * CARD_H;
  raw.tanggal_terbit = dateItem ? dateItem[0] : "";
  raw.kota_terbit = issue.filter(([t, b]) => geo(b)[2] < dateY - 0.01 * CARD_H && !/\d/.test(t)).map(([t]) => t)
    .join(" ").trim();
  raw._found = Object.keys(where);
  return raw;
}

/** Layer "parse": raw text -> clean values, from the text alone (no NIK, no region table). */
export function parseFields(raw, nik = null) {
  const out = {nik};
  out.nik_valid = Boolean(nik && nikValid(nik));
  out.nama = raw.nama || null;
  const ttl = raw.tempat_tgl_lahir || "";
  out.tempat_lahir = place(ttl) || null;
  out.tanggal_lahir = date(ttl);
  out.jenis_kelamin = snap(raw.jenis_kelamin, JENIS_KELAMIN, 0.6);
  // the value is what follows the label's colon. The label itself is often misread ("COL.", "DARAH" alone)
  const gv = raw.gol_darah || "", colon = gv.lastIndexOf(":");
  let gd = translate((colon >= 0 ? gv.slice(colon + 1) : gv.replace(/G\w*\W*D\w*/gi, "")).toUpperCase(), {0: "O", 8: "B"});
  gd = gd.replace(/[^ABO+\-]/g, "");
  out.gol_darah = /^((AB|A|B|O)[+-]?|-)$/.test(gd) ? gd : ((raw._found || []).includes("jenis_kelamin") ? "-" : null);
  out.alamat = raw.alamat ? raw.alamat.replace(/\s+/g, " ").trim() : null;
  const rtClean = (raw.rt_rw || "").replace(/^\W+|\W+$/g, "");
  const rtSep = /[/\\]/.test(rtClean) ? rtClean
    : rtClean.replace(/^([\dOoDQIl|!SsBZzbG]{3})[Il|]([\dOoDQIl|!SsBZzbG]{3})$/, "$1/$2")
             .replace(/^([\dOoDQSsBZzbG]{2,3})[Il|]([\dOoDQSsBZzbG]{2,3})$/, "$1/$2");
  const d = translate(rtSep, TO_DIGIT).match(/\d+/g) || [];
  out.rt_rw = d.length >= 2 ? `${pad(parseInt(d[0], 10), 3)}/${pad(parseInt(d[1], 10), 3)}` : null;
  out.agama = snap(raw.agama, AGAMA, 0.7);
  // the row can hold the next field's text too ("KAWIN KARYAWAN SWASTA"): then its first or last 1-2 words
  const sw = (raw.status_perkawinan || "").split(/\s+/).filter(Boolean);
  out.status_perkawinan = snap(raw.status_perkawinan, STATUS_PERKAWINAN, 0.7) ||
    [sw.slice(0, 2), sw.slice(-2), sw.slice(0, 1), sw.slice(-1)].map(x => snap(x.join(" "), STATUS_PERKAWINAN, 0.85)).find(Boolean) || null;
  out.pekerjaan = snap(raw.pekerjaan, PEKERJAAN, 0.8) || raw.pekerjaan || null;
  const wn = letters(raw.kewarganegaraan);
  out.kewarganegaraan = wn.endsWith("A") && wn.length <= 4 ? "WNA" : (wn ? "WNI" : null);
  const bh = raw.berlaku_hingga || "";
  out.berlaku_hingga = ratio(letters(bh), "SEUMURHIDUP") >= 0.7 ? "SEUMUR HIDUP" : date(bh);
  out.kota_terbit = raw.kota_terbit || null;
  out.tanggal_terbit = issueDate(raw.tanggal_terbit);
  for (const f of ["provinsi", "kabupaten_kota", "kecamatan", "kel_desa"]) out[f] = raw[f] || null;
  return out;
}

/** Layer "nik": fields the card prints but the read missed, filled from what a valid NIK encodes. */
export function checkNik(out, raw) {
  out = {...out};
  if (!out.nik_valid) return out;
  out.tanggal_lahir ||= nikBirthDate(out.nik, raw.tempat_tgl_lahir || "");
  if (!out.jenis_kelamin) // row not found: the NIK encodes it
    out.jenis_kelamin = +out.nik.slice(6, 8) > 40 ? "PEREMPUAN" : "LAKI-LAKI";
  return out;
}

/** Layer "wilayah": birthplace and region names snapped to the official table, kode_wilayah. */
export function snapWilayah(out, raw, w) {
  out = {...out};
  if (out.tempat_lahir && (w.places(), !w._placeSet.has(out.tempat_lahir.toUpperCase())))
    // misread letters in a birthplace: snap to a close official place name
    out.tempat_lahir = snap(out.tempat_lahir, w.places(), 0.9) || out.tempat_lahir;
  const provs = w.kids("");
  const allKabs = () => [...w.name.keys()].filter(k => k.length === 4);
  const prov = w.best(provinceAlias(raw.provinsi), provs, 0.7) ||
    w.best(provinceAlias(raw.provinsi.toUpperCase().replace(/^\W*P?R?O?P?V?I?N?S?I?\s*/, "")), provs, 0.7);
  let kab = w.best(raw.kabupaten_kota, prov ? w.kids(prov) : allKabs(), 0.7);
  // what the card prints, before any fill from the NIK, for the validate layer's NIK vs region check
  out._region = {prov, nikProv: w.name.has((out.nik || "").slice(0, 2))};
  if (!kab && out.nik_valid && w.name.has(out.nik.slice(0, 4))) kab = out.nik.slice(0, 4);
  const kec = w.best(raw.kecamatan, kab ? w.kids(kab) : [], 0.75);
  const desa = w.best(raw.kel_desa, kec ? w.kids(kec) : [], 0.75);
  out._region.kec = kec;  // printed kecamatan found under the card's kabupaten, for the accept layer
  const terbit = w.best(raw.kota_terbit, prov ? w.kids(prov) : allKabs(), 0.7, true, kab);
  if (terbit) out.kota_terbit = w.name.get(terbit);
  out.kode_wilayah = desa || kec;
  for (const [f, code] of [["provinsi", prov], ["kabupaten_kota", kab], ["kecamatan", kec], ["kel_desa", desa]])
    if (code && !(f === "kabupaten_kota" && code === (out.nik || "").slice(0, 4) && !raw.kabupaten_kota)) {
      const official = w.name.get(code);
      // On district and village rows the card's own spacing is right when the letters match the official name
      // and every token is a real word, not an OCR fragment such as "WA TANG" or "L IMA".
      const keepRaw = ["kecamatan", "kel_desa"].includes(f) && raw[f] &&
        letters(raw[f]) === letters(official) && raw[f].trim().split(/\s+/).every(t => letters(t).length >= 3);
      out[f] = keepRaw ? raw[f] : official;
    }
  return out;
}

/** All fields from a flattened upright card's OCR items: the layers above in order.
 * skip: layer names to bypass ("rows", "parse", "nik", "wilayah"). `rows` and `parsed` are oracle inputs for
 * skipped layers. out.raw is the rows layer, out.layers each layer's output. */
export async function extractFields(items, nik = null, wilayah = null, {skip = [], rows = null, parsed = null} = {}) {
  const foundNik = nik || extractNik(items.map(([t]) => t));
  const raw = rows ?? (skip.includes("rows") ? {} : readRows(items));
  const clean = parsed ?? (skip.includes("parse") ? {nik: foundNik} : parseFields(raw, foundNik));
  const nikd = skip.includes("nik") ? clean : checkNik(clean, raw);
  const out = wilayah && !skip.includes("wilayah") ? snapWilayah(nikd, raw, wilayah) : {...nikd};
  out.raw = raw;
  const wilayahLayer = {...out};
  out.layers = {rows: raw, parse: clean, nik: nikd, wilayah: wilayahLayer};
  return out;
}
