// Jurnal berantai hash: bukti bahwa sinyal dicatat SEBELUM hasilnya diketahui.
// Yang dijamin: mengedit isi sinyal atau menghapus/menyisipkan baris di tengah terdeteksi.
// Batasnya (jujur): menghapus baris TERAKHIR tidak terdeteksi oleh rantai saja, jadi hash ujung rantai dicetak ke ringkasan
// GitHub Actions (stempel waktu di luar repo). Hasil (hasil/R/tx/bm/bi) tidak disegel karena diisi belakangan.
import crypto from 'node:crypto';

export const sha = s => crypto.createHash('sha256').update(s).digest('hex');
export const engineHash = (...texts) => sha(texts.map(t => String(t).replace(/\r\n/g, '\n')).join('\u0000')).slice(0, 16);

const SEAL = ['id', 't', 'due', 'aset', 'arah', 'entry', 'sl', 'tp', 'harga_awal', 'alasan', 'trig', 'score', 'grade', 'age', 'mode', 'engine'];
const canon = r => JSON.stringify(SEAL.map(k => (r[k] === undefined ? null : r[k])));
const link = (prev, seq, r) => sha(`${prev}|${seq}|${canon(r)}`).slice(0, 20);

export const lastSealed = rows => { let m = null; for (const r of rows) if (!m || r.seq > m.seq) m = r; return m; };
export function sealRow(row, prev) {
  row.seq = (prev ? prev.seq : 0) + 1; row.prev = prev ? prev.h : 'GENESIS'; row.h = link(row.prev, row.seq, row);
  return row;
}
export function verifyChain(rows) {
  const f = [...rows].sort((a, b) => a.seq - b.seq), errors = []; let prev = 'GENESIS';
  f.forEach((r, i) => {
    if (r.seq !== i + 1) errors.push(`seq ${r.seq} tidak berurutan (harapan ${i + 1}); ada baris dihapus atau disisipkan`);
    if (r.prev !== prev) errors.push(`baris ${r.id}: tautan ke baris sebelumnya putus`);
    if (r.h !== link(r.prev, r.seq, r)) errors.push(`baris ${r.id}: isi sinyal diubah setelah dicatat`);
    if (i && r.t < f[i - 1].t) errors.push(`baris ${r.id}: waktu lebih awal dari baris sebelumnya`);
    prev = r.h;
  });
  return { ok: !errors.length, n: f.length, head: f.length ? f.at(-1).h : null, errors };
}
