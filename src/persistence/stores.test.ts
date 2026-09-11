import { describe, expect, it } from "vitest";

import { CREDENTIALS_STORAGE_KEY, PREFERENCES_STORAGE_KEY, createCredentialsStore, createPreferencesStore } from "./stores";
import type { BrowserStorage } from "./repository";

class MemoryStorage implements BrowserStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("separate preference and credential stores", () => {
  it("hydrates preferences manually and keeps them outside practice storage", async () => {
    const storage = new MemoryStorage();
    const store = createPreferencesStore(storage);
    expect(store.persist.hasHydrated()).toBe(false);
    store.getState().setLanguage("python");
    await store.persist.rehydrate();
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toContain("python");
    expect(storage.getItem("lldpractice:practice")).toBeNull();
  });

  it("persists a learner key only after remember opt-in and erases memory immediately", () => {
    const storage = new MemoryStorage();
    const store = createCredentialsStore(storage);
    store.getState().setKey("secret", false);
    expect(storage.getItem(CREDENTIALS_STORAGE_KEY)).not.toContain("secret");
    store.getState().setKey("secret", true);
    expect(storage.getItem(CREDENTIALS_STORAGE_KEY)).toContain("secret");
    store.getState().clearKey();
    expect(store.getState().key).toBeNull();
    expect(storage.getItem(CREDENTIALS_STORAGE_KEY)).not.toContain("secret");
  });
});


it("does not hydrate malformed preferences over callable actions or accept a non-string credential", async () => {
  const storage = new MemoryStorage();
  storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 1, state: { language: "bogus", setLanguage: "broken" } }));
  storage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify({ version: 1, state: { rememberedKey: { secret: "invalid" } } }));
  const preferences = createPreferencesStore(storage);
  const credentials = createCredentialsStore(storage);
  await Promise.all([preferences.persist.rehydrate(), credentials.persist.rehydrate()]);
  expect(preferences.getState().language).toBe("java");
  expect(typeof preferences.getState().setLanguage).toBe("function");
  expect(credentials.getState().key).toBeNull();
});
