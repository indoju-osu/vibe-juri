import { matchedSecurityHeaders } from "@/lib/audit";
import type { AuditResult, AutoRubric, AutoScore, AutoSecurity, ScoreDetail } from "@/types";

/**
 * Heuristik penilaian otomatis (nilai sementara).
 *
 * Diadopsi 1:1 dari rubrik audit awal:
 * - Kesiapan Produk & MVP ......... 35
 * - Kualitas UI/UX & Estetika ...... 30
 * - Fitur & Interaktivitas ......... 20
 * - Performa & Stabilitas .......... 15
 * Total 100.
 *
 * Skor ini hanya dipakai sebagai peringkat sementara. Begitu juri menekan
 * "Simpan Skor", nilai juri (rubrik resmi 100 poin) yang dipakai di klasemen.
 */

const MVP_KEYWORDS = [
  "rp",
  "stok",
  "keranjang",
  "beli",
  "pesan",
  "detail",
  "promo",
  "diskon",
  "harga",
  "kategori",
  "daftar",
  "masuk",
  "kontak",
];

const DUMMY_PATTERNS = ["apalah", "data contoh", "lorem ipsum", "testing", "dummy", "qwerty", "asdf"];

function num(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, roundHalf(value)));
}

export function auditFailed(audit: AuditResult): boolean {
  if (audit.error) return true;
  if (audit.platformError) return true;
  if (audit.locked) return true;
  if (audit.statusCode === null) return false;
  return audit.statusCode === 0 || audit.statusCode >= 400;
}

function collectNotes(audit: AuditResult, metrics: {
  realPhotos: number;
  svgIllustrations: number;
  transactionScore: number;
  mobileFit: boolean | null;
  dummy: boolean;
  hasNav: boolean | null;
  hasFooter: boolean | null;
  loadTime: number | null;
  errors: number | null;
}): string[] {
  const notes: string[] = [];
  const { realPhotos, svgIllustrations, transactionScore, mobileFit, dummy } = metrics;

  if (realPhotos >= 5 && transactionScore >= 8 && !dummy) {
    notes.push(
      "MVP siap pakai: foto produk asli terdeteksi dan info transaksi lengkap",
    );
  } else if (realPhotos >= 2) {
    notes.push("Foto produk asli terdeteksi, katalog cukup lengkap");
  } else if (realPhotos === 0 && svgIllustrations >= 4) {
    notes.push("Gambar produk masih ilustrasi vektor/SVG (belum foto produk asli)");
  } else if (realPhotos === 0) {
    notes.push("Belum ada foto produk asli (masih placeholder/teks)");
  }

  if (dummy) notes.push("Masih terdapat teks dummy/contoh pada katalog");
  if (mobileFit === false) notes.push("UI bermasalah di layar HP (overflow)");
  if (metrics.hasNav === false || metrics.hasFooter === false) {
    notes.push("Struktur navigasi/footer belum lengkap");
  }
  if (metrics.loadTime !== null && metrics.loadTime > 8) {
    notes.push(`Waktu muat lambat (${metrics.loadTime} dtk)`);
  }
  if (metrics.errors !== null && metrics.errors > 0) {
    notes.push(`${metrics.errors} JS error`);
  }
  if (notes.length === 0) notes.push("UI/UX baik dan fungsionalitas berjalan normal");
  return notes;
}

