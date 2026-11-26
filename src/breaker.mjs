// Pemutus arah adaptif. Status tiap arah dihitung ULANG dari jurnal (tanpa memori tersembunyi) dengan memutar ulang trade
// terisi yang sudah SELESAI berurutan menurut waktu keluar. Murni kausal: hanya memakai hasil yang sudah diketahui pada `now`.
// Baris live DAN shadow ikut dihitung, jadi arah yang diblokir tetap dinilai dan bisa pulih sendiri (histeresis mencegah kedip).
import { CFG } from './config.mjs';
import { FILLED, netR, mean } from './stats.mjs';

export function directionState(rows, arah, { now = Infinity, cfg = CFG } = {}) {
  const b = cfg.breaker;
  let state = b.start[arah], roll = null, flips = 0;
  const res = rows.filter(r => r.arah === arah && FILLED(r.hasil) && Number.isFinite(+r.R) && (r.tx ?? r.due) <= now)
    .sort((x, y) => (x.tx ?? x.due) - (y.tx ?? y.due));
  const win = [];
  for (const r of res) {
    win.push(netR(r, cfg)); if (win.length > b.window) win.shift();
    if (win.length >= b.minResolved) {
      roll = mean(win);
      if (state === 'shadow' && roll > b.enableAbove) { state = 'live'; flips++; }
      else if (state === 'live' && roll <= b.disableAtOrBelow) { state = 'shadow'; flips++; }
    }
  }
  return { arah, state, roll, resolved: res.length, window: win.length, flips, warmup: win.length < b.minResolved };
}
export const breakerStates = (rows, opt) => ({ LONG: directionState(rows, 'LONG', opt), SHORT: directionState(rows, 'SHORT', opt) });
