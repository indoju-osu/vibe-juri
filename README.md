# Vibe-Juri

Platform penjurian dan security audit untuk kompetisi **Vibe Coding**. Juri mengimpor daftar URL peserta, **nilai sementara otomatis langsung terbentuk** dan klasemen langsung terbit, lalu juri menilai di panel kanan **25%** sambil membuka karya di jendela kiri **75%**. Setiap karya dipindai **Produk/UX + Security** secara otomatis; Personal (15) default **0** dan baru ditambahkan ke perhitungan saat juri mengisinya. Setelah skor juri disimpan, klasemen otomatis berubah memakai nilai juri, dan rekap dapat diekspor ke Excel 2 sheet.

Dibangun dengan **Next.js App Router**, **TypeScript**, **Tailwind CSS**, dan **SheetJS (`xlsx`)**. Tidak memakai iframe untuk preview peserta, sehingga `X-Frame-Options` dan CSP peserta tidak memblokir audit.

---

## Fitur

### 1. Import & sanitasi URL (`/`)
- Dua mode input: copy-paste teks dan upload `.txt`, `.csv`, `.xlsx`, `.xls` (seluruh sheet diekstrak).
- Membersihkan spasi, tanda kutip, dan menambahkan `https://` bila protokol belum ada.
- Menolak entri angka murni, tautan `.git`, dan repo `github.com` (subdomain `github.io` tetap diterima).
- Deduplikasi dengan normalisasi huruf kecil + penghapusan trailing slash.
- Pratinjau dua tab: **URL Valid Unik** vs **Duplikat / Tidak Valid** beserta alasan penolakan.
- Data contoh bawaan: **60 URL fiktif + 11 entri duplikat/tidak valid** untuk menguji sanitizer, dan **batch asli Vibe Coding (66 baris)** yang siap diaudit otomatis untuk melihat klasemen sementara nyata.

### 2. Split-Window Controller (`/judge`)
- Tombol **Buka Layar 75%** memanggil `window.open(currentUrl, "VibeJuriPreviewWindow", ...)` dengan posisi `left=0, width=75%`, lalu mencoba `window.moveTo/resizeTo` untuk panel juri di kanan 25%.
- Navigasi `←` / `→`, dropdown lompat karya, dan antrean URL mengubah `location.href` jendela preview yang sama — tidak menumpuk tab.
- Status koneksi **Terbuka / Tertutup / Diblokir**, tombol fokus, reload, dan buka ulang.
- Notifikasi instruktif bila pop-up diblokir, plus catatan fallback bila browser menolak resize tab utama (gunakan snap window).

### 3. Penilaian 100 poin
| Pilar | Komponen | Maks |
| --- | --- | --- |
| Produk, UI/UX & Performa | Kesiapan MVP, UI/UX, Fitur & Performa | 60 |
| Top 5 Security Testing | XSS, Auth, Data Sensitif, Headers/HTTPS, Logika Bisnis | 25 |
| Personal Juri | X-Factor / apresiasi subjektif | 15 |

- Slider + input numerik untuk 9 komponen, dengan `quick-check` dan tombol copy payload uji (`"><img src=x onerror=alert(1)>`, `/admin`, `curl -I`, dll.).
- Catatan evaluasi & temuan security per karya.
- **Autosave** setiap perubahan ke `localStorage`, tombol **Simpan Skor & Tandai Selesai**, dan skor total real-time.
- Shortcut keyboard `ArrowLeft` / `ArrowRight` (diabaikan saat fokus di form).

### 4. Nilai sementara otomatis (tanpa konfigurasi)
- Setiap karya diaudit otomatis saat `/judge` dibuka (kuota 2 audit paralel, progres + tombol stop/lanjut/coba-ulang). **Semua pemindaian dijalankan langsung** — termasuk probe keamanan aktif — tanpa langkah izin terpisah.
- `POST /api/audit` memakai **auditor HTML bawaan** (fetch server-side + guard SSRF, redirect maks. 3, timeout 15 dtk, batas 3 MB) sehingga tetap berjalan tanpa worker. Bila `AUDIT_WORKER_URL` diisi, route mem-proxy ke worker Playwright untuk metrik browser penuh.
- **Produk/UX otomatis (0–100):** status HTTP, waktu muat, foto raster vs SVG, responsif, error JS, jumlah elemen interaktif, indikator transaksi/MVP, teks dummy, viewport, hierarki tipografi, dan polish kartu → rubrik **MVP 35 · UI/UX 30 · Fitur 20 · Performa 15**.
- **Situs client-rendered (SPA) dinilai adil:** bila HTML server hanya shell (`<div id="root"></div>`) dan konten dirakit di browser, auditor otomatis mengambil bundle JS/CSS same-origin lalu menurunkan sinyalnya (referensi foto produk raster, navigasi/footer/pencarian, indikator transaksi, kekayaan teks UI, polish). Metrik digabung dengan hasil DOM sehingga SPA tidak salah dinilai "tanpa foto/navigasi". Catatan hasil menandai dengan jelas bahwa metrik berasal dari HTML + bundle.
- **Security otomatis (0–25):** diukur dari probe aktif yang aman (hanya `GET`):
  - **Headers & HTTPS (5):** header respons + protokol.
  - **XSS/sanitasi (5):** probe refleksi payload aman (`?__vibe_probe=…<vj>`).
  - **Data sensitif (5):** scan `/.env` & `/.git/config` yang terekspos + deteksi kredensial (Google/Stripe/AWS/GitHub/Slack, private key, `service_role`, API key hardcoded) pada HTML dan hingga 2 bundle skrip same-origin.
  - **Auth & kontrol akses (5):** probe rute sensitif `/admin`, `/api/admin`, `/api/users`, `/api/config` (deteksi SPA catch-all agar rute SPA tidak dihitung bocor). `401/403/3xx` dianggap terproteksi.
  - **Logika bisnis (5):** **tidak** diukur otomatis — tetap penilaian juri.
