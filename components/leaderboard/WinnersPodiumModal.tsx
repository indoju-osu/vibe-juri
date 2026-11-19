"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconCheck,
  IconExternal,
  IconPlus,
  IconRefresh,
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

/* --- Custom Commercial SVG Icons --- */

function CrownSvg({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3.5 18.5h17a1 1 0 0 1 0 2h-17a1 1 0 0 1 0-2ZM3.1 7.2a1 1 0 0 1 1.3.2l3.8 4.2 3-5.8a1 1 0 0 1 1.8 0l3 5.8 3.8-4.2a1 1 0 0 1 1.7.9l-1.9 8.4a1 1 0 0 1-1 .8H5.4a1 1 0 0 1-1-.8L2.5 8.3a1 1 0 0 1 .6-1.1Z" />
    </svg>
  );
}

function MedalSvg({ className = "h-4 w-4", color = "#e2e8f0" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M8 2h3l1 5H9L8 2Zm5 0h3l-1 5h-3l1-5Z" fill={color} opacity="0.85" />
      <circle cx="12" cy="14" r="6.5" fill={color} />
      <circle cx="12" cy="14" r="4.2" stroke="#0f172a" strokeOpacity="0.28" strokeWidth="1.4" />
    </svg>
  );
}

function VolumeSvg({ muted, className = "h-4 w-4" }: { muted: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      {muted ? (
        <path d="m22 9-6 6M16 9l6 6" />
      ) : (
        <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
      )}
    </svg>
  );
}

function PlaySvg({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M7.5 5.2a1 1 0 0 1 1.5-.86l10.2 6.8a1 1 0 0 1 0 1.72l-10.2 6.8A1 1 0 0 1 7.5 18.8V5.2Z" />
    </svg>
  );
}

