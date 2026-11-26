// Verifikasi rantai, analisis, tulis data/analysis.{json,md} dan data/state.json untuk dasbor.
import fs from 'node:fs';
import { analyze, toMarkdown } from '../src/analysis.mjs';
import { verifyChain } from '../src/chain.mjs';
import { breakerStates } from '../src/breaker.mjs';
import { F, readJson, writeJson } from '../src/io.mjs';

const rows = readJson(F.journal, []), P = readJson(F.protocol, null), funnel = readJson(F.funnel, []);
const chain = verifyChain(rows);
const counted = rows.filter(r => !P || r.engine === P.engine);
const a = analyze(counted);
const st = breakerStates(counted);
const state = {
  updated: new Date().toISOString(), chain: { ok: chain.ok, n: chain.n, head: chain.head, errors: chain.errors.slice(0, 5) },
  protokol: P ? { mulai: P.mulai, engine: P.engine } : null, dihitung: counted.length, tidakDihitung: rows.length - counted.length,
  arah: Object.fromEntries(Object.entries(st).map(([k, v]) => [k, { status: v.state, rataR: v.roll == null ? null : +v.roll.toFixed(3), selesai: v.resolved, jendela: v.window, pemanasan: v.warmup }])),
  btc: funnel.at(-1)?.btc ?? null, putusan: a.putusan,
};
writeJson(F.analysis, a, 1); writeJson(F.state, state, 1); fs.writeFileSync(F.analysisMd, toMarkdown(a));
console.log('putusan:', a.putusan.status, '| rantai:', chain.ok ? 'utuh' : 'RUSAK ' + chain.errors[0], '| ujung:', chain.head);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Stempel rantai\nBaris: ${chain.n}\nHash ujung: \`${chain.head}\`\nPutusan: **${a.putusan.status}**\n`);
if (!chain.ok) { console.error('RANTAI JURNAL RUSAK:', chain.errors.join(' | ')); process.exitCode = 1; }
