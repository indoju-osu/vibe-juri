import { entryBreakdown, sortEntries } from "@/lib/ranking";
import type { SessionState } from "@/types";

export const EXPORT_FILENAME = "Hasil_Penilaian_Vibe_Juri.xlsx";

const SHEET1_HEADERS = [
  "Peringkat",
  "URL",
  "Skor MVP (25)",
  "Skor UI/UX (20)",
  "Skor Fitur & Performa (15)",
  "Sec 1: XSS/Sanitasi (5)",
  "Sec 2: Auth & Akses (5)",
  "Sec 3: Data Sensitif (5)",
  "Sec 4: Headers & HTTPS (5)",
  "Sec 5: Logika Bisnis (5)",
  "Subtotal Security (25)",
  "Skor Personal Juri (15)",
  "Skor Total (100)",
  "Status Penilaian",
  "Catatan Evaluasi",
] as const;

const SHEET2_HEADERS = ["URL Asli", "Alasan Penolakan", "Skor Total"] as const;

export interface ExportResult {
  filename: string;
  rows: number;
  ignoredRows: number;
}

function columnWidths(headers: readonly string[]): { wch: number }[] {
  return headers.map((header) => {
    if (header === "URL" || header === "URL Asli") return { wch: 54 };
    if (header === "Catatan Evaluasi") return { wch: 60 };
    if (header === "Status Penilaian") return { wch: 17 };
    if (header.startsWith("Sec ")) return { wch: 19 };
    return { wch: Math.max(15, header.length + 3) };
  });
}

/** Build and download the 2-sheet Excel report entirely client-side. */
export async function exportSessionToXlsx(session: SessionState): Promise<ExportResult> {
  const XLSX = await import("xlsx");
  const ranked = sortEntries(session.entries);

  const rankingRows = ranked.map((entry, index) => {
    const breakdown = entryBreakdown(entry);
    return {
      Peringkat: index + 1,
      URL: entry.url,
      "Skor MVP (25)": entry.score.mvp,
      "Skor UI/UX (20)": entry.score.uiux,
      "Skor Fitur & Performa (15)": entry.score.features,
      "Sec 1: XSS/Sanitasi (5)": entry.score.secXss,
      "Sec 2: Auth & Akses (5)": entry.score.secAuth,
      "Sec 3: Data Sensitif (5)": entry.score.secData,
      "Sec 4: Headers & HTTPS (5)": entry.score.secHeaders,
      "Sec 5: Logika Bisnis (5)": entry.score.secLogic,
      "Subtotal Security (25)": breakdown.security,
      "Skor Personal Juri (15)": entry.score.personal,
      "Skor Total (100)": breakdown.total,
      "Status Penilaian": entry.score.judged ? "Sudah Dinilai" : "Belum Dinilai",
      "Catatan Evaluasi": entry.score.notes,
    };
  });

  const sheet1 = XLSX.utils.json_to_sheet(rankingRows, {
    header: [...SHEET1_HEADERS],
  });
  sheet1["!cols"] = columnWidths(SHEET1_HEADERS);
  sheet1["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rankingRows.length, c: SHEET1_HEADERS.length - 1 },
    }),
  };

  const ignoredRows = session.ignored.map((item) => ({
    "URL Asli": item.url,
    "Alasan Penolakan": item.category,
    "Skor Total": 0,
  }));

  const sheet2 = XLSX.utils.json_to_sheet(ignoredRows, {
    header: [...SHEET2_HEADERS],
  });
  sheet2["!cols"] = columnWidths(SHEET2_HEADERS);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet1, "Peringkat & Audit Lengkap");
  XLSX.utils.book_append_sheet(workbook, sheet2, "Duplikat & Tidak Valid");

  const output = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    compression: true,
  }) as ArrayBuffer;

  const blob = new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = EXPORT_FILENAME;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);

  return {
    filename: EXPORT_FILENAME,
    rows: rankingRows.length,
    ignoredRows: ignoredRows.length,
  };
}
