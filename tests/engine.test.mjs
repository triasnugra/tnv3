import test from 'node:test';
import assert from 'node:assert/strict';
import { feat, scanInput, checkBars, selectPortfolio, btcCtx } from '../src/signals.mjs';
import { gradeTrade } from '../src/trade-sim.mjs';
import { sealRow, verifyChain, lastSealed } from '../src/chain.mjs';
import { directionState } from '../src/breaker.mjs';
import { validateSignal, activeBlock } from '../src/guard.mjs';
import { summarize, netR, permP, bh, bootCI, weekKey, rng } from '../src/stats.mjs';
import { CFG } from '../src/config.mjs';
import { mkDaily, k1, HOUR, DAY } from './helpers.mjs';

const NOW = Date.UTC(2026, 10, 20, 3, 0, 0);

test('scanInput memakai HANYA open candle berjalan (tanpa lookahead)', () => {
  const k = mkDaily(1, { now: NOW }), k2 = k.map((x, i) => i === k.length - 1 ? { ...x, h: x.h * 3, l: x.l / 3, c: x.c * 2, v: 9e9 } : x);
  const a = scanInput(k, NOW), b = scanInput(k2, NOW);
  assert.deepEqual(a.bars.at(-1), b.bars.at(-1)); assert.equal(a.bars.at(-1).h, a.bars.at(-1).o); assert.equal(a.qv, b.qv);
});
test('checkBars menolak candle bolong dan harga cacat', () => {
  const k = mkDaily(2, { now: NOW }); assert.ok(checkBars(k));
  const gap = k.slice(); gap.splice(k.length - 10, 1); assert.throws(() => checkBars(gap), /bolong/);
  const bad = k.map(x => ({ ...x })); bad[bad.length - 3].h = bad[bad.length - 3].l - 1; assert.throws(() => checkBars(bad), /tidak konsisten/);
});
test('feat: properti invarian pada 120 pasar sintetis (tidak melempar, sinyal selalu koheren)', () => {
  let ok = 0, sides = 0;
  for (let s = 1; s <= 120; s++) {
    const drift = [-.004, 0, .004][s % 3], k = mkDaily(s, { now: NOW, drift, vol: .02 + (s % 5) * .008 }), sc = scanInput(k, NOW);
    const f = feat(sc.bars, 5e7, undefined); if (f.side) sides++;
    if (!f.ok) continue; ok++;
    const d = f.side;
    assert.ok(d * (f.entry - f.sl) > 0, 'SL harus di sisi rugi'); assert.ok(d * (f.tp - f.entry) > 0, 'TP di sisi untung');
    assert.ok(Math.abs((f.tp - f.entry) / (f.entry - f.sl)) > 1.99 && Math.abs((f.tp - f.entry) / (f.entry - f.sl)) < 2.01, 'RR 2');
    assert.ok(Math.abs(f.entry - f.sl) >= CFG.slAtrMin * f.atr - 1e-9, 'lantai SL 1 ATR');
    assert.ok(f.slp <= 30 && f.type !== 'ditolak');
  }
  assert.ok(sides > 0, 'harus ada setiap pemicu pada sebagian pasar');
  console.log(`  feat: ${sides} pemicu, ${ok} lolos gerbang dari 120 pasar`);
});
test('selectPortfolio membatasi klaster searah', () => {
  const mk = (i, side) => ({ ok: true, side, score: 80 - i, dist: i, s: 'X' + i });
  const c = Array.from({ length: 8 }, (_, i) => mk(i, 1));
  const r = selectPortfolio(c, CFG); assert.equal(r.picked.length, CFG.clusterKeep);
});

