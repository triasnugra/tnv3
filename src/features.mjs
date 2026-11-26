// Fitur yang DICATAT saat sinyal terbit (bukan dipakai menyaring). Tujuannya: analisis mingguan (src/analysis.mjs) menguji
// apakah ada fitur yang terbukti membedakan TP dari SL. Fitur hanya boleh menjadi filter setelah lolos koreksi uji berganda
// dan konfirmasi di data yang lebih baru.
const r2 = (v, d = 2) => Number.isFinite(v) ? +v.toFixed(d) : null;

export function snapshot(f, ctx) {
  const risk = Math.abs(f.entry - f.sl), reward = Math.abs(f.tp - f.entry);
  return {
    slPct: r2(f.slp), tpPct: r2(reward / f.entry * 100), slAtr: r2(f.slAtr), atrPct: r2(f.atr / f.px * 100),
    // hipotesis B: seberapa jauh TP dibanding jangkauan wajar 7 hari (ATR harian x akar 7); >1 = TP sulit dicapai sebelum kedaluwarsa
    reach7: r2(reward / (f.atr * Math.sqrt(7))),
    distR: r2(Math.abs(f.px - f.entry) / risk), distPct: r2(f.dist), tgtR: r2(f.tgtR),
    ret1d: r2(f.ret1d * 100), ret3d: r2(f.ret3d * 100), ret7d: r2(f.ret7d * 100), ret30: r2(f.ret30 * 100),
    rsi: r2(f.rsi, 1), e20d: r2((f.px / f.e20 - 1) * 100), e50d: r2((f.px / f.e50 - 1) * 100),
    tr: f.tr, td: f.td, tw: f.tw, pos: r2(f.pos), qvM: r2(f.qv / 1e6, 1), ct: f.ct ? 1 : 0,
    btcTr: ctx ? ctx.tr : null, btcTd: ctx ? ctx.td : null, btcRet3d: ctx ? r2(ctx.ret3d * 100) : null, btcRet7d: ctx ? r2(ctx.ret7d * 100) : null,
    dow: new Date(f.k.at(-1).t).getUTCDay(),
  };
}
