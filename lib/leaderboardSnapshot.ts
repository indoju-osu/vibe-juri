import { parseSessionPayload, stripScreenshotsForStorage } from "@/lib/storage";
import {
  DEFAULT_WINNERS_CONFIG,
  loadWinnersConfig,
  normalizeWinnersConfig,
  type WinnersConfig,
} from "@/lib/winnersConfig";
import type { SessionState } from "@/types";

export const SNAPSHOT_FORMAT = "vibe-juri-leaderboard";
export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_FILENAME = "Klasemen_Vibe_Juri.json";

export interface LeaderboardSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  exportedAt: string;
  session: SessionState;
  winners: WinnersConfig;
}

export interface SnapshotExportResult {
  filename: string;
  entriesCount: number;
}

export interface ParsedLeaderboardSnapshot {
  session: SessionState;
  winners: WinnersConfig;
  hasWinnersConfig: boolean;
}

export function buildLeaderboardSnapshot(
  session: SessionState,
  winners: WinnersConfig = loadWinnersConfig(),
): LeaderboardSnapshot {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    session: stripScreenshotsForStorage(session),
    winners,
  };
}

export function exportLeaderboardSnapshot(session: SessionState): SnapshotExportResult {
  const snapshot = buildLeaderboardSnapshot(session);
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = SNAPSHOT_FILENAME;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);

  return {
    filename: SNAPSHOT_FILENAME,
    entriesCount: snapshot.session.entries.length,
  };
}

export function parseLeaderboardSnapshot(rawText: string): ParsedLeaderboardSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("File JSON tidak valid atau rusak.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Format file klasemen tidak dikenali.");
  }

  const record = parsed as Record<string, unknown>;
  const isWrappedSnapshot =
    record.format === SNAPSHOT_FORMAT || ("session" in record && record.session !== undefined);

  const sessionSource = isWrappedSnapshot ? record.session : record;
  const session = parseSessionPayload(sessionSource);
  if (!session) {
    throw new Error("File tidak berisi data karya klasemen yang valid.");
  }

  const hasWinnersConfig = Boolean(record.winners && typeof record.winners === "object");
  const winners = hasWinnersConfig
    ? normalizeWinnersConfig(record.winners)
    : {
        ...DEFAULT_WINNERS_CONFIG,
        overrides: {},
        customCategories: [],
      };

  return {
    session,
    winners,
    hasWinnersConfig,
  };
}
