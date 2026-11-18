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
  source: "worker" | "manual";
}

export interface JudgeEntry {
  id: string;
  url: string;
  key: string;
  audit: AuditResult | null;
  score: ScoreDetail;
}

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
