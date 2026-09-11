import { createStore, type StoreApi } from "zustand/vanilla";
import { persist, type PersistStorage } from "zustand/middleware";

import { AttemptDataSchema, parseBackupJson, PersistedEnvelopeSchema, PracticeDataSchema } from "../domain/schemas";
import type { AttemptData, AttemptRepository, Clock, CommitResult, Id, PersistedEnvelope, PracticeData } from "../domain/types";

export const PRACTICE_STORAGE_KEY = "lldpractice:practice";
export const WRITER_LOCK_NAME = "lldpractice:writer:v1";

export interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type RepositoryAccess = "unhydrated" | "writable" | "readonly" | "unsupported" | "corrupt";
export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export interface RepositoryState {
  data: PracticeData;
  access: RepositoryAccess;
  saveStatus: SaveStatus;
  revision: number;
  dirtyRevision: number;
  savedRevision: number;
  generation: number;
  saveError: string | null;
}

interface PracticeStoreState { data: PracticeData }

export interface LockHandle { readonly name?: string }
export interface BrowserLockManager {
  request<T>(name: string, options: { mode: "exclusive"; ifAvailable: true }, callback: (lock: LockHandle | null) => Promise<T>): Promise<T>;
}

interface RepositoryOptions {
  storage?: BrowserStorage;
  locks?: BrowserLockManager;
  writerId: Id;
  clock: Clock;
  debounceMs?: number;
}

const clone = <T>(value: T): T => structuredClone(value);
const emptyPractice = (): PracticeData => ({ attempts: [] });
const failed = (reason: "conflict" | "storage" | "unsupported", message: string): CommitResult => ({ ok: false, reason, message });

