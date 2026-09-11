import { describe, expect, it, vi } from "vitest";

import type { PracticeData } from "../domain/types";
import { BrowserAttemptRepository, PRACTICE_STORAGE_KEY, type BrowserStorage } from "./repository";
import { Attempt } from "../domain/attempt";
import { clearLocalData } from "./data-control";
import { createCredentialsStore, createPreferencesStore, PREFERENCES_STORAGE_KEY } from "./stores";
import { draft as fullDraft } from "../application/test-fixtures";

const NOW = "2026-09-11T00:00:00.000Z";
const WRITER = "00000000-0000-4000-8000-000000000099";

class MemoryStorage implements BrowserStorage {
  readonly values = new Map<string, string>();
  failSet = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failSet) throw new Error("quota");
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

function repository(storage: MemoryStorage) {
  return new BrowserAttemptRepository({
    storage,
    writerId: WRITER,
    clock: { now: () => NOW },
    debounceMs: 1,
  });
}

function practice(label = "draft"): PracticeData {
  const id = "00000000-0000-4000-8000-000000000001";
  const questions = Array.from({ length: 10 }, (_, index) => ({
    conceptId: `concept:${index}`,
    conceptTag: `tag-${index}`,
    track: "problem_oop" as const,
    variant: {
      id: `variant:${index}`,
      language: "java" as const,
      snippet: `class Example${index} {}`,
      assumptions: "None.",
      prompt: "What happens?",
      options: [{ id: `option:${index}:a`, text: "A" }, { id: `option:${index}:b`, text: "B" }],
    },
  }));
  return { attempts: [{
    id,
    parentAttemptId: null,
    createdAt: NOW,
    updatedAt: NOW,
    status: "draft",
    mode: "mcq_only",
    content: {
      problemId: "problem:test",
      contentVersion: "1.0.0",
      title: "Problem",
      introduction: "Introduction",
      requirements: [{ id: "requirement:one", text: "Do one thing." }],
      exclusions: [],
      example: "Example",
      faq: [],
      scenarioPrompts: { normal: "Normal", failure: "Failure" },
      language: "java",
      questions,
      attribution: { url: "https://example.com", commit: "abc", adaptations: [] },
    },
    draftDesign: null,
    draftAnswers: Object.fromEntries(questions.map(({ variant }) => [variant.id, null])),
    learnerRequirementNotes: [],
    scratchpad: label,
    scratchpadCanvas: [],
    snapshot: null,
    mcq: { status: "pending" },
    design: { status: "not_required" },
    reviewSession: null,
    runs: [],
  }] };
}

