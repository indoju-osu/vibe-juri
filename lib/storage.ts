import { normalizeAudit } from "@/lib/audit";
import { seedUntouchedScore } from "@/lib/autoScore";
import { makeId } from "@/lib/id";
import { clampField, emptyScore } from "@/lib/scoring";
import type {
  AuditResult,
  CleanedUrl,
  IgnoredEntry,
  JudgeEntry,
  ScoreDetail,
  SessionState,
} from "@/types";

export const STORAGE_KEY = "vibe-juri.session.v1";

function normalizeScore(raw: unknown): ScoreDetail {
  const score = emptyScore();
  if (!raw || typeof raw !== "object") return score;
  const record = raw as Record<string, unknown>;

  for (const field of [
    "mvp",
    "uiux",
    "features",
    "secXss",
    "secAuth",
    "secData",
    "secHeaders",
    "secLogic",
    "personal",
  ] as const) {
    const value = record[field];
    score[field] = clampField(field, typeof value === "number" ? value : Number(value) || 0);
  }

  score.notes = typeof record.notes === "string" ? record.notes : "";
  score.updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : null;
  score.judged = record.judged === true;
  return score;
}

function normalizeEntry(raw: unknown): JudgeEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.url !== "string" || !record.url) return null;

  let audit: AuditResult | null = null;
  if (record.audit && typeof record.audit === "object") {
    try {
      audit = normalizeAudit(record.audit, record.url, "manual");
    } catch {
      audit = null;
    }
  }

  return {
    id: typeof record.id === "string" && record.id ? record.id : makeId("entry"),
    url: record.url,
    key:
      typeof record.key === "string" && record.key
        ? record.key
        : record.url.toLowerCase().replace(/\/+$/, ""),
    audit,
    score: seedUntouchedScore(normalizeScore(record.score), audit),
  };
}

export function createEntry(cleaned: CleanedUrl): JudgeEntry {
  return {
    id: makeId("entry"),
    url: cleaned.url,
    key: cleaned.key,
    audit: null,
    score: emptyScore(),
  };
}

export function buildSession(valid: CleanedUrl[], ignored: IgnoredEntry[]): SessionState {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    activeIndex: 0,
    entries: valid.map(createEntry),
    ignored,
  };
}

export function loadSession(): SessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;

    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.map(normalizeEntry).filter((entry): entry is JudgeEntry => entry !== null)
      : [];

    if (entries.length === 0) return null;

    const ignored: IgnoredEntry[] = Array.isArray(parsed.ignored)
      ? parsed.ignored
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => ({
            id: typeof item.id === "string" ? item.id : makeId("ignored"),
            url: typeof item.url === "string" ? item.url : String(item.url ?? ""),
            category:
              item.category === "Duplikat (Diabaikan)"
                ? "Duplikat (Diabaikan)"
                : "Tidak Valid / Repo Git",
            detail: typeof item.detail === "string" ? item.detail : "",
          }))
      : [];

    const active = Number(parsed.activeIndex);
    const activeIndex = Number.isFinite(active)
      ? Math.max(0, Math.min(entries.length - 1, Math.floor(active)))
      : 0;

    return {
      version: 1,
      createdAt:
        typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      activeIndex,
      entries,
      ignored,
    };
  } catch {
    return null;
  }
}

function stripScreenshotsForStorage(session: SessionState): SessionState {
  return {
    ...session,
    entries: session.entries.map((entry) =>
      entry.audit?.screenshotDataUrl
        ? {
            ...entry,
            audit: {
              ...entry.audit,
              screenshotDataUrl: null,
            },
          }
        : entry,
    ),
  };
}

export function saveSession(session: SessionState): boolean {
  if (typeof window === "undefined") return false;
  try {
    const compact = stripScreenshotsForStorage(session);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures (private mode / quota).
  }
}
