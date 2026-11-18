"use client";

import { useState, type CSSProperties } from "react";
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconClipboard,
  IconGauge,
  IconLayout,
  IconSave,
  IconShield,
  IconSparkles,
} from "@/components/ui/icons";
import { copyText, toast } from "@/lib/toast";
import {
  PERSONAL_FIELDS,
  PRODUCT_FIELDS,
  SECURITY_FIELDS,
  type ScoreFieldConfig,
  clampField,
  productSubtotal,
  securitySubtotal,
  totalScore,
} from "@/lib/scoring";
import type { JudgeEntry, ScoreDetail } from "@/types";

interface ScoringPanelProps {
  entry: JudgeEntry;
  index: number;
  total: number;
  onChange: (patch: Partial<ScoreDetail>) => void;
  onSave: () => void;
}

type TabId = "product" | "security" | "personal";

const TABS: {
  id: TabId;
  label: string;
  max: number;
  icon: typeof IconLayout;
  activeClass: string;
}[] = [
  {
    id: "product",
    label: "Produk/UX",
    max: 60,
    icon: IconLayout,
    activeClass: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
  },
  {
    id: "security",
    label: "Security",
    max: 25,
    icon: IconShield,
    activeClass: "border-sky-500/50 bg-sky-500/10 text-sky-200",
  },
  {
    id: "personal",
    label: "Personal",
    max: 15,
    icon: IconSparkles,
    activeClass: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  },
];

const ACCENT: Record<TabId, string> = {
  product: "#10B981",
  security: "#0EA5E9",
  personal: "#F59E0B",
};

function ScoreRow({
  config,
  value,
  accent,
  onChange,
}: {
  config: ScoreFieldConfig;
  value: number;
  accent: string;
  onChange: (value: number) => void;
}) {
  const percent = Math.max(0, Math.min(100, (value / config.max) * 100));
  const accentText =
    config.pillar === "product"
      ? "text-emerald-300"
      : config.pillar === "security"
        ? "text-sky-300"
        : "text-amber-300";

  const copyPayload = async () => {
    if (!config.payload) return;
    const ok = await copyText(config.payload);
    toast(
      ok ? `${config.payloadLabel ?? "Payload"} disalin ke clipboard.` : "Gagal menyalin payload.",
      ok ? "success" : "error",
    );
  };

  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <label
            htmlFor={`score-${config.field}`}
            className="block text-[11px] font-semibold leading-snug text-slate-200"
          >
            {config.label}
          </label>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{config.helper}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <input
            id={`score-${config.field}`}
            type="number"
            min={0}
            max={config.max}
            step={0.5}
            value={value}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              onChange(clampField(config.field, Number.isFinite(parsed) ? parsed : 0));
            }}
            className="w-14 rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-center font-mono text-xs font-bold text-slate-50 focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            aria-describedby={`hint-${config.field}`}
          />
          <span className="font-mono text-[10px] text-slate-500">/{config.max}</span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={config.max}
        step={0.5}
        value={value}
        onChange={(event) => onChange(clampField(config.field, Number(event.target.value)))}
        className="score-range mt-1.5"
        style={
          {
            "--range-accent": accent,
            "--range-progress": `${percent}%`,
          } as CSSProperties
        }
        aria-label={`${config.label} (0-${config.max})`}
      />
      <div className="flex items-center justify-between">
        <span className={`font-mono text-[10px] ${accentText}`} id={`hint-${config.field}`}>
          {value} / {config.max} poin
        </span>
        {config.payload ? (
          <button
            type="button"
            onClick={copyPayload}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-sky-300 transition-colors hover:bg-sky-500/10 hover:text-sky-200"
            title={config.payload}
          >
            <IconClipboard className="h-3 w-3" />
            {config.payloadLabel ?? "Copy payload"}
          </button>
        ) : null}
      </div>

      {config.payload ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-300">
            Lihat payload &amp; panduan uji
          </summary>
          <code className="mt-1 block break-all rounded border border-slate-700/70 bg-slate-950 px-1.5 py-1 font-mono text-[10px] leading-relaxed text-slate-300">
            {config.payload}
          </code>
        </details>
      ) : null}
    </div>
  );
}

