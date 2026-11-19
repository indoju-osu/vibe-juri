/**
 * Synthesizer efek suara ala Kahoot Podium menggunakan Web Audio API
 * (tanpa dependensi file audio eksternal).
 */

let sharedCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!sharedCtx) {
    sharedCtx = new AudioCtor();
  }
  if (sharedCtx.state === "suspended") {
    void sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  type: OscillatorType = "triangle",
  gainPeak = 0.16,
) {
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playDrumroll(durationMs = 1500, enabled = true): void {
  if (!enabled) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const steps = Math.max(8, Math.floor(durationMs / 65));
    for (let i = 0; i < steps; i += 1) {
      const t = (i * (durationMs / 1000)) / steps;
      const progress = i / steps;
      const freq = 110 + progress * 90 + (i % 2 === 0 ? 12 : -8);
      playTone(ctx, freq, t, 0.06, "triangle", 0.07 + progress * 0.09);
    }
  } catch {
    /* ignore audio errors */
  }
}

export function playRevealChime(rank: 2 | 3, enabled = true): void {
  if (!enabled) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const notes = rank === 3 ? [392.0, 493.88, 587.33] : [440.0, 554.37, 659.25];
    notes.forEach((freq, idx) => {
      playTone(ctx, freq, idx * 0.08, 0.38, "triangle", 0.15);
    });
  } catch {
    /* ignore audio errors */
  }
}

export function playChampionFanfare(enabled = true): void {
  if (!enabled) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;

    // Fanfare brass-like progression (C5 - E5 - G5 - C6!)
    const melody: [number, number, number][] = [
      [523.25, 0.0, 0.16],
      [659.25, 0.14, 0.16],
      [783.99, 0.28, 0.16],
      [1046.5, 0.44, 0.72],
    ];
    for (const [freq, offset, dur] of melody) {
      playTone(ctx, freq, offset, dur, "sawtooth", 0.09);
      playTone(ctx, freq * 0.5, offset, dur, "triangle", 0.12);
    }

    // Sparkle arpeggio
    const sparkles = [1046.5, 1318.51, 1567.98, 2093.0];
    sparkles.forEach((freq, idx) => {
      playTone(ctx, freq, 0.56 + idx * 0.07, 0.32, "sine", 0.08);
    });
  } catch {
    /* ignore audio errors */
  }
}

export function playSpotlightClick(enabled = true): void {
  if (!enabled) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    playTone(ctx, 587.33, 0, 0.14, "sine", 0.1);
    playTone(ctx, 880.0, 0.06, 0.2, "triangle", 0.1);
  } catch {
    /* ignore audio errors */
  }
}
