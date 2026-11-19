"use client";

import { useRef, useState } from "react";
import { acceptedFileTypes, parseUrlFile } from "@/lib/fileParser";
import { copyText, toast } from "@/lib/toast";
import {
  IconClipboard,
  IconFile,
  IconLoader,
  IconUpload,
  IconX,
} from "@/components/ui/icons";

export interface ImporterMeta {
  label: string;
  source: "text" | "file";
  fileName?: string;
  sheetCount?: number;
}

interface UrlBatchImporterProps {
  onEntries: (entries: string[], meta: ImporterMeta) => void;
}

type Tab = "text" | "file";

const PLACEHOLDER = `https://karya-peserta.vercel.app
https://portofolio.github.io
peserta-lain.netlify.app
https://github.com/bukan-repo-live
12345`;

export function UrlBatchImporter({ onEntries }: UrlBatchImporterProps) {
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    count: number;
    sheets: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;

  const parseText = () => {
    const entries = text.split(/\r?\n/);
    if (lineCount === 0) {
      toast("Tempel minimal satu URL terlebih dahulu.", "warning");
      return;
    }
    onEntries(entries, { label: "Copy-paste teks", source: "text" });
    toast(`${lineCount} baris diproses oleh sanitizer.`, "info");
  };

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
      toast("Teks dari clipboard ditambahkan.", "success");
    } catch {
      toast("Akses clipboard ditolak. Tempel manual dengan Ctrl/Cmd + V.", "error");
    }
  };

  const handleFile = async (file: File) => {
    if (parsing) return;
    setParsing(true);
    setFileInfo(null);
    try {
      const result = await parseUrlFile(file);
      if (result.entries.length === 0) {
        toast("File tidak berisi URL atau entri yang bisa dibaca.", "warning");
        return;
      }
      setFileInfo({
        name: result.fileName,
        count: result.entries.length,
        sheets: result.sheetCount,
      });
      onEntries(result.entries, {
        label: `File ${result.fileName}`,
        source: "file",
        fileName: result.fileName,
        sheetCount: result.sheetCount,
      });
      toast(
        `${result.entries.length} entri dibaca${
          result.sheetCount > 0 ? ` dari ${result.sheetCount} sheet` : ""
        }.`,
        "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membaca file";
      toast(message, "error");
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const copyFormatHelp = async () => {
    const ok = await copyText(".txt satu URL per baris · .csv kolom URL · .xlsx semua sheet");
    toast(ok ? "Panduan format disalin." : "Gagal menyalin.", ok ? "success" : "error");
  };

  return (
    <section className="card flex h-full flex-col overflow-hidden" aria-labelledby="importer-title">
      <div className="flex flex-col gap-3 border-b border-slate-700/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0">
          <p className="label-mono text-rose-400">Step 01 · Import Batch</p>
          <h2 id="importer-title" className="mt-0.5 text-sm font-bold text-slate-50 sm:text-base">
            Masukkan daftar URL peserta
          </h2>
        </div>
        <button
          type="button"
          onClick={copyFormatHelp}
          className="btn-ghost self-start px-2 py-1 text-[11px] text-slate-400 sm:self-auto"
        >
          <IconClipboard className="h-3.5 w-3.5" />
          Format file
        </button>
      </div>

      <div className="flex flex-1 flex-col px-3 py-3 sm:px-4">
        <div
          role="tablist"
          aria-label="Mode input URL"
          className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-slate-700/70 bg-slate-950/60 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "text"}
            aria-controls="panel-text"
            id="tab-text"
            onClick={() => setTab("text")}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 ${
              tab === "text"
                ? "bg-slate-800 text-slate-50 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <IconClipboard className="h-3.5 w-3.5" />
            Copy-Paste Teks
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "file"}
            aria-controls="panel-file"
            id="tab-file"
            onClick={() => setTab("file")}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 ${
              tab === "file"
                ? "bg-slate-800 text-slate-50 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <IconUpload className="h-3.5 w-3.5" />
            Upload File
          </button>
        </div>

        {tab === "text" ? (
          <div role="tabpanel" id="panel-text" aria-labelledby="tab-text" className="flex flex-1 flex-col">
            <label htmlFor="batch-text" className="sr-only">
              Daftar URL peserta, satu per baris
            </label>
            <textarea
              id="batch-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              rows={8}
              className="input min-h-[170px] flex-1 resize-y font-mono text-xs leading-relaxed"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[10px] text-slate-500">
                {lineCount} baris terdeteksi · satu URL per baris
              </p>
              <div className="flex items-center gap-1.5">
                {text.length > 0 ? (
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-[11px]"
                    onClick={() => setText("")}
                  >
                    <IconX className="h-3.5 w-3.5" />
                    Bersihkan
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-secondary px-2 py-1 text-[11px]"
                  onClick={pasteFromClipboard}
                >
                  <IconClipboard className="h-3.5 w-3.5" />
                  Tempel
                </button>
                <button
                  type="button"
                  className="btn-primary px-2.5 py-1 text-[11px]"
                  onClick={parseText}
                >
                  Sanitasi &amp; Pratinjau
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div role="tabpanel" id="panel-file" aria-labelledby="tab-file">
            <div
              role="button"
              tabIndex={0}
              aria-label="Unggah file txt, csv, atau xlsx"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={`flex min-h-[170px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 ${
                dragging
                  ? "border-rose-500/70 bg-rose-500/10"
                  : "border-slate-700 bg-slate-950/50 hover:border-slate-600 hover:bg-slate-900/50"
              }`}
            >
              {parsing ? (
                <>
                  <IconLoader className="h-7 w-7 animate-spin text-rose-400" />
                  <p className="text-xs font-semibold text-slate-200">Membaca file…</p>
                </>
              ) : (
                <>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300">
                    <IconUpload className="h-5 w-5" />
                  </span>
                  <p className="text-xs font-semibold text-slate-200">
                    Tarik file ke sini atau klik untuk memilih
                  </p>
                  <p className="text-[11px] text-slate-500">
                    .txt · .csv · .xlsx / .xls — semua sheet diekstrak (maks 8 MB)
                  </p>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={acceptedFileTypes()}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {fileInfo ? (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2">
                <IconFile className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <div className="min-w-0 text-[11px]">
                  <p className="truncate font-semibold text-emerald-200">{fileInfo.name}</p>
                  <p className="text-slate-400">
                    {fileInfo.count} entri terbaca
                    {fileInfo.sheets > 0 ? ` · ${fileInfo.sheets} sheet` : ""}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
