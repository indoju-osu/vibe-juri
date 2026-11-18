export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastPayload {
  id: string;
  message: string;
  variant: ToastVariant;
}

export const TOAST_EVENT = "vibe-juri:toast";

let counter = 0;

export function toast(message: string, variant: ToastVariant = "info"): void {
  if (typeof window === "undefined") return;
  counter += 1;
  const detail: ToastPayload = {
    id: `toast_${Date.now()}_${counter}`,
    message,
    variant,
  };
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail }));
}

export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }

  if (typeof document === "undefined") return false;
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