export function autoScoreFromAudit(audit: AuditResult): AutoScore {
  if (auditFailed(audit)) {
    const reason = audit.error
      ? `Timeout / gagal diakses: ${audit.error}`
      : audit.locked
        ? "Deployment terkunci autentikasi Vercel (akses belum publik)"
        : audit.platformError
          ? "Deployment tidak aktif atau error di server hosting"
          : `HTTP Error ${audit.statusCode ?? 0} (halaman gagal dimuat)`;
    return { total: 0, mvp: 0, uiux: 0, features: 0, performance: 0, notes: [reason], partial: false };
  }

  const realPhotos = num(audit.rasterImages);
  const svgIllustrations = num(audit.svgImages);
  const loadTime = audit.loadTimeSeconds;
  const errors = audit.consoleErrors;
  const mobileFit = audit.responsive;
  const viewport = audit.hasViewportMeta;
  const dummy = audit.hasDummyText === true;

  /* 1. Kesiapan Produk & MVP (35) ------------------------------------------------ */
  let photoScore: number;
  if (realPhotos >= 10) photoScore = 15;
  else if (realPhotos >= 5) photoScore = 12;
  else if (realPhotos >= 2) photoScore = 8;
  else if (realPhotos >= 1) photoScore = 5;
  else if (svgIllustrations >= 4) photoScore = 3;
  else photoScore = 0;

  const priceMentions = audit.priceMentions;
  const mvpSignals = audit.mvpSignals;
  let transactionScore = 0;
  if (priceMentions === null && mvpSignals === null) {
    transactionScore = 0;
  } else if (num(priceMentions) >= 3 || num(mvpSignals) >= 6) {
    transactionScore = 12;
  } else if (num(priceMentions) >= 1 || num(mvpSignals) >= 4) {
    transactionScore = 8;
  } else if (num(mvpSignals) >= 2) {
    transactionScore = 4;
  }

  const textLength = audit.textLength;
  let textScore: number;
  if (textLength === null) textScore = 3;
  else if (textLength >= 3000) textScore = 8;
  else if (textLength >= 1500) textScore = 6;
  else if (textLength >= 500) textScore = 3;
  else textScore = 1;
  if (dummy) textScore = Math.max(1, textScore - 4);

  const skorMvp = clamp(photoScore + transactionScore + textScore, 35);

  /* 2. Kualitas UI/UX & Estetika (30) -------------------------------------------- */
  const typographyGood = audit.typography === "Baik";
  const typographyScore = typographyGood ? 8 : 3;

  let structureScore = 0;
  if (audit.hasNav) structureScore += 4;
  if (audit.hasFooter) structureScore += 3;
  if (audit.hasSearch) structureScore += 3;

  let visualScore = 0;
  if (mobileFit === true && viewport === true) visualScore += 7;
  else if (mobileFit === true || viewport === true) visualScore += 3;

  const polished = num(audit.polishedCards);
  if (audit.polishedCards === null) visualScore += 1;
  else if (polished >= 15) visualScore += 5;
  else if (polished >= 5) visualScore += 3;
  else visualScore += 1;

  const skorUiux = clamp(typographyScore + structureScore + visualScore, 30);

  /* 3. Fitur & Interaktivitas (20) ----------------------------------------------- */
  const interactive = num(audit.interactiveCount);
  let featureScore: number;
  if (audit.interactiveCount === null) featureScore = 5;
  else if (interactive >= 60) featureScore = 15;
  else if (interactive >= 35) featureScore = 12;
  else if (interactive >= 20) featureScore = 9;
  else if (interactive >= 10) featureScore = 5;
  else featureScore = 2;

  if (num(audit.inputCount) >= 2) featureScore += 5;
  else if (num(audit.inputCount) >= 1) featureScore += 3;

  const skorFitur = clamp(featureScore, 20);

  /* 4. Performa & Stabilitas (15) ------------------------------------------------ */
  let performanceScore: number;
  if (errors === null) performanceScore = 2;
  else if (errors === 0) performanceScore = 5;
  else if (errors <= 2) performanceScore = 2;
  else performanceScore = 0;

  if (loadTime === null) performanceScore += 2;
  else if (loadTime <= 8) performanceScore += 10;
  else if (loadTime <= 12) performanceScore += 6;
  else performanceScore += 2;

  const skorPerforma = clamp(performanceScore, 15);

  const partial =
    audit.rasterImages === null ||
    audit.interactiveCount === null ||
    audit.textLength === null ||
    audit.consoleErrors === null ||
    audit.responsive === null ||
    audit.mvpSignals === null ||
    audit.priceMentions === null ||
    audit.polishedCards === null;

  const notes = collectNotes(audit, {
    realPhotos,
    svgIllustrations,
    transactionScore,
    mobileFit,
    dummy,
    hasNav: audit.hasNav,
    hasFooter: audit.hasFooter,
    loadTime,
    errors,
  });
  if (partial && !audit.clientRendered) {
    notes.push("Sebagian metrik browser tidak tersedia — skor otomatis bersifat perkiraan");
  }
  if (audit.clientRendered) {
    notes.push(
      "Aplikasi dirender di browser (SPA) — metrik diambil dari HTML + bundle JS/CSS",
    );
  } else if (audit.source === "html") {
    notes.push("Diukur dari HTML server (tanpa render browser)");
  }

  return {
    total: clamp(skorMvp + skorUiux + skorFitur + skorPerforma, 100),
    mvp: skorMvp,
    uiux: skorUiux,
    features: skorFitur,
    performance: skorPerforma,
    notes,
    partial,
  };
}

