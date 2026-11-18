import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Guard SSRF sederhana untuk audit server-side.
 * Menolak localhost, IP privat, link-local, dan metadata cloud.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "169.254.169.254",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::1" || value === "::" || value === "0:0:0:0:0:0:0:1") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true; // unique local fc00::/7
  if (value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isPrivateIPv4(mapped);
  }
  return false;
}

/** Validasi URL yang boleh diaudit. Melempar Error dengan pesan siap tampil. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("URL tidak valid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Hanya URL http/https yang dapat diaudit.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL dengan kredensial tidak diizinkan.");
  }
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    throw new Error("Hanya port 80/443 yang diizinkan untuk audit.");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new Error("Hostname kosong.");
  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new Error("Host internal/localhost tidak boleh diaudit.");
  }

  const literal = isIP(host);
  if (literal === 4) {
    if (isPrivateIPv4(host)) throw new Error("Alamat IP privat tidak boleh diaudit.");
    return parsed;
  }
  if (literal === 6) {
    if (isPrivateIPv6(host)) throw new Error("Alamat IPv6 privat tidak boleh diaudit.");
    return parsed;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    // Retry sekali: kegagalan DNS sesaat kerap terjadi saat audit massal paralel.
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      addresses = await lookup(host, { all: true, verbatim: true });
    } catch {
      throw new Error("Domain tidak dapat di-resolve (DNS gagal).");
    }
  }
  if (addresses.length === 0) throw new Error("Domain tidak memiliki alamat IP.");
  for (const { address } of addresses) {
    const family = isIP(address);
    if (family === 4 && isPrivateIPv4(address)) {
      throw new Error("Domain mengarah ke alamat IP privat.");
    }
    if (family === 6 && isPrivateIPv6(address)) {
      throw new Error("Domain mengarah ke alamat IPv6 privat.");
    }
  }

  return parsed;
}