export class BrowserAttemptRepository implements AttemptRepository {
  readonly practiceStore: StoreApi<PracticeStoreState> & { persist: { rehydrate(): Promise<void> | void; hasHydrated(): boolean } };
  readonly repositoryStore = createStore<RepositoryState>(() => ({
    data: emptyPractice(), access: "unhydrated", saveStatus: "idle", revision: 0,
    dirtyRevision: 0, savedRevision: 0, generation: 0, saveError: null,
  }));
  private readonly storage?: BrowserStorage;
  private readonly locks?: BrowserLockManager;
  private readonly writerId: Id;
  private readonly clock: Clock;
  private readonly debounceMs: number;
  private writeQueue: Promise<CommitResult> = Promise.resolve({ ok: true, revision: 0 });
  private pending: { data: PracticeData; generation: number; logicalRevision: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private suppressBridgeWrite = false;
  private corruptRaw: string | null = null;
  private releaseLock: (() => void) | null = null;
  private sessionStart: Promise<RepositoryAccess> | null = null;
  private acknowledgedWriterId: string | null = null;
  private ownsWriteSession = false;
  private sessionEpoch = 0;

  constructor(options: RepositoryOptions) {
    this.storage = options.storage;
    this.locks = options.locks;
    this.writerId = options.writerId;
    this.clock = options.clock;
    this.debounceMs = options.debounceMs ?? 500;
    const bridge: PersistStorage<PracticeData> = {
      getItem: () => this.readForZustand(),
      setItem: (_name, value) => {
        if (this.suppressBridgeWrite) return;
        this.schedule(value.state);
      },
      removeItem: () => undefined,
    };
    this.practiceStore = createStore<PracticeStoreState>()(
      persist<PracticeStoreState, [], [], PracticeData>(
        () => ({ data: emptyPractice() }),
        {
          name: PRACTICE_STORAGE_KEY,
          version: 1,
          storage: bridge,
          skipHydration: true,
          partialize: (state) => clone(state.data),
          merge: (persisted, current) => ({ ...current, data: PracticeDataSchema.parse(persisted) }),
        },
      ),
    );
  }

  subscribe(listener: (state: RepositoryState) => void) { return this.repositoryStore.subscribe(listener); }
  getState(): RepositoryState { return this.repositoryStore.getState(); }

  async hydrate(): Promise<PersistedEnvelope | null> {
    await this.hydrateWithAccess("readonly");
    const raw = this.safeRawRead();
    if (!raw) return null;
    const parsed = PersistedEnvelopeSchema.safeParse(this.safeJson(raw));
    return parsed.success ? clone(parsed.data) : null;
  }

  async hydrateOwned(): Promise<PersistedEnvelope | null> {
    if (!this.storage) {
      this.patchStatus({ access: "unsupported", saveError: "Browser storage is unavailable." });
      return null;
    }
    if (this.locks && !this.ownsWriteSession) throw new Error("Hydration requires an acquired writer lock.");
    this.ownsWriteSession = true;
    return this.hydrateWithAccess("writable");
  }

  async startSession(): Promise<RepositoryAccess> {
    if (this.sessionStart) return this.sessionStart;
    this.sessionStart = this.beginSession();
    return this.sessionStart;
  }

  private async beginSession(): Promise<RepositoryAccess> {
    const epoch = this.sessionEpoch;
    if (!this.storage || !this.locks) {
      await this.hydrateWithAccess("unsupported");
      return this.getState().access;
    }
    let resolved!: () => void;
    const held = new Promise<void>((resolve) => { resolved = resolve; });
    let decision!: () => void;
    const decided = new Promise<void>((resolve) => { decision = resolve; });
    void this.locks.request(WRITER_LOCK_NAME, { mode: "exclusive", ifAvailable: true }, async (lock) => {
      if (epoch !== this.sessionEpoch) { decision(); return; }
      if (!lock) {
        await this.hydrateWithAccess("readonly");
        decision();
        return;
      }
      this.releaseLock = resolved;
      this.ownsWriteSession = true;
      await this.hydrateWithAccess("writable");
      decision();
      await held;
    }).catch(async () => {
      if (epoch !== this.sessionEpoch) { decision(); return; }
      this.ownsWriteSession = false;
      await this.hydrateWithAccess("unsupported");
      decision();
    });
    await decided;
    return this.getState().access;
  }

  closeSession(): void {
    this.sessionEpoch++;
    this.ownsWriteSession = false;
    this.invalidate();
    this.patchStatus({ access: this.storage ? "readonly" : "unsupported" });
    this.releaseLock?.();
    this.releaseLock = null;
    this.sessionStart = null;
  }

  read(id: Id): AttemptData | null {
    const found = this.practiceStore.getState().data.attempts.find((attempt) => attempt.id === id);
    return found ? clone(found) : null;
  }

  stage(data: PracticeData): void {
    const parsed = PracticeDataSchema.parse(clone(data));
    const access = this.getState().access;
    if (access === "readonly" || access === "unhydrated" || access === "corrupt") throw new Error("Practice mutation requires writer ownership.");
    if (access === "unsupported") {
      this.publishWithoutWrite(parsed);
      this.patchStatus({ saveStatus: "error", saveError: "This browser supports memory-only drafting and export." });
      return;
    }
    this.practiceStore.setState({ data: parsed });
    this.patchStatus({ data: parsed });
  }

  stageAttempt(attemptId: Id, attempt: AttemptData): void {
    const current = this.getState();
    if (current.access === "readonly" || current.access === "unhydrated" || current.access === "corrupt") throw new Error("Practice mutation requires writer ownership.");
    const index = this.practiceStore.getState().data.attempts.findIndex(({ id }) => id === attemptId);
    if (index < 0) throw new Error(`Attempt ${attemptId} does not exist.`);
    const parsed = AttemptDataSchema.parse(clone(attempt));
    const data = { attempts: this.practiceStore.getState().data.attempts.map((item, itemIndex) => itemIndex === index ? parsed : item) };
    if (current.access === "unsupported") {
      this.publishWithoutWrite(data);
      this.patchStatus({ saveStatus: "error", saveError: "This browser supports memory-only drafting and export." });
      return;
    }
    this.practiceStore.setState({ data });
    this.patchStatus({ data });
  }

  async flush(): Promise<CommitResult> {
    if (this.getState().access !== "writable") return failed("unsupported", "Persistent writes require writer ownership.");
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.pending) {
      const candidate = this.pending;
      this.pending = null;
      this.writeQueue = this.enqueue(() => this.commitCandidate(candidate.data, candidate.generation, candidate.logicalRevision));
    }
    return this.writeQueue;
  }

  async retrySave(): Promise<CommitResult> {
    const state = this.getState();
    this.pending = { data: clone(this.practiceStore.getState().data), generation: state.generation, logicalRevision: state.dirtyRevision };
    return this.flush();
  }

