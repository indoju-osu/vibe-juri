import { EXPECTED_SECURITY_HEADERS } from "@/lib/audit";
import { assertPublicUrl } from "@/lib/urlGuard";
import type { AuditResult } from "@/types";

/**
 * Audit HTML tanpa browser (fallback bawaan /api/audit).
 *
 * Mengukur metrik nyata dari respons HTTP + markup:
 * status, waktu muat, security headers, foto raster vs SVG, struktur UI,
 * jumlah elemen interaktif, indikator transaksi, teks dummy, dan viewport.
 *
 * Metrik yang hanya bisa diukur browser (console error, overflow 375px,
 * ukuran font hasil render) ditandai null dan membuat skor bertanda "partial".
 * Untuk metrik penuh, arahkan AUDIT_WORKER_URL ke worker Playwright.
 */

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 3;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 VibeJuriAudit/1.0";

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

const PLATFORM_ERRORS = [
  "DEPLOYMENT_NOT_FOUND",
  "404: NOT_FOUND",
  "Application failed to respond",
  "DEPLOYMENT_DISABLED",
  "This deployment is not available",
];

function decodeEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    hellip: "…",
    copy: "©",
    reg: "®",
  };
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function htmlToText(html: string): string {
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

function countMatches(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

function attrValue(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "").trim() : null;
}

function imageMetrics(html: string): { raster: number; svg: number } {
  let raster = 0;
  let svg = 0;

  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgTags) {
    const src = (attrValue(tag, "src") ?? "").toLowerCase();
    const srcset = (attrValue(tag, "srcset") ?? "").toLowerCase();
    const isVector =
      src.includes(".svg") ||
      src.startsWith("data:image/svg") ||
      srcset.includes(".svg") ||
      srcset.includes("data:image/svg");

    if (isVector) {
      svg += 1;
      continue;
    }
    if (!src && !srcset) continue;

    const width = Number.parseInt(attrValue(tag, "width") ?? "", 10);
    const height = Number.parseInt(attrValue(tag, "height") ?? "", 10);
    const tooSmall = (Number.isFinite(width) && width < 80) || (Number.isFinite(height) && height < 80);
    if (!tooSmall) raster += 1;
  }

  const bgUrls = html.match(/url\((['"]?)([^)'"]+)\1\)/gi) ?? [];
  for (const entry of bgUrls) {
    const value = entry.toLowerCase();
    if (value.includes(".svg") || value.includes("data:image/svg") || value.includes("data:image/gif")) {
      svg += 1;
    } else if (/\.(jpe?g|png|webp|avif)/.test(value)) {
      raster += 1;
    }
  }

  svg += countMatches(html, /<svg\b/gi);
  return { raster, svg };
}

/* --- Analisis bundle untuk situs client-rendered (SPA) ---------------------- */

const IMAGE_TOKEN_RE = /[\w@%./-]+\.(?:jpe?g|png|webp|avif|gif|svg)\b/gi;

interface BundleSignals {
  rasterRefs: number;
  svgRefs: number;
  mvpSignals: number;
  priceMentions: number;
  interactiveHints: number;
  inputHints: number;
  hasNav: boolean;
  hasFooter: boolean;
  hasSearch: boolean;
  copyLength: number;
  polishSignals: number;
}

/**
 * Deteksi shell client-rendered: HTML server hanya berisi mount point kosong
 * (<div id="root"></div>) plus bundle, sementara konten asli dirakit di browser.
 */
function looksClientRendered(html: string, text: string): boolean {
  if (text.length >= 1500) return false;
  const emptyMount =
    /id=["'](?:root|app|__next)["'][^>]*>\s*<\/(?:div|main|section)>/i.test(html);
  const hasMount = /<div[^>]+id=["'](?:root|app|__next)["']/i.test(html);
  const moduleScript = /<script\b[^>]+type=["']module["']/i.test(html);
  const hasBundle = /<script\b[^>]+\bsrc\b/i.test(html);
  if (emptyMount) return true;
  if (hasMount && hasBundle && text.length < 400) return true;
  if (moduleScript && hasBundle && text.length < 400) return true;
  return false;
}

function collectAssetUrls(html: string, base: URL): { scripts: string[]; styles: string[] } {
  const scripts: string[] = [];
  const styles: string[] = [];

  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    const src = attrValue(tag, "src");
    if (!src) continue;
    try {
      const resolved = new URL(src, base);
      if (resolved.origin === base.origin) scripts.push(resolved.toString());
    } catch {
      /* src tidak valid — abaikan */
    }
    if (scripts.length >= 4) break;
  }

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attrValue(tag, "rel") ?? "").toLowerCase();
    if (!rel.includes("stylesheet")) continue;
    const href = attrValue(tag, "href");
    if (!href) continue;
    try {
      const resolved = new URL(href, base);
      if (resolved.origin === base.origin) styles.push(resolved.toString());
    } catch {
      /* href tidak valid — abaikan */
    }
    if (styles.length >= 3) break;
  }

  return { scripts, styles };
}

async function fetchAssetText(url: string, limit: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
    });
    if (!response.ok) return "";
    return (await response.text()).slice(0, limit);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** Perkiraan panjang teks UI dari literal string di bundle. */
function estimateCopyLength(text: string): number {
  const literals = text.match(/["'`]([^"'`\\]{10,240})["'`]/g) ?? [];
  let total = 0;
  for (const raw of literals) {
    const inner = raw.slice(1, -1);
    if (!/\s/.test(inner)) continue;
    if (/^(?:https?:|\/|data:|#)|[<>{;]/.test(inner)) continue;
    const letters = (inner.match(/[A-Za-z]/g) ?? []).length;
    if (letters < 8) continue;
    total += inner.length;
    if (total >= 8000) return 8000;
  }
  return total;
}

function analyzeBundle(bundle: string, css: string): BundleSignals {
  const combined = `${bundle}\n${css}`;
  const lower = combined.toLowerCase();

  const raster = new Set<string>();
  const svg = new Set<string>();
  for (const token of combined.match(IMAGE_TOKEN_RE) ?? []) {
    const value = token.toLowerCase();
    if (value.includes(".svg")) svg.add(value);
    else raster.add(value);
  }

  const mvpSignals = MVP_KEYWORDS.filter((keyword) => lower.includes(keyword)).length;
  const priceMentions = (lower.match(/rp\.?\s?\d[\d.,]*/g) ?? []).length;

  const interactiveHints =
    countMatches(
      combined,
      /\bon(?:click|change|input|submit|focus|blur|keydown|mouseover|mouseenter|mousedown|pointerdown|touchstart)\b/gi,
    ) +
    countMatches(
      combined,
      /\b(?:keranjang|beli|pesan|tambah|checkout|cari|filter|kirim|simpan|masuk|daftar|whatsapp)\b/gi,
    );
  const inputHints = countMatches(combined, /\b(?:input|textarea|form|select)\b/gi);

  const hasNav = /beranda|navigasi|\bnavbar\b|\bmenu\b|\bnav\b|home/i.test(lower);
  const hasFooter = /footer|hak cipta|copyright|©/i.test(lower);
  const hasSearch = /search|cari|pencarian|filter/i.test(lower);

  const copyLength = estimateCopyLength(combined);
  const polishSignals =
    countMatches(
      combined,
      /\b(?:box-?shadow|border-?radius|transition|gradient|backdrop|hover:|rounded)\b/gi,
    ) +
    countMatches(css, /(?:box-shadow|border-radius|transition|gradient|@keyframes)\s*:/gi) * 2;

  return {
    rasterRefs: raster.size,
    svgRefs: svg.size,
    mvpSignals,
    priceMentions,
    interactiveHints,
    inputHints,
    hasNav,
    hasFooter,
    hasSearch,
    copyLength,
    polishSignals,
  };
}

function collectSecurityHeaders(headers: Headers): string[] {
  const present: string[] = [];
  for (const name of EXPECTED_SECURITY_HEADERS) {
    if (headers.get(name)) present.push(name);
  }
  for (const extra of [
    "permissions-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "x-xss-protection",
  ]) {
    if (headers.get(extra)) present.push(extra);
  }
  return Array.from(new Set(present));
}

/* --- Active security probes (dijalankan otomatis saat audit) ----------------- */

const PROBE_TIMEOUT_MS = 6_000;

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "Google API key", re: /AIza[0-9A-Za-z_\-]{35}/ },
  { name: "Stripe secret key", re: /sk_(?:live|test)_[0-9A-Za-z]{16,}/ },
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub token", re: /gh[pousr]_[0-9A-Za-z]{36,}/ },
  { name: "Slack token", re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: "Supabase service_role", re: /service_role/ },
  {
    name: "Kredensial hardcoded",
    re: /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i,
  },
];

const PROBE_PATHS = ["/admin", "/api/admin", "/api/users", "/api/config"] as const;

function looksLikeEnvFile(body: string): boolean {
  if (/<html/i.test(body.slice(0, 300))) return false;
  return /(?:^|\n)[A-Z][A-Z0-9_]{2,}\s*=/.test(body) && body.length < 20_000;
}

function looksLikeGitConfig(body: string): boolean {
  return /\[core\]|repositoryformatversion|\[remote\s/i.test(body);
}

type PathVerdict = "guarded" | "open" | "unknown";

async function fetchProbe(url: string, timeout = PROBE_TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/json,text/plain,*/*;q=0.8",
        "cache-control": "no-cache",
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function scanSecretExposure(origin: string): Promise<{
  files: string[];
  secrets: string[];
}> {
  const files: string[] = [];
  const secrets: string[] = [];

  const candidates: { path: string; detect: (body: string) => boolean }[] = [
    { path: "/.env", detect: looksLikeEnvFile },
    { path: "/.git/config", detect: looksLikeGitConfig },
  ];

  await Promise.allSettled(
    candidates.map(async ({ path, detect }) => {
      const response = await fetchProbe(`${origin}${path}`);
      if (!response || response.status !== 200) return;
      const body = (await response.text().catch(() => "")).slice(0, 40_000);
      if (detect(body)) files.push(path);
    }),
  );

  return { files, secrets };
}

function scanSecretsInText(text: string, found: Set<string>): void {
  for (const { name, re } of SECRET_PATTERNS) {
    if (found.has(name)) continue;
    if (re.test(text)) found.add(name);
  }
}

async function probeXssReflection(target: URL): Promise<{ reflected: boolean; probes: number }> {
  const marker = `vjPROBE${Math.random().toString(36).slice(2, 10)}`;
  const payload = `${marker}<vj>`;
  const probeUrl = new URL(target.toString());
  probeUrl.searchParams.set("__vibe_probe", payload);
  const response = await fetchProbe(probeUrl.toString());
  if (!response) return { reflected: false, probes: 0 };
  const body = (await response.text().catch(() => "")).slice(0, MAX_BYTES);
  return { reflected: body.includes(payload), probes: 1 };
}

async function probePath(
  origin: string,
  path: string,
  homeSignature: { title: string | null; length: number },
): Promise<PathVerdict> {
  const response = await fetchProbe(`${origin}${path}`);
  if (!response) return "unknown";
  const status = response.status;
  if (status === 401 || status === 403) return "guarded";
  if (status >= 300 && status < 400) return "guarded";
  if (status !== 200) return "unknown";

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const body = (await response.text().catch(() => "")).slice(0, 60_000);

  if (contentType.includes("json")) return "open";

  // SPA catch-all: halaman yang sama persis dengan beranda bukan rute terproteksi yang bocor.
  const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : null;
  if (
    contentType.includes("html") &&
    title !== null &&
    title === homeSignature.title &&
    Math.abs(body.length - homeSignature.length) < 300
  ) {
    return "unknown";
  }

  if (path.startsWith("/api/")) return "open";
  return "open";
}

/** Jalankan seluruh probe keamanan secara paralel (aman, hanya GET). */
async function runSecurityProbes(
  current: URL,
  html: string,
  homeSignature: { title: string | null; length: number },
): Promise<{
  exposedFiles: string[];
  exposedSecrets: string[];
  xssReflected: boolean;
  xssProbes: number;
  pathsProbed: number;
  pathsGuarded: number;
  pathsOpen: string[];
}> {
  const origin = current.origin;
  const foundSecrets = new Set<string>();

  const [exposure, xss, pathResults] = await Promise.all([
    scanSecretExposure(origin),
    probeXssReflection(current),
    Promise.allSettled(PROBE_PATHS.map((path) => probePath(origin, path, homeSignature))),
  ]);

  // Scan secret pada HTML utama plus hingga 2 bundle skrip same-origin.
  scanSecretsInText(html, foundSecrets);
  const scriptSources: string[] = [];
  const scriptTags = html.match(/<script\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi) ?? [];
  for (const tag of scriptTags) {
    const src = tag.match(/src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const value = src ? (src[1] ?? src[2] ?? src[3] ?? "") : "";
    if (!value) continue;
    try {
      const resolved = new URL(value, current);
      if (resolved.origin === origin) scriptSources.push(resolved.toString());
    } catch {
      // abaikan src yang tidak valid
    }
    if (scriptSources.length >= 2) break;
  }
  await Promise.allSettled(
    scriptSources.map(async (src) => {
      const response = await fetchProbe(src);
      if (!response || response.status !== 200) return;
      const body = (await response.text().catch(() => "")).slice(0, 500_000);
      scanSecretsInText(body, foundSecrets);
    }),
  );

  const exposedFiles = exposure.files;

  let pathsProbed = 0;
  let pathsGuarded = 0;
  const pathsOpen: string[] = [];
  pathResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    pathsProbed += 1;
    if (result.value === "guarded") pathsGuarded += 1;
    if (result.value === "open") pathsOpen.push(PROBE_PATHS[index]!);
  });

  return {
    exposedFiles,
    exposedSecrets: Array.from(foundSecrets),
    xssReflected: xss.probes > 0 ? xss.reflected : false,
    xssProbes: xss.probes,
    pathsProbed,
    pathsGuarded,
    pathsOpen,
  };
}

function failedAudit(url: string, message: string): AuditResult {
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
    source: "html",
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
    locked: null,
    platformError: null,
    error: message,
  };
}

export async function auditHtml(rawUrl: string): Promise<AuditResult> {
  const startedAt = Date.now();
  let current: URL;

  try {
    current = await assertPublicUrl(rawUrl);
  } catch (error) {
    return failedAudit(rawUrl, error instanceof Error ? error.message : "URL tidak valid");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let response: Response | null = null;
    let html = "";

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          "cache-control": "no-cache",
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) break;
        const next = new URL(location, current);
        try {
          await assertPublicUrl(next.toString());
        } catch (error) {
          return failedAudit(
            rawUrl,
            `Redirect ditolak: ${error instanceof Error ? error.message : "tujuan tidak aman"}`,
          );
        }
        current = next;
        continue;
      }

      html = (await response.text()).slice(0, MAX_BYTES);
      break;
    }

    if (!response) return failedAudit(rawUrl, "Tidak ada respons HTTP");

    const loadTimeSeconds = Math.round((Date.now() - startedAt) / 10) / 100;
    const statusCode = response.status;
    const contentType = response.headers.get("content-type") ?? "";
    const text = /html|xml|text/i.test(contentType) || html.includes("<html")
      ? htmlToText(html)
      : "";
    const textLower = text.toLowerCase();

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim() : null;

    const locked =
      (title !== null && /login/i.test(title) && /vercel/i.test(title)) ||
      textLower.includes("authentication required") ||
      textLower.includes("deployment is protected");

    const platformError = PLATFORM_ERRORS.some((needle) => text.includes(needle));

    const { raster, svg } = imageMetrics(html);

    // Situs client-rendered (SPA): konten asli ada di bundle, bukan HTML server.
    const clientRendered = looksClientRendered(html, text);
    let bundle: BundleSignals | null = null;
    if (clientRendered) {
      const { scripts, styles } = collectAssetUrls(html, current);
      const [scriptBodies, styleBodies] = await Promise.all([
        Promise.all(scripts.map((src) => fetchAssetText(src, 900_000))),
        Promise.all(styles.map((href) => fetchAssetText(href, 300_000))),
      ]);
      bundle = analyzeBundle(scriptBodies.join("\n"), styleBodies.join("\n"));
    }

    const mvpSignals = MVP_KEYWORDS.filter((keyword) => textLower.includes(keyword)).length;
    const priceMentions = (textLower.match(/rp\.?\s?\d[\d.,]*/g) ?? []).length;

    const interactiveCount =
      countMatches(html, /<button\b/gi) +
      countMatches(html, /<a\b/gi) +
      countMatches(html, /<input\b/gi) +
      countMatches(html, /<select\b/gi) +
      countMatches(html, /<textarea\b/gi) +
      countMatches(html, /<form\b/gi) +
      countMatches(html, /role=["']button["']/gi);

    const inputCount =
      countMatches(html, /<input\b/gi) +
      countMatches(html, /<select\b/gi) +
      countMatches(html, /<textarea\b/gi) +
      countMatches(html, /<form\b/gi);

    const hasNav =
      /<(nav|header|aside)\b/i.test(html) || /class=["'][^"']*\b(nav|navbar|sidebar|menu)\b/i.test(html);
    const hasFooter =
      /<footer\b/i.test(html) || /class=["'][^"']*\bfooter\b/i.test(html);
    const hasSearch =
      /<input[^>]+type=["']?search/i.test(html) ||
      /<input[^>]+type=["']?text/i.test(html) ||
      /<select\b/i.test(html);

    const polishTokens = countMatches(
      html,
      /\b(?:shadow(?:-[a-z]+)?|rounded(?:-[a-z]+)?|transition(?:-[a-z]+)?|backdrop-[a-z]+|hover:[a-z-]+)\b/gi,
    );
    const styleDeclarations = countMatches(html, /(?:box-shadow|border-radius|transition)\s*:/gi);
    const domPolishSignals = polishTokens + styleDeclarations * 2;
    const hasExternalStylesheet = /<link[^>]+rel\s*=\s*["']?stylesheet/i.test(html);

    const hasDummyText = DUMMY_PATTERNS.some((pattern) => textLower.includes(pattern));
    const hasViewportMeta = /<meta[^>]+name\s*=\s*["']?viewport["']?/i.test(html);

    // Gabungkan sinyal DOM dengan sinyal bundle (khusus SPA) agar penilaian adil:
    // situs client-rendered tetap dinilai dari foto, navigasi, dan fitur aslinya.
    const effRaster = bundle ? Math.max(raster, bundle.rasterRefs) : raster;
    const effSvg = bundle ? Math.max(svg, bundle.svgRefs) : svg;
    const effMvpSignals = bundle ? Math.max(mvpSignals, bundle.mvpSignals) : mvpSignals;
    const effPriceMentions = bundle ? Math.max(priceMentions, bundle.priceMentions) : priceMentions;
    const effInteractive = bundle
      ? Math.max(interactiveCount, bundle.interactiveHints)
      : interactiveCount;
    const effInputCount = bundle ? Math.max(inputCount, bundle.inputHints) : inputCount;
    const effTextLength = bundle ? Math.max(text.length, bundle.copyLength) : text.length;
    const effHasNav = hasNav || (bundle?.hasNav ?? false);
    const effHasFooter = hasFooter || (bundle?.hasFooter ?? false);
    const effHasSearch = hasSearch || (bundle?.hasSearch ?? false);
    const effPolishSignals = Math.max(domPolishSignals, bundle?.polishSignals ?? 0);
    const polishedCards =
      effPolishSignals > 0 ? Math.min(80, effPolishSignals) : hasExternalStylesheet ? null : 0;
    const typography: "Baik" | "Datar" =
      /<h1\b/i.test(html) && text.length > 200
        ? "Baik"
        : (bundle?.copyLength ?? 0) > 400
          ? "Baik"
          : "Datar";

    const httpsEnabled = current.protocol === "https:";

    // Probe keamanan aktif hanya jika halaman berhasil dimuat (bukan error/locked).
    const probes =
      statusCode < 400 && !locked && !platformError
        ? await runSecurityProbes(current, html, { title, length: html.length })
        : {
            exposedFiles: [] as string[],
            exposedSecrets: [] as string[],
            xssReflected: false,
            xssProbes: 0,
            pathsProbed: 0,
            pathsGuarded: 0,
            pathsOpen: [] as string[],
          };

    return {
      url: current.toString(),
      statusCode,
      loadTimeSeconds,
      rasterImages: effRaster,
      svgImages: effSvg,
      responsive: null,
      securityHeaders: collectSecurityHeaders(response.headers),
      consoleErrors: null,
      testedAt: new Date().toISOString(),
      source: "html",
      title,
      textLength: effTextLength,
      mvpSignals: effMvpSignals,
      priceMentions: effPriceMentions,
      interactiveCount: effInteractive,
      inputCount: effInputCount,
      polishedCards,
      hasNav: effHasNav,
      hasFooter: effHasFooter,
      hasSearch: effHasSearch,
      hasViewportMeta,
      typography,
      hasDummyText,
      clientRendered,
      httpsEnabled,
      exposedFiles: probes.exposedFiles,
      exposedSecrets: probes.exposedSecrets,
      xssReflected: probes.xssProbes > 0 ? probes.xssReflected : null,
      xssProbes: probes.xssProbes,
      pathsProbed: probes.pathsProbed,
      pathsGuarded: probes.pathsGuarded,
      pathsOpen: probes.pathsOpen,
      clientAuthProtected: null,
      searchWorks: null,
      negativeQtyRejected: null,
      stockGuardDetected: null,
      locked,
      platformError,
      error: null,
    };
  } catch (error) {
    const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    const message = aborted
      ? `Timeout ${Math.round(TIMEOUT_MS / 1000)} detik`
      : error instanceof Error
        ? error.message.slice(0, 120)
        : "Gagal mengakses halaman";
    return failedAudit(rawUrl, message);
  } finally {
    clearTimeout(timer);
  }
}
