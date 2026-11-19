import type { AuditResult, AuditSource } from "@/types";

export const EXPECTED_SECURITY_HEADERS = [
  "content-security-policy",
  "x-content-type-options",
  "x-frame-options",
  "strict-transport-security",
  "referrer-policy",
] as const;

type UnknownRecord = Record<string, unknown>;

function pick(source: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toIntOrNull(value: unknown): number | null {
  const parsed = toNumberOrNull(value);
  return parsed === null ? null : Math.max(0, Math.round(parsed));
}

function toBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "ya", "1", "responsive"].includes(normalized)) return true;
    if (["false", "no", "tidak", "0", "fixed"].includes(normalized)) return false;
  }
  return null;
}

function normalizeHeaders(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((item) => String(item).trim()).filter((item) => item.length > 0)),
    );
  }
  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(/[,;\n]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    );
  }
  if (typeof value === "object") {
    return Object.keys(value as UnknownRecord);
  }
  return [];
}

function toTextOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 400) : null;
}

function toDataUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:image/")) return null;
  return trimmed.slice(0, 1_500_000);
}

/** Normalize a list of short strings (path/secret names) => string[] | null. */
function normalizeStringList(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((item) => String(item).trim()).filter((item) => item.length > 0)),
    );
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return Array.from(
      new Set(
        trimmed
          .split(/[,;\n]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    );
  }
  return null;
}

function normalizeTypography(value: unknown): "Baik" | "Datar" | null {
  if (typeof value === "boolean") return value ? "Baik" : "Datar";
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["baik", "good", "true", "ya", "yes"].includes(normalized)) return "Baik";
    if (["datar", "flat", "false", "tidak", "no", "kurang"].includes(normalized)) return "Datar";
  }
  return null;
}

/** Normalize worker / manually-pasted audit JSON into a stable shape. */
export function normalizeAudit(
  input: unknown,
  fallbackUrl: string,
  source: AuditSource = "manual",
): AuditResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Data audit harus berupa objek JSON");
  }

  const raw = input as UnknownRecord;
  const nested =
    raw.audit && typeof raw.audit === "object" && !Array.isArray(raw.audit)
      ? (raw.audit as UnknownRecord)
      : raw;
  const record =
    raw.result && typeof raw.result === "object" && !Array.isArray(raw.result)
      ? (raw.result as UnknownRecord)
      : nested;

  const rawLoadTime = toNumberOrNull(
    pick(record, ["loadTimeSeconds", "load_time_seconds", "loadTime", "load_time", "performance"]),
  );
  const loadTimeSeconds =
    rawLoadTime === null ? null : rawLoadTime > 60 ? Math.round((rawLoadTime / 1000) * 100) / 100 : Math.round(rawLoadTime * 100) / 100;

  const testedAtRaw = pick(record, ["testedAt", "tested_at", "auditedAt", "timestamp"]);
  const testedAt =
    typeof testedAtRaw === "string" && !Number.isNaN(Date.parse(testedAtRaw))
      ? new Date(testedAtRaw).toISOString()
      : new Date().toISOString();

  const urlRaw = pick(record, ["url"]);
  const sourceRaw = record.source;
  const normalizedSource: AuditSource =
    sourceRaw === "worker" ? "worker" : sourceRaw === "html" ? "html" : source;

  return {
    url: typeof urlRaw === "string" && urlRaw ? urlRaw : fallbackUrl,
    statusCode: toIntOrNull(pick(record, ["statusCode", "status_code", "status", "httpStatus"])),
    loadTimeSeconds,
    rasterImages: toIntOrNull(
      pick(record, [
        "rasterImages",
        "raster_images",
        "rasterCount",
        "realRasterPhotos",
        "real_raster_photos",
        "fotoRaster",
        "foto_raster",
        "Foto Raster Asli",
        "images",
      ]),
    ),
    svgImages: toIntOrNull(
      pick(record, [
        "svgImages",
        "svg_images",
        "svgCount",
        "svgIllustrations",
        "svg_illustrations",
        "Ilustrasi SVG/Vektor",
        "svgs",
      ]),
    ),
    responsive: toBooleanOrNull(
      pick(record, [
        "responsive",
        "mobileResponsive",
        "mobile_responsive",
        "isResponsive",
        "mobileFit",
        "mobile_fit",
        "responsifMobile",
        "Responsif Mobile",
      ]),
    ),
    securityHeaders: normalizeHeaders(
      pick(record, ["securityHeaders", "security_headers", "headers"]),
    ),
    consoleErrors: toIntOrNull(
      pick(record, [
        "consoleErrors",
        "console_errors",
        "jsErrors",
        "js_errors",
        "errors",
        "errorJs",
        "Error JS Konsol",
      ]),
    ),
    testedAt,
    source: normalizedSource,
    title: toTextOrNull(pick(record, ["title", "judul", "pageTitle", "page_title", "Judul Halaman"])),
    textLength: toIntOrNull(
      pick(record, ["textLength", "text_length", "bodyTextLength", "copyLength"]),
    ),
    mvpSignals: toIntOrNull(
      pick(record, [
        "mvpSignals",
        "mvp_signals",
        "mvpSignalCount",
        "indikatorTransaksi",
        "Indikator Transaksi/MVP",
      ]),
    ),
    priceMentions: toIntOrNull(
      pick(record, ["priceMentions", "price_mentions", "priceCount", "hargaCount"]),
    ),
    interactiveCount: toIntOrNull(
      pick(record, [
        "interactiveCount",
        "interactive_count",
        "interactiveElements",
        "elemenInteraktif",
        "Elemen Interaktif",
      ]),
    ),
    inputCount: toIntOrNull(pick(record, ["inputCount", "input_count", "inputs"])),
    polishedCards: toIntOrNull(pick(record, ["polishedCards", "polished_cards", "polished"])),
    hasNav: toBooleanOrNull(pick(record, ["hasNav", "has_nav", "hasNavigation"])),
    hasFooter: toBooleanOrNull(pick(record, ["hasFooter", "has_footer"])),
    hasSearch: toBooleanOrNull(
      pick(record, ["hasSearch", "has_search", "hasSearchOrFilter", "has_search_or_filter"]),
    ),
    hasViewportMeta: toBooleanOrNull(
      pick(record, ["hasViewportMeta", "has_viewport_meta", "viewportMeta"]),
    ),
    typography: normalizeTypography(
      pick(record, [
        "typography",
        "typographyHierarchy",
        "hasGoodTypography",
        "hierarkiTipografi",
        "Hierarki Tipografi",
      ]),
    ),
    hasDummyText: toBooleanOrNull(
      pick(record, ["hasDummyText", "has_dummy_text", "dummyText"]),
    ),
    clientRendered: toBooleanOrNull(
      pick(record, ["clientRendered", "client_rendered", "isSpa", "is_spa", "spa"]),
    ),
    httpsEnabled: toBooleanOrNull(
      pick(record, ["httpsEnabled", "https_enabled", "isHttps", "is_https", "https"]),
    ),
    exposedFiles: normalizeStringList(
      pick(record, ["exposedFiles", "exposed_files", "exposedPaths", "exposed_paths"]),
    ),
    exposedSecrets: normalizeStringList(
      pick(record, ["exposedSecrets", "exposed_secrets", "secretMatches", "secret_matches"]),
    ),
    xssReflected: toBooleanOrNull(
      pick(record, ["xssReflected", "xss_reflected", "reflectedXss", "reflected_xss"]),
    ),
    xssProbes: toIntOrNull(pick(record, ["xssProbes", "xss_probes", "xssProbeCount"])),
    pathsProbed: toIntOrNull(pick(record, ["pathsProbed", "paths_probed", "probedPaths"])),
    pathsGuarded: toIntOrNull(pick(record, ["pathsGuarded", "paths_guarded", "guardedPaths"])),
    pathsOpen: normalizeStringList(pick(record, ["pathsOpen", "paths_open", "openPaths"])),
    clientAuthProtected: toBooleanOrNull(
      pick(record, ["clientAuthProtected", "client_auth_protected"]),
    ),
    searchWorks: toBooleanOrNull(pick(record, ["searchWorks", "search_works"])),
    negativeQtyRejected: toBooleanOrNull(
      pick(record, ["negativeQtyRejected", "negative_qty_rejected"]),
    ),
    stockGuardDetected: toBooleanOrNull(
      pick(record, ["stockGuardDetected", "stock_guard_detected"]),
    ),
    screenshotDataUrl: toDataUrlOrNull(
      pick(record, ["screenshotDataUrl", "screenshot_data_url", "screenshot"]),
    ),
    locked: toBooleanOrNull(pick(record, ["locked", "isLocked", "requiresLogin"])),
    platformError: toBooleanOrNull(
      pick(record, ["platformError", "platform_error", "deploymentError"]),
    ),
    error: toTextOrNull(pick(record, ["error", "failure", "errorMessage"])),
  };
}

