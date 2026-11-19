"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconCheck,
  IconExternal,
  IconPlus,
  IconRefresh,
  IconSparkles,
  IconTrophy,
  IconX,
} from "@/components/ui/icons";
import {
  playChampionFanfare,
  playDrumroll,
  playRevealChime,
  playSpotlightClick,
} from "@/lib/kahootAudio";
import { entryFinalScore } from "@/lib/ranking";
import type { JudgeEntry } from "@/types";

const WINNERS_CONFIG_KEY = "vibe-juri.winners.v1";

interface CustomCategory {
  id: string;
  name: string;
  entryId: string;
}

interface WinnersConfig {
  title: string;
  topCount: 3 | 5;
  highlightRank: 1 | 2 | 3;
  overrides: Record<number, string>;
  customCategories: CustomCategory[];
}

const DEFAULT_CONFIG: WinnersConfig = {
  title: "Pengumuman Juara Vibe Coding",
  topCount: 5,
  highlightRank: 1,
  overrides: {},
  customCategories: [],
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function loadConfig(): WinnersConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(WINNERS_CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<WinnersConfig>;
    return {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : DEFAULT_CONFIG.title,
      topCount: parsed.topCount === 3 ? 3 : 5,
      highlightRank: parsed.highlightRank === 2 || parsed.highlightRank === 3 ? parsed.highlightRank : 1,
      overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
      customCategories: Array.isArray(parsed.customCategories) ? parsed.customCategories : [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vRot: number;
  life: number;
}

const CONFETTI_COLORS = ["#facc15", "#f43f5e", "#38bdf8", "#34d399", "#a855f7", "#fb923c"];

export function WinnersPodiumModal({
  open,
  entries,
  onClose,
}: {
  open: boolean;
  entries: JudgeEntry[];
  onClose: () => void;
}) {
  const [config, setConfig] = useState<WinnersConfig>(DEFAULT_CONFIG);
  const [editing, setEditing] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [revealedUpTo, setRevealedUpTo] = useState<number>(5);
  const [announcing, setAnnouncing] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  const updateConfig = useCallback((updater: (prev: WinnersConfig) => WinnersConfig) => {
    setConfig((prev) => {
      const next = updater(prev);
      try {
        window.localStorage.setItem(WINNERS_CONFIG_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const launchConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: ConfettiParticle[] = Array.from({ length: 140 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? canvas.width * 0.18 : canvas.width * 0.82,
        y: canvas.height * 0.42,
        vx: (fromLeft ? 1 : -1) * (2 + Math.random() * 8) + (Math.random() - 0.5) * 4,
        vy: -7 - Math.random() * 9,
        size: 6 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.25,
        life: 160 + Math.random() * 70,
      };
    });

    let frame = 0;
    const tick = () => {
      frame += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        if (p.life <= 0) continue;
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.26;
        p.vx *= 0.99;
        p.rot += p.vRot;
        p.life -= 1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, p.life / 40);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (alive && frame < 240) {
        requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (!open) {
      clearTimers();
      setAnnouncing(false);
      setStatusBanner(null);
      return;
    }
    setRevealedUpTo(config.topCount);
  }, [open, config.topCount, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const winners = useMemo(() => {
    const list: { rank: number; entry: JudgeEntry; score: number }[] = [];
    for (let rank = 1; rank <= config.topCount; rank += 1) {
      const overrideId = config.overrides[rank];
      const matched =
        (overrideId ? entries.find((item) => item.id === overrideId) : undefined) ??
        entries[rank - 1];
      if (matched) {
        list.push({
          rank,
          entry: matched,
          score: entryFinalScore(matched).total,
        });
      }
    }
    return list;
  }, [config.overrides, config.topCount, entries]);

  const startKahootCeremony = () => {
    clearTimers();
    setEditing(false);
    setAnnouncing(true);
    setRevealedUpTo(0);
    setStatusBanner("Menyiapkan panggung juara…");
    playDrumroll(1100, soundOn);

    const t1 = window.setTimeout(() => {
      setRevealedUpTo(3);
      setStatusBanner("Juara 3!");
      playRevealChime(3, soundOn);
    }, 1100);

    const t2 = window.setTimeout(() => {
      setRevealedUpTo(2);
      setStatusBanner("Juara 2!");
      playRevealChime(2, soundOn);
    }, 2500);

    const t3 = window.setTimeout(() => {
      setStatusBanner("Siap untuk Juara 1…");
      playDrumroll(1500, soundOn);
    }, 3900);

    const t4 = window.setTimeout(() => {
      setRevealedUpTo(config.topCount);
      updateConfig((prev) => ({ ...prev, highlightRank: 1 }));
      setStatusBanner("Selamat kepada Juara 1!");
      setAnnouncing(false);
      playChampionFanfare(soundOn);
      launchConfetti();
    }, 5500);

    timersRef.current.push(t1, t2, t3, t4);
  };

  if (!open) return null;

  const podiumOrder = [2, 1, 3] as const;
  const topFourFive = winners.filter((w) => w.rank >= 4);
  const highlightedWinner = winners.find((w) => w.rank === config.highlightRank) ?? winners[0];

  const isRankVisible = (rank: number) => {
    if (!announcing && revealedUpTo >= config.topCount) return true;
    if (rank === 3) return revealedUpTo >= 3 || revealedUpTo === 1 || revealedUpTo >= 5;
    if (rank === 2) return revealedUpTo >= 2 && revealedUpTo !== 3;
    if (rank === 1) return revealedUpTo >= 1 && revealedUpTo !== 2 && revealedUpTo !== 3;
    return revealedUpTo >= rank;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Panggung Pengumuman Juara"
      className="fixed inset-0 z-50 overflow-y-auto bg-[#1b064f] text-white"
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      />

      {/* Latar panggung Kahoot */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(168,85,247,0.45),rgba(27,6,79,0.96)_62%)]"
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col px-4 py-5 sm:px-6">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-400/20 text-amber-300">
              <IconTrophy className="h-5 w-5" />
            </span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-purple-200">
                Panggung Pemenang · Top {config.topCount}
              </p>
              <h2 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                {config.title}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundOn((prev) => !prev)}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              {soundOn ? "🔊 Suara Aktif" : "🔇 Senyap"}
            </button>
            <button
              type="button"
              onClick={startKahootCeremony}
              disabled={winners.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-extrabold text-slate-950 shadow-lg transition hover:bg-amber-300 disabled:opacity-50"
            >
              <IconSparkles className="h-4 w-4" />
              {announcing ? "Mengumumkan…" : "Mulai Pengumuman Meriah"}
            </button>
            <button
              type="button"
              onClick={() => {
                launchConfetti();
                playChampionFanfare(soundOn);
              }}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              title="Putar ulang konfeti dan fanfare"
            >
              🎉 Efek
            </button>
            <button
              type="button"
              onClick={() => setEditing((prev) => !prev)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                editing
                  ? "border-amber-300 bg-amber-400/20 text-amber-200"
                  : "border-white/20 bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {editing ? "Tutup Edit" : "✏️ Edit Juara"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500/80"
            >
              <IconX className="h-4 w-4" />
              Tutup
            </button>
          </div>
        </div>

        {/* Status / Spotlight banner */}
        {statusBanner ? (
          <div className="mt-4 text-center">
            <span className="inline-block rounded-full border border-amber-300/40 bg-amber-400/20 px-4 py-1 text-xs font-bold tracking-wide text-amber-200">
              {statusBanner}
            </span>
          </div>
        ) : null}

        {/* Sorotan Utama */}
        {highlightedWinner && isRankVisible(highlightedWinner.rank) ? (
          <div className="mx-auto mt-5 w-full max-w-2xl rounded-2xl border border-amber-300/40 bg-white/10 px-5 py-4 text-center shadow-2xl backdrop-blur-md">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">
              ★ Sorotan Juara {highlightedWinner.rank} ★
            </p>
            <a
              href={highlightedWinner.entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-2 text-2xl font-black tracking-tight text-white hover:text-amber-300 sm:text-3xl"
            >
              {hostOf(highlightedWinner.entry.url)}
              <IconExternal className="h-5 w-5 opacity-75" />
            </a>
            <p className="mt-1 truncate font-mono text-xs text-purple-200">
              {highlightedWinner.entry.url}
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3.5 py-1 font-mono text-sm font-black text-slate-950">
              Skor Akhir: {highlightedWinner.score} / 100
            </p>
          </div>
        ) : null}

        {/* Podium 2 - 1 - 3 */}
        <div className="mt-8 grid flex-1 grid-cols-1 items-end gap-4 sm:grid-cols-3">
          {podiumOrder.map((rank) => {
            const item = winners.find((w) => w.rank === rank);
            if (!item) return <div key={rank} className="hidden sm:block" />;
            const visible = isRankVisible(rank);
            const highlighted = config.highlightRank === rank;
            const heightClass =
              rank === 1 ? "min-h-[210px]" : rank === 2 ? "min-h-[160px]" : "min-h-[130px]";
            const pillarColor =
              rank === 1
                ? "bg-amber-400 text-slate-950 border-amber-200"
                : rank === 2
                  ? "bg-slate-200 text-slate-950 border-white"
                  : "bg-orange-400 text-slate-950 border-orange-200";

            return (
              <button
                key={rank}
                type="button"
                onClick={() => {
                  updateConfig((prev) => ({ ...prev, highlightRank: rank }));
                  playSpotlightClick(soundOn);
                }}
                className={`group flex flex-col items-center text-center transition-all duration-500 ${
                  visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
                }`}
              >
                <div
                  className={`mb-3 w-full rounded-xl border px-3 py-3 transition ${
                    highlighted
                      ? "border-amber-300 bg-white/20 shadow-[0_0_35px_rgba(251,191,36,0.45)]"
                      : "border-white/15 bg-white/10 hover:bg-white/15"
                  }`}
                >
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-purple-200">
                    {rank === 1 ? "👑 Juara 1" : rank === 2 ? "🥈 Juara 2" : "🥉 Juara 3"}
                  </p>
                  <p className="mt-1 truncate text-base font-extrabold text-white">
                    {hostOf(item.entry.url)}
                  </p>
                  <p className="mt-0.5 font-mono text-xs font-bold text-amber-300">
                    {item.score} poin
                  </p>
                </div>

                <div
                  className={`flex w-full flex-col items-center justify-center rounded-t-2xl border-t-4 shadow-xl ${heightClass} ${pillarColor} ${
                    highlighted ? "ring-4 ring-amber-300/70" : "opacity-90"
                  }`}
                >
                  <span className="text-4xl font-black">{rank}</span>
                  <span className="mt-1 font-mono text-xs font-bold uppercase tracking-wider opacity-80">
                    {rank === 1 ? "Champion" : rank === 2 ? "Runner-up" : "3rd Place"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Peringkat 4 & 5 */}
        {config.topCount === 5 && topFourFive.length > 0 ? (
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {topFourFive.map((item) => (
              <div
                key={item.rank}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 font-mono text-sm font-black text-amber-300">
                    #{item.rank}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{hostOf(item.entry.url)}</p>
                    <p className="truncate font-mono text-[10px] text-purple-200">
                      {item.entry.url}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-white/15 px-2.5 py-1 font-mono text-xs font-extrabold text-amber-200">
                  {item.score}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Kategori Kustom */}
        {config.customCategories.length > 0 ? (
          <div className="mt-6">
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-purple-200">
              Penghargaan Kategori Kustom
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {config.customCategories.map((cat) => {
                const winner = entries.find((item) => item.id === cat.entryId);
                return (
                  <div
                    key={cat.id}
                    className="rounded-xl border border-amber-300/30 bg-white/10 px-4 py-3 backdrop-blur-sm"
                  >
                    <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      ★ {cat.name || "Kategori Kustom"}
                    </p>
                    <p className="mt-1 truncate text-sm font-extrabold text-white">
                      {winner ? hostOf(winner.url) : "Belum dipilih"}
                    </p>
                    {winner ? (
                      <p className="truncate font-mono text-[10px] text-purple-200">{winner.url}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Panel Edit Juri */}
        {editing ? (
          <div className="mt-6 rounded-2xl border border-white/25 bg-slate-950/90 p-4 text-slate-100 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Pengaturan Juara &amp; Kategori Juri</h3>
                <p className="text-[11px] text-slate-400">
                  Sesuaikan sorotan juara, jumlah peringkat, pemenang manual, atau tambah kategori kustom.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  updateConfig(() => DEFAULT_CONFIG);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800"
              >
                <IconRefresh className="h-3.5 w-3.5" />
                Reset Default
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Judul Panggung
                </label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) =>
                    updateConfig((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Sorot Pemenang
                </label>
                <div className="mt-1 flex gap-1.5">
                  {([1, 2, 3] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        updateConfig((prev) => ({ ...prev, highlightRank: r }));
                        playSpotlightClick(soundOn);
                      }}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold ${
                        config.highlightRank === r
                          ? "border-amber-400 bg-amber-400 text-slate-950"
                          : "border-slate-700 bg-slate-900 text-slate-200"
                      }`}
                    >
                      Juara {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Jumlah Tampil
                </label>
                <div className="mt-1 flex gap-1.5">
                  {([5, 3] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => updateConfig((prev) => ({ ...prev, topCount: count }))}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold ${
                        config.topCount === count
                          ? "border-purple-400 bg-purple-500 text-white"
                          : "border-slate-700 bg-slate-900 text-slate-200"
                      }`}
                    >
                      Top {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Override Juara 1 - 5 */}
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                Pemenang per Peringkat (Otomatis dari Klasemen atau Pilih Manual)
              </p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {Array.from({ length: config.topCount }, (_, i) => i + 1).map((rank) => (
                  <div key={rank}>
                    <label className="block text-[10px] font-semibold text-slate-300">
                      Juara {rank}
                    </label>
                    <select
                      value={config.overrides[rank] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateConfig((prev) => {
                          const nextOverrides = { ...prev.overrides };
                          if (val) nextOverrides[rank] = val;
                          else delete nextOverrides[rank];
                          return { ...prev, overrides: nextOverrides };
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-white"
                    >
                      <option value="">Otomatis (#{rank} Klasemen)</option>
                      {entries.map((entry, idx) => (
                        <option key={entry.id} value={entry.id}>
                          #{idx + 1} {hostOf(entry.url)} ({entryFinalScore(entry).total})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Kategori Kustom */}
            <div className="mt-4 border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Kategori Penghargaan Kustom
                </p>
                <button
                  type="button"
                  onClick={() =>
                    updateConfig((prev) => ({
                      ...prev,
                      customCategories: [
                        ...prev.customCategories,
                        {
                          id: `cat-${Date.now()}`,
                          name: "Best UI/UX",
                          entryId: entries[0]?.id ?? "",
                        },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  Tambah Kategori
                </button>
              </div>

              {config.customCategories.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {config.customCategories.map((cat) => (
                    <div key={cat.id} className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={cat.name}
                        placeholder="Nama kategori (mis. Best Security)"
                        onChange={(e) =>
                          updateConfig((prev) => ({
                            ...prev,
                            customCategories: prev.customCategories.map((c) =>
                              c.id === cat.id ? { ...c, name: e.target.value } : c,
                            ),
                          }))
                        }
                        className="min-w-[180px] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                      />
                      <select
                        value={cat.entryId}
                        onChange={(e) =>
                          updateConfig((prev) => ({
                            ...prev,
                            customCategories: prev.customCategories.map((c) =>
                              c.id === cat.id ? { ...c, entryId: e.target.value } : c,
                            ),
                          }))
                        }
                        className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="">Pilih peserta…</option>
                        {entries.map((entry, idx) => (
                          <option key={entry.id} value={entry.id}>
                            #{idx + 1} {hostOf(entry.url)} ({entryFinalScore(entry).total})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          updateConfig((prev) => ({
                            ...prev,
                            customCategories: prev.customCategories.filter((c) => c.id !== cat.id),
                          }))
                        }
                        className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/30"
                        aria-label="Hapus kategori"
                      >
                        <IconX className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300"
                >
                  <IconCheck className="h-3.5 w-3.5" />
                  Selesai Edit
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
