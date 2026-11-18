"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UrlBatchImporter } from "@/components/import/UrlBatchImporter";
import { SanitizerPreviewTable } from "@/components/import/SanitizerPreviewTable";
import { ResetSessionButton } from "@/components/layout/ResetSessionButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  IconArrowRight,
  IconCheckCircle,
  IconGauge,
  IconLayout,
  IconShield,
  IconSparkles,
  IconTrophy,
} from "@/components/ui/icons";
import { sessionStats } from "@/lib/ranking";
import { SAMPLE_RAW_URLS } from "@/lib/sampleData";
import { SECURITY_FIELDS } from "@/lib/scoring";
import { buildSession } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { cleanBatch, type BatchCleanResult } from "@/lib/urlCleaner";
import { useSession } from "@/lib/useSession";

const PILLARS = [
  {
    label: "Produk, UI/UX & Performa",
    max: 60,
    accent: "bg-emerald-500",
    text: "text-emerald-300",
    border: "border-emerald-500/30",
    detail: "MVP 25 · UI/UX 20 · Fitur & performa 15",
  },
  {
    label: "Top 5 Security Testing",
    max: 25,
    accent: "bg-sky-500",
    text: "text-sky-300",
    border: "border-sky-500/30",
    detail: "XSS · Auth · Data · Headers · Logika bisnis",
  },
  {
    label: "Penilaian Personal Juri",
    max: 15,
    accent: "bg-amber-500",
    text: "text-amber-300",
    border: "border-amber-500/30",
    detail: "Orisinalitas, kreativitas vibe & manfaat",
  },
];

