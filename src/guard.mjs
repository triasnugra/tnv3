// Validasi sinyal dan pemblokir order ganda. Fungsi murni.
import { CFG } from './config.mjs';
export const SYM_RE = /^[A-Z0-9]{2,15}$/;
const DAY = 864e5;

export function validateSignal(s, { now = Date.now(), maxSlPct = CFG.maxSlPct, minRR = CFG.minRR } = {}) {
  const e = [];
  const fin = (...v) => v.every(x => typeof x === 'number' && Number.isFinite(x) && x > 0);
  if (typeof s.aset !== 'string' || !SYM_RE.test(s.aset)) e.push('simbol kosong atau format tidak sah');
  if (s.arah !== 'LONG' && s.arah !== 'SHORT') e.push('arah bukan LONG/SHORT');
  if (!fin(s.entry, s.sl, s.tp)) e.push('entry/SL/TP bukan angka positif');
  if (!fin(s.harga_awal)) e.push('harga acuan tidak valid');
  if (!Number.isFinite(s.t) || s.t > now + 5 * 6e4) e.push('waktu analisis tidak diketahui atau di masa depan');
  else if (Number.isFinite(s.due) && s.due <= s.t) e.push('batas waktu sebelum waktu sinyal');
  if (fin(s.entry, s.sl, s.tp) && (s.arah === 'LONG' || s.arah === 'SHORT')) {
    const d = s.arah === 'LONG' ? 1 : -1, risk = d * (s.entry - s.sl), reward = d * (s.tp - s.entry);
    if (!(risk > 0 && reward > 0)) e.push('urutan entry/SL/TP tidak sesuai arah');
    else {
      if (risk / s.entry * 100 > maxSlPct) e.push(`SL ${(risk / s.entry * 100).toFixed(1)}% melebihi batas ${maxSlPct}%`);
      if (reward / risk < minRR) e.push(`RR ${(reward / risk).toFixed(2)} di bawah ${minRR}`);
    }
    if (fin(s.harga_awal) && Math.abs(s.entry - s.harga_awal) / s.harga_awal > 0.25) e.push('entry terlalu jauh dari harga acuan (>25%)');
  }
  return { ok: !e.length, errors: e };
}

// Satu order aktif per koin (live ATAU shadow), dan jeda setelah SL. Mencegah satu peristiwa pasar dihitung berkali-kali
// (di v1: 781 sinyal tercatat menjadi hanya 307 setelah deduplikasi).
export function activeBlock(rows, aset, now = Date.now(), cooldownDays = CFG.cooldownDays) {
  for (const r of rows) {
    if (r.aset !== aset) continue;
    if (r.hasil === 'menunggu') return 'duplikat-aktif';
    if (r.hasil === 'SL' && now - (r.tx ?? r.due ?? r.t) < cooldownDays * DAY) return 'cooldown-sl';
  }
  return null;
}
export const bumpCount = (m, k, n = 1) => { m[k] = (m[k] || 0) + n; };
