export const PREVIEW_WINDOW_NAME = "VibeJuriPreviewWindow";

export interface SplitGeometry {
  screenWidth: number;
  screenHeight: number;
  preview: { left: number; top: number; width: number; height: number };
  panel: { left: number; top: number; width: number; height: number };
}

export function getSplitGeometry(): SplitGeometry {
  const fallbackWidth = typeof window !== "undefined" ? window.innerWidth : 1366;
  const fallbackHeight = typeof window !== "undefined" ? window.innerHeight : 768;

  const screenWidth =
    typeof window !== "undefined"
      ? window.screen?.availWidth || window.screen?.width || fallbackWidth
      : 1366;
  const screenHeight =
    typeof window !== "undefined"
      ? window.screen?.availHeight || window.screen?.height || fallbackHeight
      : 768;

  const previewWidth = Math.max(640, Math.round(screenWidth * 0.75));
  const panelWidth = Math.max(320, Math.round(screenWidth * 0.25));

  return {
    screenWidth,
    screenHeight,
    preview: { left: 0, top: 0, width: previewWidth, height: screenHeight },
    panel: { left: Math.max(0, screenWidth - panelWidth), top: 0, width: panelWidth, height: screenHeight },
  };
}

/**
 * Opens the participant app on the left 75% of the screen.
 * Must be called synchronously from a user gesture to avoid popup blocking.
 */
export function openPreviewWindow(url: string): Window | null {
  if (typeof window === "undefined") return null;
  const { preview } = getSplitGeometry();
  const features = [
    "popup=yes",
    `left=${preview.left}`,
    `top=${preview.top}`,
    `width=${preview.width}`,
    `height=${preview.height}`,
    "resizable=yes",
    "scrollbars=yes",
    "toolbar=no",
    "menubar=no",
    "location=yes",
    "status=no",
  ].join(",");

  return window.open(url, PREVIEW_WINDOW_NAME, features);
}

/** Try to snap the judge panel itself to the right 25% of the screen. */
export function fitJudgePanelToRight(): boolean {
  if (typeof window === "undefined") return false;
  const { panel } = getSplitGeometry();
  try {
    window.moveTo(panel.left, panel.top);
    window.resizeTo(panel.width, panel.height);
    return true;
  } catch {
    return false;
  }
}

/** Navigate the already-open preview window without touching the judge panel. */
export function navigatePreviewWindow(popup: Window | null, url: string): boolean {
  if (!popup || popup.closed) return false;
  try {
    popup.location.href = url;
    return true;
  } catch {
    return false;
  }
}

export function focusPreviewWindow(popup: Window | null): boolean {
  if (!popup || popup.closed) return false;
  try {
    popup.focus();
    return true;
  } catch {
    return false;
  }
}

export function closePreviewWindow(popup: Window | null): void {
  if (!popup || popup.closed) return;
  try {
    popup.close();
  } catch {
    // Ignore cross-origin close failures.
  }
}
