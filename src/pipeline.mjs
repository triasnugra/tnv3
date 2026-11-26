// Alur scan dan penilaian sebagai fungsi yang menerima `client` (data) dan mengembalikan hasil, tanpa I/O file.
// Dengan begitu seluruh alur bisa diuji dengan klien palsu tanpa jaringan (tests/pipeline.test.mjs).
import { CFG, ENGINE_VERSION } from './config.mjs';
import { feat as realFeat, scanInput, btcCtx, selectPortfolio } from './signals.mjs';
import { validateSignal, activeBlock, bumpCount } from './guard.mjs';
import { breakerStates } from './breaker.mjs';
import { snapshot } from './features.mjs';
import { sealRow, lastSealed } from './chain.mjs';
import { gradeTrade, H1 } from './trade-sim.mjs';
import { FILLED, RESOLVED } from './stats.mjs';

const DAY = 864e5, q = v => +Number(v).toPrecision(6);

export async function runScan({ client, now = Date.now(), rows, engine, cfg = CFG, feat = realFeat, log = () => {} }) {
  const rej = {}, newRows = [];
  const syms = await client.universe(cfg.universeTop);
  const today = new Date(now).toISOString().slice(0, 10);

  const scan = async (s, ctx) => {
    try { const sc = scanInput(await client.daily(s), now); return { s, ...feat(sc.bars, sc.qv, ctx) }; }
    catch (e) { bumpCount(rej, 'data-tidak-valid'); log('scan gagal', s, e.message); return null; }
  };
  // BTC lebih dulu: rezim BTC adalah gerbang semua altcoin. Gagal aman: tanpa BTC valid, tidak ada sinyal.
  const btc = await scan('BTC');
  const ctx = btc ? btcCtx(btc) : null;
  if (!btc) log('PERINGATAN: data BTC tidak valid. Tidak ada sinyal hari ini (gagal aman).');
  const all = btc ? [btc] : [];
  if (btc) {
    const alts = syms.filter(s => s !== 'BTC');
    for (let i = 0; i < alts.length; i += 8) for (const f of await Promise.all(alts.slice(i, i + 8).map(s => scan(s, ctx)))) if (f) all.push(f);
  }
  const cand = [];
  for (const f of all) {
    if (!f.side) { bumpCount(rej, 'tanpa-pemicu'); continue; }
    if (f.ok) cand.push(f); else for (const c of f.rej) bumpCount(rej, c);
  }
  const sel = selectPortfolio(cand, cfg);
  for (const d of sel.dropped) bumpCount(rej, d.why);

  const states = breakerStates(rows, { now, cfg });
  let prev = lastSealed(rows);
  const taken = [];
  for (const f of sel.picked) {
    const arah = f.side === 1 ? 'LONG' : 'SHORT', id = `${today}|${f.s}`;
    if (rows.some(r => r.id === id)) { bumpCount(rej, 'duplikat-aktif'); continue; }
    const blk = activeBlock([...rows, ...newRows], f.s, now, cfg.cooldownDays);
    if (blk) { bumpCount(rej, blk); continue; }
    const row = {
      id, waktu: new Date(now).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', t: now, due: now + cfg.holdDays * DAY, aset: f.s, arah,
      entry: q(f.entry), sl: q(f.sl), tp: q(f.tp), harga_awal: q(f.px), alasan: f.why.join(', ').slice(0, 200),
      trig: f.trig, score: f.score, grade: f.grade, age: f.age, mode: states[arah].state, engine,
    };
    const v = validateSignal(row, { now, maxSlPct: cfg.maxSlPct, minRR: cfg.minRR });
    if (!v.ok) { bumpCount(rej, 'data-tidak-valid'); log('ditolak validator', f.s, v.errors.join('; ')); continue; }
    row.feat = snapshot(f, ctx); row.hasil = 'menunggu';
    prev = sealRow(row, prev); newRows.push(row); taken.push(f);
  }
  const funnel = {
    d: today, mesin: ENGINE_VERSION, dipindai: all.length, kandidat: cand.length, dicatat: newRows.length,
    live: newRows.filter(r => r.mode === 'live').length, shadow: newRows.filter(r => r.mode === 'shadow').length, ditolak: rej,
    btc: btc ? { tr: btc.tr, td: btc.td, tw: btc.tw, ret3d: +(btc.ret3d * 100).toFixed(2), ret7d: +(btc.ret7d * 100).toFixed(2), px: btc.px } : null,
    arah: Object.fromEntries(Object.entries(states).map(([k, v]) => [k, { status: v.state, rataR: v.roll == null ? null : +v.roll.toFixed(3), selesai: v.resolved, jendela: v.window, pemanasan: v.warmup }])),
    detail: newRows.map(r => ({ s: r.aset, arah: r.arah, mode: r.mode, skor: r.score, grade: r.grade, umur: r.age, pemicu: r.trig })),
  };
  return { newRows, funnel };
}

// ---------- penilaian ----------
async function gradeRow(r, client, now) {
  const t0 = Math.floor(r.t / H1) * H1;
  const h = await client.h1(r.aset, t0);
  if (!h.length) return null;
  return gradeTrade(r, { now, h1: async () => h, m1: (a, b) => client.m1(r.aset, a, b) });
}
// Baseline pembanding: MARKET (masuk di open menit pertama setelah sinyal, arah sama) dan MIRROR (arah dibalik), risiko sama, TP 2R.
// Tanpa ini tidak bisa dibedakan edge pemilihan setup dari sekadar beta rezim (temuan utama analisis awal: MIRROR LONG = +0,78R).
async function gradeBase(r, client, now) {
  const s = r.arah === 'LONG' ? 1 : -1, risk = Math.abs(r.entry - r.sl), t0 = Math.floor(r.t / H1) * H1;
  const m0 = (await client.m1(r.aset, r.t, r.t + 12e4))[0]; if (!m0) return;
  const e = m0.o, h = await client.h1(r.aset, t0); if (!h.length) return;
  const src = { now, h1: async () => h, m1: (a, b) => client.m1(r.aset, a, b) };
  const one = d => { const sd = d * s; return gradeTrade({ arah: sd === 1 ? 'LONG' : 'SHORT', entry: e, sl: e - sd * risk, tp: e + sd * 2 * risk, t: r.t, due: r.due }, src); };
  const [a, b] = [await one(1), await one(-1)];
  if (a && b) { r.bm = { e, h: a.hasil, R: +a.R.toFixed(3), tx: a.t }; r.bi = { e, h: b.hasil, R: +b.R.toFixed(3), tx: b.t }; }
}

export async function runGrade({ client, now = Date.now(), rows, log = () => {} }) {
  let graded = 0, base = 0, errors = 0;
  for (const r of rows.filter(r => r.hasil === 'menunggu')) {
    try {
      const g = await gradeRow(r, client, now);
      if (g && g.hasil !== 'tidak valid') { r.hasil = g.hasil; r.R = +g.R.toFixed(3); r.tx = g.t; if (g.batal) r.batal = true; graded++; }
    } catch (e) { errors++; log('nilai gagal', r.id, e.message); }
  }
  for (const r of rows.filter(r => RESOLVED(r.hasil) && !r.bm)) {
    try { await gradeBase(r, client, now); if (r.bm) base++; } catch (e) { errors++; log('baseline gagal', r.id, e.message); }
  }
  return { graded, base, errors };
}
