"use client";

import { useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconClipboard,
  IconDownload,
  IconLoader,
  IconRefresh,
  IconShield,
  IconUpload,
  IconX,
} from "@/components/ui/icons";
import {
  matchedSecurityHeaders,
  normalizeAudit,
  suggestedHeaderScore,
} from "@/lib/audit";
import { toast } from "@/lib/toast";
import type { AuditResult, JudgeEntry } from "@/types";

interface AutoAuditBadgeProps {
  entry: JudgeEntry;
  onChange: (audit: AuditResult | null) => void;
  onApplyHeaderScore: (score: number) => void;
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
    <div className="min-w-0 rounded-md border border-slate-700/70 bg-slate-950/50 px-2 py-1.5">
      <p className="label-mono text-[9px]">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-xs font-semibold ${className}`} title={hint ?? value}>
        {value}
      </p>
    </div>
  );
}

export function AutoAuditBadge({
  entry,
  onChange,
  onApplyHeaderScore,
}: AutoAuditBadgeProps) {
  const audit = entry.audit;
  const [running, setRunning] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyRawAudit = (raw: unknown, source: "worker" | "manual"): boolean => {
    try {
      const normalized = normalizeAudit(raw, entry.url, source);
      onChange(normalized);
      setInlineError(null);
      toast(
        source === "worker"
          ? "Hasil audit worker diterapkan ke panel juri."
          : "JSON audit manual berhasil dimuat.",
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
      };

      if (!response.ok) {
        throw new Error(data.message || `Audit gagal dengan HTTP ${response.status}`);
      }

      applyRawAudit(data.audit ?? data, "worker");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menjalankan audit";
      setInlineError(message);
      toast(message, "error");
    } finally {
      setRunning(false);
    }
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (applyRawAudit(parsed, "manual")) setPasteOpen(false);
    } catch {
      const message = "File JSON tidak valid. Pastikan isinya objek audit.";
      setInlineError(message);
      toast(message, "error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const matched = audit ? matchedSecurityHeaders(audit) : [];
  const headerScore = audit ? suggestedHeaderScore(audit) : 0;

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
              Metrik teknis & security headers
            </h2>
          </div>
        </div>
        <span className="chip shrink-0 border-slate-600 bg-slate-900 text-slate-400">Opsional</span>
      </div>

      <div className="space-y-2 px-3 py-3">
        {audit ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className={`chip ${statusTone(audit.statusCode)}`}>
                HTTP {audit.statusCode ?? "—"}
              </span>
              <span className="text-[10px] text-slate-500">
                {audit.source === "worker" ? "Worker API" : "Import manual"} ·{" "}
                {new Date(audit.testedAt).toLocaleString("id-ID", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <Metric
                label="Load time"
                value={audit.loadTimeSeconds === null ? "—" : `${audit.loadTimeSeconds} dtk`}
                className={loadTone(audit.loadTimeSeconds)}
              />
              <Metric
                label="Responsif"
                value={
                  audit.responsive === null ? "—" : audit.responsive ? "Ya" : "Tidak"
                }
                className={audit.responsive ? "text-emerald-300" : "text-amber-300"}
              />
              <Metric
                label="Foto raster"
                value={audit.rasterImages === null ? "—" : String(audit.rasterImages)}
                className={
                  audit.rasterImages === 0 ? "text-rose-300" : "text-emerald-300"
                }
              />
              <Metric
                label="Ilustrasi SVG"
                value={audit.svgImages === null ? "—" : String(audit.svgImages)}
                className={(audit.svgImages ?? 0) > 0 ? "text-amber-300" : "text-slate-200"}
              />
              <Metric
                label="Error JS"
                value={audit.consoleErrors === null ? "—" : String(audit.consoleErrors)}
                className={errorTone(audit.consoleErrors)}
              />
              <Metric
                label="Security headers"
                value={`${matched.length} / 5`}
                className={matched.length >= 3 ? "text-emerald-300" : "text-amber-300"}
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
                Tidak ada security header yang dilaporkan worker.
              </p>
            )}

            {audit.rasterImages === 0 ? (
              <p className="flex items-start gap-1 text-[10px] leading-snug text-amber-300/90">
                <IconAlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Tidak ada foto raster asli — waspadai ilustrasi SVG/dummy pada penilaian MVP.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="btn-secondary flex-1 px-2 py-1 text-[10px]"
                onClick={() => {
                  onApplyHeaderScore(headerScore);
                  toast(`Skor Headers diisi otomatis: ${headerScore} / 5.`, "success");
                }}
                disabled={audit.securityHeaders.length === 0}
                title="Mengisi komponen 4.4 dari jumlah security header yang terdeteksi"
              >
                <IconCheckCircle className="h-3.5 w-3.5" />
                Isi skor Headers {headerScore}/5
              </button>
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-[10px]"
                onClick={() => onChange(null)}
              >
                <IconX className="h-3.5 w-3.5" />
                Hapus
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-2.5 py-3">
            <p className="text-[11px] font-semibold text-slate-200">Belum ada data audit</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
              Jalankan worker Playwright melalui <span className="font-mono">/api/audit</span>, atau
              impor JSON hasil audit secara manual. Penilaian tetap bisa dilakukan tanpa audit.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn-primary px-2 py-1 text-[10px]"
            onClick={runWorkerAudit}
            disabled={running}
          >
            {running ? (
              <IconLoader className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <IconRefresh className="h-3.5 w-3.5" />
            )}
            {running ? "Mengaudit…" : "Jalankan Audit API"}
          </button>
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-[10px]"
            onClick={() => fileRef.current?.click()}
          >
            <IconUpload className="h-3.5 w-3.5" />
            Import JSON
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-[10px]"
            onClick={() => setPasteOpen((prev) => !prev)}
            aria-expanded={pasteOpen}
          >
            <IconClipboard className="h-3.5 w-3.5" />
            Tempel JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
        </div>

        {pasteOpen ? (
          <div className="space-y-1.5 rounded-md border border-slate-700/70 bg-slate-950/50 p-2">
            <label htmlFor="audit-json" className="label-mono">
              Tempel JSON audit
            </label>
            <textarea
              id="audit-json"
              value={pasteValue}
              onChange={(event) => setPasteValue(event.target.value)}
              rows={5}
              spellCheck={false}
              placeholder={`{
  "statusCode": 200,
  "loadTimeSeconds": 1.4,
  "rasterImages": 12,
  "svgImages": 3,
  "responsive": true,
  "securityHeaders": ["content-security-policy", "x-content-type-options"],
  "consoleErrors": 0
}`}
              className="input resize-y font-mono text-[10px] leading-relaxed"
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-[10px]"
                onClick={() => setPasteOpen(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-primary px-2 py-1 text-[10px]"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(pasteValue) as unknown;
                    if (applyRawAudit(parsed, "manual")) {
                      setPasteValue("");
                      setPasteOpen(false);
                    }
                  } catch {
                    const message = "JSON tidak valid. Periksa tanda kutip dan koma.";
                    setInlineError(message);
                    toast(message, "error");
                  }
                }}
                disabled={!pasteValue.trim()}
              >
                <IconDownload className="h-3.5 w-3.5" />
                Terapkan
              </button>
            </div>
          </div>
        ) : null}

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
