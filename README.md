# Vibe-Juri

Platform penjurian dan security audit untuk kompetisi **Vibe Coding**. Juri mengimpor daftar URL peserta, membuka karya di jendela kiri **75%** layar, menilai di panel kanan **25%**, lalu mengekspor rekap peringkat ke Excel 2 sheet.

Dibangun dengan **Next.js App Router**, **TypeScript**, **Tailwind CSS**, dan **SheetJS (`xlsx`)**. Tidak memakai iframe untuk preview peserta, sehingga `X-Frame-Options` dan CSP peserta tidak memblokir audit.

---

## Fitur

### 1. Import & sanitasi URL (`/`)
- Dua mode input: copy-paste teks dan upload `.txt`, `.csv`, `.xlsx`, `.xls` (seluruh sheet diekstrak).
- Membersihkan spasi, tanda kutip, dan menambahkan `https://` bila protokol belum ada.
- Menolak entri angka murni, tautan `.git`, dan repo `github.com` (subdomain `github.io` tetap diterima).
- Deduplikasi dengan normalisasi huruf kecil + penghapusan trailing slash.
- Pratinjau dua tab: **URL Valid Unik** vs **Duplikat / Tidak Valid** beserta alasan penolakan.
- Data contoh bawaan: **60 URL valid + 11 entri duplikat/tidak valid**.

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

### 4. Auto audit (opsional)
- Tombol **Jalankan Audit API** memanggil `/api/audit` yang mem-proxy ke worker headless (`AUDIT_WORKER_URL`).
- Alternatif tanpa worker: import file JSON atau tempel JSON audit langsung di panel.
- Metrik: status HTTP, waktu muat, jumlah foto raster vs SVG, responsif mobile, security headers, dan error JS.
- Tombol **Isi skor Headers N/5** mengisi komponen 4.4 berdasarkan header yang terdeteksi.

### 5. Klasemen & ekspor (`/leaderboard`)
- Peringkat otomatis: Total DESC → MVP → Security → Personal → URL.
- Breakdown kolom Produk/UX (60), Security (25), Personal (15), Total (100), status, aksi.
- Pencarian URL, filter **Semua / Sudah / Belum Dinilai**, tombol **Split-Window** per baris untuk review, dan **Nilai** untuk membuka panel.
- Ekspor **`Hasil_Penilaian_Vibe_Juri.xlsx`**:
  - **Sheet 1 — Peringkat & Audit Lengkap**: peringkat, URL, 3 skor produk, 5 skor security, subtotal, personal, total, status, catatan.
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

Deploy ke Vercel: import repo, framework terdeteksi otomatis, tidak perlu env untuk fitur inti. Tambahkan `AUDIT_WORKER_URL` bila memakai audit otomatis.

---

## Alur pemakaian cepat

1. Buka `/`, klik **Import Data Contoh (55+ URL)** atau tempel/upload daftar asli.
2. Periksa tab **Valid** (60) dan **Duplikat / Tidak Valid** (11).
3. Klik **Mulai Penjurian Split-Window** → `/judge`.
4. Klik **Buka Layar 75%**, izinkan pop-up jika diminta.
5. Uji web peserta di jendela kiri; isi skor di panel kanan; gunakan `←`/`→` untuk pindah karya.
6. Buka `/leaderboard`, cek filter/pencarian, lalu **Export Excel**.

Data tersimpan di kunci `localStorage` `vibe-juri.session.v1`. Sesi bertahan setelah reload dan tersinkron antar-tab pada origin yang sama.

---

## Integrasi worker audit (opsional)

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
    "testedAt": "2026-11-18T10:00:00.000Z"
  }
}
```

Worker dapat berupa Python + Playwright + FastAPI. Tanpa `AUDIT_WORKER_URL`, route mengembalikan `501` dengan pesan konfigurasi; panel juri tetap dapat memakai import JSON manual.

---

## Struktur proyek

```
app/
  page.tsx                  # import + sanitizer preview
  judge/page.tsx            # split-window controller + scoring
  leaderboard/page.tsx      # peringkat + ekspor Excel
  api/audit/route.ts        # proxy worker audit (opsional)
  layout.tsx, globals.css
components/
  import/                   # UrlBatchImporter, SanitizerPreviewTable
  judge/                    # SplitWindowLauncher, ScoringPanel, AutoAuditBadge
  layout/                   # header/footer, reset sesi
  ui/                       # toast, dialog, ikon SVG
lib/
  urlCleaner.ts             # validasi + normalisasi + deduplikasi
  fileParser.ts             # .txt/.csv/.xlsx parser
  storage.ts, useSession.ts # localStorage modular
  scoring.ts, ranking.ts    # rubrik, total, tie-breaker
  exporter.ts               # SheetJS 2 sheet
  splitWindow.ts            # window.open/moveTo/ref navigasi
  audit.ts                  # normalisasi metrik audit
types/index.ts
```

---

## Catatan teknis

- **Tanpa iframe** — preview peserta selalu berupa jendela browser terpisah.
- **Pop-up blocker** — browser mewajibkan `window.open` dipanggil langsung dari klik pengguna; UI menampilkan langkah izin jika diblokir.
- **Resize tab utama** — `moveTo/resizeTo` sering dibatasi untuk tab yang tidak dibuka via script. Preview tetap 75% kiri; panel menampilkan saran snap window ke kanan 25%.
- **Tidak ada error konsol** pada alur E2E (import, split-window, navigasi, skor, audit JSON, klasemen, export, reset, viewport 340px).
- Security headers dasar untuk aplikasi ini diatur di `next.config.mjs` (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Font **Inter** dan **JetBrains Mono** di-self-host via `@fontsource-variable`, tanpa request runtime ke Google Fonts.