export function ScoringPanel({ entry, index, total, onChange, onSave }: ScoringPanelProps) {
  const [tab, setTab] = useState<TabId>("product");
  const score = entry.score;
  const product = productSubtotal(score);
  const security = securitySubtotal(score);
  const personal = score.personal;
  const totalPoints = totalScore(score);
  const updatedLabel = score.updatedAt
    ? new Date(score.updatedAt).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const activeFields =
    tab === "product" ? PRODUCT_FIELDS : tab === "security" ? SECURITY_FIELDS : PERSONAL_FIELDS;

  return (
    <section className="card overflow-hidden" aria-labelledby="scoring-title">
      <div className="flex items-center justify-between gap-2 border-b border-slate-700/70 px-3 py-2.5">
        <div className="min-w-0">
          <p className="label-mono text-rose-400">Panel Penilaian</p>
          <h2 id="scoring-title" className="text-xs font-bold text-slate-50">
            Rubrik 100 poin · {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
          </h2>
        </div>
        <span
          className={`chip shrink-0 ${
            score.judged
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : score.updatedAt
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-slate-600 bg-slate-900 text-slate-400"
          }`}
        >
          {score.judged ? "Selesai" : score.updatedAt ? "Draft" : "Belum"}
        </span>
      </div>

      <div className="px-3 py-3">
        <div className="rounded-lg border border-rose-500/30 bg-gradient-to-br from-rose-950/50 via-slate-900/60 to-slate-950/80 p-2.5">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="label-mono text-rose-300">Skor Total</p>
              <p className="font-mono text-3xl font-bold leading-none text-slate-50">
                {totalPoints}
                <span className="ml-1 text-xs font-medium text-slate-500">/100</span>
              </p>
            </div>
            <IconGauge className="h-6 w-6 text-rose-400/80" />
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-600 via-rose-500 to-amber-400 transition-all"
              style={{ width: `${Math.min(100, totalPoints)}%` }}
            />
          </div>

          <dl className="mt-2 grid grid-cols-3 gap-1.5">
            {[
              { label: "Produk/UX", value: product, max: 60, tone: "text-emerald-300" },
              { label: "Security", value: security, max: 25, tone: "text-sky-300" },
              { label: "Personal", value: personal, max: 15, tone: "text-amber-300" },
            ].map((item) => (
              <div key={item.label} className="rounded-md bg-slate-950/50 px-1.5 py-1">
                <dt className="label-mono text-[9px]">{item.label}</dt>
                <dd className={`font-mono text-xs font-bold ${item.tone}`}>
                  {item.value}
                  <span className="text-[9px] font-normal text-slate-500">/{item.max}</span>
                </dd>
              </div>
            ))}
          </dl>

          <button type="button" className="btn-success mt-2 w-full py-1.5 text-xs" onClick={onSave}>
            <IconSave className="h-3.5 w-3.5" />
            Simpan Skor &amp; Tandai Selesai
          </button>
          <p className="mt-1 text-center text-[9px] text-slate-500">
            {updatedLabel
              ? `Autosave aktif · terakhir ${updatedLabel}`
              : "Autosave aktif setiap ada perubahan"}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Kelompok penilaian"
          className="mt-3 grid grid-cols-3 gap-1"
        >
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`scoring-panel-${item.id}`}
                id={`scoring-tab-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 ${
                  active
                    ? item.activeClass
                    : "border-slate-700/70 bg-slate-950/40 text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="font-mono text-[9px] opacity-80">maks {item.max}</span>
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`scoring-panel-${tab}`}
          aria-labelledby={`scoring-tab-${tab}`}
          className="mt-2 space-y-1.5"
        >
          {activeFields.map((field) => (
            <ScoreRow
              key={field.field}
              config={field}
              value={score[field.field]}
              accent={ACCENT[tab]}
              onChange={(value) => onChange({ [field.field]: value })}
            />
          ))}
        </div>

        {tab === "security" ? (
          <p className="mt-2 flex items-start gap-1 rounded-md border border-sky-500/20 bg-sky-500/5 px-2 py-1.5 text-[10px] leading-snug text-sky-200/80">
            <IconAlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-sky-300" />
            Uji payload di jendela preview kiri. Jangan menilai hanya dari tampilan — buka DevTools
            dan cek reaksi form.
          </p>
        ) : null}

        <div className="mt-3">
          <label htmlFor="judge-notes" className="label-mono">
            Catatan Evaluasi &amp; Temuan Security
          </label>
          <textarea
            id="judge-notes"
            value={score.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            rows={4}
            placeholder="Tulis temuan XSS, route /admin yang bocor, API key di bundle, foto dummy, atau catatan UX…"
            className="input mt-1 resize-y text-xs leading-relaxed"
          />
          <p className="mt-0.5 text-right font-mono text-[9px] text-slate-600">
            {score.notes.length} karakter · ikut ter-export ke Excel
          </p>
        </div>

        {score.judged ? (
          <p className="mt-1 flex items-center gap-1 text-[10px] text-emerald-300">
            <IconCheckCircle className="h-3.5 w-3.5" />
            Tersimpan sebagai sudah dinilai. Perubahan baru tetap tersimpan otomatis.
          </p>
        ) : null}
      </div>
    </section>
  );
}
