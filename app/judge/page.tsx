"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AddUrlsDialog } from "@/components/judge/AddUrlsDialog";
import { AutoAuditBadge } from "@/components/judge/AutoAuditBadge";
import { BulkAutoAudit } from "@/components/judge/BulkAutoAudit";
import { ScoringPanel } from "@/components/judge/ScoringPanel";
import { SplitWindowLauncher } from "@/components/judge/SplitWindowLauncher";
import { WebsiteScreenshotCard } from "@/components/judge/WebsiteScreenshotCard";
import { ResetSessionButton } from "@/components/layout/ResetSessionButton";
import {
  IconCheckCircle,
  IconGauge,
  IconLink,
  IconPlus,
  IconSearch,
  IconTrophy,
} from "@/components/ui/icons";
import { seedUntouchedScore } from "@/lib/autoScore";
import { entryFinalScore, sessionStats } from "@/lib/ranking";
import { totalScore } from "@/lib/scoring";
import type { SessionAdditionPreview } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/useSession";
import type { AuditResult, ScoreDetail } from "@/types";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function JudgePage() {
  const { session, loaded, update } = useSession();
  const [queueQuery, setQueueQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const index = session?.activeIndex ?? 0;
  const total = session?.entries.length ?? 0;
  const current = session?.entries[index];

  const stats = session ? sessionStats(session) : null;
  const currentFinal = current ? entryFinalScore(current) : null;
  const urls = useMemo(() => session?.entries.map((entry) => entry.url) ?? [], [session]);

  const jumpTo = useCallback(
    (nextIndex: number) => {
      update((draft) => {
        draft.activeIndex = Math.max(0, Math.min(draft.entries.length - 1, nextIndex));
      });
    },
    [update],
  );

  const goPrev = useCallback(() => {
    jumpTo(index - 1);
  }, [index, jumpTo]);

  const goNext = useCallback(() => {
    jumpTo(index + 1);
  }, [index, jumpTo]);

  const handleScoreChange = useCallback(
    (patch: Partial<ScoreDetail>) => {
      update((draft) => {
        const entry = draft.entries[draft.activeIndex];
        if (!entry) return;
        entry.score = {
          ...entry.score,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [update],
  );

  const handleSave = useCallback(() => {
    const now = new Date().toISOString();
    update((draft) => {
      const entry = draft.entries[draft.activeIndex];
      if (!entry) return;
      entry.score.updatedAt = now;
      entry.score.judged = true;
    });
    toast("Skor karya disimpan dan ditandai selesai dinilai.", "success");
  }, [update]);

  const currentId = current?.id;

  const handleAuditChange = useCallback(
    (audit: AuditResult | null) => {
      if (!currentId) return;
      update((draft) => {
        const entry = draft.entries.find((item) => item.id === currentId);
        if (entry) {
          entry.audit = audit;
          entry.score = seedUntouchedScore(entry.score, audit);
        }
      });
    },
    [currentId, update],
  );

  const handleAuditForEntry = useCallback(
    (entryId: string, audit: AuditResult) => {
      update((draft) => {
        const entry = draft.entries.find((item) => item.id === entryId);
        if (entry) {
          entry.audit = audit;
          entry.score = seedUntouchedScore(entry.score, audit);
        }
      });
    },
    [update],
  );

  const handleAddUrls = useCallback(
    (preview: SessionAdditionPreview, jumpToNew: boolean) => {
      if (preview.addedEntries.length === 0) return;
      let nextTotal = 0;
      update((draft) => {
        const firstNewIndex = draft.entries.length;
        draft.entries.push(...preview.addedEntries);
        if (preview.ignoredEntries.length > 0) {
          draft.ignored.push(...preview.ignoredEntries);
        }
        if (jumpToNew) {
          draft.activeIndex = firstNewIndex;
        }
        nextTotal = draft.entries.length;
      });
      const skipped = preview.ignoredEntries.length;
      toast(
        `${preview.addedEntries.length} URL baru ditambahkan (total ${nextTotal} karya)${
          skipped > 0 ? ` · ${skipped} duplikat/tidak valid diabaikan` : ""
        }.`,
        "success",
      );
    },
    [update],
  );

  const filteredQueue = useMemo(() => {
    if (!session) return [];
    const query = queueQuery.trim().toLowerCase();
    return session.entries
      .map((entry, entryIndex) => ({ entry, entryIndex }))
      .filter(({ entry }) => !query || entry.url.toLowerCase().includes(query));
  }, [queueQuery, session]);

  if (!loaded) {
    return (
      <main id="konten-utama" className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-6 sm:px-5">
        <div className="card animate-pulse p-5">
          <div className="h-3 w-32 rounded bg-slate-700" />
          <div className="mt-3 h-6 w-64 max-w-full rounded bg-slate-700" />
          <div className="mt-4 h-24 rounded-lg bg-slate-800" />
          <div className="mt-3 h-40 rounded-lg bg-slate-800" />
        </div>
      </main>
    );
  }

  if (!session || !current || !stats) {
    return (
      <main id="konten-utama" className="mx-auto w-full max-w-[720px] flex-1 px-3 py-10 sm:px-5">
        <section className="card p-5 text-center" aria-labelledby="judge-empty-title">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
            <IconGauge className="h-6 w-6" />
          </span>
          <h1 id="judge-empty-title" className="mt-3 text-xl font-bold text-slate-50">
            Belum ada sesi penjurian
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">
            Import daftar URL peserta lebih dulu. Sanitizer akan membuang duplikat, repo Git, dan
            entri tidak valid sebelum sesi dibuat.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/" className="btn-primary">
              <IconLink className="h-4 w-4" />
              Import URL Peserta
            </Link>
            <Link href="/leaderboard" className="btn-secondary">
              <IconTrophy className="h-4 w-4" />
              Lihat Klasemen
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      id="konten-utama"
      className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-4 sm:px-5 sm:py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="label-mono text-rose-400">Live Judging Console</p>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-50 sm:text-xl">
            Split-Window &amp; Scoring
          </h1>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {stats.completionLabel} · {stats.audited}/{stats.total} punya nilai otomatis · rata-rata
            klasemen {stats.averageFinal}/100
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className={
              stats.judged === stats.total
                ? "btn-primary px-2.5 py-1.5 text-[11px]"
                : "btn-secondary px-2.5 py-1.5 text-[11px]"
            }
          >
            <IconPlus className="h-3.5 w-3.5" />
            Tambah URL
          </button>
          <Link href="/leaderboard" className="btn-secondary px-2.5 py-1.5 text-[11px]">
            <IconTrophy className="h-3.5 w-3.5" />
            Klasemen
          </Link>
          <ResetSessionButton className="btn-ghost px-2 py-1.5 text-[11px]" label="Reset" />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="card-quiet px-2.5 py-2">
          <p className="label-mono text-[9px]">Sudah dinilai</p>
          <p className="font-mono text-base font-bold text-emerald-300">
            {stats.judged}
            <span className="text-[10px] font-normal text-slate-500">/{stats.total}</span>
          </p>
        </div>
        <div className="card-quiet px-2.5 py-2">
          <p className="label-mono text-[9px]">Progres</p>
          <div className="mt-1 flex items-center gap-1.5">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-700/70">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${stats.progressPercent}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-slate-300">{stats.progressPercent}%</span>
          </div>
        </div>
        <div className="card-quiet px-2.5 py-2">
          <p className="label-mono text-[9px]">Skor karya aktif</p>
          <p className="font-mono text-base font-bold text-rose-300">
            {currentFinal?.total ?? 0}
            <span className="text-[10px] font-normal text-slate-500">/100</span>
          </p>
          <p className="text-[9px] leading-tight text-slate-500">
            {currentFinal?.source === "judge"
              ? "nilai juri"
              : currentFinal?.source === "auto"
                ? `otomatis · juri ${totalScore(current.score)}`
                : "belum ada nilai"}
          </p>
        </div>
      </div>

      {stats.judged === stats.total && stats.total > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <IconCheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-xs text-emerald-100">
              Semua <span className="font-bold">{stats.total}</span> karya selesai dinilai. Ingin
              menambah 1 atau beberapa URL susulan tanpa menghapus sesi ini?
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="btn-success px-2.5 py-1.5 text-[11px]"
          >
            <IconPlus className="h-3.5 w-3.5" />
            Tambah URL Baru
          </button>
        </div>
      ) : null}

      <div className="mt-3">
        <BulkAutoAudit
          sessionKey={session.createdAt}
          entries={session.entries}
          onAudit={handleAuditForEntry}
        />
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,480px)] lg:items-start lg:gap-4">
        <div className="contents lg:block lg:min-w-0 lg:space-y-3">
          <div className="order-1 min-w-0">
            <SplitWindowLauncher
              url={current.url}
              urls={urls}
              index={index}
              total={total}
              judged={current.score.judged}
              onPrev={goPrev}
              onNext={goNext}
              onJump={jumpTo}
            />
          </div>

          <div className="order-3 min-w-0">
            <AutoAuditBadge
              key={`audit-${current.id}`}
              entry={current}
              onChange={handleAuditChange}
            />
          </div>

          <div className="order-4 min-w-0">
            <section className="card overflow-hidden" aria-labelledby="queue-title">
            <div className="flex items-center justify-between gap-2 border-b border-slate-700/70 px-3 py-2.5">
              <div>
                <p className="label-mono">Antrean Karya</p>
                <h2 id="queue-title" className="text-xs font-bold text-slate-50">
                  {filteredQueue.length} dari {total} URL
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="chip border-slate-600 bg-slate-900 text-slate-400">
                  <IconCheckCircle className="h-3 w-3 text-emerald-400" />
                  {stats.judged} selesai
                </span>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="btn-ghost px-2 py-1 text-[10px] text-rose-300 hover:text-rose-200"
                  title="Tambah 1 atau beberapa URL ke antrean tanpa menghapus sesi"
                >
                  <IconPlus className="h-3 w-3" />
                  Tambah
                </button>
              </div>
            </div>
            <div className="border-b border-slate-700/60 p-2">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={queueQuery}
                  onChange={(event) => setQueueQuery(event.target.value)}
                  placeholder="Cari URL di antrean…"
                  className="input py-1.5 pl-7 text-[11px]"
                  aria-label="Cari URL di antrean"
                />
              </div>
            </div>
            <ul className="max-h-[300px] divide-y divide-slate-800/80 overflow-y-auto">
              {filteredQueue.length === 0 ? (
                <li className="px-3 py-6 text-center text-[11px] text-slate-500">
                  Tidak ada URL yang cocok.
                </li>
              ) : (
                filteredQueue.map(({ entry, entryIndex }) => {
                  const active = entryIndex === index;
                  const rowFinal = entryFinalScore(entry);
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => jumpTo(entryIndex)}
                        aria-current={active ? "true" : undefined}
                        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
                          active
                            ? "bg-rose-500/10 ring-1 ring-inset ring-rose-500/30"
                            : "hover:bg-slate-800/50"
                        }`}
                      >
                        <span
                          className={`w-6 shrink-0 font-mono text-[10px] ${
                            active ? "text-rose-300" : "text-slate-500"
                          }`}
                        >
                          {String(entryIndex + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate font-mono text-[10px] ${
                              active ? "text-slate-100" : "text-slate-300"
                            }`}
                            title={entry.url}
                          >
                            {hostOf(entry.url)}
                          </span>
                          <span className="block truncate text-[9px] text-slate-600">
                            {entry.url}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {entry.score.judged ? (
                            <IconCheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                          ) : entry.score.updatedAt ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                          )}
                          <span
                            className={`w-7 text-right font-mono text-[10px] ${
                              rowFinal.source === "judge"
                                ? "text-emerald-300"
                                : rowFinal.source === "auto"
                                  ? "text-sky-300"
                                  : "text-slate-500"
                            }`}
                            title={
                              rowFinal.source === "judge"
                                ? "Nilai juri"
                                : rowFinal.source === "auto"
                                  ? "Nilai otomatis (sementara)"
                                  : "Belum ada nilai"
                            }
                          >
                            {rowFinal.total}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            </section>
          </div>
        </div>

        <div className="order-2 min-w-0 space-y-3 lg:order-none">
          <WebsiteScreenshotCard entry={current} />
          <ScoringPanel
            key={current.id}
            entry={current}
            index={index}
            total={total}
            onChange={handleScoreChange}
            onSave={handleSave}
          />
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] text-slate-600">
        Gunakan <kbd className="rounded border border-slate-700 bg-slate-900 px-1 font-mono">←</kbd>{" "}
        <kbd className="rounded border border-slate-700 bg-slate-900 px-1 font-mono">→</kbd> untuk
        berpindah karya tanpa menutup jendela preview.
      </p>

      <AddUrlsDialog
        open={addOpen}
        existingEntries={session.entries}
        onClose={() => setAddOpen(false)}
        onAdd={handleAddUrls}
      />
    </main>
  );
}