describe("BrowserAttemptRepository", () => {
  it("stages one attempt without replacing unrelated attempts", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    const data = practice();
    const second = structuredClone(data.attempts[0]!);
    second.id = "00000000-0000-4000-8000-000000000002";
    data.attempts.push(second);
    repo.stage(data);

    const next = { ...repo.read(data.attempts[0]!.id)!, scratchpad: "updated" };
    repo.stageAttempt(data.attempts[0]!.id, next);

    expect(repo.read(data.attempts[0]!.id)?.scratchpad).toBe("updated");
    expect(repo.read(second.id)).toEqual(second);
  });

  it("hydrates an existing envelope without writing a default over it", async () => {
    const storage = new MemoryStorage();
    const envelope = { schemaVersion: 1, revision: 7, writerId: WRITER, savedAt: NOW, data: { attempts: [] } };
    storage.values.set(PRACTICE_STORAGE_KEY, JSON.stringify(envelope));
    const setItem = vi.spyOn(storage, "setItem");
    const repo = repository(storage);

    await repo.hydrateOwned();

    expect(repo.getState().data).toEqual({ attempts: [] });
    expect(repo.getState().revision).toBe(7);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("preserves corrupt bytes, blocks writes, and exports the original raw value", async () => {
    const storage = new MemoryStorage();
    storage.values.set(PRACTICE_STORAGE_KEY, "{broken-json");
    const repo = repository(storage);

    await repo.hydrateOwned();
    expect(() => repo.stage({ attempts: [] })).toThrow(/writer ownership/);

    expect(repo.getState().access).toBe("corrupt");
    expect(repo.exportRawRecovery()).toBe("{broken-json");
    await expect(repo.flush()).resolves.toMatchObject({ ok: false, reason: "unsupported" });
    expect(storage.getItem(PRACTICE_STORAGE_KEY)).toBe("{broken-json");
  });

  it("serializes staged writes with monotonic revisions and rejects an external conflict", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    repo.stage(practice("one"));
    expect(await repo.flush()).toEqual({ ok: true, revision: 1 });

    storage.values.set(PRACTICE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, revision: 4, writerId: "other", savedAt: NOW, data: { attempts: [] } }));
    repo.stage(practice("two"));

    await expect(repo.flush()).resolves.toMatchObject({ ok: false, reason: "conflict" });
    expect(repo.getState().data).toEqual(practice("two"));
    expect(JSON.parse(storage.getItem(PRACTICE_STORAGE_KEY)!).revision).toBe(4);
  });

  it("publishes a critical transition only after its envelope is stored", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    repo.stage(practice("draft"));
    await repo.flush();
    storage.failSet = true;

    const id = repo.getState().data.attempts[0]!.id;
    const result = await repo.commitCritical(id, (attempt) => ({ ...attempt, scratchpad: "critical" }));

    expect(result).toMatchObject({ ok: false, reason: "storage" });
    expect(repo.read(id)?.scratchpad).toBe("draft");
  });

  it("invalidates queued generations so replacement cannot be recreated by an old save", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    repo.stage(practice("old"));
    repo.invalidate();

    const result = await repo.flush();

    expect(result).toMatchObject({ ok: false, reason: "unsupported" });
    expect(storage.getItem(PRACTICE_STORAGE_KEY)).toBeNull();
  });

  it("keeps a newer staged edit dirty when an older queued write completes", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    repo.stage(practice("one"));
    const saving = repo.flush();
    repo.stage(practice("two"));

    await saving;

    expect(repo.getState().saveStatus).toBe("dirty");
    expect(repo.getState().savedRevision).toBeLessThan(repo.getState().dirtyRevision);
    await repo.flush();
    expect(repo.getState().saveStatus).toBe("saved");
  });

  it("treats a same-revision writer change as a conflict", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    repo.stage(practice("one"));
    await repo.flush();
    const disk = JSON.parse(storage.getItem(PRACTICE_STORAGE_KEY)!);
    storage.values.set(PRACTICE_STORAGE_KEY, JSON.stringify({ ...disk, writerId: "another-tab" }));
    repo.stage(practice("two"));
    await expect(repo.flush()).resolves.toMatchObject({ ok: false, reason: "conflict" });
  });

  it("preserves intentionally saved pending submissions across reload before evaluation", async () => {
    const storage = new MemoryStorage();
    const ids = { next: () => "00000000-0000-4000-8000-000000000080" };
    const source = fullDraft("comprehensive");
    const snapshot = new Attempt(source, { now: () => NOW }, ids).prepareSubmission({ incompleteSections: ["relationships"], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    const submitted = { ...source, status: "submitted" as const, draftDesign: null, draftAnswers: {}, snapshot };
    storage.values.set(PRACTICE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, revision: 2, writerId: "old", savedAt: NOW, data: { attempts: [submitted] } }));
    const repo = repository(storage);

    await repo.hydrateOwned();

    expect(repo.read(source.id)).toMatchObject({ mcq: { status: "pending" }, design: { status: "pending" } });
    expect(JSON.parse(storage.getItem(PRACTICE_STORAGE_KEY)!).revision).toBe(2);
  });

  it("makes lock acquisition idempotent, releases writable access on close, and handles lock rejection", async () => {
    const storage = new MemoryStorage();
    let requests = 0;
    const locks = { request: async <T,>(_name: string, _options: { mode: "exclusive"; ifAvailable: true }, callback: (lock: object | null) => Promise<T>) => { requests++; return callback({}); } };
    const repo = new BrowserAttemptRepository({ storage, locks, writerId: WRITER, clock: { now: () => NOW } });
    const first = repo.startSession();
    const second = repo.startSession();
    expect(await first).toBe("writable");
    expect(await second).toBe("writable");
    expect(requests).toBe(1);
    repo.closeSession();
    expect(repo.getState().access).toBe("readonly");

    const rejected = new BrowserAttemptRepository({ storage, locks: { request: async () => { throw new Error("denied"); } }, writerId: WRITER, clock: { now: () => NOW } });
    await expect(rejected.startSession()).resolves.toBe("unsupported");
  });

  it("reload never grants writer access to a tab denied the Web Lock", async () => {
    const storage = new MemoryStorage();
    const locks = { request: async <T,>(_name: string, _options: { mode: "exclusive"; ifAvailable: true }, callback: (lock: object | null) => Promise<T>) => callback(null) };
    const repo = new BrowserAttemptRepository({ storage, locks, writerId: WRITER, clock: { now: () => NOW } });
    await repo.startSession();
    await repo.reload();
    expect(repo.getState().access).toBe("readonly");
    expect(() => repo.stage(practice())).toThrow(/writer ownership/);
  });

  it("closing while a Web Lock request is pending prevents late writable hydration", async () => {
    const storage = new MemoryStorage();
    let grant!: () => void;
    const ready = new Promise<void>((resolve) => { grant = resolve; });
    const locks = { request: async <T,>(_name: string, _options: { mode: "exclusive"; ifAvailable: true }, callback: (lock: object | null) => Promise<T>) => { await ready; return callback({}); } };
    const repo = new BrowserAttemptRepository({ storage, locks, writerId: WRITER, clock: { now: () => NOW } });
    const opening = repo.startSession();
    repo.closeSession();
    grant();
    await opening;
    expect(repo.getState().access).toBe("readonly");
  });

  it("a critical transition cannot run after import replaces its browser generation", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    repo.stage(practice());
    await repo.flush();
    let transitions = 0;
    const commit = repo.commitCritical(practice().attempts[0]!.id, (attempt) => { transitions++; return { ...attempt, scratchpad: "obsolete" }; });
    const replacing = repo.replace(practice("imported"));
    await Promise.all([commit, replacing]);
    expect(transitions).toBe(0);
    expect(repo.read(practice().attempts[0]!.id)?.scratchpad).toBe("imported");
  });

  it("a draft staged while a critical commit queues is included and cannot overwrite that commit later", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    repo.stage(practice());
    await repo.flush();
    const critical = repo.commitCritical(practice().attempts[0]!.id, (attempt) => ({ ...attempt, scratchpad: "critical" }));
    repo.stage(practice("staged"));
    await critical;
    await repo.flush();
    expect(repo.read(practice().attempts[0]!.id)?.scratchpad).toBe("critical");
    expect(JSON.parse(storage.getItem(PRACTICE_STORAGE_KEY)!).data.attempts[0].scratchpad).toBe("critical");
  });

  it("clear resets memory and preferences and permits a fresh owned save", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    repo.stage(practice());
    await repo.flush();
    const credentialsStore = createCredentialsStore(storage);
    const preferencesStore = createPreferencesStore(storage);
    preferencesStore.getState().setLanguage("python");
    credentialsStore.getState().setKey("secret", true);
    const outcomes = clearLocalData({ storage, repository: repo, credentialsStore, preferencesStore });
    expect(outcomes.every(({ ok }) => ok)).toBe(true);
    expect(repo.getState().data.attempts).toEqual([]);
    expect(preferencesStore.getState().language).toBe("java");
    expect(credentialsStore.getState().key).toBeNull();
    repo.stage(practice("new"));
    expect((await repo.flush()).ok).toBe(true);
  });

  it("partial clear empties memory, identifies each failed key, and suspends writes", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    repo.stage(practice());
    await repo.flush();
    const credentialsStore = createCredentialsStore(storage);
    const preferencesStore = createPreferencesStore(storage);
    preferencesStore.getState().setLanguage("python");
    vi.spyOn(storage, "removeItem").mockImplementation((key) => { if (key === PREFERENCES_STORAGE_KEY) throw new Error("blocked"); storage.values.delete(key); });
    const outcomes = clearLocalData({ storage, repository: repo, credentialsStore, preferencesStore });
    expect(outcomes.filter(({ ok }) => !ok)).toEqual([{ key: PREFERENCES_STORAGE_KEY, ok: false, message: "blocked" }]);
    expect(repo.getState().data.attempts).toEqual([]);
    expect(repo.getState().saveError).toContain(PREFERENCES_STORAGE_KEY);
    expect((await repo.retrySave()).ok).toBe(false);
    expect(storage.getItem(PRACTICE_STORAGE_KEY)).toBeNull();
    preferencesStore.getState().setLanguage("cpp");
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toContain("java");
  });


  it("imports a validated backup over corrupt owned storage while retaining raw recovery until success", async () => {
    const source = repository(new MemoryStorage());
    await source.hydrateOwned();
    source.stage(practice("backup"));
    const backup = source.exportPractice();
    const storage = new MemoryStorage();
    storage.values.set(PRACTICE_STORAGE_KEY, "broken original");
    const repo = repository(storage);
    await repo.hydrateOwned();
    storage.failSet = true;
    expect((await repo.importConfirmed(backup)).ok).toBe(false);
    expect(repo.exportRawRecovery()).toBe("broken original");
    storage.failSet = false;
    expect((await repo.importConfirmed(backup)).ok).toBe(true);
    expect(repo.getState().access).toBe("writable");
    expect(repo.read(practice().attempts[0]!.id)?.scratchpad).toBe("backup");
    expect(repo.exportRawRecovery()).toBeNull();
  });


  it("autosaves the latest edit after the 500ms debounce", async () => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const set = vi.spyOn(storage, "setItem");
      const repo = new BrowserAttemptRepository({ storage, writerId: WRITER, clock: { now: () => NOW } });
      await repo.hydrateOwned();
      repo.stage(practice("first"));
      await vi.advanceTimersByTimeAsync(400);
      repo.stage(practice("latest"));
      await vi.advanceTimersByTimeAsync(499);
      expect(set).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(set).toHaveBeenCalledTimes(1);
      expect(JSON.parse(storage.getItem(PRACTICE_STORAGE_KEY)!).data.attempts[0].scratchpad).toBe("latest");
    } finally { vi.useRealTimers(); }
  });

  it("only one tab owns writes and a reader can acquire the released lock on reload", async () => {
    const storage = new MemoryStorage();
    let owned = false;
    const locks = { request: async <T,>(_name: string, _options: { mode: "exclusive"; ifAvailable: true }, callback: (lock: object | null) => Promise<T>) => {
      if (owned) return callback(null);
      owned = true;
      try { return await callback({}); } finally { owned = false; }
    } };
    const first = new BrowserAttemptRepository({ storage, locks, writerId: WRITER, clock: { now: () => NOW } });
    const second = new BrowserAttemptRepository({ storage, locks, writerId: "second", clock: { now: () => NOW } });
    expect(await first.startSession()).toBe("writable");
    expect(await second.startSession()).toBe("readonly");
    first.closeSession();
    await vi.waitFor(() => expect(owned).toBe(false));
    await second.reload();
    expect(second.getState().access).toBe("writable");
    second.stage(practice());
    expect((await second.flush()).ok).toBe(true);
    second.closeSession();
  });

  it("suspends mutation after an external conflict until explicit reload", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    repo.stage(practice());
    await repo.flush();
    const raw = JSON.parse(storage.getItem(PRACTICE_STORAGE_KEY)!);
    storage.values.set(PRACTICE_STORAGE_KEY, JSON.stringify({ ...raw, writerId: "external" }));
    repo.stage(practice("unsaved recovery"));
    expect((await repo.flush()).ok).toBe(false);
    expect(repo.getState().access).toBe("readonly");
    expect(repo.exportPractice()).toContain("unsaved recovery");
    expect(() => repo.stage(practice())).toThrow(/writer ownership/);
    await repo.reload();
    expect(repo.getState().access).toBe("writable");
    repo.stage(practice("after reload"));
    expect((await repo.flush()).ok).toBe(true);
  });


  it("rehydrates nonempty persisted drafts consistently through public reads and supports editing", async () => {
    const storage = new MemoryStorage();
    const beforeRefresh = repository(storage);
    await beforeRefresh.hydrateOwned();
    beforeRefresh.stage(practice("persisted before refresh"));
    await beforeRefresh.flush();
    const afterRefresh = repository(storage);
    await afterRefresh.hydrateOwned();
    const id = practice().attempts[0]!.id;
    expect(afterRefresh.practiceStore.persist.hasHydrated()).toBe(true);
    expect(afterRefresh.read(id)).toEqual(afterRefresh.getState().data.attempts[0]);
    expect(afterRefresh.read(id)?.scratchpad).toBe("persisted before refresh");
    afterRefresh.stage({ attempts: [{ ...afterRefresh.read(id)!, scratchpad: "edited after refresh" }] });
    expect((await afterRefresh.flush()).ok).toBe(true);
    expect(JSON.parse(storage.getItem(PRACTICE_STORAGE_KEY)!).data.attempts[0].scratchpad).toBe("edited after refresh");
  });

  it("permits a critical save immediately after explicit reload without requiring a new draft edit", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.hydrateOwned();
    repo.stage(practice("stored"));
    await repo.flush();
    await repo.reload();
    const id = practice().attempts[0]!.id;
    const result = await repo.commitCritical(id, (attempt) => ({ ...attempt, scratchpad: "critical after reload" }));
    expect(result.ok).toBe(true);
    expect(repo.read(id)?.scratchpad).toBe("critical after reload");
    expect(repo.read(id)).toEqual(repo.getState().data.attempts[0]);
  });

  it("preserves memory-only drafting after successful clear without Web Locks", async () => {
    const storage = new MemoryStorage();
    const repo = repository(storage);
    await repo.startSession();
    expect(repo.getState().access).toBe("unsupported");
    repo.stage(practice());
    const outcomes = clearLocalData({ storage, repository: repo, credentialsStore: createCredentialsStore(storage) });
    expect(outcomes.every(x => x.ok)).toBe(true);
    expect(repo.getState().access).toBe("unsupported");
    repo.stage(practice("after clear"));
    expect(repo.getState().data.attempts).toHaveLength(1);
  });

});
