// Statistik: R bersih setelah biaya, ringkasan, bootstrap per minggu (klaster), uji permutasi, koreksi Benjamini-Hochberg.
import { CFG } from './config.mjs';

export const DAY = 864e5;
export const FILLED = h => h === 'TP' || h === 'SL' || h === 'kedaluwarsa';
export const RESOLVED = h => FILLED(h) || h === 'tidak terisi';

// PRNG deterministik supaya laporan bisa diulang persis
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Minggu dimulai Senin 00:00 UTC; kunci = tanggal Senin tsb
export function weekKey(t) {
  const d = new Date(t), dow = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}

export const slPct = r => Math.abs(r.entry - r.sl) / r.entry * 100;
export const costPct = (cfg = CFG) => 2 * cfg.cost.feePct + cfg.cost.slipPct;
// R bersih: biaya dibagi jarak SL (dalam %) dikurangkan dari R kotor. Tidak terisi = 0.
export const netR = (r, cfg = CFG) => (FILLED(r.hasil) && Number.isFinite(+r.R)) ? +r.R - costPct(cfg) / slPct(r) : 0;
export const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;

export function summarize(rows, cfg = CFG) {
  const done = rows.filter(r => RESOLVED(r.hasil)), f = done.filter(r => FILLED(r.hasil));
  const tp = f.filter(r => r.hasil === 'TP').length, sl = f.filter(r => r.hasil === 'SL').length, ex = f.length - tp - sl;
  const nets = f.map(r => netR(r, cfg)), gp = nets.filter(x => x > 0).reduce((s, x) => s + x, 0), gl = -nets.filter(x => x < 0).reduce((s, x) => s + x, 0);
  let eq = 0, pk = 0, dd = 0;
  for (const r of [...f].sort((a, b) => (a.tx ?? a.due) - (b.tx ?? b.due))) { eq += netR(r, cfg); pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return {
    sinyal: done.length, terisi: f.length, tidakTerisi: done.length - f.length, batal: done.filter(r => r.batal).length, TP: tp, SL: sl, kedaluwarsa: ex,
    win: tp + sl ? tp / (tp + sl) : null, expectancy: f.length ? mean(nets) : null, perSinyal: done.length ? nets.reduce((s, x) => s + x, 0) / done.length : null,
    PF: gl > 0 ? gp / gl : (gp > 0 ? Infinity : null), total: nets.reduce((s, x) => s + x, 0), maxDD: dd,
    minggu: new Set(f.map(r => weekKey(r.t))).size,
  };
}

// Bootstrap per minggu: sinyal satu minggu saling berkorelasi (satu rezim pasar), jadi minggu = unit sampel.
export function bootCI(values, groups, { B = CFG.bootB, seed = 1 } = {}) {
  if (values.length < 5) return null;
  const m = new Map(); values.forEach((v, i) => { const g = groups[i]; if (!m.has(g)) m.set(g, []); m.get(g).push(v); });
  const gr = [...m.values()], k = gr.length; if (k < 2) return null;
  const rand = rng(seed), out = new Float64Array(B);
  for (let b = 0; b < B; b++) { let s = 0, n = 0; for (let j = 0; j < k; j++) { const g = gr[Math.floor(rand() * k)]; for (const v of g) { s += v; n++; } } out[b] = s / n; }
  out.sort(); return { lo: out[Math.floor(.025 * B)], hi: out[Math.floor(.975 * B)], clusters: k };
}
export const ciOfRows = (rows, o) => { const f = rows.filter(r => FILLED(r.hasil)); return bootCI(f.map(r => netR(r)), f.map(r => weekKey(r.t)), o); };

// Uji permutasi dua sisi: selisih rata-rata `x` antara label 1 dan 0. Tanpa asumsi distribusi.
export function permP(x, y, { N = 2000, seed = 7 } = {}) {
  const n = x.length, n1 = y.reduce((s, v) => s + v, 0); if (n1 < 3 || n - n1 < 3) return null;
  const diff = lab => { let a = 0, b = 0; for (let i = 0; i < n; i++) lab[i] ? a += x[i] : b += x[i]; return a / n1 - b / (n - n1); };
  const obs = Math.abs(diff(y)), rand = rng(seed), lab = y.slice(); let ge = 0;
  for (let t = 0; t < N; t++) { for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [lab[i], lab[j]] = [lab[j], lab[i]]; } if (Math.abs(diff(lab)) >= obs - 1e-12) ge++; }
  return (ge + 1) / (N + 1);
}
export function bh(ps) {
  const n = ps.length, o = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), q = new Array(n); let prev = 1;
  for (let r = n; r >= 1; r--) { const [p, i] = o[r - 1]; prev = Math.min(prev, p * n / r); q[i] = prev; }
  return q;
}
