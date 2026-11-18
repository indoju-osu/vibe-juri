"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheckCircle,
  IconExternal,
  IconEye,
  IconKeyboard,
  IconMonitor,
  IconRefresh,
  IconX,
} from "@/components/ui/icons";
import {
  closePreviewWindow,
  fitJudgePanelToRight,
  focusPreviewWindow,
  getSplitGeometry,
  navigatePreviewWindow,
  openPreviewWindow,
} from "@/lib/splitWindow";
import { toast } from "@/lib/toast";

interface SplitWindowLauncherProps {
  url: string;
  urls: string[];
  index: number;
  total: number;
  judged: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function SplitWindowLauncher({
  url,
  urls,
  index,
  total,
  judged,
  onPrev,
  onNext,
  onJump,
}: SplitWindowLauncherProps) {
  const popupRef = useRef<Window | null>(null);
  const lastSentUrl = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [resizeBlocked, setResizeBlocked] = useState(false);

  const percent = total > 0 ? ((index + 1) / total) * 100 : 0;

  const handleOpen = useCallback(() => {
    const popup = openPreviewWindow(url);
    if (!popup) {
      setBlocked(true);
      setIsOpen(false);
      toast(
        "Popup diblokir browser. Klik ikon pop-up di address bar, izinkan untuk situs ini, lalu coba lagi.",
        "error",
      );
      return;
    }

    popupRef.current = popup;
    lastSentUrl.current = url;
    setBlocked(false);
    setIsOpen(true);
    focusPreviewWindow(popup);

    const geometry = getSplitGeometry();
    const resized = fitJudgePanelToRight();
    if (!resized) setResizeBlocked(true);

    window.setTimeout(() => {
      try {
        if (window.outerWidth > geometry.panel.width + 120) {
          setResizeBlocked(true);
        } else {
          setResizeBlocked(false);
        }
      } catch {
        setResizeBlocked(true);
      }
    }, 700);

    toast("Jendela preview 75% dibuka di sisi kiri. Panel juri di sisi kanan.", "success");
  }, [url]);

  const handleFocus = () => {
    if (focusPreviewWindow(popupRef.current)) {
      toast("Jendela preview difokuskan.", "info");
    } else {
      popupRef.current = null;
      setIsOpen(false);
      toast("Jendela preview sudah tertutup. Buka ulang untuk melanjutkan.", "warning");
    }
  };

  const handleClose = () => {
    closePreviewWindow(popupRef.current);
    popupRef.current = null;
    lastSentUrl.current = null;
    setIsOpen(false);
    toast("Jendela preview ditutup.", "info");
  };

  // Navigate the existing preview window instead of spawning tabs.
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup || popup.closed) return;
    if (lastSentUrl.current === url) return;
    if (navigatePreviewWindow(popup, url)) {
      lastSentUrl.current = url;
    }
  }, [url]);

  // Keep the connection status honest when the juri closes the popup manually.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const popup = popupRef.current;
      if (popup && popup.closed) {
        popupRef.current = null;
        lastSentUrl.current = null;
        setIsOpen(false);
        toast(
          "Jendela preview tertutup. Panel juri tetap aktif — buka ulang saat siap.",
          "warning",
        );
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, []);

  // Arrow-key navigation, disabled while typing in forms.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrev();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNext, onPrev]);

  return (
    <section className="card overflow-hidden" aria-labelledby="split-launcher-title">
      <div className="flex items-center justify-between gap-2 border-b border-slate-700/70 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-400">
            <IconMonitor className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="label-mono text-rose-400">Split-Window Controller</p>
            <h2 id="split-launcher-title" className="truncate text-xs font-bold text-slate-50">
              Preview 75% kiri · Panel 25% kanan
            </h2>
          </div>
        </div>
        <span
          className={`chip shrink-0 ${
            blocked
              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
              : isOpen
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-slate-600 bg-slate-900 text-slate-400"
          }`}
          role="status"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              blocked ? "bg-rose-400" : isOpen ? "animate-pulse-soft bg-emerald-400" : "bg-slate-500"
            }`}
          />
          {blocked ? "Diblokir" : isOpen ? "Terbuka" : "Tertutup"}
        </span>
      </div>

      <div className="space-y-2.5 px-3 py-3">
        <div className="min-w-0 rounded-lg border border-slate-700/70 bg-slate-950/50 px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="label-mono">Karya aktif</p>
            <span className="font-mono text-[10px] text-slate-400">
              {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>
          <p
            className="mt-0.5 truncate font-mono text-[11px] text-slate-100"
            title={url}
          >
            {url}
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-700/70">
            <div
              className="h-full rounded-full bg-rose-500 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {blocked ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2"
          >
            <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div className="min-w-0 text-[11px] leading-relaxed text-rose-100">
              <p className="font-semibold">Popup diblokir browser.</p>
              <p className="text-rose-200/80">
                Klik ikon pop-up di address bar → pilih “Selalu izinkan situs ini” → tekan Buka Lagi.
              </p>
              <button type="button" className="btn-secondary mt-1.5 px-2 py-1 text-[11px]" onClick={handleOpen}>
                <IconRefresh className="h-3.5 w-3.5" />
                Coba Buka Lagi
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {!isOpen ? (
            <button type="button" className="btn-primary flex-1 px-2.5 py-2 text-xs" onClick={handleOpen}>
              <IconEye className="h-4 w-4" />
              {blocked ? "Buka Lagi Layar 75%" : "Buka Layar 75%"}
            </button>
          ) : (
            <>
              <button type="button" className="btn-secondary flex-1 px-2 py-1.5 text-[11px]" onClick={handleFocus}>
                <IconEye className="h-3.5 w-3.5" />
                Fokuskan
              </button>
              <button type="button" className="btn-secondary px-2 py-1.5 text-[11px]" onClick={handleOpen}>
                <IconRefresh className="h-3.5 w-3.5" />
                Reload
              </button>
              <button type="button" className="btn-ghost px-2 py-1.5 text-[11px]" onClick={handleClose}>
                <IconX className="h-3.5 w-3.5" />
                Tutup
              </button>
            </>
          )}
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5">
          <button
            type="button"
            className="btn-secondary h-8 w-8 p-0"
            onClick={onPrev}
            disabled={index <= 0}
            aria-label="Karya sebelumnya (ArrowLeft)"
            title="Sebelumnya (←)"
          >
            <IconArrowLeft className="h-4 w-4" />
          </button>
          <div className="relative min-w-0">
            <label htmlFor="jump-entry" className="sr-only">
              Lompat ke karya nomor
            </label>
            <select
              id="jump-entry"
              value={index}
              onChange={(event) => onJump(Number(event.target.value))}
              className="input appearance-none py-1.5 pl-2 pr-7 font-mono text-[11px]"
            >
              {urls.map((entryUrl, i) => (
                <option key={i} value={i}>
                  {String(i + 1).padStart(2, "0")} · {hostOf(entryUrl)}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">
              ▾
            </span>
          </div>
          <button
            type="button"
            className="btn-primary h-8 w-8 p-0"
            onClick={onNext}
            disabled={index >= total - 1}
            aria-label="Karya berikutnya (ArrowRight)"
            title="Berikutnya (→)"
          >
            <IconArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <IconKeyboard className="h-3.5 w-3.5" />
            <kbd className="rounded border border-slate-700 bg-slate-900 px-1 font-mono">←</kbd>
            <kbd className="rounded border border-slate-700 bg-slate-900 px-1 font-mono">→</kbd>
            navigasi
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
          >
            Tab baru
            <IconExternal className="h-3 w-3" />
          </a>
        </div>

        {judged ? (
          <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-300">
            <IconCheckCircle className="h-3.5 w-3.5" />
            Karya ini sudah ditandai selesai dinilai.
          </p>
        ) : null}

        {resizeBlocked ? (
          <p
            className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] leading-snug text-amber-200/90"
            role="status"
          >
            Browser membatasi <span className="font-mono">moveTo/resizeTo</span> untuk tab utama.
            Preview tetap presisi 75% kiri — gunakan snap jendela (kiri/kanan) atau tarik tepi jendela
            ke 25% kanan.
          </p>
        ) : (
          <p className="text-[10px] leading-snug text-slate-500">
            Jika posisi panel tidak otomatis mengecil, browser memblokir resize tab — gunakan fitur
            snap jendela ke kanan.
          </p>
        )}
      </div>
    </section>
  );
}
