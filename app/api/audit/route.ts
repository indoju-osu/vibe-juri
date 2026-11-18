import { NextResponse } from "next/server";
import { normalizeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKER_TIMEOUT_MS = 25_000;

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
      message:
        "Gunakan POST { url } untuk menjalankan audit. Worker headless diatur lewat env AUDIT_WORKER_URL.",
      expected: EXPECTED_CONTRACT,
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Body harus berupa JSON { url: string }." },
      { status: 400 },
    );
  }

  const rawUrl =
    payload && typeof payload === "object" && typeof (payload as { url?: unknown }).url === "string"
      ? (payload as { url: string }).url.trim()
      : "";

  if (!rawUrl) {
    return NextResponse.json(
      { ok: false, message: "Field url wajib diisi." },
      { status: 400 },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json(
      { ok: false, message: "URL tidak valid." },
      { status: 400 },
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { ok: false, message: "Hanya URL http/https yang dapat diaudit." },
      { status: 400 },
    );
  }

  const workerUrl = process.env.AUDIT_WORKER_URL;
  if (!workerUrl) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        message:
          "AUDIT_WORKER_URL belum dikonfigurasi. Set env ke endpoint Python Playwright/FastAPI, atau impor JSON audit secara manual di panel juri.",
        expected: EXPECTED_CONTRACT,
      },
      { status: 501 },
    );
  }

  let workerEndpoint: URL;
  try {
    workerEndpoint = new URL(workerUrl);
  } catch {
    return NextResponse.json(
      { ok: false, message: "AUDIT_WORKER_URL bukan URL yang valid." },
      { status: 500 },
    );
  }
  if (workerEndpoint.protocol !== "http:" && workerEndpoint.protocol !== "https:") {
    return NextResponse.json(
      { ok: false, message: "AUDIT_WORKER_URL harus menggunakan http/https." },
      { status: 500 },
    );
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
      return NextResponse.json(
        {
          ok: false,
          message: "Worker audit mengembalikan respons non-JSON.",
          detail: text.slice(0, 400),
        },
        { status: 502 },
      );
    }

    if (!upstream.ok) {
      const message =
        data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string"
          ? (data as { message: string }).message
          : `Worker audit mengembalikan HTTP ${upstream.status}.`;
      return NextResponse.json({ ok: false, message }, { status: 502 });
    }

    const audit = normalizeAudit(data, parsed.toString(), "worker");
    return NextResponse.json({ ok: true, audit });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { ok: false, message: "Audit timeout setelah 25 detik. Coba lagi atau impor JSON manual." },
        { status: 504 },
      );
    }
    if (error instanceof Error && error.message.includes("audit")) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 502 });
    }
    return NextResponse.json(
      {
        ok: false,
        message:
          "Tidak dapat menghubungi worker audit. Periksa AUDIT_WORKER_URL dan pastikan worker aktif.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
