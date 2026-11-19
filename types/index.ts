export type ScoreField =
  | "mvp"
  | "uiux"
  | "features"
  | "secXss"
  | "secAuth"
  | "secData"
  | "secHeaders"
  | "secLogic"
  | "personal";

export interface ScoreDetail {
  mvp: number;
  uiux: number;
  features: number;
  secXss: number;
  secAuth: number;
  secData: number;
  secHeaders: number;
  secLogic: number;
  personal: number;
  notes: string;
  updatedAt: string | null;
  judged: boolean;
}

export type AuditSource = "worker" | "manual" | "html";

export interface AuditResult {
  url: string;
  statusCode: number | null;
  loadTimeSeconds: number | null;
  rasterImages: number | null;
  svgImages: number | null;
  responsive: boolean | null;
  securityHeaders: string[];
  consoleErrors: number | null;
  testedAt: string;
  source: AuditSource;

  /* --- Extended metrics used by the automatic pre-score --- */
  title: string | null;
  textLength: number | null;
  mvpSignals: number | null;
  priceMentions: number | null;
  interactiveCount: number | null;
  inputCount: number | null;
  polishedCards: number | null;
  hasNav: boolean | null;
  hasFooter: boolean | null;
  hasSearch: boolean | null;
  hasViewportMeta: boolean | null;
  typography: "Baik" | "Datar" | null;
  hasDummyText: boolean | null;

  /**
   * True bila halaman adalah shell client-rendered (SPA) — konten sesungguhnya
   * baru muncul di browser. Metrik pelengkap diambil dari bundle JS/CSS.
   */
  clientRendered: boolean | null;

  /* --- Security probe metrics (bagian dari audit otomatis penuh) --- */
  httpsEnabled: boolean | null;
  exposedFiles: string[] | null;
  exposedSecrets: string[] | null;
  xssReflected: boolean | null;
  xssProbes: number | null;
  pathsProbed: number | null;
  pathsGuarded: number | null;
  pathsOpen: string[] | null;
  clientAuthProtected: boolean | null;

  /* --- Interactive / functional heuristic probes (worker only) --- */
  searchWorks: boolean | null;
  negativeQtyRejected: boolean | null;
  stockGuardDetected: boolean | null;
  screenshotDataUrl: string | null;

  locked: boolean | null;
  platformError: boolean | null;
  error: string | null;
}

/** Total 0–100 mengikuti rubrik audit otomatis (MVP 35 · UI/UX 30 · Fitur 20 · Performa 15). */
export interface AutoScore {
  total: number;
  mvp: number;
  uiux: number;
  features: number;
  performance: number;
  notes: string[];
  partial: boolean;
}

/** Skor otomatis 5 komponen Security (masing-masing 0–5, total 0–25). */
export interface AutoSecurity {
  xss: number;
  auth: number;
  data: number;
  headers: number;
  logic: number;
  total: number;
  notes: string[];
  partial: boolean;
}

/**
 * Pemetaan skor otomatis ke komponen rubrik resmi (untuk adopsi nilai awal).
 * product (0–60) + security (0–25) + personal (0). Personal sengaja 0:
 * baru ditambahkan ke perhitungan setelah juri mengisinya.
 */
export interface AutoRubric {
  mvp: number;
  uiux: number;
  features: number;
  secXss: number;
  secAuth: number;
  secData: number;
  secHeaders: number;
  secLogic: number;
  product: number;
  security: number;
  personal: number;
  total: number;
}

export interface JudgeEntry {
  id: string;
  url: string;
  key: string;
  audit: AuditResult | null;
  score: ScoreDetail;
}

export type ValueSource = "auto" | "judge" | "none";

export type IgnoreCategory = "Tidak Valid / Repo Git" | "Duplikat (Diabaikan)";

export interface IgnoredEntry {
  id: string;
  url: string;
  category: IgnoreCategory;
  detail: string;
}

export interface SessionState {
  version: 1;
  createdAt: string;
  updatedAt: string;
  activeIndex: number;
  entries: JudgeEntry[];
  ignored: IgnoredEntry[];
}

export interface CleanedUrl {
  raw: string;
  url: string;
  key: string;
}