/**
 * Skor otomatis 5 komponen Security (masing-masing 0–5, total 0–25).
 *
 * - Headers & HTTPS → dari header respons + protokol.
 * - XSS/sanitasi → probe refleksi payload aman.
 * - Data sensitif → scan bundle/JS + file terekspos (.env/.git).
 * - Auth & akses rute → probe rute sensitif (/admin, /api/*).
 * - Logika bisnis → TIDAK diukur otomatis (tetap untuk penilaian juri).
 */
export function autoSecurityFromAudit(audit: AuditResult): AutoSecurity {
  if (auditFailed(audit)) {
    return {
      xss: 0,
      auth: 0,
      data: 0,
      headers: 0,
      logic: 0,
      total: 0,
      notes: ["Audit gagal — aspek security belum dapat diukur"],
      partial: false,
    };
  }

  const notes: string[] = [];
  let partial = false;

  /* 4.4 Headers & HTTPS (5) ------------------------------------------------------ */
  const matched = matchedSecurityHeaders(audit).length;
  let headers = matched;
  if (audit.httpsEnabled === false) {
    headers = Math.min(headers, 2);
    notes.push("HTTPS tidak aktif — koneksi tidak terenkripsi");
  } else if (audit.httpsEnabled === null) {
    partial = true;
  }
  if (matched >= 4) notes.push(`Security headers lengkap (${matched}/5)`);
  else if (matched === 0) notes.push("Tidak ada security header terdeteksi");
  else notes.push(`Security headers sebagian (${matched}/5)`);

  /* 4.1 Sanitasi input & XSS (5) ------------------------------------------------- */
  let xss: number;
  if (audit.xssProbes === null || audit.xssProbes === 0) {
    xss = 0;
    partial = true;
    notes.push("Probe refleksi XSS tidak dapat dijalankan");
  } else if (audit.xssReflected === true) {
    xss = 0;
    notes.push("Payload uji ter-refleksi tanpa sanitasi (indikasi XSS)");
  } else {
    xss = 5;
    notes.push("Tidak ada refleksi payload XSS terdeteksi");
  }

  /* 4.3 Proteksi data sensitif (5) ----------------------------------------------- */
  const exposedFiles = audit.exposedFiles ?? [];
  const exposedSecrets = audit.exposedSecrets ?? [];
  let data: number;
  if (audit.exposedFiles === null && audit.exposedSecrets === null) {
    data = 0;
    partial = true;
  } else {
    data = Math.max(0, 5 - exposedFiles.length * 4 - exposedSecrets.length * 2);
    if (exposedFiles.length > 0) {
      notes.push(`File sensitif terekspos: ${exposedFiles.join(", ")}`);
    }
    if (exposedSecrets.length > 0) {
      notes.push(`Indikasi kredensial di bundle: ${exposedSecrets.join(", ")}`);
    }
    if (exposedFiles.length === 0 && exposedSecrets.length === 0) {
      notes.push("Tidak ada file/kredensial sensitif yang bocor terdeteksi");
    }
  }

  /* 4.2 Autentikasi & kontrol akses rute (5) ------------------------------------- */
  const probed = audit.pathsProbed ?? 0;
  const guarded = audit.pathsGuarded ?? 0;
  const pathsOpen = audit.pathsOpen ?? [];
  let auth: number;
  if (audit.pathsProbed === null || probed === 0) {
    auth = 0;
    partial = true;
    notes.push("Probe rute terproteksi tidak dapat dijalankan");
  } else {
    auth = Math.round(5 * (guarded / probed));
    if (pathsOpen.length > 0) {
      auth = Math.min(auth, Math.max(0, 5 - pathsOpen.length * 2));
      notes.push(`Rute sensitif dapat diakses langsung: ${pathsOpen.join(", ")}`);
    } else if (guarded === 0) {
      notes.push(
        "Rute sensitif tidak dapat diverifikasi otomatis (aplikasi client-rendered / tanpa rute server)",
      );
    } else {
      notes.push("Rute sensitif tertutup / terproteksi");
    }
  }

  /* 4.5 Logika bisnis (5) — khusus penilaian juri -------------------------------- */
  const logic = 0;
  notes.push("Validasi logika bisnis & tampering tetap dinilai manual oleh juri");

  return {
    xss,
    auth,
    data,
    headers,
    logic,
    total: xss + auth + data + headers + logic,
    notes,
    partial,
  };
}