// ---- trade-sim ----
const G = (r, cs, now) => gradeTrade({ t: 0, due: 7 * DAY, ...r }, { now: now ?? 8 * DAY, h1: async () => cs });
test('trade-sim: SHORT terisi lalu TP', async () => {
  const r = { arah: 'SHORT', entry: 100, sl: 105, tp: 90 };
  const g = await G(r, [k1(0, 98, 99, 97, 98), k1(HOUR, 98, 101, 97, 100), k1(2 * HOUR, 100, 100, 89, 90)]);
  assert.equal(g.hasil, 'TP'); assert.equal(g.R, 2);
});
test('trade-sim: SL dan TP di candle yang sama tanpa m1 dihitung SL (konservatif)', async () => {
  const r = { arah: 'LONG', entry: 100, sl: 95, tp: 110 };
  const g = await G(r, [k1(HOUR, 101, 102, 99, 101), k1(2 * HOUR, 100, 111, 94, 100)]);
  assert.equal(g.hasil, 'SL'); assert.equal(g.R, -1);
});
test('trade-sim: batal bila TP tersentuh sebelum entry (tidak terisi 0R)', async () => {
  const r = { arah: 'LONG', entry: 100, sl: 95, tp: 110 };
  const g = await G(r, [k1(HOUR, 108, 111, 107, 110)]);
  assert.equal(g.hasil, 'tidak terisi'); assert.equal(g.batal, true); assert.equal(g.R, 0);
});
test('trade-sim: kedaluwarsa dinilai di close terakhir; belum jatuh tempo = null', async () => {
  const r = { arah: 'LONG', entry: 100, sl: 95, tp: 110 }, cs = [k1(HOUR, 101, 103, 99, 102), k1(2 * HOUR, 102, 104, 101, 104)];
  assert.equal(await G(r, cs, 3 * DAY), null);
  const g = await gradeTrade({ t: 0, due: 3 * DAY, ...r }, { now: 4 * DAY, h1: async () => cs });
  assert.equal(g.hasil, 'kedaluwarsa'); assert.ok(Math.abs(g.R - 0.8) < 1e-9);
});
test('trade-sim: tidak terisi sampai due', async () => {
  const g = await gradeTrade({ t: 0, due: 3 * DAY, arah: 'SHORT', entry: 120, sl: 125, tp: 110 }, { now: 4 * DAY, h1: async () => [k1(HOUR, 115, 118, 112, 115)] });
  assert.equal(g.hasil, 'tidak terisi'); assert.ok(!g.batal);
});

// ---- rantai ----
const mkRow = (i, extra = {}) => ({ id: 'd|' + i, t: 1e12 + i, due: 1e12 + i + DAY, aset: 'A' + i, arah: 'SHORT', entry: 10, sl: 11, tp: 8, harga_awal: 10, alasan: 'x', trig: 'mon', score: 70, grade: 'B', age: 1, mode: 'live', engine: 'e', hasil: 'menunggu', ...extra });
test('rantai hash: utuh, deteksi edit isi, hapus tengah; hasil boleh diisi belakangan', () => {
  const rows = []; for (let i = 1; i <= 5; i++) rows.push(sealRow(mkRow(i), lastSealed(rows)));
  assert.ok(verifyChain(rows).ok);
  rows[2].hasil = 'TP'; rows[2].R = 2; assert.ok(verifyChain(rows).ok, 'hasil tidak disegel');
  const e = structuredClone(rows); e[1].tp = 5; assert.ok(!verifyChain(e).ok);
  const d = structuredClone(rows); d.splice(2, 1); assert.ok(!verifyChain(d).ok);
  const m = structuredClone(rows); m[3].mode = 'live'; m[3].mode = 'shadow'; assert.ok(!verifyChain(m).ok, 'mode ikut disegel');
});