  async commitCritical(attemptId: Id, transition: (current: AttemptData) => AttemptData): Promise<CommitResult> {
    const generation = this.getState().generation;
    const prior = await this.flush();
    if (!prior.ok) return prior;
    if (generation !== this.getState().generation) return failed("unsupported", "The transition belongs to an obsolete browser generation.");
    this.writeQueue = this.enqueue(async () => {
      if (generation !== this.getState().generation) return failed("unsupported", "The transition belongs to an obsolete browser generation.");
      const current = this.practiceStore.getState().data;
      const index = current.attempts.findIndex(({ id }) => id === attemptId);
      if (index < 0) return failed("unsupported", `Attempt ${attemptId} does not exist.`);
      const nextAttempt = AttemptDataSchema.parse(transition(clone(current.attempts[index]!)));
      const candidate = PracticeDataSchema.parse({ attempts: current.attempts.map((attempt, i) => i === index ? nextAttempt : attempt) });
      const logicalRevision = this.getState().dirtyRevision + 1;
      // The candidate includes the latest staged edits. Do not allow an older debounce
      // candidate to overwrite this critical transition after it is persisted.
      this.pending = null;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.patchStatus({ dirtyRevision: logicalRevision, saveStatus: "saving" });
      const result = this.commitCandidate(candidate, generation, logicalRevision);
      if (result.ok && generation === this.getState().generation) this.publishWithoutWrite(candidate);
      return result;
    });
    return this.writeQueue;
  }

  async replace(data: PracticeData): Promise<CommitResult> {
    const candidate = PracticeDataSchema.parse(clone(data));
    const recovery = this.getState().access === "corrupt" && this.ownsWriteSession;
    this.invalidate();
    const generation = this.getState().generation;
    this.writeQueue = this.enqueue(async () => {
      if (generation !== this.getState().generation) return failed("unsupported", "The replacement belongs to an obsolete browser generation.");
      const logicalRevision = this.getState().dirtyRevision + 1;
      this.patchStatus({ dirtyRevision: logicalRevision });
      const result = this.commitCandidate(candidate, generation, logicalRevision, recovery);
      if (result.ok) {
        this.publishWithoutWrite(candidate);
        if (recovery) { this.corruptRaw = null; this.patchStatus({ access: "writable" }); }
      } else if (generation === this.getState().generation) {
        // Replacement already cancelled active transports. Keep the original work
        // recoverable as interrupted rather than stranding it in running state.
        this.publishWithoutWrite(normalizeAbandoned(this.getState().data, this.clock.now()));
      }
      return result;
    });
    return this.writeQueue;
  }

  previewImport(json: string): PracticeData {
    return normalizeAbandoned(parseBackupJson(json).data, this.clock.now());
  }

  importConfirmed(json: string): Promise<CommitResult> {
    return this.replace(this.previewImport(json));
  }

  async reload(): Promise<PersistedEnvelope | null> {
    this.invalidate();
    if (!this.ownsWriteSession && this.locks) {
      this.closeSession();
      await this.startSession();
      const raw = this.safeRawRead();
      const parsed = raw ? PersistedEnvelopeSchema.safeParse(this.safeJson(raw)) : null;
      return parsed?.success ? clone(parsed.data) : null;
    }
    return this.hydrateWithAccess(this.ownsWriteSession ? "writable" : "unsupported");
  }

  /** Called after all individual removals have completed. Never writes removed data back. */
  resetAfterClear(failedKeys: string[]): void {
    const wasUnsupported = this.getState().access === "unsupported";
    this.invalidate();
    this.publishWithoutWrite(emptyPractice());
    this.corruptRaw = null;
    this.acknowledgedWriterId = null;
    const access = failedKeys.length ? "readonly" : this.ownsWriteSession ? "writable" : wasUnsupported || !this.storage ? "unsupported" : "readonly";
    this.patchStatus({
      access, revision: 0, dirtyRevision: 0, savedRevision: 0,
      saveStatus: failedKeys.length ? "error" : "idle",
      saveError: failedKeys.length ? `Local removal failed for: ${failedKeys.join(", ")}. Writes are suspended; retry clearing or reload.` : null,
    });
    this.writeQueue = Promise.resolve(failedKeys.length ? failed("storage", this.getState().saveError!) : { ok: true, revision: 0 });
  }

