// Klien data Binance publik (tanpa API key). Antarmuka yang sama dipakai tes lewat klien palsu (tests/fake-client.mjs).
import { NOT } from './config.mjs';
import { mapK } from './trade-sim.mjs';

const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com', 'https://api2.binance.com'];

export function makeClient({ fetchImpl = fetch, hosts = HOSTS, timeoutMs = 15000 } = {}) {
  let hi = 0;
  async function bj(path) {
    let err;
    for (let t = 0; t < hosts.length; t++) {
      const h = hosts[(hi + t) % hosts.length];
      try {
        const r = await fetchImpl(h + '/api/v3/' + path, { signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) throw new Error(h + ' HTTP ' + r.status);
        hi = (hi + t) % hosts.length; return await r.json();
      } catch (e) { err = e; }
    }
    throw err;
  }
  return {
    // koin USDT teratas menurut volume 24 jam; BTC selalu di urutan pertama (gerbang rezim)
    async universe(n) {
      const t = await bj('ticker/24hr');
      const top = t.filter(x => x.symbol.endsWith('USDT') && !NOT.test(x.symbol.slice(0, -4))).sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, n).map(x => x.symbol.slice(0, -4));
      return ['BTC', ...top.filter(s => s !== 'BTC')];
    },
    async daily(s) { return (await bj(`klines?symbol=${s}USDT&interval=1d&limit=1000`)).map(a => ({ t: a[0], o: +a[1], h: +a[2], l: +a[3], c: +a[4], v: +a[5] })); },
    async h1(s, startMs) { return (await bj(`klines?symbol=${s}USDT&interval=1h&startTime=${startMs}&limit=1000`)).map(mapK); },
    async m1(s, a, b) { return (await bj(`klines?symbol=${s}USDT&interval=1m&startTime=${a}&endTime=${b}&limit=1000`)).map(mapK); },
  };
}
