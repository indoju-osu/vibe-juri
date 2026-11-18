import { makeId } from "@/lib/id";
import type { CleanedUrl, IgnoredEntry, IgnoreCategory } from "@/types";

export interface CleanSuccess {
  raw: string;
  url: string;
  key: string;
}

export interface CleanFailure {
  category: IgnoreCategory;
  detail: string;
}

export type CleanResult =
  | { ok: true; value: CleanSuccess }
  | { ok: false; error: CleanFailure };

export interface BatchCleanResult {
  valid: CleanedUrl[];
  ignored: IgnoredEntry[];
  totalInput: number;
}

const INVALID: IgnoreCategory = "Tidak Valid / Repo Git";
const DUPLICATE: IgnoreCategory = "Duplikat (Diabaikan)";

const BLOCKED_SCHEMES = [
  "javascript:",
  "data:",
  "file:",
  "ftp:",
  "vbscript:",
  "mailto:",
  "tel:",
  "blob:",
  "about:",
];

const BLOCKED_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "gist.github.com",
  "api.github.com",
  "raw.githubusercontent.com",
]);

function fail(detail: string): CleanResult {
  return { ok: false, error: { category: INVALID, detail } };
}

/** Trim, remove zero-width chars and surrounding quotes/brackets. */
export function stripEntry(raw: string): string {
  let value = raw.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();

  for (let i = 0; i < 4; i += 1) {
    const next = value
      .replace(/^[\s"'`“”‘’<([{]+/, "")
      .replace(/[\s"'`“”‘’>)\]}]+$/, "")
      .replace(/[,;]+$/, "")
      .trim();
    if (next === value) break;
    value = next;
  }

  return value;
}

/**
 * Cleans a single pasted value and validates it.
 *
 * Rules:
 * - trims whitespace / quotes
 * - rejects pure numbers, .git links, and GitHub repository links
 * - normalizes a missing protocol to https://
 * - lowercases the dedupe key and removes trailing slashes
 */
export function cleanUrl(raw: string): CleanResult {
  const input = stripEntry(raw);
  if (!input) return fail("Entri kosong");
  if (input.length > 2048) return fail("URL melebihi 2048 karakter");
  if (/^[+-]?\d+(?:[.,]\d+)?$/.test(input)) {
    return fail("Entri hanya berisi angka, bukan URL");
  }
  if (/\s/.test(input)) return fail("URL mengandung spasi internal");

  const lower = input.toLowerCase();
  if (BLOCKED_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    const scheme = lower.split(":")[0];
    return fail(`Protokol "${scheme}:" tidak diizinkan`);
  }

  let withProtocol = input;
  if (withProtocol.startsWith("//")) {
    withProtocol = `https:${withProtocol}`;
  } else if (!/^https?:\/\//i.test(withProtocol)) {
    withProtocol = `https://${withProtocol}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return fail("Format URL tidak dapat diparse");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return fail(`Protokol "${parsed.protocol}" tidak diizinkan`);
  }
  if (parsed.username || parsed.password) {
    return fail("URL memuat kredensial (user/password)");
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) return fail("Hostname kosong");

  const isLocalhost = host === "localhost" || host.endsWith(".localhost");
  const isIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  const hasValidDomain =
    host.includes(".") &&
    !host.endsWith(".") &&
    !host.startsWith(".") &&
    /^[a-z0-9.-]+$/.test(host) &&
    host.split(".").pop()!.length >= 2;

  if (!isLocalhost && !isIp && !hasValidDomain) {
    return fail("Hostname tidak lengkap (domain tanpa TLD)");
  }
  if (isIp) return fail("Alamat IP langsung tidak diizinkan");

  if (BLOCKED_HOSTS.has(host) || host.endsWith(".github.com")) {
    return fail("Tautan repositori GitHub, bukan URL aplikasi live");
  }

  const pathLower = parsed.pathname.toLowerCase().replace(/\/+$/, "");
  if (pathLower.endsWith(".git") || lower.replace(/\/+$/, "").endsWith(".git")) {
    return fail("Tautan repository .git tidak diizinkan");
  }

  if (parsed.port === "80" && parsed.protocol === "http:") parsed.port = "";
  if (parsed.port === "443" && parsed.protocol === "https:") parsed.port = "";

  let url = parsed.toString();
  url = url.replace(/\/+$/, "");
  if (!url || url === "https:") return fail("URL tidak valid");

  const key = url.toLowerCase().replace(/\/+$/, "");

  return { ok: true, value: { raw, url, key } };
}

/** Cleans a batch, splitting out duplicates and invalid entries. */
export function cleanBatch(inputs: string[]): BatchCleanResult {
  const seen = new Map<string, string>();
  const valid: CleanedUrl[] = [];
  const ignored: IgnoredEntry[] = [];
  let totalInput = 0;

  for (const raw of inputs) {
    if (!raw || !raw.trim()) continue;
    totalInput += 1;

    const result = cleanUrl(raw);
    if (!result.ok) {
      ignored.push({
        id: makeId("bad"),
        url: raw.trim(),
        category: result.error.category,
        detail: result.error.detail,
      });
      continue;
    }

    const { url, key } = result.value;
    const existing = seen.get(key);
    if (existing) {
      ignored.push({
        id: makeId("dup"),
        url: result.value.raw.trim() || url,
        category: DUPLICATE,
        detail: `Duplikat dari ${existing}`,
      });
      continue;
    }

    seen.set(key, url);
    valid.push({ raw: result.value.raw, url, key });
  }

  return { valid, ignored, totalInput };
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