- **Peringkat sementara = Produk/UX + Security (maks 85)**, Personal default 0. Nilai bertanda `/85`. Begitu juri mengisi Personal, komponen itu ditambahkan ke perhitungan rubrik resmi 100.
- Tombol **Adopsi nilai awal** mengisi **seluruh** komponen rubrik juri (MVP, UI/UX, Fitur & Performa, plus 5 komponen Security) dari hasil audit; juri tinggal menyempurnakan. Panel rubrik juga **terisi otomatis** saat audit selesai selama juri belum menyentuh entri itu (belum disimpan/diedit) — editan juri tidak pernah ditimpa. Personal tetap `0` sampai juri mengisinya.
- Klasemen memakai **nilai juri bila sudah disimpan**, selain itu nilai otomatis Produk/UX + Security. Nilai juri default **0** sampai juri menekan simpan, jadi peringkat awal tetap adil dan berubah saat penjurian berjalan.
- Kegagalan audit (timeout, HTTP ≥ 400, deployment terkunci) disimpan sebagai audit gagal → nilai sementara `0` dengan catatan alasannya; probe keamanan tidak dijalankan pada halaman yang gagal dimuat.

### 5. Klasemen & ekspor (`/leaderboard`)
- Kolom **Otomatis Produk+Security (85) → Juri (100) → Akhir (100)**, plus rincian **Produk/UX (60)** & **Security (25)** efektif (nilai juri bila sudah dinilai, selain itu otomatis), **Personal (15)**, dan status per baris.
- Urutan: skor akhir DESC → Produk/UX → Security → Personal → nilai otomatis → URL.
- Pencarian URL, filter **Semua / Sudah / Belum Dinilai**, tombol **Split-Window** per baris untuk review, dan **Nilai** untuk membuka panel.
- Ekspor **`Hasil_Penilaian_Vibe_Juri.xlsx`**:
  - **Sheet 1 — Peringkat & Audit Lengkap**: peringkat, URL, 9 komponen rubrik, subtotal, total, status, catatan, plus kolom auto (**Skor Otomatis Produk (100)** + rincian MVP/UI/UX/Fitur/Performa, **Auto Produk/UX (60)**, **Auto Security (25)** dengan 5 komponennya, **Sementara Produk+Security (85)**), **Skor Akhir (100)**, dan sumber skor akhir.
  - **Sheet 2 — Duplikat & Tidak Valid**: URL asli, alasan (`Tidak Valid / Repo Git` atau `Duplikat (Diabaikan)`), skor total `0`.
- Reset sesi dengan dialog konfirmasi.

---

## Menjalankan

Prasyarat: **Node.js 18.9+**. Proyek dipin ke Next.js 13.5 agar kompatibel dengan Node 18.9; Next.js 14 membutuhkan Node ≥18.17.

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

Perintah lain:

```bash
npm run build     # production build + type check
npm run start     # jalankan hasil build
npm run typecheck # tsc --noEmit
```

Deploy ke Vercel: import repo, framework terdeteksi otomatis, tidak perlu env untuk fitur inti (audit HTML bawaan aktif otomatis). Tambahkan `AUDIT_WORKER_URL` hanya bila ingin metrik browser penuh.

---

## Alur pemakaian cepat

1. Buka `/`, klik **Muat Batch Vibe Coding** (data asli) atau **Data Contoh** di panel pratinjau.
2. Periksa tab **Valid** dan **Duplikat / Tidak Valid**.
3. Klik **Mulai Penjurian Split-Window** → `/judge`. Audit otomatis mulai berjalan dan nilai sementara terisi.
4. Buka **Klasemen** untuk melihat peringkat sementara (nilai juri masih 0).
5. Kembali ke `/judge`, klik **Buka Layar 75%**, uji web peserta, lalu beri skor. Panel rubrik sudah terisi nilai otomatis sebagai titik mulai (gunakan **Adopsi nilai awal** untuk menyegarkan ulang).
6. Tekan **Simpan Skor** → klasemen langsung berubah memakai nilai juri.
7. Buka `/leaderboard`, cek filter/pencarian, lalu **Export Excel**.

Data tersimpan di kunci `localStorage` `vibe-juri.session.v1`. Sesi bertahan setelah reload dan tersinkron antar-tab pada origin yang sama.