export default function HomePage() {
  const router = useRouter();
  const { session, loaded, replaceSession } = useSession();
  const [preview, setPreview] = useState<BatchCleanResult | null>(null);
  const [sourceLabel, setSourceLabel] = useState("—");
  const [confirmReplace, setConfirmReplace] = useState(false);

  const stats = session ? sessionStats(session) : null;

  const handleEntries = (entries: string[], meta: { label: string }) => {
    const result = cleanBatch(entries);
    setPreview(result);
    setSourceLabel(meta.label);
    if (result.valid.length === 0) {
      toast(
        `Tidak ada URL valid (${result.ignored.length} entri diabaikan). Periksa format daftar.`,
        "warning",
      );
      return;
    }
    toast(
      `${result.valid.length} URL valid unik · ${result.ignored.length} duplikat/tidak valid.`,
      "success",
    );
  };

  const handleLoadSample = () => {
    const result = cleanBatch(SAMPLE_RAW_URLS);
    setPreview(result);
    setSourceLabel("Data contoh built-in (60 proyek)");
    toast(
      `Data contoh dimuat: ${result.valid.length} URL valid + ${result.ignored.length} diabaikan.`,
      "success",
    );
    requestAnimationFrame(() => {
      document.getElementById("preview-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const launchJudging = () => {
    if (!preview || preview.valid.length === 0) {
      toast("Import URL valid terlebih dahulu.", "warning");
      return;
    }
    const next = buildSession(preview.valid, preview.ignored);
    replaceSession(next);
    setConfirmReplace(false);
    toast(`Sesi baru dibuat: ${next.entries.length} karya siap dinilai.`, "success");
    router.push("/judge");
  };

  const handleStart = () => {
    if (!preview || preview.valid.length === 0) {
      toast("Import URL valid terlebih dahulu.", "warning");
      return;
    }
    if (session && session.entries.length > 0) {
      setConfirmReplace(true);
      return;
    }
    launchJudging();
  };

  return (
    <main
      id="konten-utama"
      className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-5 sm:px-5 sm:py-8"
    >
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-stretch">
        <div className="flex min-w-0 flex-col justify-center">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip border-rose-500/30 bg-rose-500/10 text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              Vibe Coding Judging Console
            </span>
            <span className="chip border-slate-700 bg-slate-900 text-slate-400">
              Next.js · Local-first
            </span>
          </div>
          <h1 className="mt-3 text-balance text-2xl font-extrabold leading-[1.15] tracking-tight text-slate-50 sm:text-4xl lg:text-[2.65rem]">
            Nilai karya. Uji keamanan.
            <span className="block text-rose-400">Tanpa diblokir iframe.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-[15px]">
            Vibe-Juri menggabungkan split-window controller 75/25, rubrik 100 poin berbasis OWASP,
            dan ekspor Excel 2 sheet. Juri menguji aplikasi peserta di jendela kiri sementara panel
            skor tetap presisi di 25% kanan layar.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <a href="#import" className="btn-primary">
              <IconArrowRight className="h-4 w-4" />
              Mulai Import URL
            </a>
            <button type="button" className="btn-secondary" onClick={handleLoadSample}>
              <IconSparkles className="h-4 w-4 text-amber-300" />
              Muat 60 Proyek Contoh
            </button>
            {session ? (
              <Link href="/judge" className="btn-ghost">
                <IconGauge className="h-4 w-4" />
                Lanjutkan Sesi
              </Link>
            ) : null}
          </div>

          <dl className="mt-5 grid max-w-xl grid-cols-3 gap-2">
            {[
              { value: "9", label: "Komponen skor" },
              { value: "75/25", label: "Split window" },
              { value: "2", label: "Sheet Excel" },
            ].map((item) => (
              <div key={item.label} className="card-quiet px-2.5 py-2">
                <dt className="label-mono">{item.label}</dt>
                <dd className="mt-0.5 font-mono text-lg font-bold text-slate-50">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside
          className="card flex min-w-0 flex-col p-3 sm:p-4"
          aria-labelledby="rubrik-title"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="label-mono text-rose-400">Rubrik Penilaian</p>
              <h2 id="rubrik-title" className="text-sm font-bold text-slate-50">
                Total maksimal 100 poin
              </h2>
            </div>
            <IconTrophy className="h-5 w-5 text-amber-300" />
          </div>
          <ul className="mt-3 space-y-2.5">
            {PILLARS.map((pillar) => (
              <li key={pillar.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">{pillar.label}</span>
                  <span className={`font-mono text-sm font-bold ${pillar.text}`}>{pillar.max}</span>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-500">{pillar.detail}</p>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-700/70">
                  <div className={`h-full ${pillar.accent}`} style={{ width: `${pillar.max}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-950/50 px-2.5 py-2">
            <IconShield className="h-4 w-4 shrink-0 text-sky-400" />
            <p className="text-[10px] leading-snug text-slate-400">
              Preview menggunakan <span className="font-mono text-slate-200">window.open()</span>{" "}
              sehingga CSP dan <span className="font-mono">X-Frame-Options</span> peserta tidak
              memblokir audit.
            </p>
          </div>
        </aside>
      </section>

      {loaded && session && stats ? (
        <section
          className="mt-4 flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-gradient-to-r from-rose-950/40 via-slate-900/70 to-slate-900/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
          aria-label="Sesi penjurian aktif"
        >
          <div className="min-w-0">
            <p className="label-mono text-rose-300">Sesi Aktif</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-100">
              {stats.completionLabel}
              <span className="ml-2 font-mono text-xs text-slate-400">
                · rata-rata {stats.averageTotal} / 100
              </span>
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-slate-700/70">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${stats.progressPercent}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-slate-400">{stats.progressPercent}%</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/judge" className="btn-primary px-2.5 py-1.5 text-xs">
              <IconGauge className="h-3.5 w-3.5" />
              Lanjut Menilai
            </Link>
            <Link href="/leaderboard" className="btn-secondary px-2.5 py-1.5 text-xs">
              <IconTrophy className="h-3.5 w-3.5" />
              Klasemen
            </Link>
            <ResetSessionButton className="btn-ghost px-2 py-1.5 text-xs" />
          </div>
        </section>
      ) : null}

      <section id="import" className="mt-5 scroll-mt-20" aria-label="Import dan sanitasi URL">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <UrlBatchImporter onEntries={handleEntries} />
          <SanitizerPreviewTable
            result={preview}
            sourceLabel={sourceLabel}
            sessionActive={Boolean(session && session.entries.length > 0)}
            onStart={handleStart}
            onLoadSample={handleLoadSample}
          />
        </div>
      </section>

      <section className="mt-6" aria-labelledby="alur-title">
        <div className="mb-2.5 flex items-end justify-between gap-2">
          <div>
            <p className="label-mono text-slate-500">Workflow</p>
            <h2 id="alur-title" className="text-base font-bold text-slate-50">
              Tiga langkah, satu sesi penjurian
            </h2>
          </div>
          <span className="hidden font-mono text-[10px] text-slate-600 sm:block">
            import → audit → klasemen
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              icon: IconLayout,
              step: "01",
              title: "Import & sanitasi",
              body: "Tempel teks, unggah .txt/.csv/.xlsx, deduplikasi otomatis, dan tolak repo Git atau entri non-URL.",
              accent: "text-sky-400 border-sky-500/30",
            },
            {
              icon: IconShield,
              step: "02",
              title: "Uji & nilai",
              body: "Buka 75% kiri, panel 25% kanan. Skor 9 komponen dengan shortcut keyboard dan autosave lokal.",
              accent: "text-rose-400 border-rose-500/30",
            },
            {
              icon: IconTrophy,
              step: "03",
              title: "Klasemen & ekspor",
              body: "Peringkat real-time dengan tie-breaker, filter status, lalu unduh laporan Excel 2 sheet.",
              accent: "text-emerald-400 border-emerald-500/30",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.step} className="card flex gap-3 p-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-slate-950/60 ${item.accent}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-slate-500">{item.step}</p>
                  <h3 className="text-sm font-bold text-slate-100">{item.title}</h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{item.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-6" aria-labelledby="security-scope-title">
        <div className="card p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="label-mono text-sky-400">Top 5 Security Testing</p>
              <h2 id="security-scope-title" className="text-base font-bold text-slate-50">
                Checklist keamanan yang diuji juri
              </h2>
            </div>
            <Link href="/judge" className="btn-secondary px-2.5 py-1.5 text-[11px]">
              <IconCheckCircle className="h-3.5 w-3.5" />
              Buka Panel Juri
            </Link>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {SECURITY_FIELDS.map((field, index) => (
              <li
                key={field.field}
                className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-2.5"
              >
                <p className="flex items-center justify-between font-mono text-[10px] text-slate-500">
                  <span>SEC 0{index + 1}</span>
                  <span className="text-sky-300">{field.max} pt</span>
                </p>
                <p className="mt-1 text-[11px] font-semibold text-slate-200">{field.short}</p>
                <p className="mt-0.5 line-clamp-3 text-[10px] leading-snug text-slate-500">
                  {field.helper}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ConfirmDialog
        open={confirmReplace}
        danger
        title="Ganti sesi penjurian aktif?"
        description={`Sesi saat ini berisi ${session?.entries.length ?? 0} karya (${
          stats?.completionLabel ?? "0 / 0 dinilai"
        }). Memulai batch baru akan mengganti daftar URL dan skor yang tersimpan di browser ini.`}
        confirmLabel="Ganti & mulai baru"
        cancelLabel="Simpan sesi lama"
        onConfirm={launchJudging}
        onCancel={() => setConfirmReplace(false)}
      />
    </main>
  );
}
