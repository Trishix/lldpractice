"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useStore } from "zustand";
import { BrowserAttemptRepository, type BrowserStorage } from "@/persistence/repository";
import { createCredentialsStore, createPreferencesStore } from "@/persistence/stores";
import { DefaultEvaluationCoordinator } from "@/application/coordinator";
import { createHttpEvaluationTransport, fetchPublicConfig } from "@/application/transport";
import type { PublicConfig, PublicProblemSummary } from "@/domain/types";
import { clock, ids } from "./model";

export interface Runtime {
  repository: BrowserAttemptRepository;
  preferences: ReturnType<typeof createPreferencesStore>;
  credentials: ReturnType<typeof createCredentialsStore>;
  coordinator: DefaultEvaluationCoordinator;
  storage: BrowserStorage;
  config: PublicConfig | null;
  configError: string | null;
  refreshConfig(): Promise<void>;
}
const Context = createContext<{ runtime: Runtime; problems: PublicProblemSummary[] } | null>(null);
export function PracticeProvider({ problems, children }: { problems: PublicProblemSummary[]; children: React.ReactNode }) {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [, rerender] = useState(0);
  useEffect(() => {
    let cleanup = () => {};
    // Defer acquisition until the effect survives React Strict Mode replay.
    const initialize = setTimeout(() => {
    let active = true;
    let browserStorage: Storage | undefined;
    try { browserStorage = window.localStorage; } catch { /* repository exposes memory-only mode */ }
    const memory = new Map<string, string>();
    const storage: BrowserStorage = browserStorage ?? { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); }, removeItem: key => { memory.delete(key); } };
    const repository = new BrowserAttemptRepository({ storage: browserStorage, locks: navigator.locks, writerId: ids.next(), clock });
    const preferences = createPreferencesStore(storage);
    const credentials = createCredentialsStore(storage);
    const value = { repository, preferences, credentials, storage, config: null, configError: null } as unknown as Runtime;
    value.refreshConfig = async () => {
      try { value.config = await fetchPublicConfig(); value.configError = null; }
      catch { value.configError = "Review availability could not be loaded. Your draft and MCQ practice remain available."; }
      if (active) rerender(n => n + 1);
    };
    value.coordinator = new DefaultEvaluationCoordinator({ repository, transport: createHttpEvaluationTransport(), clock, ids,
      getConfig: () => { if (!value.config) throw new Error("Review configuration is unavailable. Reload review availability in Settings."); return value.config; },
      getCredential: () => ({ mode: preferences.getState().credentialMode, key: credentials.getState().key ?? undefined }),
    });
    void Promise.allSettled([repository.startSession(), preferences.persist.rehydrate(), credentials.persist.rehydrate()]).then(() => { if (active) setRuntime(value); });
    void value.refreshConfig();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "lldpractice:practice" || event.key === null) {
        const state = repository.getState();
        if (state.access === "writable") repository.observeExternalChange();
        else if (state.access === "readonly" && !["conflict", "error"].includes(state.saveStatus)) void repository.reload();
      }
    };
    const onPageHide = () => { void repository.flush(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", onPageHide);
    cleanup = () => { active = false; window.removeEventListener("storage", onStorage); window.removeEventListener("pagehide", onPageHide); value.coordinator.dispose(); repository.closeSession(); };
    }, 0);
    return () => { clearTimeout(initialize); cleanup(); };
  }, []);
  if (!runtime) return <main className="boot" aria-busy="true"><p>LLD Practice</p><h1>Opening your workspace…</h1><p role="status">Restoring practice saved in this browser.</p></main>;
  return <Context.Provider value={{ runtime, problems }}>{children}</Context.Provider>;
}
export function usePractice() {
  const value = useContext(Context);
  if (!value) throw new Error("Practice provider is missing.");
  const state = useStore(value.runtime.repository.repositoryStore);
  const preferences = useStore(value.runtime.preferences);
  const credentials = useStore(value.runtime.credentials);
  return { ...value, state, preferences, credentials, editable: state.access === "writable" || state.access === "unsupported" };
}