  canClear(): boolean { return this.ownsWriteSession || this.getState().access === "unsupported"; }

  invalidate(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    const generation = this.getState().generation + 1;
    this.patchStatus({ generation, saveStatus: "error", saveError: "Pending work was invalidated." });
    this.writeQueue = this.enqueue(() => Promise.resolve(failed("unsupported", "The operation belongs to an obsolete browser generation.")));
  }

  /** Preserve unsaved memory when a storage event invalidates the acknowledged disk. */
  observeExternalChange(): void {
    this.invalidate();
    this.recordFailure("conflict", "Saved practice changed in another tab. Export unsaved work or explicitly reload the saved version.");
  }

  exportPractice(): string {
    const data = PracticeDataSchema.parse(clone(this.practiceStore.getState().data));
    return JSON.stringify({ format: "lldpractice-backup", schemaVersion: 1, exportedAt: this.clock.now(), data }, null, 2);
  }

  exportRawRecovery(): string | null { return this.corruptRaw; }

  private async hydrateWithAccess(access: RepositoryAccess): Promise<PersistedEnvelope | null> {
    const generation = this.getState().generation;
    this.patchStatus({ access: "unhydrated", saveError: null });
    const raw = this.safeRawRead();
    if (raw === undefined) {
      this.publishWithoutWrite(emptyPractice());
      this.patchStatus({ access: "unsupported", saveStatus: "error", saveError: "Browser storage is unavailable." });
      return null;
    }
    if (raw === null) {
      this.publishWithoutWrite(emptyPractice());
      this.acknowledgedWriterId = null;
      this.patchStatus({ access, data: emptyPractice(), revision: 0, savedRevision: 0, dirtyRevision: 0, saveStatus: "idle" });
      if (access === "writable") this.writeQueue = Promise.resolve({ ok: true, revision: 0 });
      return null;
    }
    const parsed = PersistedEnvelopeSchema.safeParse(this.safeJson(raw));
    if (!parsed.success) {
      this.corruptRaw = raw;
      this.publishWithoutWrite(emptyPractice());
      this.patchStatus({ access: "corrupt", saveStatus: "error", saveError: "Saved practice data is corrupt or uses an unsupported version." });
      return null;
    }
    await this.practiceStore.persist.rehydrate();
    if (generation !== this.getState().generation) return null;
    this.corruptRaw = null;
    this.acknowledgedWriterId = parsed.data.writerId;
    this.patchStatus({ access, data: clone(parsed.data.data), revision: parsed.data.revision, savedRevision: parsed.data.revision, dirtyRevision: parsed.data.revision, saveStatus: "saved" });
    if (access === "writable") {
      const recovered = normalizeAbandoned(parsed.data.data, this.clock.now());
      if (JSON.stringify(recovered) !== JSON.stringify(parsed.data.data)) {
        const logicalRevision = this.getState().dirtyRevision + 1;
        this.patchStatus({ dirtyRevision: logicalRevision });
        const result = this.commitCandidate(recovered, this.getState().generation, logicalRevision);
        if (!result.ok) {
          this.patchStatus({ access: "readonly" });
          return parsed.data;
        }
        this.publishWithoutWrite(recovered);
      }
    }
    if (access === "writable") this.writeQueue = Promise.resolve({ ok: true, revision: this.getState().revision });
    return clone(parsed.data);
  }

  private readForZustand(): { state: PracticeData; version: number } | null {
    const raw = this.safeRawRead();
    if (!raw) return null;
    const envelope = PersistedEnvelopeSchema.parse(this.safeJson(raw));
    return { state: clone(envelope.data), version: envelope.schemaVersion };
  }

