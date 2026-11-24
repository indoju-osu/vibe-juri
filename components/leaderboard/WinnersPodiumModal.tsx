"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowRight,
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
import {
  DEFAULT_WINNERS_CONFIG,
  loadWinnersConfig,
  saveWinnersConfig,
  type CustomCategory,
  type WinnersConfig,
} from "@/lib/winnersConfig";
import type { JudgeEntry } from "@/types";

type StepKind =
  | { type: "idle" }
  | { type: "zoom"; rank: number }
  | { type: "place"; rank: number }
  | { type: "suspense" }
  | { type: "done" };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
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

function StopSvg({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
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

function buildSteps(topCount: 3 | 5): StepKind[] {
  const steps: StepKind[] = [{ type: "idle" }];
  for (let r = topCount; r >= 2; r -= 1) {
    steps.push({ type: "zoom", rank: r });
    steps.push({ type: "place", rank: r });
  }
  steps.push({ type: "suspense" });
  steps.push({ type: "zoom", rank: 1 });
  steps.push({ type: "place", rank: 1 });
  steps.push({ type: "done" });
  return steps;
}

export function WinnersPodiumModal({
  open,
  entries,
  onClose,
}: {
  open: boolean;
  entries: JudgeEntry[];
  onClose: () => void;
}) {
  const [config, setConfig] = useState<WinnersConfig>(DEFAULT_WINNERS_CONFIG);
  const [editing, setEditing] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [autoRunning, setAutoRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timersRef = useRef<number[]>([]);
  const intervalRef = useRef<number | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const fanfareRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (open) {
      setConfig(loadWinnersConfig());
    }
  }, [open]);

  const steps = useMemo(() => buildSteps(config.topCount), [config.topCount]);
  const currentStep = steps[stepIndex] ?? { type: "idle" };

  const updateConfig = useCallback((updater: (prev: WinnersConfig) => WinnersConfig) => {
    setConfig((prev) => {
      const next = updater(prev);
      saveWinnersConfig(next);
      return next;
    });
  }, []);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stopAllAudio = useCallback(() => {
    if (bgmRef.current) {
      bgmRef.current.pause();
      bgmRef.current.currentTime = 0;
    }
    if (fanfareRef.current) {
      fanfareRef.current.pause();
      fanfareRef.current.currentTime = 0;
    }
  }, []);

  const startBgm = useCallback(
    (loop: boolean) => {
      if (!soundOn) return;
      try {
        if (!bgmRef.current) {
          bgmRef.current = new Audio("/audio/ceremony-bgm.mp3");
        }
        bgmRef.current.loop = loop;
        bgmRef.current.volume = 0.72;
        bgmRef.current.currentTime = 0;
        void bgmRef.current.play().catch(() => {});
      } catch {
        /* ignore */
      }
    },
    [soundOn],
  );

  const playChampionAudio = useCallback(() => {
    if (!soundOn) return;
    try {
      if (bgmRef.current) {
        bgmRef.current.volume = 0.25;
      }
      if (!fanfareRef.current) {
        fanfareRef.current = new Audio("/audio/champion-fanfare.mp3");
      }
      fanfareRef.current.volume = 0.95;
      fanfareRef.current.currentTime = 0;
      void fanfareRef.current.play().catch(() => {
        playChampionFanfare(true);
      });
    } catch {
      playChampionFanfare(true);
    }
  }, [soundOn]);

  useEffect(() => {
    if (!soundOn) {
      stopAllAudio();
    }
  }, [soundOn, stopAllAudio]);

  const launchConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: ConfettiParticle[] = Array.from({ length: 170 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? canvas.width * 0.16 : canvas.width * 0.84,
        y: canvas.height * 0.42,
        vx: (fromLeft ? 1 : -1) * (2 + Math.random() * 8.5) + (Math.random() - 0.5) * 4,
        vy: -7.5 - Math.random() * 9.5,
        size: 6 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.25,
        life: 170 + Math.random() * 80,
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
        p.vy += 0.25;
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
      if (alive && frame < 250) {
        requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    requestAnimationFrame(tick);
  }, []);

  // Reset selalu ke Tahap 1 (kosong) saat modal dibuka, dan putar BGM loop di Panggung Juara
  useEffect(() => {
    if (!open) {
      clearTimers();
      stopAllAudio();
      setAutoRunning(false);
      setStepIndex(0);
      setElapsedSec(0);
      return;
    }
    setStepIndex(0);
    setAutoRunning(false);
    setElapsedSec(0);
    if (soundOn) {
      startBgm(true);
    }
  }, [open, clearTimers, stopAllAudio, startBgm, soundOn]);

  useEffect(
    () => () => {
      clearTimers();
      stopAllAudio();
    },
    [clearTimers, stopAllAudio],
  );

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

  // Menentukan peringkat mana saja yang sudah menetap di podium/daftar
  const placedRanks = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i <= stepIndex; i += 1) {
      const s = steps[i];
      if (s?.type === "place") set.add(s.rank);
      if (s?.type === "done") {
        for (let r = 1; r <= config.topCount; r += 1) set.add(r);
      }
    }
    return set;
  }, [config.topCount, stepIndex, steps]);

  const applyStepEffects = useCallback(
    (step: StepKind) => {
      if (step.type === "zoom") {
        if (step.rank === 1) {
          playChampionAudio();
          launchConfetti();
        } else if (step.rank === 2 || step.rank === 3) {
          playRevealChime(step.rank, soundOn);
        } else {
          playSpotlightClick(soundOn);
        }
      } else if (step.type === "suspense") {
        playDrumroll(2400, soundOn);
      } else if (step.type === "place" && step.rank === 1) {
        updateConfig((prev) => ({ ...prev, highlightRank: 1 }));
        launchConfetti();
      } else if (step.type === "done") {
        if (bgmRef.current) {
          bgmRef.current.pause();
          bgmRef.current.currentTime = 0;
        }
      }
    },
    [launchConfetti, playChampionAudio, soundOn, updateConfig],
  );

  const goNextStep = useCallback(() => {
    clearTimers();
    setAutoRunning(false);
    setStepIndex((prev) => {
      const nextIdx = Math.min(steps.length - 1, prev + 1);
      if (prev === 0) {
        startBgm(true);
      }
      const nextStep = steps[nextIdx];
      if (nextStep) applyStepEffects(nextStep);
      return nextIdx;
    });
  }, [applyStepEffects, clearTimers, startBgm, steps]);

  const stopCeremony = useCallback(() => {
    clearTimers();
    stopAllAudio();
    setAutoRunning(false);
    setElapsedSec(0);
    setStepIndex(0);
  }, [clearTimers, stopAllAudio]);

  // Auto Run pas 60 detik
  const startAutoRun60s = useCallback(() => {
    clearTimers();
    stopAllAudio();
    setEditing(false);
    setAutoRunning(true);
    setStepIndex(0);
    setElapsedSec(0);
    startBgm(true);

    const startedAt = Date.now();
    intervalRef.current = window.setInterval(() => {
      const sec = Math.min(60, Math.floor((Date.now() - startedAt) / 1000));
      setElapsedSec(sec);
    }, 250);

    // Jadwal 60 detik sesuai jumlah step (index 1 .. steps.length-1)
    const scheduleMs: number[] =
      config.topCount === 5
        ? [
            1000, // zoom 5
            6000, // place 5
            10000, // zoom 4
            15000, // place 4
            19000, // zoom 3
            25000, // place 3
            29000, // zoom 2
            35000, // place 2
            39000, // suspense jeda mendebarkan + lampu sorot (8s)
            47000, // zoom 1 + fanfare + konfeti
            54000, // place 1
            60000, // done
          ]
        : [
            1200, // zoom 3
            8500, // place 3
            15500, // zoom 2
            23000, // place 2
            30000, // suspense jeda mendebarkan (10s)
            40000, // zoom 1 + fanfare + konfeti
            52000, // place 1
            60000, // done
          ];

    scheduleMs.forEach((ms, offset) => {
      const targetIdx = offset + 1;
      if (targetIdx >= steps.length) return;
      const tid = window.setTimeout(() => {
        setStepIndex(targetIdx);
        const s = steps[targetIdx];
        if (s) applyStepEffects(s);
        if (targetIdx === steps.length - 1) {
          setAutoRunning(false);
          clearTimers();
          setElapsedSec(60);
        }
      }, ms);
      timersRef.current.push(tid);
    });
  }, [applyStepEffects, clearTimers, config.topCount, startBgm, steps, stopAllAudio]);

  if (!open) return null;

  const podiumOrder = [2, 1, 3] as const;
  const topFourFive = winners.filter((w) => w.rank >= 4);
  const highlightedWinner =
    placedRanks.has(config.highlightRank)
      ? winners.find((w) => w.rank === config.highlightRank)
      : undefined;

  const zoomedWinner =
    currentStep.type === "zoom"
      ? winners.find((w) => w.rank === currentStep.rank)
      : undefined;

  const isSuspense = currentStep.type === "suspense";
  const isIdle = currentStep.type === "idle";
  const isDone = currentStep.type === "done";
  const canClickStageToNext = !editing && !isDone && winners.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Panggung Pengumuman Juara"
      onClick={() => {
        if (canClickStageToNext) goNextStep();
      }}
      className={`dark fixed inset-0 z-50 overflow-y-auto bg-[#130638] text-white ${
        canClickStageToNext ? "cursor-pointer" : ""
      }`}
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

      {/* Animasi Lampu Sorot saat Jeda Mendebarkan & Juara 1 */}
      {(isSuspense || (zoomedWinner && zoomedWinner.rank === 1) || placedRanks.has(1)) ? (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
          <div
            className={`absolute -top-24 left-1/2 h-[120vh] w-[42vw] -translate-x-1/2 blur-2xl transition-opacity duration-500 ${
              isSuspense ? "animate-pulse opacity-65" : "opacity-45"
            }`}
            style={{
              background:
                "conic-gradient(from 165deg at 50% 0%, transparent 0deg, rgba(253, 224, 71, 0.45) 15deg, rgba(255, 255, 255, 0.35) 22deg, transparent 36deg)",
            }}
          />
          {isSuspense ? (
            <>
              <div
                className="absolute -top-20 left-[20%] h-[115vh] w-[30vw] -rotate-12 blur-2xl animate-pulse"
                style={{
                  background:
                    "conic-gradient(from 165deg at 50% 0%, transparent 0deg, rgba(56, 189, 248, 0.38) 18deg, transparent 35deg)",
                }}
              />
              <div
                className="absolute -top-20 right-[20%] h-[115vh] w-[30vw] rotate-12 blur-2xl animate-pulse"
                style={{
                  background:
                    "conic-gradient(from 165deg at 50% 0%, transparent 0deg, rgba(244, 63, 94, 0.38) 18deg, transparent 35deg)",
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1160px] flex-col px-4 py-5 sm:px-6">
        {/* Header Bar */}
        <header
          onClick={(e) => e.stopPropagation()}
          className="flex cursor-default flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-[#fde047]">
              <IconTrophy className="h-4 w-4" />
            </span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c4b5fd]">
                Panggung Pemenang · Top {config.topCount}
              </p>
              <p className="text-xs font-bold text-white/90">
                {autoRunning ? `Auto Run · ${elapsedSec} / 60 dtk` : "Vibe-Juri Awards Stage"}
              </p>
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
              onClick={startAutoRun60s}
              disabled={winners.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#fbbf24] px-3.5 text-xs font-extrabold text-[#1e1b4b] shadow-[0_6px_24px_rgba(251,191,36,0.38)] transition hover:bg-[#fcd34d] disabled:opacity-50"
            >
              <PlaySvg className="h-3.5 w-3.5" />
              <span>{autoRunning ? `Auto (${elapsedSec}s/60s)` : "Auto Run 60 dtk"}</span>
            </button>

            {!isDone ? (
              <button
                type="button"
                onClick={goNextStep}
                disabled={winners.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#38bdf8]/60 bg-[#0ea5e9] px-3.5 text-xs font-extrabold text-white shadow-md transition hover:bg-[#38bdf8] disabled:opacity-50"
              >
                <span>{isIdle ? "Mulai (Next)" : "Next"}</span>
                <IconArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={stopCeremony}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.08] px-3 text-xs font-semibold text-white transition hover:bg-white/[0.16]"
              title="Stop musik & kosongkan panggung ke Tahap 1"
            >
              <StopSvg className="h-3.5 w-3.5 text-rose-300" />
              <span>Stop / Reset</span>
            </button>

            <button
              type="button"
              onClick={() => {
                launchConfetti();
                playChampionAudio();
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
              onClick={() => {
                stopCeremony();
                onClose();
              }}
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
        </div>

        {/* Kartu Sorotan Utama (hanya tampil setelah juara yang disorot sudah diumumkan) */}
        {highlightedWinner ? (
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
                onClick={(e) => e.stopPropagation()}
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

        {/* Podium 2 - 1 - 3 (selalu tampil agar transisi Next & Auto Run smooth) */}
        <div className="relative mt-8 grid flex-1 grid-cols-1 items-end gap-4 sm:grid-cols-3 sm:gap-5">
          {podiumOrder.map((rank) => {
            const item = winners.find((w) => w.rank === rank);
            if (!item) return <div key={rank} className="hidden sm:block" />;
            const visible = placedRanks.has(rank);
            const highlighted = config.highlightRank === rank && visible;
            const suspenseCenter = isSuspense && rank === 1;
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
                  if (!visible) return;
                  updateConfig((prev) => ({ ...prev, highlightRank: rank }));
                  playSpotlightClick(soundOn);
                }}
                className="group relative flex flex-col items-center text-center transition-all duration-500"
              >
                {/* Animasi Lampu Sorot Lingkaran ala Kahoot di atas Podium 1 */}
                {suspenseCenter ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-20 left-1/2 z-0 h-44 w-44 -translate-x-1/2 rounded-full bg-[#3b82f6]/55 blur-md animate-pulse ring-4 ring-[#fde047]/50"
                  />
                ) : null}

                {/* Nama pemenang (tersembunyi sebelum diumumkan) */}
                <div
                  className={`relative z-10 mb-3 w-full px-2 transition-all duration-500 ${
                    visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-40"
                  }`}
                >
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
                    {visible ? hostOf(item.entry.url) : suspenseCenter ? "…" : "???"}
                  </p>
                </div>

                {/* Pilar podium gelap */}
                <div
                  className={`relative z-10 flex w-full flex-col items-center justify-start rounded-t-2xl border-x border-t-4 border-white/10 px-4 pt-5 pb-4 shadow-[0_-8px_40px_rgba(0,0,0,0.45)] transition-all duration-500 ${heightClass} ${pillarBorder} ${
                    highlighted
                      ? "ring-2 ring-[#fde047]/70 shadow-[0_0_45px_rgba(250,204,21,0.28)]"
                      : suspenseCenter
                        ? "ring-4 ring-[#fde047]/80 shadow-[0_0_65px_rgba(59,130,246,0.55)]"
                        : ""
                  }`}
                >
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl font-black ${badgeStyle} ${
                      suspenseCenter ? "animate-bounce" : ""
                    }`}
                  >
                    {rank}
                  </div>
                  <p className="mt-3 font-mono text-xl font-black text-white">
                    {visible ? item.score : "—"}
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

        {/* Floating Zoom Card Overlay (tidak menyembunyikan podium di belakangnya) */}
        {zoomedWinner ? (
          <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-[#0d0428]/55 p-4 backdrop-blur-[2px] transition-opacity duration-300">
            <div
              className={`pointer-events-auto w-full max-w-lg animate-fade-up rounded-3xl border-2 px-6 py-8 text-center shadow-[0_0_80px_rgba(250,204,21,0.45)] backdrop-blur-md ${
                zoomedWinner.rank === 1
                  ? "scale-105 border-[#fde047] bg-gradient-to-b from-[#3b1c8c]/95 to-[#1b084f]/95"
                  : "border-white/30 bg-[#251263]/95"
              }`}
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#fbbf24] text-2xl font-black text-[#1e1b4b] shadow-lg">
                {zoomedWinner.rank === 1 ? (
                  <CrownSvg className="h-8 w-8" />
                ) : (
                  zoomedWinner.rank
                )}
              </div>
              <p className="mt-4 font-mono text-xs font-bold uppercase tracking-[0.25em] text-[#fde047]">
                {zoomedWinner.rank === 1
                  ? "Champion · Juara 1"
                  : `Juara ${zoomedWinner.rank}`}
              </p>
              <h3 className="mt-2 break-words text-3xl font-black tracking-tight text-white sm:text-4xl">
                {hostOf(zoomedWinner.entry.url)}
              </h3>
              <p className="mt-1 truncate font-mono text-xs text-[#ddd6fe]">
                {zoomedWinner.entry.url}
              </p>
              <div className="mt-4 inline-flex items-center rounded-full bg-[#fbbf24] px-5 py-1.5 font-mono text-base font-black text-[#1e1b4b]">
                Skor Akhir: {zoomedWinner.score} / 100
              </div>
            </div>
          </div>
        ) : null}

        {/* Peringkat 4 & 5 */}
        {config.topCount === 5 && topFourFive.length > 0 ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {topFourFive.map((item) => {
              const visible = placedRanks.has(item.rank);
              return (
                <div
                  key={item.rank}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3 backdrop-blur-sm transition-all duration-500"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 font-mono text-sm font-black text-[#fde047]">
                      #{item.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">
                        {visible ? hostOf(item.entry.url) : "Menunggu pengumuman…"}
                      </p>
                      <p className="truncate font-mono text-[10px] text-[#ddd6fe]">
                        {visible ? item.entry.url : "???"}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg border border-[#fbbf24]/35 bg-[#fbbf24]/15 px-2.5 py-1 font-mono text-xs font-extrabold text-[#fde68a]">
                    {visible ? item.score : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Kategori Kustom (tampil setelah pengumuman selesai atau saat tidak kosong) */}
        {config.customCategories.length > 0 && isDone ? (
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
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-6 cursor-default rounded-2xl border border-white/20 bg-[#090d1f]/95 p-4 text-white shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Pengaturan Juara &amp; Kategori Juri</h3>
                <p className="text-[11px] text-[#94a3b8]">
                  Sesuaikan sorotan juara, jumlah peringkat, pemenang manual, atau tambah kategori kustom.
                </p>
              </div>
              <button
                type="button"
                onClick={() => updateConfig(() => DEFAULT_WINNERS_CONFIG)}
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
