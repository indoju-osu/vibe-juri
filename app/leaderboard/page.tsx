"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ResetSessionButton } from "@/components/layout/ResetSessionButton";
import {
  IconAlertTriangle,
  IconDownload,
  IconExternal,
  IconGauge,
  IconLoader,
  IconMonitor,
  IconSearch,
  IconSparkles,
  IconTrophy,
  IconX,
} from "@/components/ui/icons";
import { EXPORT_FILENAME, exportSessionToXlsx } from "@/lib/exporter";
import { entryBreakdown, sessionStats, sortEntries } from "@/lib/ranking";
import { focusPreviewWindow, openPreviewWindow } from "@/lib/splitWindow";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/useSession";
import type { JudgeEntry } from "@/types";

type StatusFilter = "all" | "judged" | "pending";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function rankBadge(rank: number): string {
  if (rank === 1) return "border-amber-400/60 bg-amber-400/15 text-amber-300";
  if (rank === 2) return "border-slate-300/40 bg-slate-300/10 text-slate-200";
  if (rank === 3) return "border-orange-500/50 bg-orange-500/10 text-orange-300";
  return "border-slate-700 bg-slate-900 text-slate-400";
}

export default function LeaderboardPage() {
  const router = useRouter();
  const { session, loaded, update } = useSession();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [exporting, setExporting] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const ranked = useMemo(
    () =>
      session
        ? sortEntries(session.entries).map((entry, entryIndex) => ({
            entry,
            rank: entryIndex + 1,
            sourceIndex: session.entries.findIndex((item) => item.id === entry.id),
          }))
        : [],
    [session],
  );

  const stats = session ? sessionStats(session) : null;

  const counts = useMemo(() => {
    const judged = ranked.filter(({ entry }) => entry.score.judged).length;
    return { all: ranked.length, judged, pending: ranked.length - judged };
  }, [ranked]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ranked.filter(({ entry }) => {
      if (normalized && !entry.url.toLowerCase().includes(normalized)) return false;
      if (filter === "judged" && !entry.score.judged) return false;
      if (filter === "pending" && entry.score.judged) return false;
      return true;
    });
  }, [filter, query, ranked]);

  useEffect(() => {
    setPopupBlocked(false);
  }, [session]);

  const reviewEntry = (entry: JudgeEntry, sourceIndex: number) => {
    const popup = openPreviewWindow(entry.url);
    if (!popup) {
      setPopupBlocked(true);
      toast(
        "Popup diblokir. Izinkan pop-up untuk situs ini di address bar, lalu klik ulang tombol Split-Window.",
        "error",
      );
      return;
    }
    focusPreviewWindow(popup);
    if (sourceIndex >= 0) {
      update((draft) => {
        draft.activeIndex = sourceIndex;
      });
    }
    setPopupBlocked(false);
    toast(
      `Preview ${hostOf(entry.url)} dibuka di 75% kiri. Buka Panel Juri untuk memberi skor.`,
      "success",
    );
  };

  const openJudgeAt = (sourceIndex: number) => {
    if (sourceIndex >= 0) {
      update((draft) => {
        draft.activeIndex = sourceIndex;
      });
    }
    router.push("/judge");
  };

  const handleExport = async () => {
    if (!session || exporting) return;
    if (session.entries.length === 0) {
      toast("Tidak ada karya untuk diekspor.", "warning");
      return;
    }
    setExporting(true);
    try {
      const result = await exportSessionToXlsx(session);
      toast(
        `${result.filename} diunduh: ${result.rows} karya + ${result.ignoredRows} entri diabaikan (2 sheet).`,
        "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membuat file Excel";
      toast(message, "error");
    } finally {
      setExporting(false);
    }
  };

  if (!loaded) {
    return (
      <main id="konten-utama" className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-6 sm:px-5">
        <div className="card animate-pulse p-5">
          <div className="h-3 w-28 rounded bg-slate-700" />
          <div className="mt-3 h-6 w-56 max-w-full rounded bg-slate-700" />
          <div className="mt-4 h-28 rounded-lg bg-slate-800" />
        </div>
      </main>
    );
  }

  if (!session || !stats) {
    return (
      <main id="konten-utama" className="mx-auto w-full max-w-[720px] flex-1 px-3 py-10 sm:px-5">
        <section className="card p-5 text-center" aria-labelledby="lb-empty-title">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
            <IconTrophy className="h-6 w-6" />
          </span>
          <h1 id="lb-empty-title" className="mt-3 text-xl font-bold text-slate-50">
            Klasemen belum tersedia
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">
            Import URL peserta untuk mengisi klasemen sementara otomatis. Nilai juri (default 0)
            akan menggantikan nilai otomatis begitu disimpan.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/" className="btn-primary">
              <IconSparkles className="h-4 w-4" />
              Import URL Peserta
            </Link>
            <Link href="/judge" className="btn-secondary">
              <IconGauge className="h-4 w-4" />
              Panel Juri
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      id="konten-utama"
      className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-4 sm:px-5 sm:py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="label-mono text-emerald-400">Rekap Akhir</p>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-50 sm:text-xl">
            Klasemen &amp; Ekspor Laporan
          </h1>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Peringkat memakai skor akhir: nilai juri bila sudah disimpan, selain itu{" "}
            <span className="text-slate-300">Produk/UX + Security otomatis</span> (Personal 0,
            ditambahkan saat juri mengisi). Tie-breaker: Produk/UX → Security → Personal → otomatis
            → URL.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ResetSessionButton className="btn-ghost px-2 py-1.5 text-[11px]" label="Reset" />
          <button
            type="button"
            className="btn-primary px-2.5 py-1.5 text-[11px]"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <IconLoader className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <IconDownload className="h-3.5 w-3.5" />
            )}
            {exporting ? "Menyiapkan…" : "Export Excel"}
          </button>
        </div>
      </div>

      {popupBlocked ? (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2"
        >
          <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-rose-100">
            Pop-up diblokir browser. Klik ikon pop-up di address bar, pilih “Selalu izinkan situs
            ini”, lalu coba tombol <span className="font-mono">Split-Window</span> lagi.
          </p>
          <button
            type="button"
            onClick={() => setPopupBlocked(false)}
            className="rounded p-0.5 text-rose-300 hover:bg-rose-500/10"
            aria-label="Tutup peringatan pop-up"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Total karya", value: String(stats.total), tone: "text-slate-50" },
          { label: "Sudah dinilai", value: `${stats.judged}`, tone: "text-emerald-300" },
          { label: "Nilai otomatis", value: `${stats.audited}/${stats.total}`, tone: "text-sky-300" },
          { label: "Rata-rata klasemen", value: `${stats.averageFinal}`, tone: "text-rose-300" },
        ].map((item) => (
          <div key={item.label} className="card-quiet px-2.5 py-2">
            <p className="label-mono text-[9px]">{item.label}</p>
            <p className={`font-mono text-lg font-bold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {stats.pendingAudit > 0 ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/5 px-2.5 py-2 text-[11px] leading-relaxed text-sky-100/90">
          <IconSparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
          <span className="min-w-0">
            {stats.pendingAudit} karya belum punya nilai otomatis. Audit berjalan otomatis saat{" "}
            <Link href="/judge" className="underline decoration-sky-400/60 hover:text-sky-50">
              panel juri
            </Link>{" "}
            dibuka — klasemen akan terisi sendiri.
          </span>
        </p>
      ) : null}

      <section className="card mt-3 overflow-hidden" aria-labelledby="ranking-title">
        <div className="flex flex-col gap-2 border-b border-slate-700/70 px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="label-mono text-rose-400">Peringkat Real-Time</p>
              <h2 id="ranking-title" className="text-sm font-bold text-slate-50">
                {filtered.length} karya ditampilkan
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="chip border-slate-600 bg-slate-900 text-slate-400">
                {session.ignored.length} diabaikan
              </span>
              <span className="hidden font-mono text-[10px] text-slate-500 sm:inline">
                {EXPORT_FILENAME}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari URL karya…"
                aria-label="Cari URL karya di klasemen"
                className="input py-1.5 pl-8 text-xs"
              />
            </div>
            <div
              role="tablist"
              aria-label="Filter status penilaian"
              className="grid shrink-0 grid-cols-3 gap-1 rounded-lg border border-slate-700/70 bg-slate-950/60 p-1"
            >
              {(
                [
                  { id: "all", label: "Semua", count: counts.all },
                  { id: "judged", label: "Sudah", count: counts.judged },
                  { id: "pending", label: "Belum", count: counts.pending },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === item.id}
                  aria-label={
                    item.id === "judged"
                      ? "Sudah Dinilai"
                      : item.id === "pending"
                        ? "Belum Dinilai"
                        : "Semua"
                  }
                  onClick={() => setFilter(item.id)}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 ${
                    filter === item.id
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {item.label}
                  <span className="sr-only">
                    {item.id === "judged"
                      ? " Dinilai"
                      : item.id === "pending"
                        ? " Dinilai"
                        : ""}
                  </span>{" "}
                  <span className="font-mono text-[9px] opacity-70">{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1140px] border-collapse text-left text-xs">
            <caption className="sr-only">
              Klasemen karya peserta dengan nilai otomatis Produk/UX + Security, nilai juri, dan
              skor akhir
            </caption>
            <thead className="bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th scope="col" className="w-14 px-2 py-2 text-center font-semibold">Rank</th>
                <th scope="col" className="px-2 py-2 font-semibold">URL Karya</th>
                <th scope="col" className="w-20 px-2 py-2 text-center font-semibold">
                  Produk/UX
                  <span className="block font-mono text-[9px] normal-case text-slate-500">/60</span>
                </th>
                <th scope="col" className="w-20 px-2 py-2 text-center font-semibold">
                  Security
                  <span className="block font-mono text-[9px] normal-case text-slate-500">/25</span>
                </th>
                <th scope="col" className="w-16 px-2 py-2 text-center font-semibold">
                  Personal
                  <span className="block font-mono text-[9px] normal-case text-slate-500">/15</span>
                </th>
                <th scope="col" className="w-24 px-2 py-2 text-center font-semibold text-sky-300">
                  Otomatis
                  <span className="block font-mono text-[9px] normal-case text-slate-500">
                    Prod+Sec /85
                  </span>
                </th>
                <th scope="col" className="w-20 px-2 py-2 text-center font-semibold">
                  Juri
                  <span className="block font-mono text-[9px] normal-case text-slate-500">/100</span>
                </th>
                <th scope="col" className="w-20 px-2 py-2 text-center font-semibold text-rose-300">
                  Akhir
                  <span className="block font-mono text-[9px] normal-case text-slate-500">/100</span>
                </th>
                <th scope="col" className="w-28 px-2 py-2 font-semibold">Status</th>
                <th scope="col" className="w-56 px-2 py-2 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-xs text-slate-500">
                    Tidak ada karya yang cocok dengan pencarian / filter.
                  </td>
                </tr>
              ) : (
                filtered.map(({ entry, rank, sourceIndex }) => {
                  const breakdown = entryBreakdown(entry);
                  return (
                    <tr key={entry.id} className="align-middle hover:bg-slate-800/40">
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1 font-mono text-[11px] font-bold ${rankBadge(rank)}`}
                        >
                          {rank}
                        </span>
                      </td>
                      <td className="max-w-[300px] px-2 py-2">
                        <span
                          className="block truncate font-mono text-[11px] text-slate-100"
                          title={entry.url}
                        >
                          {entry.url}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[9px] text-slate-500">
                          <span>{hostOf(entry.url)}</span>
                          {entry.score.notes ? (
                            <span
                              className="chip border-slate-700 bg-slate-900 text-slate-400"
                              title={entry.score.notes}
                            >
                              catatan
                            </span>
                          ) : null}
                          {entry.audit ? (
                            <span
                              className={`chip ${
                                breakdown.auto === null
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                  : "border-sky-500/30 bg-sky-500/10 text-sky-300"
                              }`}
                              title={
                                entry.audit.error
                                  ? `Audit gagal: ${entry.audit.error}`
                                  : "Sudah diaudit otomatis"
                              }
                            >
                              {entry.audit.error ? "audit gagal" : "audit"}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td
                        className={`px-2 py-2 text-center font-mono text-[11px] ${
                          breakdown.source === "auto" ? "text-sky-200" : "text-emerald-300"
                        }`}
                        title={
                          breakdown.source === "auto"
                            ? "Produk/UX otomatis (belum dinilai juri)"
                            : "Produk/UX dari nilai juri"
                        }
                      >
                        {breakdown.effProduct}
                      </td>
                      <td
                        className={`px-2 py-2 text-center font-mono text-[11px] ${
                          breakdown.source === "auto" ? "text-sky-200" : "text-sky-300"
                        }`}
                        title={
                          breakdown.source === "auto"
                            ? `Security otomatis · XSS ${breakdown.secAutoXss} · Auth ${breakdown.secAutoAuth} · Data ${breakdown.secAutoData} · Hdr ${breakdown.secAutoHeaders} · Logika ${breakdown.secAutoLogic}`
                            : "Security dari nilai juri"
                        }
                      >
                        {breakdown.effSecurity}
                      </td>
                      <td className="px-2 py-2 text-center font-mono text-[11px] text-amber-300">
                        {breakdown.personal}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`font-mono text-[11px] ${
                            breakdown.provisional === null
                              ? "text-slate-600"
                              : breakdown.source === "auto"
                                ? "font-bold text-sky-200"
                                : "text-sky-400/70"
                          }`}
                          title={
                            breakdown.provisional === null
                              ? "Belum diaudit otomatis"
                              : `Produk/UX ${breakdown.autoProduct}/60 + Security ${breakdown.secAuto}/25 = ${breakdown.provisional}/85 · Produk detail: MVP ${breakdown.autoMvp} · UI/UX ${breakdown.autoUiux} · Fitur ${breakdown.autoFeatures} · Performa ${breakdown.autoPerformance}`
                          }
                        >
                          {breakdown.provisional ?? "—"}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`font-mono text-[11px] ${
                            entry.score.judged
                              ? "font-bold text-emerald-200"
                              : entry.score.updatedAt
                                ? "text-amber-300/80"
                                : "text-slate-600"
                          }`}
                          title={entry.score.judged ? "Nilai juri (final)" : "Draft juri / default 0"}
                        >
                          {breakdown.judge}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`inline-flex min-w-12 justify-center rounded-md border px-1.5 py-0.5 font-mono text-xs font-bold ${
                            breakdown.source === "judge"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              : breakdown.source === "auto"
                                ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                                : "border-slate-700 bg-slate-900 text-slate-400"
                          }`}
                        >
                          {breakdown.total}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {entry.score.judged ? (
                          <span className="chip border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                            Dinilai Juri
                          </span>
                        ) : breakdown.provisional !== null ? (
                          <span className="chip border-rose-500/30 bg-rose-500/10 text-rose-300">
                            Sementara
                          </span>
                        ) : entry.score.updatedAt ? (
                          <span className="chip border-amber-500/30 bg-amber-500/10 text-amber-300">
                            Draft
                          </span>
                        ) : (
                          <span className="chip border-slate-600 bg-slate-900 text-slate-400">
                            Belum Dinilai
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-nowrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => reviewEntry(entry, sourceIndex)}
                            className="btn-secondary px-1.5 py-1 text-[10px]"
                            title="Buka preview karya di jendela kiri 75%"
                          >
                            <IconMonitor className="h-3 w-3" />
                            Split-Window
                          </button>
                          <button
                            type="button"
                            onClick={() => openJudgeAt(sourceIndex)}
                            className="btn-ghost px-1.5 py-1 text-[10px]"
                            title="Buka panel penilaian untuk karya ini"
                          >
                            <IconGauge className="h-3 w-3" />
                            Nilai
                          </button>
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-ghost px-1 py-1 text-[10px]"
                            aria-label={`Buka ${entry.url} di tab baru`}
                            title="Buka di tab baru"
                          >
                            <IconExternal className="h-3 w-3" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-700/70 bg-slate-900/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-[10px] leading-relaxed text-slate-500">
            Excel berisi 2 sheet: <span className="text-slate-300">Peringkat &amp; Audit Lengkap</span>{" "}
            (termasuk kolom nilai otomatis, nilai juri, dan skor akhir) dan{" "}
            <span className="text-slate-300">Duplikat &amp; Tidak Valid</span>. File:{" "}
            <span className="font-mono text-slate-400">{EXPORT_FILENAME}</span>
          </p>
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-xs"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <IconLoader className="h-4 w-4 animate-spin" />
            ) : (
              <IconDownload className="h-4 w-4" />
            )}
            Unduh Laporan (.xlsx)
          </button>
        </div>
      </section>
    </main>
  );
}
