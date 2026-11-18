"use client";

import { useEffect, useRef, useState } from "react";
import { TOAST_EVENT, type ToastPayload, type ToastVariant } from "@/lib/toast";
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconInfo,
  IconX,
} from "@/components/ui/icons";

const VARIANT_STYLES: Record<
  ToastVariant,
  { border: string; icon: string; Icon: typeof IconInfo }
> = {
  success: {
    border: "border-emerald-500/50",
    icon: "text-emerald-400",
    Icon: IconCheckCircle,
  },
  error: {
    border: "border-rose-500/60",
    icon: "text-rose-400",
    Icon: IconAlertTriangle,
  },
  warning: {
    border: "border-amber-500/50",
    icon: "text-amber-400",
    Icon: IconAlertTriangle,
  },
  info: {
    border: "border-sky-500/50",
    icon: "text-sky-400",
    Icon: IconInfo,
  },
};

export function ToastHost() {
  const [items, setItems] = useState<ToastPayload[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const activeTimers = timers.current;

    const dismiss = (id: string) => {
      setItems((prev) => prev.filter((item) => item.id !== id));
      const timer = activeTimers.get(id);
      if (timer) {
        clearTimeout(timer);
        activeTimers.delete(id);
      }
    };

    const onToast = (event: Event) => {
      const payload = (event as CustomEvent<ToastPayload>).detail;
      if (!payload?.message) return;
      setItems((prev) => [...prev.slice(-3), payload]);
      const timeout = setTimeout(() => dismiss(payload.id), 4600);
      activeTimers.set(payload.id, timeout);
    };

    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-[100] flex w-[min(92vw,380px)] flex-col gap-2 sm:bottom-5 sm:right-5"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((item) => {
        const style = VARIANT_STYLES[item.variant];
        return (
          <div
            key={item.id}
            role={item.variant === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-lg border ${style.border} bg-slate-900/95 px-3 py-2.5 shadow-xl backdrop-blur`}
          >
            <style.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.icon}`} />
            <p className="min-w-0 flex-1 break-words text-xs leading-relaxed text-slate-100">
              {item.message}
            </p>
            <button
              type="button"
              onClick={() => {
                setItems((prev) => prev.filter((entry) => entry.id !== item.id));
                const timer = timers.current.get(item.id);
                if (timer) {
                  clearTimeout(timer);
                  timers.current.delete(item.id);
                }
              }}
              className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-500"
              aria-label="Tutup notifikasi"
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
