"use client";

import { useState } from "react";
import {
  IconAlertTriangle,
  IconLoader,
  IconRefresh,
  IconShield,
} from "@/components/ui/icons";
import {
  matchedSecurityHeaders,
  normalizeAudit,
} from "@/lib/audit";
import {
  auditFailed,
  autoRubricFromAudit,
  autoScoreFromAudit,
  autoSecurityFromAudit,
} from "@/lib/autoScore";
import { toast } from "@/lib/toast";
import type { AuditResult, AuditSource, JudgeEntry } from "@/types";

interface AutoAuditBadgeProps {
  entry: JudgeEntry;
  onChange: (audit: AuditResult | null) => void;
}

function statusTone(code: number | null): string {
  if (code === null) return "border-slate-600 bg-slate-900 text-slate-400";
  if (code >= 200 && code < 300) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (code >= 300 && code < 400) return "border-sky-500/40 bg-sky-500/10 text-sky-300";
  return "border-rose-500/40 bg-rose-500/10 text-rose-300";
}

function loadTone(seconds: number | null): string {
  if (seconds === null) return "text-slate-400";
  if (seconds <= 1.5) return "text-emerald-300";
  if (seconds <= 3) return "text-amber-300";
  return "text-rose-300";
}

function errorTone(count: number | null): string {
  if (count === null) return "text-slate-400";
  if (count === 0) return "text-emerald-300";
  if (count <= 3) return "text-amber-300";
  return "text-rose-300";
}

function Metric({
  label,
  value,
  className = "text-slate-100",
  hint,
}: {
  label: string;
  value: string;
  className?: string;
  hint?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-md border border-slate-700/70 bg-slate-950/50 px-2 py-1.5 ${hint ? "cursor-help" : ""}`}
      title={hint ?? value}
    >
      <p className="label-mono text-[9px]">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-xs font-semibold ${className}`}>
        {value}
      </p>
    </div>
  );
}