function headerName(header: string): string {
  return header.split(":")[0]!.trim().toLowerCase();
}

export function matchedSecurityHeaders(audit: AuditResult): string[] {
  const present = new Set(audit.securityHeaders.map(headerName));
  return EXPECTED_SECURITY_HEADERS.filter((header) => present.has(header));
}

/** Deterministic header score (0–5) based on the 5 expected headers. */
export function suggestedHeaderScore(audit: AuditResult): number {
  return Math.min(5, matchedSecurityHeaders(audit).length);
}

export function auditSummaryLine(audit: AuditResult): string {
  const status = audit.statusCode ?? "?";
  const load = audit.loadTimeSeconds !== null ? `${audit.loadTimeSeconds}s` : "?";
  const errors = audit.consoleErrors ?? "?";
  return `HTTP ${status} · ${load} · ${errors} error JS`;
}

/** Audit gagal (timeout / HTTP error) tetap disimpan agar nilai sementara = 0. */
export function createFailedAudit(
  url: string,
  message: string,
  source: AuditSource = "manual",
): AuditResult {
  return {
    url,
    statusCode: null,
    loadTimeSeconds: null,
    rasterImages: null,
    svgImages: null,
    responsive: null,
    securityHeaders: [],
    consoleErrors: null,
    testedAt: new Date().toISOString(),
    source,
    title: null,
    textLength: null,
    mvpSignals: null,
    priceMentions: null,
    interactiveCount: null,
    inputCount: null,
    polishedCards: null,
    hasNav: null,
    hasFooter: null,
    hasSearch: null,
    hasViewportMeta: null,
    typography: null,
    hasDummyText: null,
    clientRendered: null,
    httpsEnabled: null,
    exposedFiles: null,
    exposedSecrets: null,
    xssReflected: null,
    xssProbes: null,
    pathsProbed: null,
    pathsGuarded: null,
    pathsOpen: null,
    clientAuthProtected: null,
    searchWorks: null,
    negativeQtyRejected: null,
    stockGuardDetected: null,
    screenshotDataUrl: null,
    locked: null,
    platformError: null,
    error: message,
  };
}
