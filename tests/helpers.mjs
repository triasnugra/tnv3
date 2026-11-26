import { rng } from '../src/stats.mjs';
export const DAY = 864e5, HOUR = 36e5;
// Kline harian sintetis deterministik: n candle tutup + 1 candle berjalan (hari ini). drift per hari, vol harian.
export function mkDaily(seed, { n = 400, now, drift = 0, vol = .03, base = 100 } = {}) {
  const r = rng(seed), today = Math.floor(now / DAY) * DAY, out = []; let p = base;
  for (let i = n; i >= 0; i--) {
    const t = today - i * DAY, o = p, z = (r() + r() + r() - 1.5) / 1.5, c = Math.max(.01, o * (1 + drift + vol * z));
    const h = Math.max(o, c) * (1 + vol * r() * .6), l = Math.min(o, c) * (1 - vol * r() * .6);
    out.push({ t, o, h, l, c, v: 1e6 + r() * 5e5 }); p = c;
  }
  return out; // elemen terakhir = candle hari ini (berjalan)
}
// Klien palsu: harga acak tetapi deterministik; h1/m1 diambil dari "lintasan" yang bisa diatur per tes.
export function fakeClient({ now, syms = ['BTC', 'AAA', 'BBB'], daily, h1, m1 } = {}) {
  return {
    universe: async () => syms,
    daily: async s => (daily ? daily(s) : mkDaily([...s].reduce((a, c) => a + c.charCodeAt(0), 0), { now, drift: -.002 })),
    h1: async (s, start) => (h1 ? h1(s, start) : []),
    m1: async (s, a, b) => (m1 ? m1(s, a, b) : []),
  };
}
export const k1 = (ot, o, h, l, c, dt = HOUR) => ({ ot, o, h, l, c, ct: ot + dt - 1 });