  private schedule(data: PracticeData): void {
    const parsed = PracticeDataSchema.parse(clone(data));
    const state = this.getState();
    const logicalRevision = state.dirtyRevision + 1;
    this.pending = { data: parsed, generation: state.generation, logicalRevision };
    this.patchStatus({ saveStatus: "dirty", dirtyRevision: logicalRevision, saveError: null });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.debounceMs);
  }

  private commitCandidate(data: PracticeData, generation: number, logicalRevision: number, recoverCorrupt = false): CommitResult {
    const state = this.getState();
    if (generation !== state.generation) return failed("unsupported", "The write belongs to an obsolete browser generation.");
    if ((state.access !== "writable" && !(recoverCorrupt && state.access === "corrupt" && this.ownsWriteSession)) || !this.storage) return failed("unsupported", "Persistent writes require browser storage and writer ownership.");
    this.patchStatus({ saveStatus: "saving", saveError: null });
    try {
      const raw = this.storage.getItem(PRACTICE_STORAGE_KEY);
      let diskRevision = 0;
      let diskWriterId: string | null = null;
      if (raw !== null) {
        const disk = PersistedEnvelopeSchema.safeParse(this.safeJson(raw));
        if (!disk.success) {
          if (!recoverCorrupt || raw !== this.corruptRaw) return this.recordFailure("storage", "The stored practice envelope cannot be validated.");
        } else {
          diskRevision = disk.data.revision;
          diskWriterId = disk.data.writerId;
        }
      }
      const expected = recoverCorrupt ? 0 : this.getState().revision;
      if (diskRevision !== expected || diskWriterId !== (recoverCorrupt ? null : this.acknowledgedWriterId)) return this.recordFailure("conflict", `Saved revision or writer changed from the acknowledged envelope.`);
      if (generation !== this.getState().generation) return failed("unsupported", "The write belongs to an obsolete browser generation.");
      const revision = expected + 1;
      const envelope: PersistedEnvelope = { schemaVersion: 1, revision, writerId: this.writerId, savedAt: this.clock.now(), data: PracticeDataSchema.parse(clone(data)) };
      this.storage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(envelope));
      this.acknowledgedWriterId = this.writerId;
      const latest = this.getState();
      this.patchStatus({ revision, savedRevision: logicalRevision, saveStatus: latest.dirtyRevision > logicalRevision || this.pending ? "dirty" : "saved", saveError: null });
      return { ok: true, revision };
    } catch (error) {
      return this.recordFailure("storage", error instanceof Error ? error.message : "Browser storage failed.");
    }
  }

  private recordFailure(reason: "storage" | "conflict", message: string): CommitResult {
    this.patchStatus({ ...(reason === "conflict" ? { access: "readonly" as const } : {}), saveStatus: reason === "conflict" ? "conflict" : "error", saveError: message });
    return failed(reason, message);
  }

  private publishWithoutWrite(data: PracticeData): void {
    this.suppressBridgeWrite = true;
    try { this.practiceStore.setState({ data: clone(data) }); }
    finally { this.suppressBridgeWrite = false; }
    this.patchStatus({ data: clone(data) });
  }

  private safeRawRead(): string | null | undefined {
    if (!this.storage) return undefined;
    try { return this.storage.getItem(PRACTICE_STORAGE_KEY); }
    catch { return undefined; }
  }

  private safeJson(raw: string): unknown {
    try { return JSON.parse(raw) as unknown; }
    catch { return undefined; }
  }

  private enqueue(operation: () => Promise<CommitResult> | CommitResult): Promise<CommitResult> {
    return this.writeQueue.then(operation, operation).catch((error) => this.recordFailure("storage", error instanceof Error ? error.message : "Persistence operation failed."));
  }

  private patchStatus(patch: Partial<RepositoryState>): void { this.repositoryStore.setState(patch); }
}

export function normalizeAbandoned(data: PracticeData, now: string): PracticeData {
  const error = { code: "REQUEST_INTERRUPTED", message: "The browser closed before this evaluation finished. Retry is available.", retryable: true };
  const attempts = data.attempts.map((source) => {
    if (source.status !== "submitted") return clone(source);
    const attempt = clone(source);
    for (const component of ["mcq", "design"] as const) {
      const evaluation = attempt[component];
      if (evaluation.status !== "running") continue;
      const runId = evaluation.status === "running" ? evaluation.runId : undefined;
      attempt[component] = { status: "interrupted", ...(runId ? { runId } : {}), error } as never;
      if (runId) {
        const index = attempt.runs.findIndex((run) => run.id === runId && run.outcome === "running");
        if (index >= 0) attempt.runs[index] = { ...attempt.runs[index]!, endedAt: now, outcome: "interrupted", error };
      }
    }
    return AttemptDataSchema.parse(attempt);
  });
  return PracticeDataSchema.parse({ attempts });
}
