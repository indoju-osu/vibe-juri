import { autoRubricFromAudit, autoScoreFromAudit, autoSecurityFromAudit } from "@/lib/autoScore";
import { productSubtotal, securitySubtotal, totalScore } from "@/lib/scoring";
import type {
  AutoRubric,
  AutoScore,
  AutoSecurity,
  JudgeEntry,
  SessionState,
  ValueSource,
} from "@/types";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Nilai produk/UX otomatis (0–100) atau null jika belum diaudit. */
export function entryAutoScore(entry: JudgeEntry): AutoScore | null {
  return entry.audit ? autoScoreFromAudit(entry.audit) : null;
}

/** Nilai security otomatis (0–25) atau null jika belum diaudit. */
export function entryAutoSecurity(entry: JudgeEntry): AutoSecurity | null {
  return entry.audit ? autoSecurityFromAudit(entry.audit) : null;
}

/** Pemetaan otomatis ke rubrik resmi (Product 0–60 + Security 0–25 + Personal 0). */
export function entryAutoRubric(entry: JudgeEntry): AutoRubric | null {
  return entry.audit ? autoRubricFromAudit(entry.audit) : null;
}

export interface EffectiveScore {
  product: number;
  security: number;
  personal: number;
  total: number;
  source: ValueSource;
}

/**
 * Komponen efektif untuk klasemen:
 * - sudah dinilai juri → rubrik juri (Product 60 + Security 25 + Creativity 15)
 * - belum dinilai → otomatis (Product 60 + Security 25) + Creativity (default 8 / nilai juri)
 */
export function entryEffectiveScore(entry: JudgeEntry): EffectiveScore {
  if (entry.score.judged) {
    return {
      product: round1(productSubtotal(entry.score)),
      security: round1(securitySubtotal(entry.score)),
      personal: entry.score.personal,
      total: entryJudgeTotal(entry),
      source: "judge",
    };
  }
  const rubric = entryAutoRubric(entry);
  if (rubric) {
    return {
      product: rubric.product,
      security: rubric.security,
      personal: entry.score.personal,
      total: round1(rubric.product + rubric.security + entry.score.personal),
      source: "auto",
    };
  }
  return {
    product: 0,
    security: 0,
    personal: entry.score.personal,
    total: round1(entry.score.personal),
    source: "none",
  };
}

/** Skor otomatis gabungan Produk/UX + Security (0–85, Personal 0) — peringkat sementara. */
export function entryAutoTotal(entry: JudgeEntry): number {
  return entryAutoRubric(entry)?.total ?? 0;
}

export function entryJudgeTotal(entry: JudgeEntry): number {
  return Math.round(totalScore(entry.score) * 10) / 10;
}

/** Skor yang dipakai di klasemen (juri bila sudah dinilai, selain itu otomatis). */
export function entryFinalScore(entry: JudgeEntry): { total: number; source: ValueSource } {
  const effective = entryEffectiveScore(entry);
  return { total: effective.total, source: effective.source };
}

/**
 * Rank: skor akhir DESC, lalu Produk/UX, Security, Personal, nilai otomatis, URL.
 * Tie-breaker memakai komponen efektif (juri bila dinilai, selain itu otomatis).
 */
export function sortEntries(entries: JudgeEntry[]): JudgeEntry[] {
  return [...entries].sort((a, b) => {
    const ea = entryEffectiveScore(a);
    const eb = entryEffectiveScore(b);

    const byFinal = eb.total - ea.total;
    if (byFinal !== 0) return byFinal;

    const byProduct = eb.product - ea.product;
    if (byProduct !== 0) return byProduct;

    const bySecurity = eb.security - ea.security;
    if (bySecurity !== 0) return bySecurity;

    const byPersonal = eb.personal - ea.personal;
    if (byPersonal !== 0) return byPersonal;

    const byAuto = entryAutoTotal(b) - entryAutoTotal(a);
    if (byAuto !== 0) return byAuto;

    return a.url.localeCompare(b.url);
  });
}

export interface SessionStats {
  total: number;
  judged: number;
  remaining: number;
  audited: number;
  pendingAudit: number;
  progressPercent: number;
  averageTotal: number;
  averageFinal: number;
  completionLabel: string;
}

export function sessionStats(session: SessionState): SessionStats {
  const total = session.entries.length;
  const judgedEntries = session.entries.filter((entry) => entry.score.judged);
  const judged = judgedEntries.length;
  const audited = session.entries.filter((entry) => Boolean(entry.audit)).length;
  const judgeSum = judgedEntries.reduce((acc, entry) => acc + totalScore(entry.score), 0);
  const finalSum = session.entries.reduce((acc, entry) => acc + entryFinalScore(entry).total, 0);

  return {
    total,
    judged,
    remaining: total - judged,
    audited,
    pendingAudit: total - audited,
    progressPercent: total === 0 ? 0 : Math.round((judged / total) * 100),
    averageTotal: judged === 0 ? 0 : Math.round((judgeSum / judged) * 10) / 10,
    averageFinal: total === 0 ? 0 : Math.round((finalSum / total) * 10) / 10,
    completionLabel: `${judged} / ${total} dinilai`,
  };
}

export function entryBreakdown(entry: JudgeEntry) {
  const auto = entryAutoScore(entry);
  const autoSecurity = entryAutoSecurity(entry);
  const rubric = entryAutoRubric(entry);
  const effective = entryEffectiveScore(entry);
  const final = entryFinalScore(entry);

  return {
    /* Rubrik juri */
    product: round1(productSubtotal(entry.score)),
    security: round1(securitySubtotal(entry.score)),
    personal: effective.personal,
    judge: entryJudgeTotal(entry),

    /* Nilai efektif (dipakai sebagai peringkat) */
    effProduct: effective.product,
    effSecurity: effective.security,

    /* Nilai produk/UX otomatis (0–100) + rinciannya */
    auto: auto ? auto.total : null,
    autoMvp: auto ? auto.mvp : null,
    autoUiux: auto ? auto.uiux : null,
    autoFeatures: auto ? auto.features : null,
    autoPerformance: auto ? auto.performance : null,

    /* Nilai security otomatis (0–25) + rincian 5 komponen */
    secAuto: rubric ? rubric.security : null,
    secAutoXss: autoSecurity ? autoSecurity.xss : null,
    secAutoAuth: autoSecurity ? autoSecurity.auth : null,
    secAutoData: autoSecurity ? autoSecurity.data : null,
    secAutoHeaders: autoSecurity ? autoSecurity.headers : null,
    secAutoLogic: autoSecurity ? autoSecurity.logic : null,

    /* Nilai otomatis gabungan Produk/UX + Security (0–85) */
    autoProduct: rubric ? rubric.product : null,
    provisional: rubric ? rubric.total : null,

    total: final.total,
    source: final.source,
  };
}
