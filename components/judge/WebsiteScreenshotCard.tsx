"use client";

import { useState } from "react";
import { IconExternal, IconMonitor, IconX } from "@/components/ui/icons";
import type { JudgeEntry } from "@/types";

interface WebsiteScreenshotCardProps {
  entry: JudgeEntry;
}

export function WebsiteScreenshotCard({ entry }: WebsiteScreenshotCardProps) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const screenshot = entry.audit?.screenshotDataUrl ?? null;

  return (
    <>
      <section className="card overflow-hidden" aria-labelledby="screenshot-title">
        <div className="flex items-center justify-between gap-2 border-b border-slate-700/70 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-300">
              <IconMonitor className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="label-mono text-sky-400">Tampilan Web</p>
              <h2 id="screenshot-title" className="truncate text-xs font-bold text-slate-50">
                Screenshot Halaman Peserta
              </h2>
            </div>
          </div>
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost shrink-0 px-2 py-1 text-[10px]"
            title="Buka website di tab baru"
          >
            <IconExternal className="h-3 w-3" />
            Buka
          </a>
        </div>

        <div className="p-3">
          {screenshot ? (
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              className="group relative block w-full overflow-hidden rounded-lg border border-slate-700/80 bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
              title="Klik untuk memperbesar screenshot"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshot}
                alt={`Screenshot ${entry.url}`}
                className="aspect-video w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
              />
              <span className="absolute bottom-2 right-2 rounded-md border border-slate-700/80 bg-slate-950/85 px-2 py-0.5 font-mono text-[10px] font-medium text-slate-100 opacity-90 shadow-sm">
                Klik untuk perbesar
              </span>
            </button>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/60 px-4 text-center">
              <IconMonitor className="h-6 w-6 text-slate-500" />
              <p className="mt-1.5 text-[11px] font-semibold text-slate-200">
                Screenshot belum tersedia
              </p>
              <p className="mt-0.5 max-w-[260px] text-[10px] leading-relaxed text-slate-500">
                Screenshot otomatis diambil oleh Worker Playwright saat proses audit atau klik{" "}
                <span className="font-medium text-slate-300">Nilai Ulang</span>.
              </p>
            </div>
          )}
        </div>
      </section>

      {zoomOpen && screenshot ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Pratinjau penuh ${entry.url}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          onClick={() => setZoomOpen(false)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-700 px-4 py-2.5">
              <p className="truncate font-mono text-xs font-semibold text-slate-100">{entry.url}</p>
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                className="btn-ghost px-2 py-1 text-xs"
                aria-label="Tutup pratinjau"
              >
                <IconX className="h-4 w-4" />
                Tutup
              </button>
            </div>
            <div className="max-h-[calc(90vh-52px)] overflow-auto bg-slate-900 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshot}
                alt={`Screenshot penuh ${entry.url}`}
                className="mx-auto h-auto w-full rounded-md"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
