import { z } from "zod";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { CredentialMode, Language, PracticeMode } from "../domain/types";
import type { BrowserStorage } from "./repository";

export const PREFERENCES_STORAGE_KEY = "lldpractice:preferences";
export const CREDENTIALS_STORAGE_KEY = "lldpractice:credentials";

export interface PreferencesState {
  reset(): void;
  setPersistenceEnabled(enabled: boolean): void;
  language: Language;
  mode: PracticeMode;
  credentialMode: CredentialMode;
  timerEnabled: boolean;
  briefCollapsed: boolean;
  setLanguage(language: Language): void;
  setMode(mode: PracticeMode): void;
  setCredentialMode(credentialMode: CredentialMode): void;
  setTimerEnabled(timerEnabled: boolean): void;
  setBriefCollapsed(briefCollapsed: boolean): void;
}

export interface CredentialsState {
  setPersistenceEnabled(enabled: boolean): void;
  key: string | null;
  remembered: boolean;
  setKey(key: string, remember: boolean): void;
  clearKey(): void;
}

type PersistedPreferences = Pick<PreferencesState, "language" | "mode" | "credentialMode" | "timerEnabled" | "briefCollapsed">;
interface PersistedCredentials { rememberedKey: string | null }
const preferencesSchema = z.strictObject({
  language: z.enum(["java", "python", "cpp"]), mode: z.enum(["comprehensive", "mcq_only"]), credentialMode: z.enum(["platform", "user"]),
  timerEnabled: z.boolean(), briefCollapsed: z.boolean(),
});
const credentialsSchema = z.strictObject({ rememberedKey: z.string().max(4096).nullable() });

const stateStorage = (storage: BrowserStorage, enabled: () => boolean): StateStorage => ({
  getItem: (name) => storage.getItem(name),
  setItem: (name, value) => { if (enabled()) storage.setItem(name, value); },
  removeItem: (name) => storage.removeItem(name),
});

export function createPreferencesStore(storage: BrowserStorage) {
  let persistenceEnabled = true;
  return createStore<PreferencesState>()(persist<PreferencesState, [], [], PersistedPreferences>(
    (set) => ({
      reset: () => set({ language: "java", mode: "comprehensive", credentialMode: "platform", timerEnabled: false, briefCollapsed: false }),
      setPersistenceEnabled: (enabled) => { persistenceEnabled = enabled; },
      language: "java",
      mode: "comprehensive",
      credentialMode: "platform",
      timerEnabled: false,
      briefCollapsed: false,
      setLanguage: (language) => set({ language }),
      setMode: (mode) => set({ mode }),
      setCredentialMode: (credentialMode) => set({ credentialMode }),
      setTimerEnabled: (timerEnabled) => set({ timerEnabled }),
      setBriefCollapsed: (briefCollapsed) => set({ briefCollapsed }),
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => stateStorage(storage, () => persistenceEnabled)),
      partialize: ({ language, mode, credentialMode, timerEnabled, briefCollapsed }) => ({ language, mode, credentialMode, timerEnabled, briefCollapsed }),
      merge: (persisted, current) => {
        const parsed = preferencesSchema.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
    },
  ));
}

export function createCredentialsStore(storage: BrowserStorage) {
  let persistenceEnabled = true;
  return createStore<CredentialsState>()(persist<CredentialsState, [], [], PersistedCredentials>(
    (set) => ({
      setPersistenceEnabled: (enabled) => { persistenceEnabled = enabled; },
      key: null,
      remembered: false,
      setKey: (key, remember) => set({ key, remembered: remember }),
      clearKey: () => set({ key: null, remembered: false }),
    }),
    {
      name: CREDENTIALS_STORAGE_KEY,
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => stateStorage(storage, () => persistenceEnabled)),
      partialize: ({ key, remembered }) => ({ rememberedKey: remembered ? key : null }),
      merge: (persisted, current) => {
        const parsed = credentialsSchema.safeParse(persisted);
        if (!parsed.success) return current;
        const rememberedKey = parsed.data.rememberedKey;
        return { ...current, key: rememberedKey, remembered: rememberedKey !== null };
      },
    },
  ));
}
