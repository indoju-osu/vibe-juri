export interface ParsedFileResult {
  entries: string[];
  fileName: string;
  sheetCount: number;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".txt", ".csv", ".xlsx", ".xls"];

const HEADER_WORDS = new Set([
  "url",
  "link",
  "tautan",
  "website",
  "web",
  "no",
  "nama",
  "name",
  "peserta",
  "karya",
  "project",
  "entry",
]);

const URL_REGEX = /https?:\/\/[^\s,;"'<>]+/gi;

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}

/** Extract candidate rows from a free-form line / spreadsheet cell. */
export function extractCandidates(value: string): string[] {
  const text = value.replace(/\r/g, "\n");
  const results: string[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (HEADER_WORDS.has(line.toLowerCase())) continue;

    const matches = line.match(URL_REGEX);
    if (matches && matches.length > 0) {
      results.push(...matches.map((match) => match.trim()));
      continue;
    }

    // A cell like "Budi — example.vercel.app" still contains one usable entry.
    if (line.includes("://")) {
      results.push(line);
      continue;
    }
    if (line.includes(",") || line.includes(";")) {
      const parts = line.split(/[,;]+/).map((part) => part.trim());
      const plausible = parts.filter((part) => part.length > 0);
      if (plausible.length > 1) {
        results.push(...plausible);
        continue;
      }
    }

    results.push(line);
  }

  return results;
}

function parseText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !HEADER_WORDS.has(line.toLowerCase()))
    .flatMap((line) => {
      const matches = line.match(URL_REGEX);
      return matches && matches.length > 0 ? matches.map((m) => m.trim()) : [line];
    });
}

/** Parse .txt, .csv, .xls or .xlsx into a flat list of URL candidates. */
export async function parseUrlFile(file: File): Promise<ParsedFileResult> {
  const ext = extensionOf(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    throw new Error("Format file harus .txt, .csv, .xlsx, atau .xls");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Ukuran file maksimal 8 MB");
  }
  if (file.size === 0) {
    throw new Error("File kosong");
  }

  if (ext === ".txt") {
    const text = await file.text();
    return {
      entries: parseText(text),
      fileName: file.name,
      sheetCount: 0,
    };
  }

  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
  const entries: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (cell === null || cell === undefined) continue;
        const text = String(cell).trim();
        if (!text) continue;
        entries.push(...extractCandidates(text));
      }
    }
  }

  return {
    entries,
    fileName: file.name,
    sheetCount: workbook.SheetNames.length,
  };
}

export function acceptedFileTypes(): string {
  return ACCEPTED_EXTENSIONS.join(",");
}
