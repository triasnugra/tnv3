// Pindai pasar, pilih setup, putuskan mode live/shadow per arah, catat ke jurnal berantai hash.
import { makeClient } from '../src/binance.mjs';
import { runScan, runGrade } from '../src/pipeline.mjs';
import { F, readJson, writeJson, currentEngine, ensureProtocol } from '../src/io.mjs';

const client = makeClient(), rows = readJson(F.journal, []), engine = currentEngine(), P = ensureProtocol(engine);
if (P.created) console.log('Protokol forward test DIMULAI', P.mulai, 'mesin', engine);
else if (P.engine !== engine) console.log(`PERINGATAN: hash mesin berubah (${engine}, protokol ${P.engine}). Baris baru dicatat tetapi TIDAK dihitung di analisis. Hapus data/protocol.json untuk memulai protokol baru.`);

// nilai dulu agar status pemutus memakai hasil terbaru
const g = await runGrade({ client, rows, log: (...a) => console.log(...a) });
console.log('dinilai:', g.graded, '| baseline:', g.base);

const { newRows, funnel } = await runScan({ client, rows, engine, log: (...a) => console.log(...a) });
rows.push(...newRows);
const fu = readJson(F.funnel, []);
if (!fu.some(x => x.d === funnel.d)) fu.push(funnel);
writeJson(F.journal, rows, 1); writeJson(F.funnel, fu.slice(-120), 1);
console.log('corong:', JSON.stringify({ dipindai: funnel.dipindai, kandidat: funnel.kandidat, dicatat: funnel.dicatat, live: funnel.live, shadow: funnel.shadow, ditolak: funnel.ditolak }));
console.log('status arah:', JSON.stringify(funnel.arah));
