import type { AuditResult } from "@/types";

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

/** Normalize worker / manually-pasted audit JSON into a stable shape. */
export function normalizeAudit(
  input: unknown,
  fallbackUrl: string,
  source: "worker" | "manual" = "manual",
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
  const responsiveRaw = pick(record, [
    "responsive",
    "mobileResponsive",
    "mobile_responsive",
    "isResponsive",
  ]);

  return {
    url: typeof urlRaw === "string" && urlRaw ? urlRaw : fallbackUrl,
    statusCode: toIntOrNull(pick(record, ["statusCode", "status_code", "status", "httpStatus"])),
    loadTimeSeconds,
    rasterImages: toIntOrNull(
      pick(record, ["rasterImages", "raster_images", "rasterCount", "images"]),
    ),
    svgImages: toIntOrNull(pick(record, ["svgImages", "svg_images", "svgCount", "svgs"])),
    responsive: toBooleanOrNull(responsiveRaw),
    securityHeaders: normalizeHeaders(
      pick(record, ["securityHeaders", "security_headers", "headers"]),
    ),
    consoleErrors: toIntOrNull(
      pick(record, ["consoleErrors", "console_errors", "jsErrors", "js_errors", "errors"]),
    ),
    testedAt,
    source: record.source === "worker" ? "worker" : source,
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
