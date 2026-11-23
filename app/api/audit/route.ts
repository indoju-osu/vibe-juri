import { NextResponse } from "next/server";
import { normalizeAudit } from "@/lib/audit";
import { auditHtml } from "@/lib/htmlAudit";
import { assertPublicUrl } from "@/lib/urlGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const WORKER_TIMEOUT_MS = 40_000;

const EXPECTED_CONTRACT = {
  request: { url: "https://karya-peserta.vercel.app" },
  response: {
    ok: true,
    audit: {
      url: "https://karya-peserta.vercel.app",
      statusCode: 200,
      loadTimeSeconds: 1.42,
      rasterImages: 12,
      svgImages: 3,
      responsive: true,
      securityHeaders: ["content-security-policy", "x-content-type-options"],
      consoleErrors: 0,
      textLength: 3200,
      mvpSignals: 7,
      priceMentions: 5,
      interactiveCount: 48,
      inputCount: 4,
      polishedCards: 26,
      hasNav: true,
      hasFooter: true,
      hasSearch: true,
      hasViewportMeta: true,
      typography: "Baik",
      hasDummyText: false,
      clientRendered: false,
      httpsEnabled: true,
      exposedFiles: [],
      exposedSecrets: [],
      xssReflected: false,
      xssProbes: 1,
      pathsProbed: 4,
      pathsGuarded: 4,
      pathsOpen: [],
      testedAt: "2026-11-18T10:00:00.000Z",
    },
  },
};

export async function GET() {
  const configured = Boolean(process.env.AUDIT_WORKER_URL);
  return NextResponse.json(
    {
      ok: false,
      configured,
      mode: configured ? "worker" : "html",
      message: configured
        ? "Gunakan POST { url } untuk menjalankan audit via worker Playwright."
        : "Tanpa AUDIT_WORKER_URL, /api/audit memakai auditor HTML bawaan (tanpa browser).",
      expected: EXPECTED_CONTRACT,
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Body harus berupa JSON { url: string }.");
  }

  const rawUrl =
    payload && typeof payload === "object" && typeof (payload as { url?: unknown }).url === "string"
      ? (payload as { url: string }).url.trim()
      : "";

  if (!rawUrl) return badRequest("Field url wajib diisi.");

  let parsed: URL;
  try {
    parsed = await assertPublicUrl(rawUrl);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "URL tidak valid.");
  }

  const workerUrl = process.env.AUDIT_WORKER_URL;

  /* --- Mode bawaan: auditor HTML server-side (tanpa browser) ------------------ */
  if (!workerUrl) {
    const audit = await auditHtml(parsed.toString());
    return NextResponse.json({
      ok: true,
      mode: "html",
      audit,
      message: audit.error ?? undefined,
    });
  }

  /* --- Mode worker: proxy ke Playwright/FastAPI ------------------------------- */
  let workerEndpoint: URL;
  try {
    workerEndpoint = new URL(workerUrl);
  } catch {
    return badRequest("AUDIT_WORKER_URL bukan URL yang valid.", 500);
  }
  if (workerEndpoint.protocol !== "http:" && workerEndpoint.protocol !== "https:") {
    return badRequest("AUDIT_WORKER_URL harus menggunakan http/https.", 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  try {
    const upstream = await fetch(workerEndpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: parsed.toString() }),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await upstream.text();
    let data: unknown = null;
    try {
      data = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      return badRequest("Worker audit mengembalikan respons non-JSON.", 502);
    }

    if (!upstream.ok) {
      const message =
        data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string"
          ? (data as { message: string }).message
          : `Worker audit mengembalikan HTTP ${upstream.status}.`;
      return badRequest(message, 502);
    }

    const audit = normalizeAudit(data, parsed.toString(), "worker");
    return NextResponse.json({ ok: true, mode: "worker", audit });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return badRequest("Audit timeout setelah 40 detik. Coba lagi atau impor JSON manual.", 504);
    }
    if (error instanceof Error && error.message.includes("audit")) {
      return badRequest(error.message, 502);
    }
    return badRequest(
      "Tidak dapat menghubungi worker audit. Periksa AUDIT_WORKER_URL dan pastikan worker aktif.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
