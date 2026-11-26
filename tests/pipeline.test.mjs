import test from 'node:test';
import assert from 'node:assert/strict';
import { runScan, runGrade } from '../src/pipeline.mjs';
import { verifyChain } from '../src/chain.mjs';
import { analyze, toMarkdown, screen, verdict } from '../src/analysis.mjs';
import { rng, RESOLVED } from '../src/stats.mjs';
import { CFG } from '../src/config.mjs';
import { mkDaily, fakeClient, k1, HOUR, DAY } from './helpers.mjs';

const NOW = Date.UTC(2026, 10, 20, 3, 0, 0);
const syms = ['BTC', ...Array.from({ length: 59 }, (_, i) => 'C' + String(i).padStart(2, '0'))];
const mkClient = extra => fakeClient({ now: NOW, syms, daily: s => mkDaily([...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7), { now: NOW, drift: [-.004, 0, .004][s.length % 3 + (s.charCodeAt(2) || 0) % 3 - s.length % 3], vol: .03 }), ...extra });

test('runScan: baris tersegel, mode sesuai pemutus, tanpa duplikat pada scan kedua', async () => {
  const client = mkClient(), rows = [];
  const { newRows, funnel } = await runScan({ client, now: NOW, rows, engine: 'testhash' });
  assert.ok(newRows.length > 0, 'pasar sintetis harus menghasilkan minimal satu sinyal; funnel=' + JSON.stringify(funnel.ditolak));
  rows.push(...newRows);
  assert.ok(verifyChain(rows).ok);
  for (const r of newRows) {
    assert.equal(r.mode, r.arah === 'LONG' ? 'shadow' : 'live', 'status awal: LONG shadow, SHORT live');
    assert.equal(r.hasil, 'menunggu'); assert.ok(r.feat && Number.isFinite(r.feat.atrPct)); assert.equal(r.engine, 'testhash');
  }
  assert.ok(newRows.length <= CFG.maxTotal);
  assert.equal(funnel.dicatat, newRows.length); assert.equal(funnel.live + funnel.shadow, newRows.length);
  const again = await runScan({ client, now: NOW + 3600e3, rows, engine: 'testhash' });
  assert.equal(again.newRows.length, 0, 'hari yang sama / order aktif tidak boleh terulang');
});

test('runScan: gagal aman bila data BTC rusak (tanpa sinyal)', async () => {
  const bad = mkClient({ daily: async s => { if (s === 'BTC') throw new Error('HTTP 451'); return mkDaily(3, { now: NOW }); } });
  const r = await runScan({ client: bad, now: NOW, rows: [], engine: 'x' });
  assert.equal(r.newRows.length, 0); assert.equal(r.funnel.btc, null); assert.ok(r.funnel.ditolak['data-tidak-valid'] >= 1);
});

test('runScan: kandidat gagal data tidak menjatuhkan seluruh scan', async () => {
  const c = mkClient({ daily: async s => { if (s === 'C03') return mkDaily(5, { now: NOW }).slice(-50); return mkDaily([...s].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7), { now: NOW, drift: -.002 }); } });
  const r = await runScan({ client: c, now: NOW, rows: [], engine: 'x' });
  assert.ok(r.funnel.ditolak['data-tidak-valid'] >= 1); assert.ok(r.funnel.dipindai >= 50);
});

test('runGrade: terisi lalu TP; baseline MARKET/MIRROR terisi; hasil tidak mengubah segel', async () => {
  const rows = []; const { newRows } = await runScan({ client: mkClient(), now: NOW, rows, engine: 'e' }); rows.push(...newRows);
  const by = Object.fromEntries(rows.map(r => [r.aset, r]));
  const h1 = async (s, t0) => { const r = by[s], L = r.arah === 'LONG', px = r.harga_awal;
    return [k1(t0, px, px * 1.0005, px * .9995, px), k1(t0 + HOUR, px, L ? px : r.entry, L ? r.entry : px, r.entry), k1(t0 + 2 * HOUR, r.entry, L ? r.tp * 1.01 : r.entry, L ? r.entry : r.tp * .99, r.tp)]; };
  const m1 = async (s, a) => { const px = by[s].harga_awal; return [k1(a, px, px, px, px, 6e4)]; };
  const res = await runGrade({ client: fakeClient({ now: NOW, syms, h1, m1 }), now: NOW + 8 * DAY, rows });
  assert.equal(res.errors, 0); assert.equal(res.graded, rows.length);
  for (const r of rows) { assert.equal(r.hasil, 'TP'); assert.ok(Math.abs(r.R - 2) < .01); assert.ok(r.bm && r.bi, 'baseline'); }
  assert.ok(verifyChain(rows).ok, 'mengisi hasil tidak boleh merusak rantai');
  const a = analyze(rows, { now: NOW }); assert.equal(a.semua.TP, rows.length); assert.equal(a.putusan.status, 'BELUM SAH');
  assert.ok(toMarkdown(a).includes('BELUM SAH'));
});

