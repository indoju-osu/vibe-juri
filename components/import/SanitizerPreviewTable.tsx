"use client";

import { useEffect, useState } from "react";
import { getHostname, type BatchCleanResult } from "@/lib/urlCleaner";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheckCircle,
  IconSparkles,
} from "@/components/ui/icons";

interface SanitizerPreviewTableProps {
  result: BatchCleanResult | null;
  sourceLabel: string;
  sessionActive: boolean;
  onStart: () => void;
  onLoadSample: () => void;
}

type PreviewTab = "valid" | "ignored";

export function SanitizerPreviewTable({
  result,
  sourceLabel,
  sessionActive,
  onStart,
  onLoadSample,
}: SanitizerPreviewTableProps) {
  const [tab, setTab] = useState<PreviewTab>("valid");

  useEffect(() => {
    if (result && result.valid.length === 0 && result.ignored.length > 0) {
      setTab("ignored");
    }
  }, [result]);

  const validCount = result?.valid.length ?? 0;
  const ignoredCount = result?.ignored.length ?? 0;
  const duplicateCount =
    result?.ignored.filter((item) => item.category === "Duplikat (Diabaikan)").length ?? 0;
  const invalidCount = ignoredCount - duplicateCount;

  return (
    <section className="card flex h-full flex-col overflow-hidden" aria-labelledby="preview-title">
      <div className="flex flex-col gap-2 border-b border-slate-700/70 px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="label-mono text-sky-400">Step 02 · Sanitizer</p>
            <h2 id="preview-title" className="mt-0.5 text-sm font-bold text-slate-50 sm:text-base">
              Pratinjau hasil sanitasi
            </h2>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <span className="chip border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <IconCheckCircle className="h-3 w-3" />
              {validCount} valid
            </span>
            <span className="chip border-amber-500/30 bg-amber-500/10 text-amber-300">
              <IconAlertTriangle className="h-3 w-3" />
              {ignoredCount} diabaikan
            </span>
          </div>
        </div>
        {result ? (
          <p className="truncate text-[11px] text-slate-500">
            Sumber: <span className="font-mono text-slate-400">{sourceLabel}</span> ·{" "}
            {result.totalInput} entri diproses
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">
            Belum ada data. Tempel URL, unggah file, atau muat data contoh.
          </p>
        )}
      </div>

      {result ? (
        <>
          <div className="grid grid-cols-3 divide-x divide-slate-700/60 border-b border-slate-700/60 bg-slate-900/40">
            <div className="px-3 py-2">
              <p className="label-mono">Valid Unik</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-emerald-300">{validCount}</p>
            </div>
            <div className="px-3 py-2">
              <p className="label-mono">Duplikat</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-amber-300">{duplicateCount}</p>
            </div>
            <div className="px-3 py-2">
              <p className="label-mono">Tidak Valid</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-rose-300">{invalidCount}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 border-b border-slate-700/60 bg-slate-950/40 px-2 py-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "valid"}
              onClick={() => setTab("valid")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                tab === "valid"
                  ? "bg-slate-800 text-emerald-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              URL Valid ({validCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "ignored"}
              onClick={() => setTab("ignored")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                tab === "ignored"
                  ? "bg-slate-800 text-amber-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Duplikat / Tidak Valid ({ignoredCount})
            </button>
          </div>

          <div className="max-h-[320px] overflow-auto">
            {tab === "valid" ? (
              validCount > 0 ? (
                <table className="w-full min-w-[540px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th scope="col" className="w-10 px-2 py-2 font-semibold">#</th>
                      <th scope="col" className="px-2 py-2 font-semibold">URL Asli</th>
                      <th scope="col" className="px-2 py-2 font-semibold">URL Ternormalisasi</th>
                      <th scope="col" className="px-2 py-2 font-semibold">Host</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {result.valid.map((entry, index) => (
                      <tr key={entry.key} className="hover:bg-slate-800/40">
                        <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">
                          {String(index + 1).padStart(2, "0")}
                        </td>
                        <td className="max-w-[220px] px-2 py-1.5">
                          <span className="block truncate font-mono text-[11px] text-slate-400" title={entry.raw}>
                            {entry.raw.trim() || entry.url}
                          </span>
                        </td>
                        <td className="max-w-[240px] px-2 py-1.5">
                          <span className="block truncate font-mono text-[11px] text-slate-100" title={entry.url}>
                            {entry.url}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="whitespace-nowrap font-mono text-[11px] text-sky-300">
                            {getHostname(entry.url)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 py-8 text-center text-xs text-slate-500">
                  Tidak ada URL valid. Periksa tab duplikat / tidak valid.
                </p>
              )
            ) : ignoredCount > 0 ? (
              <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th scope="col" className="w-10 px-2 py-2 font-semibold">#</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Entri Asli</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Kategori</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {result.ignored.map((entry, index) => (
                    <tr key={entry.id} className="hover:bg-slate-800/40">
                      <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">
                        {String(index + 1).padStart(2, "0")}
                      </td>
                      <td className="max-w-[200px] px-2 py-1.5">
                        <span className="block truncate font-mono text-[11px] text-slate-300" title={entry.url}>
                          {entry.url}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`chip ${
                            entry.category === "Duplikat (Diabaikan)"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                          }`}
                        >
                          {entry.category === "Duplikat (Diabaikan)" ? "Duplikat" : "Tidak Valid"}
                        </span>
                      </td>
                      <td className="max-w-[200px] px-2 py-1.5">
                        <span className="block truncate text-[11px] text-slate-400" title={entry.detail}>
                          {entry.detail}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-8 text-center text-xs text-slate-500">
                Tidak ada entri duplikat atau tidak valid.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-400">
            <IconSparkles className="h-5 w-5" />
          </span>
          <p className="text-xs font-semibold text-slate-200">Mulai dengan data contoh</p>
          <p className="max-w-md text-[11px] leading-relaxed text-slate-500">
            60 URL peserta valid plus duplikat dan entri tidak valid untuk menguji seluruh alur
            sanitasi, penjurian, dan ekspor Excel.
          </p>
          <button type="button" className="btn-secondary mt-1" onClick={onLoadSample}>
            <IconSparkles className="h-4 w-4 text-amber-300" />
            Import Data Contoh (55+ URL)
          </button>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-slate-700/70 bg-slate-900/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0">
          {sessionActive ? (
            <p className="text-[11px] text-amber-300/90">
              Sesi aktif akan diganti setelah konfirmasi. Data lama tetap tersimpan sampai batch baru
              dimulai.
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">
              Skor &amp; progres tersimpan otomatis di localStorage browser ini.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn-ghost px-2.5 py-1.5 text-[11px]" onClick={onLoadSample}>
            <IconSparkles className="h-3.5 w-3.5 text-amber-300" />
            Data Contoh
          </button>
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-xs"
            disabled={validCount === 0}
            onClick={onStart}
          >
            Mulai Penjurian Split-Window
            <IconArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
