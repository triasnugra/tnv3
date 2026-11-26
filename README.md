# Mesin v3 — analisis crypto dengan forward test jujur

Node 20+, **tanpa dependensi**, berjalan penuh di GitHub Actions dan terbit di GitHub Pages.
Dibangun dari analisis jurnal tn, tnv2, tnv2c2 (307 trade setelah deduplikasi, 4 Okt–25 Nov 2026).

> **Mesin ini bukan alat sinyal untuk uang nyata.** Ia berjalan dalam *mode uji* sampai forward test membuktikan
> expectancy positif (≥150 trade terisi, ≥20 minggu, batas bawah CI 95% > 0, PF ≥ 1,2, MaxDD ≤ 15R, mengalahkan MIRROR).
> Bukan nasihat keuangan.

## Pasang (5 menit)

1. Buat repo GitHub baru, unggah **seluruh isi folder ini** (termasuk `.github/`).
2. **Settings → Actions → General → Workflow permissions → Read and write permissions** → Save.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Actions → "Scan, nilai dan publikasi" → Run workflow** (mode `scan`).
5. Setelah hijau, dasbor ada di `https://<user>.github.io/<repo>/`.

Jadwal otomatis: scan harian 01:20 UTC (setelah candle harian tutup) dan penilaian 3× sehari. Workflow `Tes` jalan di setiap push;
workflow scan **berhenti bila tes gagal**.

## Apa yang dipertahankan dari mesin lama (terbukti berguna)

| Dipertahankan | Alasan dari data |
| --- | --- |
| Deteksi setup v2.0 (Monday High/Low sweep, deviasi, breakout-retest, Double Deviation, Wolf, Fib 0,75), diambil apa adanya | Sisi SHORT: +0,64R, win 56% (n=89) |
| Gerbang basi/terjangkau (umur pemicu, TP sudah tercapai, entry sudah berjalan 1R, jarak ≤0,75R) | Penyebab utama "EXPIRED noise" |
| Gerbang BTC weekly+daily dan pisau jatuh | LONG melawan tren turun adalah sumber kerugian |
| Lantai SL 1 ATR, SL maks 15%, RR 2 tetap | SL 3% justru terbaik di SHORT; melebarkan SL hanya menggeser SL ke kedaluwarsa |
| Satu order aktif per koin, jeda 3 hari setelah SL, batas klaster | 781 sinyal tercatat = hanya 307 peristiwa independen |
| Aturan penilaian trade-sim (konservatif, aturan batal, data 1 menit) | Penilaian sudah diverifikasi manual di TradingView |
| Biaya 0,05%/sisi + slippage 0,05% | Biaya bukan penyebab (±0,05R) tetapi tetap dihitung |

## Yang dibuang atau diperbaiki (kelemahan yang ditemukan)

| Kelemahan | Perbaikan v3 |
| --- | --- |
| LONG terus dibuka walau rugi −0,56R (rugi 8 dari 8 minggu) | **Pemutus arah adaptif**: tiap arah punya status `live`/`shadow` dari R bersih 20 trade terakhir yang sudah selesai (histeresis +0,10 / 0). LONG mulai `shadow`, SHORT `live`; salah satu berbalik sendiri bila datanya berbalik |
| Arah yang diblokir tidak pernah dinilai sehingga tak bisa pulih | Sinyal shadow tetap dicatat dan dinilai identik; ikut dihitung pemutus |
| Edge pemilihan setup tak terbedakan dari beta rezim (MIRROR LONG +0,78R) | Baseline MARKET dan MIRROR dinilai untuk setiap sinyal; putusan wajib mengalahkan MIRROR |
| Skor/grade menyaring tanpa bukti (0 dari 35 uji lolos) | `minScore: 0`: skor hanya dicatat. Naikkan hanya bila fitur lolos validasi |
| Fitur pasar tidak tercatat, analisis lanjutan mustahil | Setiap sinyal menyimpan ATR%, reach7, jarak, return 1/3/7/30h, EMA, RSI, rezim BTC, dsb. |
| Sampel digelembungkan duplikasi dan klaster | Dedupe, bootstrap per minggu, bukan per trade |
| Angka "bagus" dari sampel kecil dibaca sebagai bukti | Putusan `BELUM SAH` sampai syarat sampel terpenuhi; kriteria dikunci |
| Edit/hapus jurnal tak terdeteksi | Rantai hash; hash ujung dicetak ke ringkasan Actions |

## Alur

```
scan.mjs   : nilai order lama → pindai ±60 koin → gerbang → portofolio → mode live/shadow → catat (berantai hash)
grade.mjs  : nilai order + baseline MARKET/MIRROR (3×/hari)
report.mjs : verifikasi rantai → analisis → data/analysis.{json,md}, data/state.json
build-site : site/ (dasbor + data) → GitHub Pages
```

Analisis (`src/analysis.mjs`): ringkasan per mode/arah/pemicu/rezim, CI bootstrap per minggu, baseline, dan **saringan fitur**
(uji permutasi + Benjamini-Hochberg di 60% data awal, **validasi di 40% data terbaru**; kalibrasi di tes: 1 dari 400 uji pada data acak
lolos). Tidak ada parameter yang diubah otomatis: temuan hanyalah usulan untuk forward test berikutnya.

## Aturan main (mengikat Anda sendiri)

- Jangan mengubah `src/signals.mjs`, `src/config.mjs`, `src/trade-sim.mjs` di tengah forward test: hash mesin berubah dan baris baru
  **tidak dihitung**. Untuk mesin baru hapus `data/protocol.json`.
- Jangan mengedit atau menghapus baris `data/journal.json`.
- Jangan mengubah kriteria `gate` setelah dimulai. Jangan memperlebar SL atau menurunkan RR demi win rate.
- Perubahan filter/parameter baru: ajukan hipotesis → uji out-of-sample di analisis → forward test baru.
- Verifikasi tanggal FOMC di `signals.mjs` (`FOMC`) di federalreserve.gov sebelum dipakai.

## Membaca dasbor

- **Mode live** boleh diperdagangkan *hanya setelah putusan LULUS*; sebelumnya semua baris adalah uji. **Shadow** tidak pernah.
- **E** = rata-rata R bersih per trade terisi. **CI 95%** per minggu. **PF**, **MaxDD** dalam R.
- Ukuran posisi = ekuitas × risiko% ÷ jarak SL% (default uji 0,25%).

## Batasan jujur

- Data awal berasal dari satu rezim turun; sisi LONG dan gerbang rezim belum teruji di pasar naik. Itu sebabnya pemutus bersifat simetris.
- Candle 1H/1m dari Binance publik; bila runner diblokir (HTTP 451) klien otomatis mencoba host cadangan.
- `reach7` (jarak TP dibanding ATR×√7) dicatat sebagai hipotesis lebar-SL/target, belum menjadi filter.
- Tes memakai klien palsu dan pasar sintetis; perilaku di pasar nyata hanya bisa dibuktikan oleh forward test.

## Perintah lokal

```bash
npm test          # semua tes
node scripts/scan.mjs && node scripts/report.mjs && node scripts/build-site.mjs
```
