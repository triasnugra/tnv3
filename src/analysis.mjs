// Analisis forward test: ringkasan per mode/arah/pemicu/grade/rezim, perbandingan dengan baseline MARKET & MIRROR,
// saringan fitur dengan koreksi uji berganda (uji permutasi + Benjamini-Hochberg) dan konfirmasi di paruh data yang lebih baru,
// serta putusan terhadap kriteria "uang nyata" yang dikunci di config.mjs. Tidak ada parameter yang diubah otomatis.
import { CFG } from './config.mjs';
import { FILLED, RESOLVED, summarize, ciOfRows, bootCI, netR, costPct, weekKey, permP, bh, mean } from './stats.mjs';

const r3 = v => (v == null || !Number.isFinite(v)) ? null : +v.toFixed(3);
const clean = s => {
  const o = {}; for (const [k, v] of Object.entries(s)) o[k] = typeof v === 'number' ? (Number.isFinite(v) ? r3(v) : (v === Infinity ? 'inf' : null)) : v; return o;
};
const block = rs => { const s = summarize(rs), ci = ciOfRows(rs); return { ...clean(s), ci95: ci ? [r3(ci.lo), r3(ci.hi)] : null, mingguCI: ci ? ci.clusters : 0 }; };

function baselineNet(r, b) {
  if (!b) return null;
  const sl = Math.abs(r.entry - r.sl) / b.e * 100;
  return FILLED(b.h) ? b.R - costPct() / sl : 0;
}

export function baselines(rows) {
  const out = {};
  for (const arah of ['LONG', 'SHORT']) {
    const x = rows.filter(r => r.arah === arah && RESOLVED(r.hasil) && r.bm && r.bi);
    if (x.length < 5) { out[arah] = { n: x.length }; continue; }
    const eng = x.map(r => netR(r)), mk = x.map(r => baselineNet(r, r.bm)), mi = x.map(r => baselineNet(r, r.bi)), wk = x.map(r => weekKey(r.t));
    const dMk = eng.map((v, i) => v - mk[i]), dMi = eng.map((v, i) => v - mi[i]);
    const ci = d => { const c = bootCI(d, wk); return c ? [r3(c.lo), r3(c.hi)] : null; };
    out[arah] = { n: x.length, mesin: r3(mean(eng)), market: r3(mean(mk)), mirror: r3(mean(mi)), mesinMinusMarket: r3(mean(dMk)), ciMarket: ci(dMk), mesinMinusMirror: r3(mean(dMi)), ciMirror: ci(dMi) };
  }
  return out;
}

const NUM = ['slPct', 'tpPct', 'slAtr', 'atrPct', 'reach7', 'distR', 'distPct', 'tgtR', 'ret1d', 'ret3d', 'ret7d', 'ret30', 'rsi', 'e20d', 'e50d', 'pos', 'qvM', 'btcRet3d', 'btcRet7d', 'age', 'score', 'dow'];
const BIN = {
  searahTren: r => /searah tren/.test(r.alasan || ''), melawanTren: r => r.feat?.ct === 1,
  pemicuMonday: r => r.trig === 'mon', pemicuDev: r => r.trig === 'dev', pemicuBreakout: r => r.trig === 'bo', pemicuDD: r => r.trig === 'dd', pemicuZona: r => r.trig === 'zone',
  pemicuWolf: r => r.trig === 'wolf', pemicuFib: r => r.trig === 'fib', gradeA: r => r.grade === 'A', btcSearah: r => r.feat?.btcTd === (r.arah === 'LONG' ? 1 : -1),
};

