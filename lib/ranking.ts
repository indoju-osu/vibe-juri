import { productSubtotal, securitySubtotal, totalScore } from "@/lib/scoring";
import type { JudgeEntry, SessionState } from "@/types";

/** Rank: total DESC, then MVP, Security, Personal, finally URL for stability. */
export function sortEntries(entries: JudgeEntry[]): JudgeEntry[] {
  return [...entries].sort((a, b) => {
    const byTotal = totalScore(b.score) - totalScore(a.score);
    if (byTotal !== 0) return byTotal;

    const byMvp = b.score.mvp - a.score.mvp;
    if (byMvp !== 0) return byMvp;

    const bySecurity = securitySubtotal(b.score) - securitySubtotal(a.score);
    if (bySecurity !== 0) return bySecurity;

    const byPersonal = b.score.personal - a.score.personal;
    if (byPersonal !== 0) return byPersonal;

    return a.url.localeCompare(b.url);
  });
}

export interface SessionStats {
  total: number;
  judged: number;
  remaining: number;
  progressPercent: number;
  averageTotal: number;
  completionLabel: string;
}

export function sessionStats(session: SessionState): SessionStats {
  const total = session.entries.length;
  const judgedEntries = session.entries.filter((entry) => entry.score.judged);
  const judged = judgedEntries.length;
  const sum = judgedEntries.reduce((acc, entry) => acc + totalScore(entry.score), 0);

  return {
    total,
    judged,
    remaining: total - judged,
    progressPercent: total === 0 ? 0 : Math.round((judged / total) * 100),
    averageTotal: judged === 0 ? 0 : Math.round((sum / judged) * 10) / 10,
    completionLabel: `${judged} / ${total} dinilai`,
  };
}

export function entryBreakdown(entry: JudgeEntry) {
  return {
    product: Math.round(productSubtotal(entry.score) * 10) / 10,
    security: Math.round(securitySubtotal(entry.score) * 10) / 10,
    personal: entry.score.personal,
    total: Math.round(totalScore(entry.score) * 10) / 10,
  };
}