/**
 * Konversi skor otomatis ke komponen rubrik resmi (untuk adopsi nilai awal).
 * product (0–60) + security (0–25) + personal (0). Personal sengaja 0.
 */
export function autoRubricFromAudit(audit: AuditResult): AutoRubric {
  const auto = autoScoreFromAudit(audit);
  const sec = autoSecurityFromAudit(audit);

  const mvp = clamp((auto.mvp / 35) * 25, 25);
  const uiux = clamp((auto.uiux / 30) * 20, 20);
  const features = clamp((auto.features / 20) * 12 + (auto.performance / 15) * 3, 15);
  const product = roundHalf(mvp + uiux + features);
  const security = sec.total;

  return {
    mvp,
    uiux,
    features,
    secXss: sec.xss,
    secAuth: sec.auth,
    secData: sec.data,
    secHeaders: sec.headers,
    secLogic: sec.logic,
    product,
    security,
    personal: 0,
    total: roundHalf(product + security),
  };
}

/** Ringkasan metrik untuk badge/daftar. */
export function autoScoreLabel(score: AutoScore | null): string {
  if (!score) return "Belum diaudit";
  return `${score.total}/100 otomatis`;
}

/**
 * Isi komponen rubrik dengan nilai awal otomatis HANYA jika juri belum menyentuh
 * entri ini (belum disimpan & belum diedit). Dipakai agar panel penilaian langsung
 * terisi hasil sementara saat audit selesai, tanpa menimpa editan juri.
 * Personal tidak diisi (tetap 0 sampai juri menilai).
 */
export function seedUntouchedScore(score: ScoreDetail, audit: AuditResult | null): ScoreDetail {
  if (!audit || auditFailed(audit)) return score;
  if (score.judged || score.updatedAt) return score;

  const rubric = autoRubricFromAudit(audit);
  return {
    ...score,
    mvp: rubric.mvp,
    uiux: rubric.uiux,
    features: rubric.features,
    secXss: rubric.secXss,
    secAuth: rubric.secAuth,
    secData: rubric.secData,
    secHeaders: rubric.secHeaders,
    secLogic: rubric.secLogic,
  };
}