// Saringan fitur per arah pada trade TP/SL terisi, dengan holdout kronologis: penemuan di 60% data awal (permutasi + BH q<0,10),
// lalu VALIDASI di 40% data terbaru (arah efek sama dan p<0,05). Hanya yang tervalidasi masuk `lolos`.
// Mengembalikan semua uji penemuan, bukan hanya yang "menarik".
export function screen(rows, cfg = CFG) {
  const out = {};
  for (const arah of ['LONG', 'SHORT']) {
    const z = rows.filter(r => r.arah === arah && (r.hasil === 'TP' || r.hasil === 'SL') && r.feat).sort((a, b) => a.t - b.t);
    if (z.length < cfg.screenMinN) { out[arah] = { n: z.length, uji: [], lolos: [], kandidat: [], catatan: `butuh >= ${cfg.screenMinN} trade TP/SL terisi (ada ${z.length})` }; continue; }
    const cut = Math.floor(z.length * 0.6), disc = z.slice(0, cut), val = z.slice(cut);
    const get = (r, k) => BIN[k] ? (BIN[k](r) ? 1 : 0) : (k === 'age' || k === 'score' ? r[k] : r.feat[k]);
    const names = [...NUM, ...Object.keys(BIN)], tests = [];
    const col = (set, k) => { const x = [], y = []; for (const r of set) { const v = get(r, k); if (v != null && Number.isFinite(+v)) { x.push(+v); y.push(r.hasil === 'TP' ? 1 : 0); } } return { x, y }; };
    for (const k of names) {
      const { x, y } = col(disc, k); if (x.length < 20) continue;
      const p = permP(x, y); if (p == null) continue;
      tests.push({ nama: k, tipe: BIN[k] ? 'biner' : 'kontinu', n: x.length, p, selisih: mean(x.filter((_, i) => y[i])) - mean(x.filter((_, i) => !y[i])) });
    }
    const q = bh(tests.map(t => t.p)); tests.forEach((t, i) => { t.q = q[i]; });
    for (const t of tests.filter(t => t.q < 0.10)) {
      const { x, y } = col(val, t.nama), p = x.length >= 12 ? permP(x, y, { seed: 11 }) : null;
      const d = x.length ? mean(x.filter((_, i) => y[i])) - mean(x.filter((_, i) => !y[i])) : NaN;
      t.validasiP = p; t.validasi = p != null && Math.sign(d) === Math.sign(t.selisih) && p < 0.05;
    }
    tests.sort((a, b) => a.p - b.p);
    out[arah] = {
      n: z.length, nPenemuan: disc.length, nValidasi: val.length, jumlahUji: tests.length,
      uji: tests.slice(0, 12).map(t => ({ ...t, p: r3(t.p), q: r3(t.q), selisih: r3(t.selisih), validasiP: r3(t.validasiP) })),
      kandidat: tests.filter(t => t.q < 0.10).map(t => t.nama), lolos: tests.filter(t => t.validasi).map(t => ({ nama: t.nama, q: r3(t.q), validasiP: r3(t.validasiP) })),
    };
  }
  return out;
}

export function verdict(rows, cfg = CFG) {
  const g = cfg.gate, live = rows.filter(r => r.mode === 'live' && RESOLVED(r.hasil)), s = summarize(live), ci = ciOfRows(live), b = baselines(live);
  const ready = s.terisi >= g.minFilled && s.minggu >= g.minWeeks;
  const prog = { terisi: s.terisi, perlu: g.minFilled, minggu: s.minggu, perluMinggu: g.minWeeks };
  if (!ready) return { status: 'BELUM SAH', alasan: [`Kemajuan ${s.terisi}/${g.minFilled} trade terisi, ${s.minggu}/${g.minWeeks} minggu. Angka sebelum syarat terpenuhi hanya kemajuan, bukan bukti.`], prog };
  const fail = [];
  if (!(ci && ci.lo > 0)) fail.push(`batas bawah CI 95% expectancy ${ci ? ci.lo.toFixed(3) : 'n/a'} tidak > 0`);
  if (!(s.PF >= g.minPF)) fail.push(`PF ${s.PF == null ? 'n/a' : s.PF.toFixed(2)} < ${g.minPF}`);
  if (!(s.maxDD <= g.maxDD)) fail.push(`MaxDD ${s.maxDD.toFixed(1)}R > ${g.maxDD}R`);
  for (const a of ['LONG', 'SHORT']) { const x = b[a]; if (x && x.n >= 20 && x.ciMirror && !(x.ciMirror[0] > 0) && live.filter(r => r.arah === a).length >= 20) fail.push(`${a}: belum mengalahkan MIRROR (CI selisih ${x.ciMirror})`); }
  return { status: fail.length ? 'GAGAL' : 'LULUS', alasan: fail.length ? fail : ['Semua kriteria terpenuhi. Mulai dengan risiko kecil; evaluasi ulang tiap minggu.'], prog };
}

