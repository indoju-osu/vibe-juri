import type { ScoreDetail, ScoreField } from "@/types";

export interface ScoreFieldConfig {
  field: ScoreField;
  label: string;
  short: string;
  max: number;
  pillar: "product" | "security" | "personal";
  helper: string;
  payload?: string;
  payloadLabel?: string;
}

export const PRODUCT_FIELDS: ScoreFieldConfig[] = [
  {
    field: "mvp",
    label: "1. Kesiapan Produk & MVP",
    short: "MVP",
    max: 25,
    pillar: "product",
    helper:
      "Kelengkapan produk nyata, foto raster asli (bukan SVG/dummy), dan alur transaksi end-to-end.",
    payloadLabel: "Cek foto dummy",
    payload: "Klik kanan gambar → Open image in new tab → cek apakah file raster (.jpg/.png/.webp) atau SVG placeholder.",
  },
  {
    field: "uiux",
    label: "2. Kualitas UI/UX & Estetika",
    short: "UI/UX",
    max: 20,
    pillar: "product",
    helper:
      "Tipografi, hierarki visual, konsistensi tata letak, serta responsivitas di viewport mobile.",
    payloadLabel: "Uji viewport mobile",
    payload: "DevTools (F12) → Toggle device toolbar (Ctrl/Cmd + Shift + M) → coba 375×667 dan 768×1024.",
  },
  {
    field: "features",
    label: "3. Fitur, Interaktivitas & Performa",
    short: "Fitur",
    max: 15,
    pillar: "product",
    helper:
      "Pencarian, filter, keranjang bekerja; waktu muat wajar; tidak ada JS error di console.",
    payloadLabel: "Cek console",
    payload: "DevTools (F12) → tab Console → reload halaman → pastikan tidak ada error merah.",
  },
];

export const SECURITY_FIELDS: ScoreFieldConfig[] = [
  {
    field: "secXss",
    label: "4.1. Sanitasi Input & Proteksi XSS/Injection",
    short: "XSS",
    max: 5,
    pillar: "security",
    helper:
      "Input form/pencarian tidak mengeksekusi HTML/JS. Coba tempel payload di kolom input lalu submit.",
    payload: '"><img src=x onerror=alert(1)>',
    payloadLabel: "Copy payload XSS",
  },
  {
    field: "secAuth",
    label: "4.2. Autentikasi & Kontrol Akses Rute",
    short: "Auth",
    max: 5,
    pillar: "security",
    helper:
      "Halaman terproteksi seperti /admin tidak bisa dibuka langsung lewat URL tanpa sesi/login valid.",
    payload: "/admin",
    payloadLabel: "Copy rute /admin",
  },
  {
    field: "secData",
    label: "4.3. Proteksi Data Sensitif & Konfigurasi",
    short: "Data",
    max: 5,
    pillar: "security",
    helper:
      "Tidak ada API key, kredensial, token, atau informasi internal yang bocor di bundle client/console.",
    payload: "DevTools → Sources → cari: api_key, secret, token, password, service_role",
    payloadLabel: "Copy kata kunci",
  },
  {
    field: "secHeaders",
    label: "4.4. Security Headers & HTTPS Enforcement",
    short: "Headers",
    max: 5,
    pillar: "security",
    helper:
      "HTTPS aktif dan header keamanan dasar terpasang (CSP, X-Content-Type-Options, X-Frame-Options, dll).",
    payload: "curl -sI https://TARGET-URL | grep -iE 'content-security-policy|x-content-type-options|x-frame-options|strict-transport-security|referrer-policy'",
    payloadLabel: "Copy cek headers",
  },
  {
    field: "secLogic",
    label: "4.5. Validasi Logika Bisnis & Client-Side Tampering",
    short: "Logika",
    max: 5,
    pillar: "security",
    helper:
      "Form/keranjang menolak angka negatif, jumlah melebihi stok, atau manipulasi parameter harga.",
    payload: "-1",
    payloadLabel: "Copy payload -1",
  },
];

export const PERSONAL_FIELDS: ScoreFieldConfig[] = [
  {
    field: "personal",
    label: "5. Creativity / X-Factor",
    short: "Creativity",
    max: 15,
    pillar: "personal",
    helper:
      "Orisinalitas ide, kreativitas vibe, ketelitian eksekusi, dan nilai manfaat solusi menurut penilaian profesional juri.",
  },
];

export const ALL_FIELDS: ScoreFieldConfig[] = [
  ...PRODUCT_FIELDS,
  ...SECURITY_FIELDS,
  ...PERSONAL_FIELDS,
];

export const FIELD_BY_KEY: Record<ScoreField, ScoreFieldConfig> = ALL_FIELDS.reduce(
  (acc, field) => {
    acc[field.field] = field;
    return acc;
  },
  {} as Record<ScoreField, ScoreFieldConfig>,
);

export const MAX_PRODUCT = 60;
export const MAX_SECURITY = 25;
export const MAX_PERSONAL = 15;
export const MAX_TOTAL = 100;

export function emptyScore(): ScoreDetail {
  return {
    mvp: 0,
    uiux: 0,
    features: 0,
    secXss: 0,
    secAuth: 0,
    secData: 0,
    secHeaders: 0,
    secLogic: 0,
    personal: 8,
    notes: "",
    updatedAt: null,
    judged: false,
  };
}

export function clampField(field: ScoreField, value: number): number {
  const config = FIELD_BY_KEY[field];
  if (!config || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(config.max, Math.round(value * 2) / 2));
}

export function productSubtotal(score: ScoreDetail): number {
  return score.mvp + score.uiux + score.features;
}

export function securitySubtotal(score: ScoreDetail): number {
  return score.secXss + score.secAuth + score.secData + score.secHeaders + score.secLogic;
}

export function totalScore(score: ScoreDetail): number {
  return productSubtotal(score) + securitySubtotal(score) + score.personal;
}

export function isJudged(judged: boolean): boolean {
  return judged;
}
