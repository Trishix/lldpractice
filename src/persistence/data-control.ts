import type { StoreApi } from "zustand/vanilla";

import type { BrowserAttemptRepository, BrowserStorage } from "./repository";
import { PRACTICE_STORAGE_KEY } from "./repository";
import { CREDENTIALS_STORAGE_KEY, PREFERENCES_STORAGE_KEY, type CredentialsState, type PreferencesState } from "./stores";

export type ClearKey = typeof PRACTICE_STORAGE_KEY | typeof PREFERENCES_STORAGE_KEY | typeof CREDENTIALS_STORAGE_KEY;
export interface ClearOutcome { key: ClearKey; ok: boolean; message?: string }

export function clearLocalData(options: {
  storage: BrowserStorage;
  repository: BrowserAttemptRepository;
  credentialsStore: StoreApi<CredentialsState>;
  preferencesStore?: StoreApi<PreferencesState>;
  abortActive?: () => void;
}): ClearOutcome[] {
  if (!options.repository.canClear()) throw new Error("Clearing local data requires writer ownership.");
  options.abortActive?.();
  options.repository.invalidate();
  try { options.credentialsStore.getState().clearKey(); } catch { /* memory updates before a persist adapter reports failure */ }
  try { options.preferencesStore?.getState().reset(); } catch { /* memory reset precedes persistence */ }
  options.credentialsStore.getState().setPersistenceEnabled(false);
  options.preferencesStore?.getState().setPersistenceEnabled(false);
  const keys: ClearKey[] = [PRACTICE_STORAGE_KEY, PREFERENCES_STORAGE_KEY, CREDENTIALS_STORAGE_KEY];
  const outcomes = keys.map((key) => {
    try {
      options.storage.removeItem(key);
      return { key, ok: true };
    } catch (error) {
      return { key, ok: false, message: error instanceof Error ? error.message : "Browser storage removal failed." };
    }
  });
  const failures = outcomes.filter(({ ok }) => !ok).map(({ key }) => key);
  options.repository.resetAfterClear(failures);
  if (failures.length === 0) {
    options.credentialsStore.getState().setPersistenceEnabled(true);
    options.preferencesStore?.getState().setPersistenceEnabled(true);
  }
  return outcomes;
}
