import fs from 'node:fs';
import path from 'node:path';
import { engineHash } from './chain.mjs';
import { CFG, ENGINE_VERSION } from './config.mjs';

export const F = { journal: 'data/journal.json', funnel: 'data/funnel.json', protocol: 'data/protocol.json', analysis: 'data/analysis.json', analysisMd: 'data/analysis.md', state: 'data/state.json' };
export const readJson = (f, d) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d;
export const writeJson = (f, v, ind = 0) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, ind || undefined)); };
const rd = rel => fs.readFileSync(new URL('../src/' + rel, import.meta.url), 'utf8');

// Hash mesin = isi aturan (signals), ambang (config), dan penilaian (trade-sim). Mengubah salah satunya = mesin baru.
export const currentEngine = () => engineHash(rd('signals.mjs'), rd('config.mjs'), rd('trade-sim.mjs'));

// Protokol forward test dikunci pada hash mesin pertama. Baris dengan hash lain dicatat tetapi TIDAK dihitung di analisis.
export function ensureProtocol(engine, now = Date.now()) {
  const p = readJson(F.protocol, null);
  if (p) return { ...p, created: false };
  const n = {
    versi: 1, versiMesin: ENGINE_VERSION, engine, mulai: new Date(now).toISOString(), gate: CFG.gate, breaker: CFG.breaker,
    aturan: ['Jangan ubah signals.mjs/config.mjs/trade-sim.mjs: hash berubah, baris baru tidak dihitung. Untuk mesin baru hapus data/protocol.json.',
      'Jangan ubah kriteria lulus setelah dimulai.', 'Jangan edit/hapus baris jurnal: rantai hash menandainya.', 'Jangan menilai hasil sebelum syarat sampel terpenuhi.'],
  };
  writeJson(F.protocol, n, 1);
  return { ...n, created: true };
}