export function analyze(rows, { cfg = CFG, now = Date.now() } = {}) {
  const res = rows.filter(r => RESOLVED(r.hasil)), by = (f, list = res) => Object.fromEntries([...new Set(list.map(f))].filter(k => k != null).sort().map(k => [k, block(list.filter(r => f(r) === k))]));
  const wk = {};
  for (const r of res.filter(r => FILLED(r.hasil))) { const k = weekKey(r.t) + '|' + r.arah; (wk[k] ||= []).push(netR(r)); }
  const mingguan = Object.entries(wk).sort().map(([k, v]) => { const [w, a] = k.split('|'); return { minggu: w, arah: a, n: v.length, E: r3(mean(v)), total: r3(v.reduce((s, x) => s + x, 0)) }; });
  return {
    dibuat: new Date(now).toISOString(), mesin: rows.at(-1)?.engine ?? null, totalBaris: rows.length, menunggu: rows.filter(r => r.hasil === 'menunggu').length,
    putusan: verdict(rows, cfg),
    semua: block(res), live: block(res.filter(r => r.mode === 'live')), shadow: block(res.filter(r => r.mode === 'shadow')),
    perArahMode: Object.fromEntries(['LONG', 'SHORT'].flatMap(a => ['live', 'shadow'].map(m => [`${a}/${m}`, block(res.filter(r => r.arah === a && r.mode === m))]))),
    perPemicu: by(r => r.trig), perGrade: by(r => r.grade), perRezimBTC: by(r => r.feat ? `${r.arah}|BTC ${r.feat.btcTd === 1 ? 'naik' : r.feat.btcTd === -1 ? 'turun' : 'netral'}` : null),
    baseline: baselines(res), saringanFitur: screen(res, cfg), mingguan,
    auditPemutus: { catatan: 'Shadow = sinyal yang dicatat tetapi tidak boleh dieksekusi karena arahnya diblokir pemutus. Bila shadow rugi, pemutus menyelamatkan modal; bila shadow untung, pemutus melewatkan peluang.',
      LONG: { live: block(res.filter(r => r.arah === 'LONG' && r.mode === 'live')), shadow: block(res.filter(r => r.arah === 'LONG' && r.mode === 'shadow')) },
      SHORT: { live: block(res.filter(r => r.arah === 'SHORT' && r.mode === 'live')), shadow: block(res.filter(r => r.arah === 'SHORT' && r.mode === 'shadow')) } },
  };
}

const pc = v => v == null ? 'n/a' : (v * 100).toFixed(1) + '%', f2 = v => v == null || typeof v === 'string' ? (v ?? 'n/a') : v.toFixed(2);
export function toMarkdown(a) {
  const L = [`# Laporan forward test mesin ${a.mesin ?? '-'}`, '', `Dibuat ${a.dibuat}. Baris ${a.totalBaris}, menunggu ${a.menunggu}.`, '',
    `## Putusan: ${a.putusan.status}`, ...a.putusan.alasan.map(x => '- ' + x), '',
    '## Ringkasan', '', '| Set | Selesai | Terisi | TP | SL | Kedaluwarsa | Win% | E bersih (R) | CI 95% | PF | MaxDD (R) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  const row = (n, b) => `| ${n} | ${b.sinyal} | ${b.terisi} | ${b.TP} | ${b.SL} | ${b.kedaluwarsa} | ${pc(b.win)} | ${f2(b.expectancy)} | ${b.ci95 ? b.ci95.join(' s/d ') : 'n/a'} | ${f2(b.PF)} | ${f2(b.maxDD)} |`;
  L.push(row('Semua', a.semua), row('Live', a.live), row('Shadow', a.shadow));
  for (const [k, b] of Object.entries(a.perArahMode)) L.push(row(k, b));
  L.push('', '## Baseline (R bersih per sinyal)', '', '| Arah | n | Mesin | MARKET | MIRROR | Mesin - MIRROR (CI) |', '| --- | --- | --- | --- | --- | --- |');
  for (const [k, b] of Object.entries(a.baseline)) L.push(`| ${k} | ${b.n} | ${f2(b.mesin)} | ${f2(b.market)} | ${f2(b.mirror)} | ${f2(b.mesinMinusMirror)} ${b.ciMirror ? '(' + b.ciMirror.join(' s/d ') + ')' : ''} |`);
  L.push('', '## Saringan fitur (penemuan 60% awal, validasi 40% terbaru)', '');
  for (const [k, s] of Object.entries(a.saringanFitur)) L.push(`- **${k}** (n=${s.n}): ${s.catatan ?? `${s.jumlahUji} uji, kandidat penemuan ${s.kandidat.length ? s.kandidat.join(', ') : 'tidak ada'}; tervalidasi di data terbaru: ${s.lolos.length ? s.lolos.map(x => `${x.nama} (q=${x.q}, p validasi=${x.validasiP})`).join(', ') : 'tidak ada'}`}`);
  L.push('', '## Per minggu', '', '| Minggu | Arah | n | E (R) | Total (R) |', '| --- | --- | --- | --- | --- |', ...a.mingguan.map(m => `| ${m.minggu} | ${m.arah} | ${m.n} | ${f2(m.E)} | ${f2(m.total)} |`));
  return L.join('\n') + '\n';
}
