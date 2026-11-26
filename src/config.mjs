// Semua ambang ada di sini, bukan tersebar di kode, supaya bisa diaudit dan diuji.
// Mengubah file ini mengubah hash mesin (lihat scripts/scan.mjs) dan memulai protokol forward baru.
export const ENGINE_VERSION = '3.0';

export const CFG = {
  // ---- semesta & data ----
  universeTop: 60,      // koin USDT teratas menurut volume 24 jam (BTC selalu ikut sebagai gerbang rezim)
  minQv: 2e7,           // volume dolar harian kemarin minimum (hasil analisis: di bawah ini slippage/OBV tak bisa dipercaya)
  holdDays: 7,          // masa berlaku order limit & masa tahan posisi
  // ---- gerbang kualitas v2 (dipertahankan; terbukti menghilangkan setup basi/"EXPIRED noise") ----
  slAtrMin: 1,          // SL minimal 1x ATR(14) harian
  maxAge: 3,            // umur maksimum candle pemicu (hari)
  maxAgeBreakout: 5,
  maxDistR: .75,        // harga harus dalam 0.75R dari entry limit
  maxDistPct: 5,        // dan tidak lebih jauh dari 5% harga
  minTargetR: 1,        // ruang menuju sisi seberang range minimal 1R
  btcKnife: .05,        // BTC bergerak >5%/3 hari melawan arah: jangan menangkap pisau jatuh
  // Skor 0-100 hanya DICATAT (grade A/B/C), tidak lagi menyaring: analisis 307 trade tidak menemukan bukti bahwa
  // skor/pemicu membedakan TP dari SL (0 dari 35 uji lolos koreksi uji berganda). Naikkan hanya bila forward test membuktikan.
  minScore: 0,
  gradeA: 75,
  // ---- portofolio ----
  perSide: 3,           // maks sinyal baru per arah per hari
  maxTotal: 5,          // maks sinyal baru per hari
  clusterN: 6,          // >= N kandidat searah = SATU taruhan pasar, bukan N peluang
  clusterKeep: 2,
  cooldownDays: 3,      // jeda koin yang sama setelah SL
  maxSlPct: 15,
  minRR: 1.5,
  // ---- biaya (sama dengan protokol forward test sebelumnya) ----
  cost: { feePct: 0.05, slipPct: 0.05 },   // per sisi; slippage sekali
  // ---- pemutus arah adaptif (TEMUAN UTAMA analisis) ----
  // LONG: E -0,56R (n=104, CI 95% -0,62..-0,46) di rezim turun; SHORT: +0,64R. Satu arah tidak boleh terus dibuka
  // hanya karena sinyalnya muncul. Setiap arah punya status live/shadow yang dihitung dari R bersih N trade TERISI
  // terakhir yang sudah SELESAI (baik live maupun shadow, sehingga arah yang diblokir bisa pulih).
  breaker: {
    window: 20,
    minResolved: 10,          // sebelum ini status awal (start) berlaku
    enableAbove: 0.10,        // shadow -> live bila rata-rata R bersih > ini
    disableAtOrBelow: 0,      // live -> shadow bila rata-rata R bersih <= ini
    start: { LONG: 'shadow', SHORT: 'live' },   // prior dari riwayat v1; terbukti salah => breaker akan membalik sendiri
  },
  // ---- kriteria "uang nyata" (tetap, tidak boleh diubah setelah forward test mulai) ----
  gate: { minFilled: 150, minWeeks: 20, minPF: 1.2, maxDD: 15 },
  riskPctTest: 0.25,        // % ekuitas per trade selama mode uji
  riskPctPass: 1,
  // ---- analisis ----
  screenMinN: 60,           // minimal trade TP/SL terisi per arah agar fitur diuji (60% penemuan, 40% validasi)
  bootB: 4000,
};

export const NOT = /^(USDC|FDUSD|TUSD|USDP|DAI|BUSD|EUR|AEUR|USD1|XUSD|PAXG|USDE|PYUSD|U|USDS|USDD|RLUSD|BFUSD|USDG)$/;

export const REJ_TEXT = {
 'tanpa-pemicu':'tidak ada pemicu','sl-lebar':'SL melebihi batas','usang-umur':'pemicu sudah terlalu lama','usang-tp-tercapai':'harga sudah mencapai TP sejak pemicu',
 'usang-sl-tertembus':'SL sudah tertembus sejak pemicu','usang-sudah-berjalan':'entry sudah tersentuh dan harga sudah berjalan 1R','jauh-dari-entry':'harga terlalu jauh dari entry',
 'melawan-btc':'melawan tren BTC (weekly dan daily)','btc-momentum-lawan':'BTC bergerak tajam melawan arah setup','likuiditas-rendah':'likuiditas terlalu rendah',
 'ruang-target-sempit':'ruang menuju target range sempit','skor-rendah':'skor kualitas di bawah minimum','data-tidak-valid':'data kline tidak valid',
 'duplikat-aktif':'setup yang sama masih aktif','cooldown-sl':'koin baru kena SL (jeda)','klaster-pasar':'klaster searah, hanya terbaik yang diambil','batas-portofolio':'melewati batas sinyal per hari',
 'shadow-arah':'arah sedang diblokir pemutus (dicatat sebagai shadow)'};