export function AutoAuditBadge({
  entry,
  onChange,
}: AutoAuditBadgeProps) {
  const audit = entry.audit;
  const auto = audit ? autoScoreFromAudit(audit) : null;
  const autoFailed = audit ? auditFailed(audit) : false;
  const rubric = audit ? autoRubricFromAudit(audit) : null;
  const sec = audit ? autoSecurityFromAudit(audit) : null;
  const [running, setRunning] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const applyRawAudit = (raw: unknown, source: AuditSource): boolean => {
    try {
      const normalized = normalizeAudit(raw, entry.url, source);
      onChange(normalized);
      setInlineError(null);
      toast(
        source === "manual"
          ? "JSON audit manual berhasil dimuat."
          : "Hasil audit otomatis diterapkan ke panel juri.",
        "success",
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Format audit tidak valid";
      setInlineError(message);
      toast(message, "error");
      return false;
    }
  };

  const runWorkerAudit = async () => {
    if (running) return;
    setRunning(true);
    setInlineError(null);
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: entry.url }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        audit?: unknown;
        message?: string;
        mode?: string;
      };

      if (!response.ok) {
        throw new Error(data.message || `Audit gagal dengan HTTP ${response.status}`);
      }

      applyRawAudit(data.audit ?? data, data.mode === "worker" ? "worker" : "html");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menjalankan audit";
      setInlineError(message);
      toast(message, "error");
    } finally {
      setRunning(false);
    }
  };

  const matched = audit ? matchedSecurityHeaders(audit) : [];

  return (
    <section className="card overflow-hidden" aria-labelledby="audit-title">
      <div className="flex items-center justify-between gap-2 border-b border-slate-700/70 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-400">
            <IconShield className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="label-mono text-sky-400">Automated Audit</p>
            <h2 id="audit-title" className="truncate text-xs font-bold text-slate-50">
              Nilai sementara &amp; metrik teknis
            </h2>
          </div>
        </div>
        {auto && audit ? (
          <span
            className={`chip shrink-0 ${
              autoFailed
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-sky-500/40 bg-sky-500/10 text-sky-300"
            }`}
            title="Peringkat sementara = Produk/UX + Security otomatis (Creativity 0)"
          >
            {autoFailed ? "Audit gagal" : `${rubric?.total ?? 0}/85`}
          </span>
        ) : (
          <span className="chip shrink-0 border-slate-600 bg-slate-900 text-slate-400">Belum</span>
        )}
      </div>

      <div className="space-y-2 px-3 py-3">
        {audit ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className={`chip ${statusTone(audit.statusCode)}`}>
                HTTP {audit.statusCode ?? "—"}
              </span>
              <span className="text-[10px] text-slate-500">
                {audit.source === "worker"
                  ? "Worker Playwright"
                  : audit.source === "html"
                    ? "Audit HTML server"
                    : "Import manual"}{" "}
                ·{" "}
                {new Date(audit.testedAt).toLocaleString("id-ID", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            </div>

            {auto ? (
              <div className="rounded-lg border border-sky-500/35 bg-slate-900/60 p-2.5 dark:bg-gradient-to-br dark:from-sky-950/40 dark:via-slate-900/60 dark:to-slate-950/80">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="label-mono text-sky-300">Produk &amp; UX otomatis</p>
                    <p className="font-mono text-2xl font-bold leading-none text-slate-50">
                      {auto.total}
                      <span className="ml-1 text-[10px] font-medium text-slate-500">/100</span>
                    </p>
                  </div>
                  {autoFailed ? (
                    <span className="chip border-amber-500/40 bg-amber-500/10 text-amber-300">
                      Gagal
                    </span>
                  ) : auto.partial ? (
                    <span className="chip border-amber-500/40 bg-amber-500/10 text-amber-300">
                      Perkiraan
                    </span>
                  ) : (
                    <span className="chip border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                      Lengkap
                    </span>
                  )}
                </div>

                <dl className="mt-1.5 grid grid-cols-4 gap-1">
                  {[
                    {
                      label: "MVP",
                      value: auto.mvp,
                      max: 35,
                      tip: "Kesiapan Produk & MVP (maks 35): foto produk asli, sinyal transaksi/harga, dan kelengkapan konten.",
                    },
                    {
                      label: "UI/UX",
                      value: auto.uiux,
                      max: 30,
                      tip: "Kualitas UI/UX & Estetika (maks 30): tipografi, struktur nav/footer/search, responsif mobile, dan polish kartu.",
                    },
                    {
                      label: "Fitur",
                      value: auto.features,
                      max: 20,
                      tip: "Fitur & Interaktivitas (maks 20): jumlah tombol/elemen interaktif dan input form/pencarian.",
                    },
                    {
                      label: "Perf",
                      value: auto.performance,
                      max: 15,
                      tip: "Performa & Stabilitas (maks 15): bebas error JS console dan kecepatan muat halaman.",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      title={item.tip}
                      className="cursor-help rounded bg-slate-950/60 px-1 py-0.5"
                    >
                      <dt className="label-mono text-[8px]">{item.label}</dt>
                      <dd className="font-mono text-[11px] font-bold text-slate-100">
                        {item.value}
                        <span className="text-[8px] font-normal text-slate-500">/{item.max}</span>
                      </dd>
                    </div>
                  ))}
                </dl>

                <ul className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-slate-400">
                  {auto.notes.map((note) => (
                    <li key={note} className="flex items-start gap-1">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
                      <span className="min-w-0 break-words">{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {sec && auto && !autoFailed ? (
              <div className="rounded-lg border border-emerald-500/35 bg-slate-900/60 p-2.5 dark:bg-gradient-to-br dark:from-emerald-950/40 dark:via-slate-900/60 dark:to-slate-950/80">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="label-mono text-emerald-300">Security otomatis</p>
                    <p className="font-mono text-2xl font-bold leading-none text-slate-50">
                      {sec.total}
                      <span className="ml-1 text-[10px] font-medium text-slate-500">/25</span>
                    </p>
                  </div>
                  <span
                    className={`chip ${
                      sec.partial
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    }`}
                  >
                    {sec.partial ? "Perkiraan" : "Terukur"}
                  </span>
                </div>

                <dl className="mt-1.5 grid grid-cols-5 gap-1">
                  {[
                    {
                      label: "XSS",
                      value: sec.xss,
                      tip: "Sanitasi Input & XSS (maks 5): uji refleksi payload aman pada parameter URL.",
                    },
                    {
                      label: "Auth",
                      value: sec.auth,
                      tip: "Autentikasi & Kontrol Akses Rute (maks 5): proteksi rute sensitif (/admin, /api/*) server-side maupun client-side.",
                    },
                    {
                      label: "Data",
                      value: sec.data,
                      tip: "Proteksi Data Sensitif (maks 5): tidak ada .env/.git terekspos atau kredensial/API key bocor di bundle JS.",
                    },
                    {
                      label: "Hdr",
                      value: sec.headers,
                      tip: "Security Headers & HTTPS (maks 5): kelengkapan CSP, X-Content-Type-Options, X-Frame-Options, HSTS, dan Referrer-Policy.",
                    },
                    {
                      label: "Logika",
                      value: sec.logic,
                      tip: "Validasi Logika Bisnis (maks 5): uji heuristik input negatif (-1), batas stok, dan responsivitas pencarian.",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      title={item.tip}
                      className="cursor-help rounded bg-slate-950/60 px-1 py-0.5"
                    >
                      <dt className="label-mono text-[8px]">{item.label}</dt>
                      <dd
                        className={`font-mono text-[11px] font-bold ${
                          item.value >= 4
                            ? "text-emerald-300"
                            : item.value >= 2
                              ? "text-amber-300"
                              : "text-rose-300"
                        }`}
                      >
                        {item.value}
                        <span className="text-[8px] font-normal text-slate-500">/5</span>
                      </dd>
                    </div>
                  ))}
                </dl>

                <ul className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-slate-400">
                  {sec.notes.map((note) => (
                    <li key={note} className="flex items-start gap-1">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
                      <span className="min-w-0 break-words">{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-1.5">
              <Metric
                label="Load time"
                value={audit.loadTimeSeconds === null ? "—" : `${audit.loadTimeSeconds} dtk`}
                className={loadTone(audit.loadTimeSeconds)}
                hint="Waktu muat halaman hingga selesai dirender (ideal <= 8 detik)."
              />
              <Metric
                label="Responsif"
                value={
                  audit.responsive === null ? "—" : audit.responsive ? "Ya" : "Tidak"
                }
                className={audit.responsive ? "text-emerald-300" : "text-amber-300"}
                hint="Cek horizontal overflow pada lebar layar mobile 375px."
              />
              <Metric
                label="Foto raster"
                value={audit.rasterImages === null ? "—" : String(audit.rasterImages)}
                className={
                  audit.rasterImages === 0 ? "text-rose-300" : "text-emerald-300"
                }
                hint="Jumlah foto produk asli (JPG/PNG/WebP/AVIF) berukuran >= 80px."
              />
              <Metric
                label="Ilustrasi SVG"
                value={audit.svgImages === null ? "—" : String(audit.svgImages)}
                className={(audit.svgImages ?? 0) > 0 ? "text-amber-300" : "text-slate-200"}
                hint="Jumlah elemen vektor <svg> atau gambar .svg pada halaman."
              />
              <Metric
                label="Error JS"
                value={audit.consoleErrors === null ? "—" : String(audit.consoleErrors)}
                className={errorTone(audit.consoleErrors)}
                hint="Jumlah uncaught JavaScript error di console browser saat halaman dibuka & diuji."
              />
              <Metric
                label="Security headers"
                value={`${matched.length} / 5`}
                className={matched.length >= 3 ? "text-emerald-300" : "text-amber-300"}
                hint="Jumlah security header standar yang terdeteksi (CSP, X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy)."
              />
            </div>

            {audit.securityHeaders.length > 0 ? (
              <details className="rounded-md border border-slate-700/70 bg-slate-950/40 px-2 py-1.5">
                <summary className="cursor-pointer text-[10px] font-medium text-slate-400 hover:text-slate-200">
                  Lihat {audit.securityHeaders.length} header terdeteksi
                </summary>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {audit.securityHeaders.map((header) => {
                    const name = header.split(":")[0]!.trim();
                    const isExpected = matched.includes(
                      name.toLowerCase() as (typeof matched)[number],
                    );
                    return (
                      <span
                        key={header}
                        className={`chip ${
                          isExpected
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border-slate-600 bg-slate-900 text-slate-400"
                        }`}
                        title={header}
                      >
                        {name}
                      </span>
                    );
                  })}
                </div>
              </details>
            ) : (
              <p className="text-[10px] text-slate-500">
                Tidak ada security header yang terdeteksi pada respons server.
              </p>
            )}

            {audit.rasterImages === 0 ? (
              <p className="flex items-start gap-1 text-[10px] leading-snug text-amber-300/90">
                <IconAlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Tidak ada foto raster asli — waspadai ilustrasi SVG/dummy pada penilaian MVP.
              </p>
            ) : null}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-2.5 py-3">
            <p className="text-[11px] font-semibold text-slate-200">Belum ada nilai sementara</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
              Audit otomatis berjalan sendiri saat panel juri dibuka. Klik{" "}
              <span className="text-slate-300">Nilai Ulang</span> untuk mengulang. Penilaian juri
              tetap bisa dilakukan tanpa audit.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn-primary w-full px-2.5 py-1.5 text-xs"
            onClick={runWorkerAudit}
            disabled={running}
          >
            {running ? (
              <IconLoader className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <IconRefresh className="h-3.5 w-3.5" />
            )}
            {running ? "Mengaudit…" : "Nilai Ulang"}
          </button>
        </div>

        {inlineError ? (
          <div
            role="alert"
            className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5"
          >
            <IconAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <p className="min-w-0 break-words text-[10px] leading-relaxed text-amber-100/90">
              {inlineError}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
