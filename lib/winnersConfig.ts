export const WINNERS_CONFIG_KEY = "vibe-juri.winners.v1";

export interface CustomCategory {
  id: string;
  name: string;
  entryId: string;
}

export interface WinnersConfig {
  title: string;
  topCount: 3 | 5;
  highlightRank: 1 | 2 | 3;
  overrides: Record<number, string>;
  customCategories: CustomCategory[];
}

export const DEFAULT_WINNERS_CONFIG: WinnersConfig = {
  title: "Pengumuman Juara Vibe Coding",
  topCount: 5,
  highlightRank: 1,
  overrides: {},
  customCategories: [],
};

export function normalizeWinnersConfig(raw: unknown): WinnersConfig {
  if (!raw || typeof raw !== "object") {
    return {
      ...DEFAULT_WINNERS_CONFIG,
      overrides: {},
      customCategories: [],
    };
  }

  const parsed = raw as Partial<WinnersConfig>;

  const overrides: Record<number, string> = {};
  if (parsed.overrides && typeof parsed.overrides === "object") {
    for (const [key, value] of Object.entries(parsed.overrides)) {
      const rank = Number(key);
      if (Number.isInteger(rank) && rank >= 1 && typeof value === "string" && value.trim()) {
        overrides[rank] = value;
      }
    }
  }

  const customCategories: CustomCategory[] = [];
  if (Array.isArray(parsed.customCategories)) {
    for (const item of parsed.customCategories) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Partial<CustomCategory>;
      if (
        typeof rec.id === "string" &&
        rec.id.trim() &&
        typeof rec.name === "string" &&
        typeof rec.entryId === "string"
      ) {
        customCategories.push({
          id: rec.id,
          name: rec.name,
          entryId: rec.entryId,
        });
      }
    }
  }

  return {
    title:
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title
        : DEFAULT_WINNERS_CONFIG.title,
    topCount: parsed.topCount === 3 ? 3 : 5,
    highlightRank:
      parsed.highlightRank === 2 || parsed.highlightRank === 3 ? parsed.highlightRank : 1,
    overrides,
    customCategories,
  };
}

export function loadWinnersConfig(): WinnersConfig {
  if (typeof window === "undefined") {
    return {
      ...DEFAULT_WINNERS_CONFIG,
      overrides: {},
      customCategories: [],
    };
  }
  try {
    const raw = window.localStorage.getItem(WINNERS_CONFIG_KEY);
    if (!raw) {
      return {
        ...DEFAULT_WINNERS_CONFIG,
        overrides: {},
        customCategories: [],
      };
    }
    return normalizeWinnersConfig(JSON.parse(raw));
  } catch {
    return {
      ...DEFAULT_WINNERS_CONFIG,
      overrides: {},
      customCategories: [],
    };
  }
}

export function saveWinnersConfig(config: WinnersConfig): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(WINNERS_CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}
