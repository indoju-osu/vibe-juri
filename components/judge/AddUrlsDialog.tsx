"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconClipboard,
  IconPlus,
  IconX,
} from "@/components/ui/icons";
import { prepareSessionAdditions, type SessionAdditionPreview } from "@/lib/storage";
import { toast } from "@/lib/toast";
import type { JudgeEntry } from "@/types";

interface AddUrlsDialogProps {
  open: boolean;
  existingEntries: JudgeEntry[];
  onClose: () => void;
  onAdd: (preview: SessionAdditionPreview, jumpToNew: boolean) => void;
}

const PLACEHOLDER = `https://karya-susulan.vercel.app
peserta-baru.netlify.app`;

export function AddUrlsDialog({
  open,
  existingEntries,
  onClose,
  onAdd,
}: AddUrlsDialogProps) {
  const [text, setText] = useState("");
  const [jumpToNew, setJumpToNew] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const preview = useMemo(() => {
    const lines = text.split(/\r?\n/);
    return prepareSessionAdditions(existingEntries, lines);
  }, [existingEntries, text]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  const pasteFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      toast("Browser tidak mengizinkan baca clipboard. Gunakan Ctrl/Cmd + V.", "warning");
      return;
    }
    try {
      const value = await navigator.clipboard.readText();
      if (!value.trim()) {
        toast("Clipboard kosong.", "warning");
        return;
      }
      setText((prev) => (prev.trim() ? `${prev.trim()}\n${value.trim()}` : value.trim()));
      toast("URL dari clipboard ditambahkan.", "success");
    } catch {
      toast("Akses clipboard ditolak. Tempel manual dengan Ctrl/Cmd + V.", "error");
    }
  };

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (preview.addedEntries.length === 0) {
      toast("Masukkan minimal satu URL baru yang valid.", "warning");
      return;
    }
    onAdd(preview, jumpToNew);
    setText("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-urls-title"
        aria-describedby="add-urls-description"
        className="w-full max-w-lg animate-fade-up rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-400">
            <IconPlus className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="add-urls-title" className="text-sm font-bold text-slate-50">
              Tambah URL Penilaian
            </h2>
            <p id="add-urls-description" className="mt-1 text-xs leading-relaxed text-slate-400">
              Tambahkan 1 URL atau beberapa URL (satu per baris) ke antrean sesi aktif tanpa
              menghapus skor atau hasil audit sebelumnya.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Tutup dialog"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="add-urls-textarea" className="label-mono text-[10px]">
                Daftar URL Baru
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={pasteFromClipboard}
                  className="btn-ghost px-2 py-1 text-[10px] text-slate-300"
                >
                  <IconClipboard className="h-3 w-3" />
                  Tempel Clipboard
                </button>
                {text.trim() ? (
                  <button
                    type="button"
                    onClick={() => setText("")}
                    className="btn-ghost px-2 py-1 text-[10px] text-slate-400"
                  >
                    Bersihkan
                  </button>
                ) : null}
              </div>
            </div>
            <textarea
              ref={textareaRef}
              id="add-urls-textarea"
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={PLACEHOLDER}
              className="input resize-y font-mono text-xs leading-relaxed"
            />
          </div>

          {preview.totalInput > 0 ? (
            <div className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-2.5 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="chip border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  <IconCheckCircle className="h-3 w-3" />
                  {preview.addedEntries.length} URL baru siap ditambah
                </span>
                {preview.duplicateCount > 0 ? (
                  <span className="chip border-amber-500/30 bg-amber-500/10 text-amber-300">
                    {preview.duplicateCount} duplikat
                  </span>
                ) : null}
                {preview.invalidCount > 0 ? (
                  <span className="chip border-rose-500/30 bg-rose-500/10 text-rose-300">
                    <IconAlertTriangle className="h-3 w-3" />
                    {preview.invalidCount} tidak valid / repo Git
                  </span>
                ) : null}
              </div>

              {preview.ignoredEntries.length > 0 ? (
                <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto border-t border-slate-800 pt-2 text-[10px] text-slate-400">
                  {preview.ignoredEntries.map((item) => (
                    <li key={item.id} className="truncate">
                      <span className="font-mono text-slate-300">{item.url}</span>{" "}
                      <span className="text-slate-500">— {item.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={jumpToNew}
              onChange={(event) => setJumpToNew(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-rose-500 focus:ring-rose-500/40"
            />
            Langsung buka URL baru pertama untuk dinilai
          </label>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary w-full sm:w-auto" onClick={onClose}>
              Batal
            </button>
            <button
              type="submit"
              disabled={preview.addedEntries.length === 0}
              className="btn-primary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconPlus className="h-4 w-4" />
              Tambah {preview.addedEntries.length > 0 ? `${preview.addedEntries.length} ` : ""}URL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
