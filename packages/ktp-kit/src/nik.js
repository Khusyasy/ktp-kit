// NIK (Nomor Induk Kependudukan) parsing: what the 16 digits encode.
//   digits 1-2 province, 3-4 regency/city, 5-6 district (the region where the NIK was issued),
//   7-12 birth date DDMMYY (women: day + 40), 13-16 sequence number (never 0000).
// With a Wilayah table (the same one the reader uses: Kepmendagri 2025, plus older codes that were re-coded since,
// because a NIK keeps its original code) the region names are filled in too.
import {nikValid} from "./ktp.js";

/**
 * @param {string} nik
 * @param {import("./ktp.js").Wilayah} [wilayah]
 * @param {number} [now] reference year for the two-digit birth year (default: this year)
 * @returns {{nik: string, valid: boolean, jenis_kelamin?: string, tanggal_lahir?: string, kode_wilayah?: string,
 *   provinsi?: string|null, kabupaten_kota?: string|null, kecamatan?: string|null, urut?: string}}
 */
export function parseNik(nik, wilayah, now = new Date().getFullYear()) {
  nik = String(nik ?? "").replace(/\D/g, "");
  if (!nikValid(nik)) return {nik, valid: false};
  let day = +nik.slice(6, 8);
  const female = day > 40;
  if (female) day -= 40;
  const yy = +nik.slice(10, 12), century = 2000 + yy > now ? 1900 : 2000;
  const name = code => wilayah?.name.get(code) ?? null;
  return {
    nik, valid: true,
    jenis_kelamin: female ? "PEREMPUAN" : "LAKI-LAKI",
    tanggal_lahir: `${String(day).padStart(2, "0")}-${nik.slice(8, 10)}-${century + yy}`,
    kode_wilayah: nik.slice(0, 6),
    provinsi: name(nik.slice(0, 2)), kabupaten_kota: name(nik.slice(0, 4)), kecamatan: name(nik.slice(0, 6)),
    urut: nik.slice(12),
  };
}