// ---- pemutus arah ----
const res = (arah, Rs, t0 = 0) => Rs.map((R, i) => ({ arah, hasil: R > 0 ? 'TP' : R < 0 ? 'SL' : 'kedaluwarsa', R, entry: 100, sl: 95, tx: t0 + i * HOUR, due: t0 + i * HOUR }));
test('pemutus: status awal (LONG shadow, SHORT live) sebelum data cukup', () => {
  assert.equal(directionState([], 'LONG').state, 'shadow'); assert.equal(directionState([], 'SHORT').state, 'live');
  assert.equal(directionState(res('LONG', [2, 2, 2]), 'LONG').state, 'shadow', 'belum minResolved');
});
test('pemutus: LONG shadow -> live saat rata-rata R bersih > 0,10; kembali shadow bila <= 0; SHORT live -> shadow', () => {
  const up = res('LONG', Array(12).fill(0).map((_, i) => i % 2 ? -1 : 2)); // rata-rata ~ +0,5
  assert.equal(directionState(up, 'LONG').state, 'live');
  const turun = [...up, ...res('LONG', Array(20).fill(-1), 1e6)];
  assert.equal(directionState(turun, 'LONG').state, 'shadow');
  assert.equal(directionState(res('SHORT', Array(12).fill(-1)), 'SHORT').state, 'shadow');
});
test('pemutus: kausal, hanya memakai trade yang sudah keluar sebelum now', () => {
  const rows = res('SHORT', Array(12).fill(-1), 1000);
  assert.equal(directionState(rows, 'SHORT', { now: 1000 + 5 * HOUR }).state, 'live');
  assert.equal(directionState(rows, 'SHORT', { now: 1000 + 12 * HOUR }).state, 'shadow');
});

// ---- guard ----
test('validateSignal dan activeBlock', () => {
  const ok = { aset: 'BTC', arah: 'LONG', entry: 100, sl: 96, tp: 108, harga_awal: 101, t: NOW, due: NOW + DAY };
  assert.ok(validateSignal(ok, { now: NOW }).ok);
  assert.ok(!validateSignal({ ...ok, sl: 104 }, { now: NOW }).ok); assert.ok(!validateSignal({ ...ok, aset: '' }, { now: NOW }).ok);
  assert.ok(!validateSignal({ ...ok, sl: 80, tp: 140 }, { now: NOW }).ok, 'SL > 15%');
  assert.equal(activeBlock([{ aset: 'BTC', hasil: 'menunggu' }], 'BTC', NOW), 'duplikat-aktif');
  assert.equal(activeBlock([{ aset: 'BTC', hasil: 'SL', tx: NOW - DAY }], 'BTC', NOW), 'cooldown-sl');
  assert.equal(activeBlock([{ aset: 'BTC', hasil: 'SL', tx: NOW - 5 * DAY }], 'BTC', NOW), null);
});

// ---- statistik ----
test('statistik: netR, summarize, BH, permutasi, bootstrap', () => {
  const rows = [{ hasil: 'TP', R: 2, entry: 100, sl: 95, t: NOW, tx: NOW }, { hasil: 'SL', R: -1, entry: 100, sl: 95, t: NOW + DAY, tx: NOW + DAY }, { hasil: 'tidak terisi', R: 0, entry: 100, sl: 95, t: NOW }];
  const c = 0.15 / 5; assert.ok(Math.abs(netR(rows[0]) - (2 - c)) < 1e-9); assert.equal(netR(rows[2]), 0);
  const s = summarize(rows); assert.equal(s.terisi, 2); assert.equal(s.win, .5); assert.ok(Math.abs(s.PF - (2 - c) / (1 + c)) < 1e-9);
  const q = bh([.001, .02, .5]); assert.ok(q[0] <= q[1] && q[1] <= q[2] + 1e-12 && q[0] < .01);
  const x = Array.from({ length: 60 }, (_, i) => i < 30 ? 5 + (i % 3) : (i % 3)), y = x.map((_, i) => i < 30 ? 1 : 0);
  assert.ok(permP(x, y) < .01);
  assert.ok(permP(Array.from({ length: 60 }, (_, i) => i % 7), Array.from({ length: 60 }, (_, i) => i % 2)) > .05);
  const ci = bootCI([1, 2, 3, 4, 5, 6, 7, 8], ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd']); assert.ok(ci.lo < 4.5 && ci.hi > 4.5);
  assert.equal(weekKey(Date.UTC(2026, 10, 25)), '2026-11-23'); assert.equal(weekKey(Date.UTC(2026, 10, 23)), '2026-11-23'); assert.equal(weekKey(Date.UTC(2026, 10, 22)), '2026-11-16');
});
