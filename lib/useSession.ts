"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STORAGE_KEY, clearSession, loadSession, saveSession } from "@/lib/storage";
import { toast } from "@/lib/toast";
import type { SessionState } from "@/types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const SESSION_CHANGE_EVENT = "vibe-juri:session-change";

function emitSessionChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

export interface UseSessionResult {
  session: SessionState | null;
  loaded: boolean;
  update: (updater: (draft: SessionState) => SessionState | void) => void;
  replaceSession: (next: SessionState | null) => void;
  resetSession: () => void;
}

export function useSession(): UseSessionResult {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const sessionRef = useRef<SessionState | null>(null);
  const failureNotified = useRef(false);

  const commit = useCallback((next: SessionState) => {
    sessionRef.current = next;
    setSession(next);
    const ok = saveSession(next);
    if (!ok && !failureNotified.current) {
      failureNotified.current = true;
      toast(
        "Gagal menyimpan ke localStorage. Periksa mode privat atau kuota penyimpanan browser.",
        "error",
      );
    }
  }, []);

  useEffect(() => {
    const initial = loadSession();
    sessionRef.current = initial;
    setSession(initial);
    setLoaded(true);

    const sync = () => {
      const next = loadSession();
      sessionRef.current = next;
      setSession(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      sync();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SESSION_CHANGE_EVENT, sync);
    };
  }, []);

  const update = useCallback(
    (updater: (draft: SessionState) => SessionState | void) => {
      const previous = sessionRef.current;
      if (!previous) return;
      const draft = clone(previous);
      const next = updater(draft) ?? draft;
      next.updatedAt = new Date().toISOString();
      commit(next);
    },
    [commit],
  );

  const replaceSession = useCallback(
    (next: SessionState | null) => {
      if (!next) {
        clearSession();
        sessionRef.current = null;
        setSession(null);
        emitSessionChange();
        return;
      }
      commit(next);
      emitSessionChange();
    },
    [commit],
  );

  const resetSession = useCallback(() => {
    clearSession();
    sessionRef.current = null;
    setSession(null);
    failureNotified.current = false;
    emitSessionChange();
  }, []);

  return { session, loaded, update, replaceSession, resetSession };
}