---

## Audit otomatis & worker (opsional)

Tanpa konfigurasi apa pun, `/api/audit` memakai auditor HTML server-side (`lib/htmlAudit.ts`). Cek mode aktif:

```bash
curl -s http://localhost:3000/api/audit
# { "mode": "html", ... }  atau  { "mode": "worker", ... }
```

Untuk metrik yang hanya bisa diukur setelah render (console error, responsif 375px, ukuran font hasil render, polish kartu), jalankan worker Playwright yang disertakan:

```bash
pip install fastapi uvicorn playwright
playwright install chromium
uvicorn worker.audit_worker:app --host 127.0.0.1 --port 8000
```

Salin `.env.example` → `.env.local`:

```env
AUDIT_WORKER_URL=http://127.0.0.1:8000/audit
```

Kontrak request/response:

```jsonc
// POST /api/audit  ← dari browser
{ "url": "https://karya-peserta.vercel.app" }

// POST AUDIT_WORKER_URL  ← dari route Next.js
{ "url": "https://karya-peserta.vercel.app" }

// Response worker (semua field opsional kecuali url/audit)
{
  "ok": true,
  "audit": {
    "url": "https://karya-peserta.vercel.app",
    "statusCode": 200,
    "loadTimeSeconds": 1.42,
    "rasterImages": 12,
    "svgImages": 3,
    "responsive": true,
    "securityHeaders": ["content-security-policy", "x-content-type-options"],
    "consoleErrors": 0,
    "textLength": 3200,
    "mvpSignals": 7,
    "priceMentions": 5,
    "interactiveCount": 48,
    "inputCount": 4,
    "polishedCards": 26,
    "hasNav": true,
    "hasFooter": true,
    "hasSearch": true,
    "hasViewportMeta": true,
    "typography": "Baik",
    "hasDummyText": false,
    "httpsEnabled": true,
    "exposedFiles": [],
    "exposedSecrets": [],
    "xssReflected": false,
    "xssProbes": 1,
    "pathsProbed": 4,
    "pathsGuarded": 4,
    "pathsOpen": [],
    "testedAt": "2026-11-18T10:00:00.000Z"
  }
}
```

Worker boleh mengirim nama field `snake_case` atau label Indonesia (mis. `foto_raster`, `Responsif Mobile`) — `lib/audit.ts` menormalkannya. Worker Playwright juga menjalankan probe keamanan yang sama (`exposedFiles`, `exposedSecrets`, `xssReflected`, `pathsOpen`, dll.). Audit manual via tempel/import JSON tetap tersedia di panel juri.

---

## Struktur proyek

```
app/
  page.tsx                  # import + sanitizer preview
  judge/page.tsx            # split-window controller + scoring
  leaderboard/page.tsx      # peringkat + ekspor Excel
  api/audit/route.ts        # audit HTML bawaan / proxy worker
  layout.tsx, globals.css
components/
  import/                   # UrlBatchImporter, SanitizerPreviewTable
  judge/                    # SplitWindowLauncher, BulkAutoAudit, AutoAuditBadge, ScoringPanel
  layout/                   # header/footer, reset sesi
  ui/                       # toast, dialog, ikon SVG
lib/
  urlCleaner.ts             # validasi + normalisasi + deduplikasi
  fileParser.ts             # .txt/.csv/.xlsx parser
  storage.ts, useSession.ts # localStorage modular
  scoring.ts, ranking.ts    # rubrik, skor akhir, tie-breaker
  autoScore.ts              # heuristik Produk/UX + Security (rubrik resmi, personal 0)
  htmlAudit.ts              # auditor server-side tanpa browser + probe keamanan aktif
  urlGuard.ts               # guard SSRF (IP privat/localhost/metadata)
  exporter.ts               # SheetJS 2 sheet
  splitWindow.ts            # window.open/moveTo/ref navigasi
  audit.ts                  # normalisasi metrik audit
worker/
  audit_worker.py           # worker Playwright opsional (FastAPI)
types/index.ts
```

---

## Catatan teknis

- **Tanpa iframe** — preview peserta selalu berupa jendela browser terpisah.
- **Pop-up blocker** — browser mewajibkan `window.open` dipanggil langsung dari klik pengguna; UI menampilkan langkah izin jika diblokir.
- **Resize tab utama** — `moveTo/resizeTo` sering dibatasi untuk tab yang tidak dibuka via script. Preview tetap 75% kiri; panel menampilkan saran snap window ke kanan 25%.
- **Tidak ada error konsol** pada alur E2E (import, split-window, navigasi, skor, adopsi Produk/UX + Security, audit, klasemen dengan peringkat Produk/UX + Security, penambahan Personal, export, reset, viewport 340px).
- Auto-audit dapat dinonaktifkan lewat `localStorage` kunci `vibe-juri.autoaudit.v1` (`"0"` = nonaktif); preferensi ini dipatuhi sejak render pertama.
- Security headers dasar untuk aplikasi ini diatur di `next.config.mjs` (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Font **Inter** dan **JetBrains Mono** di-self-host via `@fontsource-variable`, tanpa request runtime ke Google Fonts.
