"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconLoader,
  IconRefresh,
  IconShield,
} from "@/components/ui/icons";
import { createFailedAudit, normalizeAudit } from "@/lib/audit";
import { toast } from "@/lib/toast";
import type { AuditResult, JudgeEntry } from "@/types";

const ENABLED_KEY = "vibe-juri.autoaudit.v1";
const CONCURRENCY = 2;

interface BulkAutoAuditProps {
  entries: JudgeEntry[];
  onAudit: (entryId: string, audit: AuditResult) => void;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function BulkAutoAudit({ entries, onAudit }: BulkAutoAuditProps) {
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const runningRef = useRef(false);
  const cancelRef = useRef(false);
  const startedRef = useRef(false);
  const urlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    urlsRef.current = new Map(entries.map((entry) => [entry.id, entry.url]));
  }, [entries]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(ENABLED_KEY) === "0") setEnabled(false);
    } catch {
      // ignore storage failures
    }
    setReady(true);
  }, []);

  const pending = useMemo(() => entries.filter((entry) => !entry.audit), [entries]);
  const failedEntries = useMemo(
    () => entries.filter((entry) => entry.audit?.error).map((entry) => entry.id),
    [entries],
  );

  const run = useCallback(
    async (ids: string[]) => {
      if (runningRef.current || ids.length === 0) return;
      runningRef.current = true;
      cancelRef.current = false;
      setRunning(true);
      setFinished(false);
      setProcessed(0);
      setFailed(0);
      setTotal(ids.length);

      const queue = [...ids];
      let done = 0;
      let failures = 0;

      const worker = async () => {
        while (queue.length > 0 && !cancelRef.current) {
          const id = queue.shift();
          if (!id) break;
          const url = urlsRef.current.get(id);
          if (!url) continue;

          setCurrent(url);
          try {
            const response = await fetch("/api/audit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url }),
            });
            const data = (await response.json().catch(() => ({}))) as {
              audit?: unknown;
              message?: string;
              mode?: string;
            };
            if (!response.ok) {
              throw new Error(data.message || `Audit gagal (HTTP ${response.status})`);
            }
            const audit = normalizeAudit(
              data.audit ?? data,
              url,
              data.mode === "worker" ? "worker" : "html",
            );
            onAudit(id, audit);
            if (audit.error) failures += 1;
          } catch (error) {
            if (cancelRef.current) continue;
            const message = error instanceof Error ? error.message : "Audit gagal";
            onAudit(id, createFailedAudit(url, message, "html"));
            failures += 1;
          }

          done += 1;
          setProcessed(done);
          setFailed(failures);
          setCurrent(null);
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker()),
      );

      runningRef.current = false;
      setRunning(false);
      setCurrent(null);

      if (!cancelRef.current) {
        setFinished(true);
        toast(
          `Audit otomatis selesai: ${done - failures} berhasil, ${failures} gagal. Nilai sementara diperbarui.`,
          failures > 0 ? "warning" : "success",
        );
      }
    },
    [onAudit],
  );

  // Jalankan otomatis sekali per sesi: nilai sementara langsung terbentuk.
  useEffect(() => {
    if (!ready || !enabled || startedRef.current || pending.length === 0) return;
    startedRef.current = true;
    void run(pending.map((entry) => entry.id));
  }, [ready, enabled, pending, run]);

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      window.localStorage.setItem(ENABLED_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    if (next && !runningRef.current && pending.length > 0) {
      startedRef.current = true;
      void run(pending.map((entry) => entry.id));
    }
  };

  const stop = () => {
    cancelRef.current = true;
    toast("Audit otomatis dihentikan. Klik Mulai untuk melanjutkan sisa karya.", "info");
  };

  const percent = total === 0 ? 0 : Math.round((processed / total) * 100);
  const allAudited = pending.length === 0;
  const remaining = Math.max(0, total - processed);

  return (
    <section
      className="card overflow-hidden"
      aria-labelledby="bulk-audit-title"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-700/70 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-400">
            <IconShield className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="label-mono text-sky-400">Nilai Sementara Otomatis</p>
            <h2 id="bulk-audit-title" className="truncate text-xs font-bold text-slate-50">
              Audit massal untuk klasemen awal
            </h2>
          </div>
        </div>
        <span className="chip shrink-0 border-slate-600 bg-slate-900 text-slate-400">
          {entries.length - pending.length}/{entries.length} diaudit
        </span>
      </div>

      <div className="space-y-2 px-3 py-3">
        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1 font-mono">
            {running ? (
              <IconLoader className="h-3 w-3 animate-spin text-sky-400" />
            ) : finished ? (
              <IconCheckCircle className="h-3 w-3 text-emerald-400" />
            ) : (
              <IconRefresh className="h-3 w-3 text-slate-500" />
            )}
            {running
              ? `${processed} / ${total} diproses`
              : finished
                ? `Selesai · ${processed - failed} berhasil · ${failed} gagal`
                : allAudited
                  ? "Semua karya sudah punya nilai otomatis"
                  : `${pending.length} karya menunggu audit`}
          </span>
          <span className="font-mono">{percent}%</span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-slate-700/70">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all dark:bg-gradient-to-r dark:from-sky-500 dark:to-emerald-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        {running && current ? (
          <p className="truncate font-mono text-[10px] text-slate-500" title={current}>
            Mengaudit: {hostOf(current)}
            {remaining > 0 ? ` · sisa ${remaining}` : ""}
          </p>
        ) : (
          <p className="text-[10px] leading-relaxed text-slate-500">
            Setiap karya langsung dipindai: Produk/UX (audit HTML/Playwright) dan Security
            (headers/HTTPS, XSS, data sensitif, <span className="font-mono">/admin</span> &amp;
            <span className="font-mono"> /api/*</span>).{" "}
            <span className="text-slate-300">Peringkat sementara = Produk/UX + Security</span>{" "}
            (Personal 0). Nilai juri menggantikannya setelah disimpan.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {running ? (
            <button type="button" className="btn-secondary px-2 py-1 text-[10px]" onClick={stop}>
              Stop audit
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary px-2 py-1 text-[10px]"
              onClick={() => {
                startedRef.current = true;
                void run(pending.map((entry) => entry.id));
              }}
              disabled={allAudited}
            >
              <IconRefresh className="h-3.5 w-3.5" />
              {allAudited ? "Semua sudah diaudit" : pending.length === entries.length ? "Mulai audit" : "Lanjutkan audit"}
            </button>
          )}

          {failedEntries.length > 0 && !running ? (
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-[10px]"
              onClick={() => {
                startedRef.current = true;
                void run(failedEntries);
              }}
            >
              <IconAlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              Coba ulang {failedEntries.length} gagal
            </button>
          ) : null}

          <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-400">
            <input
              type="checkbox"
              checked={enabled}
              onChange={toggleEnabled}
              className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500/40"
            />
            Otomatis saat sesi dibuka
          </label>
        </div>
      </div>
    </section>
  );
}
