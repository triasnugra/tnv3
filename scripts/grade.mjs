// Menilai order yang masih 'menunggu' dan baseline MARKET/MIRROR. Aman dijalankan berkali-kali sehari.
import { makeClient } from '../src/binance.mjs';
import { runGrade } from '../src/pipeline.mjs';
import { F, readJson, writeJson } from '../src/io.mjs';

const rows = readJson(F.journal, []);
const r = await runGrade({ client: makeClient(), rows, log: (...a) => console.log(...a) });
writeJson(F.journal, rows, 1);
console.log('dinilai:', r.graded, '| baseline:', r.base, '| galat:', r.errors, '| baris:', rows.length);