function SparkBurstSvg({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function SlidersSvg({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" fill="currentColor" />
      <circle cx="15" cy="12" r="2" fill="currentColor" />
      <circle cx="11" cy="18" r="2" fill="currentColor" />
    </svg>
  );
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

const CONFETTI_COLORS = ["#facc15", "#f43f5e", "#38bdf8", "#34d399", "#c084fc", "#fb923c"];

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

    const particles: ConfettiParticle[] = Array.from({ length: 150 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? canvas.width * 0.16 : canvas.width * 0.84,
        y: canvas.height * 0.4,
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
      setStatusBanner("Menuju Juara 1…");
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
      className="dark fixed inset-0 z-50 overflow-y-auto bg-[#130638] text-white"
    >
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50 h-full w-full" />

      {/* Latar panggung & efek sinar berputar ala Kahoot */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 25%, rgba(109, 40, 217, 0.52), rgba(19, 6, 56, 0.98) 72%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-1/2 h-[180vmax] w-[180vmax] -translate-x-1/2 -translate-y-1/2 opacity-[0.09] animate-[spin_48s_linear_infinite]"
        style={{
          background:
            "repeating-conic-gradient(from 0deg, rgba(255,255,255,0.85) 0deg 10deg, transparent 10deg 22deg)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1160px] flex-col px-4 py-5 sm:px-6">
        {/* Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-[#fde047]">
              <IconTrophy className="h-4 w-4" />
            </span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c4b5fd]">
                Panggung Pemenang · Top {config.topCount}
              </p>
              <p className="text-xs font-bold text-white/90">Vibe-Juri Awards Stage</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundOn((prev) => !prev)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.08] px-3 text-xs font-semibold text-white transition hover:bg-white/[0.16]"
            >
              <VolumeSvg muted={!soundOn} className="h-4 w-4 text-[#ddd6fe]" />
              <span>{soundOn ? "Suara Aktif" : "Senyap"}</span>
            </button>
            <button
              type="button"
              onClick={startKahootCeremony}
              disabled={winners.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#fbbf24] px-4 text-xs font-extrabold text-[#1e1b4b] shadow-[0_6px_24px_rgba(251,191,36,0.38)] transition hover:bg-[#fcd34d] disabled:opacity-50"
            >
              <PlaySvg className="h-3.5 w-3.5" />
              <span>{announcing ? "Mengumumkan…" : "Mulai Pengumuman"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                launchConfetti();
                playChampionFanfare(soundOn);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.08] px-3 text-xs font-semibold text-white transition hover:bg-white/[0.16]"
              title="Putar ulang konfeti dan fanfare"
            >
              <SparkBurstSvg className="h-4 w-4 text-[#fcd34d]" />
              <span>Konfeti</span>
            </button>
            <button
              type="button"
              onClick={() => setEditing((prev) => !prev)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                editing
                  ? "border-[#fbbf24] bg-[#fbbf24]/20 text-[#fde68a]"
                  : "border-white/15 bg-white/[0.08] text-white hover:bg-white/[0.16]"
              }`}
            >
              <SlidersSvg className="h-4 w-4" />
              <span>{editing ? "Tutup Edit" : "Edit Juara"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.08] px-3 text-xs font-semibold text-white transition hover:border-rose-400/60 hover:bg-rose-500/80"
            >
              <IconX className="h-4 w-4" />
              <span>Tutup</span>
            </button>
          </div>
        </header>

        {/* Banner Judul Putih ala Kahoot */}
        <div className="mt-5 flex flex-col items-center gap-2 text-center">
          <div className="inline-flex items-center gap-2.5 rounded-2xl bg-white px-6 py-2.5 text-[#1e1b4b] shadow-[0_14px_40px_rgba(0,0,0,0.45)]">
            <CrownSvg className="h-5 w-5 text-[#d97706]" />
            <h2 className="text-lg font-black tracking-tight sm:text-2xl">{config.title}</h2>
          </div>

          {statusBanner ? (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[#fbbf24]/50 bg-[#fbbf24]/20 px-4 py-1 text-xs font-bold tracking-wide text-[#fde68a]">
              <SparkBurstSvg className="h-3.5 w-3.5 text-[#fbbf24]" />
              {statusBanner}
            </span>
          ) : null}
        </div>

        {/* Kartu Sorotan Utama */}
        {highlightedWinner && isRankVisible(highlightedWinner.rank) ? (
          <div className="mx-auto mt-4 w-full max-w-xl rounded-2xl border border-[#fbbf24]/45 bg-white/[0.08] px-5 py-3.5 text-center shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#fbbf24]/40 bg-[#fbbf24]/15 px-3 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#fde047]">
              <CrownSvg className="h-3.5 w-3.5 text-[#fbbf24]" />
              Sorotan Juara {highlightedWinner.rank}
            </div>
            <div className="mt-1.5">
              <a
                href={highlightedWinner.entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xl font-black tracking-tight text-white transition hover:text-[#fde047] sm:text-2xl"
              >
                {hostOf(highlightedWinner.entry.url)}
                <IconExternal className="h-4 w-4 opacity-75" />
              </a>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[#ddd6fe]">
              {highlightedWinner.entry.url}
            </p>
          </div>
        ) : null}

        {/* Podium 2 - 1 - 3 (Pilar Gelap + Medali Bulat Emas/Perak/Perunggu) */}
        <div className="mt-8 grid flex-1 grid-cols-1 items-end gap-4 sm:grid-cols-3 sm:gap-5">
          {podiumOrder.map((rank) => {
            const item = winners.find((w) => w.rank === rank);
            if (!item) return <div key={rank} className="hidden sm:block" />;
            const visible = isRankVisible(rank);
            const highlighted = config.highlightRank === rank;
            const heightClass =
              rank === 1 ? "min-h-[225px]" : rank === 2 ? "min-h-[175px]" : "min-h-[142px]";
            const badgeStyle =
              rank === 1
                ? "bg-gradient-to-b from-[#fde047] to-[#eab308] text-[#1e1b4b] ring-4 ring-[#fef08a]/40 shadow-[0_0_28px_rgba(250,204,21,0.55)]"
                : rank === 2
                  ? "bg-gradient-to-b from-[#f8fafc] to-[#cbd5e1] text-[#0f172a] ring-4 ring-white/30"
                  : "bg-gradient-to-b from-[#fdba74] to-[#ea580c] text-[#1e1b4b] ring-4 ring-[#fed7aa]/30";
            const pillarBorder =
              rank === 1
                ? "border-t-[#fde047] bg-gradient-to-b from-[#2e1a70] to-[#190b44]"
                : rank === 2
                  ? "border-t-[#e2e8f0] bg-gradient-to-b from-[#26165e] to-[#160a3c]"
                  : "border-t-[#fb923c] bg-gradient-to-b from-[#26165e] to-[#160a3c]";

            return (
              <button
                key={rank}
                type="button"
                onClick={() => {
                  updateConfig((prev) => ({ ...prev, highlightRank: rank }));
                  playSpotlightClick(soundOn);
                }}
                className={`group flex flex-col items-center text-center transition-all duration-500 ${
                  visible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
                }`}
              >
                {/* Nama pemenang melayang di atas pilar */}
                <div className="mb-3 w-full px-2">
                  <div className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#ddd6fe]">
                    {rank === 1 ? (
                      <CrownSvg className="h-4 w-4 text-[#fbbf24]" />
                    ) : (
                      <MedalSvg
                        className="h-4 w-4"
                        color={rank === 2 ? "#e2e8f0" : "#fb923c"}
                      />
                    )}
                    <span>Juara {rank}</span>
                  </div>
                  <p
                    className={`mt-1 truncate text-lg font-black tracking-tight sm:text-xl ${
                      highlighted ? "text-[#fde047]" : "text-white"
                    }`}
                  >
                    {hostOf(item.entry.url)}
                  </p>
                </div>

                {/* Pilar podium gelap elegan ala Kahoot */}
                <div
                  className={`flex w-full flex-col items-center justify-start rounded-t-2xl border-x border-t-4 border-white/10 px-4 pt-5 pb-4 shadow-[0_-8px_40px_rgba(0,0,0,0.45)] transition ${heightClass} ${pillarBorder} ${
                    highlighted
                      ? "ring-2 ring-[#fde047]/70 shadow-[0_0_45px_rgba(250,204,21,0.28)]"
                      : "opacity-95 hover:opacity-100"
                  }`}
                >
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl font-black ${badgeStyle}`}
                  >
                    {rank}
                  </div>
                  <p className="mt-3 font-mono text-xl font-black text-white">
                    {item.score}
                    <span className="ml-1 text-xs font-semibold text-[#c4b5fd]">/ 100</span>
                  </p>
                  <span className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#c4b5fd]">
                    {rank === 1 ? "Champion" : rank === 2 ? "Runner-up" : "3rd Place"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Peringkat 4 & 5 */}
        {config.topCount === 5 && topFourFive.length > 0 ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {topFourFive.map((item) => (
              <div
                key={item.rank}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3 backdrop-blur-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 font-mono text-sm font-black text-[#fde047]">
                    #{item.rank}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{hostOf(item.entry.url)}</p>
                    <p className="truncate font-mono text-[10px] text-[#ddd6fe]">
                      {item.entry.url}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-lg border border-[#fbbf24]/35 bg-[#fbbf24]/15 px-2.5 py-1 font-mono text-xs font-extrabold text-[#fde68a]">
                  {item.score}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Kategori Kustom */}
        {config.customCategories.length > 0 ? (
          <div className="mt-6">
            <p className="mb-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#ddd6fe]">
              Penghargaan Kategori Kustom
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {config.customCategories.map((cat) => {
                const winner = entries.find((item) => item.id === cat.entryId);
                return (
                  <div
                    key={cat.id}
                    className="rounded-xl border border-[#fbbf24]/35 bg-white/[0.08] px-4 py-3 backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#fde047]">
                      <CrownSvg className="h-3.5 w-3.5 text-[#fbbf24]" />
                      <span>{cat.name || "Kategori Kustom"}</span>
                    </div>
                    <p className="mt-1 truncate text-sm font-extrabold text-white">
                      {winner ? hostOf(winner.url) : "Belum dipilih"}
                    </p>
                    {winner ? (
                      <p className="truncate font-mono text-[10px] text-[#ddd6fe]">{winner.url}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Panel Edit Juri */}
        {editing ? (
          <div className="mt-6 rounded-2xl border border-white/20 bg-[#090d1f]/95 p-4 text-white shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Pengaturan Juara &amp; Kategori Juri</h3>
                <p className="text-[11px] text-[#94a3b8]">
                  Sesuaikan sorotan juara, jumlah peringkat, pemenang manual, atau tambah kategori kustom.
                </p>
              </div>
              <button
                type="button"
                onClick={() => updateConfig(() => DEFAULT_CONFIG)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/10"
              >
                <IconRefresh className="h-3.5 w-3.5" />
                Reset Default
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[#94a3b8]">
                  Judul Panggung
                </label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) =>
                    updateConfig((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0f172a] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[#94a3b8]">
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
                          ? "border-[#fbbf24] bg-[#fbbf24] text-[#0f172a]"
                          : "border-white/15 bg-[#0f172a] text-white"
                      }`}
                    >
                      Juara {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-[#94a3b8]">
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
                          ? "border-[#a855f7] bg-[#9333ea] text-white"
                          : "border-white/15 bg-[#0f172a] text-white"
                      }`}
                    >
                      Top {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#94a3b8]">
                Pemenang per Peringkat (Otomatis dari Klasemen atau Pilih Manual)
              </p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {Array.from({ length: config.topCount }, (_, i) => i + 1).map((rank) => (
                  <div key={rank}>
                    <label className="block text-[10px] font-semibold text-[#cbd5e1]">
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
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#0f172a] px-2 py-1.5 text-[11px] text-white"
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

            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#94a3b8]">
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
                  className="inline-flex items-center gap-1 rounded-lg bg-[#059669] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#10b981]"
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
                        className="min-w-[180px] flex-1 rounded-lg border border-white/15 bg-[#0f172a] px-2.5 py-1.5 text-xs text-white"
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
                        className="min-w-[200px] flex-1 rounded-lg border border-white/15 bg-[#0f172a] px-2.5 py-1.5 text-xs text-white"
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
                  className="inline-flex items-center gap-1 rounded-lg bg-[#fbbf24] px-3 py-1.5 text-xs font-bold text-[#0f172a] hover:bg-[#fcd34d]"
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