test('runGrade: order belum jatuh tempo tetap menunggu; kegagalan jaringan dihitung sebagai galat, bukan hasil', async () => {
  const rows = []; const { newRows } = await runScan({ client: mkClient(), now: NOW, rows, engine: 'e' }); rows.push(...newRows);
  const r1 = await runGrade({ client: fakeClient({ now: NOW, syms, h1: async () => [] }), now: NOW + DAY, rows });
  assert.equal(r1.graded, 0); assert.ok(rows.every(r => r.hasil === 'menunggu'));
  const r2 = await runGrade({ client: fakeClient({ now: NOW, syms, h1: async () => { throw new Error('HTTP 429'); } }), now: NOW + DAY, rows });
  assert.equal(r2.errors, rows.length); assert.ok(rows.every(r => r.hasil === 'menunggu'));
});

// ---- analisis ----
function synth(n, seed, edge) {
  const r = rng(seed), rows = [];
  for (let i = 0; i < n; i++) {
    const arah = i % 2 ? 'LONG' : 'SHORT', distR = r() * 3, p = edge && arah === 'LONG' ? Math.min(.9, .1 + distR * .25) : .35, tp = r() < p;
    const entry = 100, sl = arah === 'LONG' ? 96 : 104, t = Date.UTC(2026, 9, 1) + i * 6 * HOUR * 1.7;
    rows.push({ id: 'd' + i, t, due: t + 7 * DAY, tx: t + DAY, aset: 'X' + i, arah, entry, sl, tp: arah === 'LONG' ? 108 : 92, harga_awal: 100, alasan: r() < .5 ? 'searah tren' : '', trig: ['mon', 'dev', 'bo'][i % 3], grade: r() < .3 ? 'A' : 'B', score: 50 + r() * 40, age: i % 3, mode: 'live', engine: 'e',
      hasil: tp ? 'TP' : 'SL', R: tp ? 2 : -1, feat: { slPct: 4, tpPct: 8, slAtr: 1 + r(), atrPct: 2 + r(), reach7: r(), distR, distPct: distR * 4, tgtR: 2 + r(), ret1d: r() * 4 - 2, ret3d: r() * 8 - 4, ret7d: r() * 10 - 5, ret30: r() * 30 - 15, rsi: 30 + r() * 40, e20d: r() * 6 - 3, e50d: r() * 10 - 5, pos: r(), qvM: 20 + r() * 100, btcRet3d: r() * 6 - 3, btcRet7d: r() * 8 - 4, ct: r() < .3 ? 1 : 0, btcTd: [-1, 0, 1][i % 3], tr: 1, td: 1, tw: 1, btcTr: 1, dow: i % 7 } });
  }
  return rows;
}
test('saringan fitur: tidak ada temuan palsu pada data acak, dan menangkap efek nyata', () => {
  const noise = screen(synth(400, 1, false)); assert.equal(noise.LONG.lolos.length + noise.SHORT.lolos.length, 0, JSON.stringify(noise.LONG.uji.slice(0, 3)));
  const real = screen(synth(400, 2, true));
  const hit = real.LONG.lolos.find(x => x.nama === 'distR'); assert.ok(hit, 'harus menemukan distR dan lolos validasi');
  assert.equal(real.SHORT.lolos.length, 0);
});
test('saringan fitur menolak menguji bila sampel kecil', () => { const s = screen(synth(20, 3, false)); assert.equal(s.LONG.uji.length, 0); assert.ok(s.LONG.catatan); });
test('putusan: BELUM SAH sampai 150 trade dan 20 minggu; GAGAL bila expectancy tidak positif', () => {
  const few = synth(100, 4, false); assert.equal(verdict(few).status, 'BELUM SAH');
  const many = synth(900, 5, false).map((r, i) => ({ ...r, t: Date.UTC(2026, 0, 1) + i * 8 * HOUR }));
  const v = verdict(many); assert.ok(['GAGAL', 'LULUS'].includes(v.status)); assert.equal(v.status, 'GAGAL', v.alasan.join('|'));
});
