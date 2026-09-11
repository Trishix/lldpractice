import { Attempt, DefaultSubmissionValidator } from "../domain/attempt";
import {
  ApiSuccessSchema,
  AttemptDataSchema,
  ClarificationAnswerSchema,
  DesignReportSchema,
  EvaluationErrorSchema,
  McqResultSchema,
  ReviewOutcomeSchema,
} from "../domain/schemas";
import type {
  ApiSuccess,
  ClarificationAnswer,
  Clock,
  CommitResult,
  CredentialMode,
  DesignReviewRequest,
  EvaluationCoordinator,
  EvaluationComponent,
  EvaluationError,
  IdGenerator,
  McqResult,
  McqScoreRequest,
  PublicConfig,
  ReviewConfiguration,
  ReviewOutcome,
  SubmissionAcknowledgments,
} from "../domain/types";
import type { BrowserAttemptRepository } from "../persistence/repository";
import { ZodError } from "zod";

export interface EvaluationTransport {
  score(request: McqScoreRequest, signal: AbortSignal): Promise<unknown>;
  review(request: DesignReviewRequest, credential: string | undefined, signal: AbortSignal): Promise<unknown>;
}

export interface CredentialSelection { mode: CredentialMode; key?: string }

interface CoordinatorOptions {
  repository: BrowserAttemptRepository;
  transport: EvaluationTransport;
  clock: Clock;
  ids: IdGenerator;
  getConfig(): PublicConfig;
  getCredential(): CredentialSelection;
  scoringTimeoutMs?: number;
  reviewTimeoutMs?: number;
}

const localError = (code: string, message: string, retryable = true): EvaluationError => ({ code, message, retryable });
const clone = <T>(value: T): T => structuredClone(value);

export class DefaultEvaluationCoordinator implements EvaluationCoordinator {
  private readonly repository: BrowserAttemptRepository;
  private readonly transport: EvaluationTransport;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;
  private readonly getConfig: () => PublicConfig;
  private readonly getCredential: () => CredentialSelection;
  private readonly scoringTimeoutMs: number;
  private readonly reviewTimeoutMs: number;
  private readonly componentGuards = new Set<string>();
  private readonly submissionGuards = new Set<string>();
  private readonly controllers = new Set<AbortController>();
  private readonly unsubscribe: () => void;

  constructor(options: CoordinatorOptions) {
    this.repository = options.repository;
    this.transport = options.transport;
    this.clock = options.clock;
    this.ids = options.ids;
    this.getConfig = options.getConfig;
    this.getCredential = options.getCredential;
    this.scoringTimeoutMs = options.scoringTimeoutMs ?? 10_000;
    this.reviewTimeoutMs = options.reviewTimeoutMs ?? 70_000;
    let generation = this.repository.getState().generation;
    this.unsubscribe = this.repository.subscribe((state) => {
      if (state.generation !== generation || state.access !== "writable") {
        for (const controller of this.controllers) controller.abort();
      }
      generation = state.generation;
    });
  }

  async saveSubmission(attemptId: string, ack: SubmissionAcknowledgments): Promise<CommitResult> {
    const generation = this.repository.getState().generation;
    const guard = `${generation}:${attemptId}`;
    if (this.submissionGuards.has(guard)) return { ok: false, reason: "unsupported", message: "Submission is already being saved." };
    this.submissionGuards.add(guard);
    try {
      return await this.repository.commitCritical(attemptId, (current) => {
        if (current.status !== "draft") throw new Error("Only a draft can be submitted.");
        const snapshot = new Attempt(current, this.clock, this.ids, new DefaultSubmissionValidator()).prepareSubmission(ack);
        return AttemptDataSchema.parse({
          ...current, updatedAt: snapshot.submittedAt, status: "submitted", draftDesign: null,
          draftAnswers: {}, snapshot, mcq: { status: "pending" },
          design: current.mode === "comprehensive" ? { status: "pending" } : { status: "not_required" },
          reviewSession: null, runs: [],
        });
      });
    } finally { this.submissionGuards.delete(guard); }
  }

  async evaluate(attemptId: string, components: EvaluationComponent[] = ["mcq", "design"]): Promise<void> {
    const attempt = this.repository.read(attemptId);
    if (!attempt?.snapshot) throw new Error("Save a frozen submission before evaluation.");
    if (this.repository.getState().access !== "writable") return;
    const tasks: Promise<void>[] = [];
    if (components.includes("mcq") && attempt.mcq.status === "pending") tasks.push(this.startMcq(attemptId));
    if (components.includes("design") && attempt.design.status === "pending") tasks.push(this.startDesign(attemptId, "initial", true));
    await Promise.allSettled(tasks);
  }

  async submit(attemptId: string, ack: SubmissionAcknowledgments): Promise<void> {
    const generation = this.repository.getState().generation;
    const committed = await this.saveSubmission(attemptId, ack);
    if (committed.ok && generation === this.repository.getState().generation) await this.evaluate(attemptId);
  }

  async retry(attemptId: string, component: EvaluationComponent): Promise<void> {
    const attempt = this.repository.read(attemptId);
    if (!attempt || attempt.status !== "submitted") throw new Error("Retry requires a submitted attempt.");
    const evaluation = attempt[component];
    if (evaluation.status !== "failed" && evaluation.status !== "interrupted") throw new Error("Only failed or interrupted work can be retried.");
    if (component === "mcq") await this.startMcq(attemptId);
    else {
      const phase = attempt.reviewSession?.frozenAnswers ? "final" : "initial";
      await this.startDesign(attemptId, phase, false);
    }
  }

  async completeClarification(attemptId: string, answers: ClarificationAnswer[]): Promise<void> {
    const guard = `${this.repository.getState().generation}:${attemptId}:clarification`;
    if (this.componentGuards.has(guard)) return;
    this.componentGuards.add(guard);
    try {
    const attempt = this.repository.read(attemptId);
    if (!attempt?.snapshot || attempt.design.status !== "awaiting_clarification" || !attempt.reviewSession?.clarification) throw new Error("The attempt is not awaiting clarification.");
    if (attempt.reviewSession.frozenAnswers) throw new Error("Clarification answers are already frozen.");
    const parsedAnswers = answers.map((answer) => ClarificationAnswerSchema.parse(answer));
    const expected = attempt.reviewSession.clarification.questions.map(({ id }) => id).sort();
    if (parsedAnswers.map(({ questionId }) => questionId).sort().join("|") !== expected.join("|")) throw new Error("Answers must exactly match clarification questions.");
    await this.startDesign(attemptId, "final", false, parsedAnswers);
    } finally { this.componentGuards.delete(guard); }
  }

  async restartDesignReview(attemptId: string): Promise<void> {
    const attempt = this.repository.read(attemptId);
    if (!attempt || !["failed", "interrupted", "awaiting_clarification"].includes(attempt.design.status)) throw new Error("Restart requires incomplete design review work.");
    const reset = await this.repository.commitCritical(attemptId, (current) => ({ ...current, design: { status: "pending" }, reviewSession: null }));
    if (reset.ok) await this.startDesign(attemptId, "initial", true);
  }

  invalidate(): void {
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.componentGuards.clear();
    this.repository.invalidate();
  }

  retrySave() { return this.repository.retrySave(); }

  dispose(): void { this.invalidate(); this.unsubscribe(); }

  private async startMcq(attemptId: string): Promise<void> {
    const guard = `${this.repository.getState().generation}:${attemptId}:mcq`;
    if (this.componentGuards.has(guard)) return;
    this.componentGuards.add(guard);
    const runId = this.ids.next();
    const generation = this.repository.getState().generation;
    try {
      const started = await this.repository.commitCritical(attemptId, (current) => {
        if (!current.snapshot || !["pending", "failed", "interrupted"].includes(current.mcq.status)) throw new Error("MCQ scoring is not eligible to start.");
        return { ...current, mcq: { status: "running", runId }, runs: [...current.runs, { id: runId, snapshotId: current.snapshot.id, phase: "mcq", startedAt: this.clock.now(), outcome: "running" }] };
      });
      if (generation !== this.repository.getState().generation) return;
      if (!started.ok) {
        await this.recordUnpersistedRunFailure(attemptId, "mcq", runId, localError("STORAGE_UNAVAILABLE", "The scoring run could not be saved; no request was sent."));
        return;
      }
      const attempt = this.repository.read(attemptId)!;
      const snapshot = attempt.snapshot!;
      const request: McqScoreRequest = { attemptId, snapshotId: snapshot.id, runId, problemId: snapshot.problemId, contentVersion: snapshot.contentVersion, language: snapshot.language, answers: clone(snapshot.answers) };
      const raw = await this.withDeadline((signal) => this.transport.score(request, signal), this.scoringTimeoutMs);
      const response = ApiSuccessSchema(McqResultSchema).parse(raw) as ApiSuccess<McqResult>;
      this.requireCorrelation(response, request);
      await this.applyResult(attemptId, "mcq", runId, generation, response.data);
    } catch (error) {
      await this.applyFailure(attemptId, "mcq", runId, generation, error);
    } finally {
      this.componentGuards.delete(guard);
    }
  }

  private async startDesign(attemptId: string, phase: "initial" | "final", newSession: boolean, finalAnswers?: ClarificationAnswer[]): Promise<void> {
    const guard = `${this.repository.getState().generation}:${attemptId}:design`;
    if (this.componentGuards.has(guard)) return;
    this.componentGuards.add(guard);
    const generation = this.repository.getState().generation;
    const runId = this.ids.next();
    try {
      const before = this.repository.read(attemptId);
      if (!before?.snapshot?.design) throw new Error("Design review requires a frozen design.");
      const credential = this.getCredential();
      let sessionId: string;
      let configuration: ReviewConfiguration;
      const credentialMode = !newSession && before.reviewSession ? before.reviewSession.credentialMode : credential.mode;
      if (newSession || !before.reviewSession) {
        sessionId = this.ids.next();
        configuration = this.resolveConfiguration(before.content.problemId, before.content.contentVersion);
      } else {
        sessionId = before.reviewSession.id;
        configuration = clone(before.reviewSession.configuration);
      }
      const started = await this.repository.commitCritical(attemptId, (current) => {
        if (!current.snapshot || current.snapshot.id !== before.snapshot!.id) throw new Error("Submission changed before review start.");
        if (!["pending", "failed", "interrupted", "awaiting_clarification"].includes(current.design.status)) throw new Error("Design review is not eligible to start.");
        const reviewSession = newSession || !current.reviewSession
          ? { id: sessionId, configuration, credentialMode }
          : { ...current.reviewSession, ...(finalAnswers ? { frozenAnswers: clone(finalAnswers) } : {}) };
        if (phase === "final" && (!reviewSession.clarification || !reviewSession.frozenAnswers)) throw new Error("Final review requires frozen clarification answers.");
        return {
          ...current,
          design: { status: "running", runId },
          reviewSession,
          runs: [...current.runs, { id: runId, snapshotId: current.snapshot.id, phase, sessionId, credentialMode, configuration, startedAt: this.clock.now(), outcome: "running" }],
        };
      });
      if (generation !== this.repository.getState().generation) return;
      if (!started.ok) {
        await this.recordUnpersistedDesignRunFailure(before, runId, phase, sessionId, configuration, credentialMode, finalAnswers, localError("STORAGE_UNAVAILABLE", "The design run could not be saved; no request was sent."));
        return;
      }
      if (credential.mode !== credentialMode) throw localError("REVIEW_CONFIG_CHANGED", "Credential mode changed; restart the design review.", false);
      const currentConfiguration = this.resolveConfiguration(before.content.problemId, before.content.contentVersion);
      if (JSON.stringify(currentConfiguration) !== JSON.stringify(configuration)) throw localError("REVIEW_CONFIG_CHANGED", "Review configuration changed; restart the design review.", false);
      if (credential.mode === "platform" && !this.getConfig().platformAvailable) throw localError("PLATFORM_UNAVAILABLE", "Platform review is unavailable.");
      if (credential.mode === "user" && !credential.key?.trim()) throw localError("USER_KEY_REQUIRED", "Enter the learner provider key before retrying.");
      const current = this.repository.read(attemptId)!;
      const snapshot = current.snapshot!;
      const session = current.reviewSession!;
      const request: DesignReviewRequest = {
        attemptId, snapshotId: snapshot.id, runId, credentialMode: credential.mode,
        input: {
          problemId: snapshot.problemId, contentVersion: snapshot.contentVersion, snapshotId: snapshot.id,
          design: clone(snapshot.design!), acknowledgedIncompleteSections: clone(snapshot.acknowledgments.incompleteSections),
          phase, sessionId: session.id, configuration: clone(session.configuration),
          ...(phase === "final" ? { clarification: clone(session.clarification!), answers: clone(session.frozenAnswers!) } : {}),
        },
      };
      const raw = await this.withDeadline((signal) => this.transport.review(request, credential.key, signal), this.reviewTimeoutMs);
      const response = ApiSuccessSchema(ReviewOutcomeSchema).parse(raw) as ApiSuccess<ReviewOutcome>;
      this.requireCorrelation(response, request);
      if (phase === "final" && response.data.kind === "clarification") throw localError("INVALID_RESPONSE", "A final review cannot request more clarification.");
      await this.applyResult(attemptId, "design", runId, generation, response.data);
    } catch (error) {
      if (generation !== this.repository.getState().generation || this.repository.getState().access !== "writable") return;
      const current = this.repository.read(attemptId);
      if (current?.design.status === "pending") {
        const mapped = this.mapError(error);
        const configuration = current.reviewSession?.configuration ?? this.getConfigForFailure(current);
        const sessionId = current.reviewSession?.id ?? this.ids.next();
        await this.recordUnpersistedDesignRunFailure(current, runId, phase, sessionId, configuration, this.getCredential().mode, undefined, mapped);
      } else {
        await this.applyFailure(attemptId, "design", runId, generation, error);
      }
    } finally {
      this.componentGuards.delete(guard);
    }
  }

  private async applyResult(attemptId: string, component: "mcq", runId: string, generation: number, result: McqResult): Promise<void>;
  private async applyResult(attemptId: string, component: "design", runId: string, generation: number, result: ReviewOutcome): Promise<void>;
  private async applyResult(attemptId: string, component: "mcq" | "design", runId: string, generation: number, result: McqResult | ReviewOutcome): Promise<void> {
    if (generation !== this.repository.getState().generation || this.repository.getState().access !== "writable") return;
    const current = this.repository.getState().data;
    const index = current.attempts.findIndex(({ id }) => id === attemptId);
    if (index < 0) return;
    const attempt = clone(current.attempts[index]!);
    const evaluation = attempt[component];
    if (evaluation.status !== "running" || evaluation.runId !== runId) return;
    const runIndex = attempt.runs.findIndex((candidate) => candidate.id === runId && candidate.outcome === "running");
    if (runIndex < 0) return;
    const run = attempt.runs[runIndex]!;
    if (component === "mcq") {
      attempt.mcq = { status: "succeeded", runId, result: McqResultSchema.parse(result) };
      attempt.runs[runIndex] = { ...run, endedAt: this.clock.now(), outcome: "succeeded" };
    } else {
      const outcome = ReviewOutcomeSchema.parse(result);
      if (outcome.kind === "report") {
        attempt.design = { status: "succeeded", runId, report: DesignReportSchema.parse(outcome.report) };
        attempt.runs[runIndex] = { ...run, endedAt: this.clock.now(), outcome: "succeeded" };
      } else {
        attempt.design = { status: "awaiting_clarification", runId, request: outcome.clarification };
        attempt.reviewSession = { ...attempt.reviewSession!, clarification: outcome.clarification };
        attempt.runs[runIndex] = { ...run, endedAt: this.clock.now(), outcome: "awaiting_clarification" };
      }
    }
    const parsed = AttemptDataSchema.parse(attempt);
    this.repository.stage({ attempts: current.attempts.map((item, i) => i === index ? parsed : item) });
    await this.repository.flush();
  }

  private async applyFailure(attemptId: string, component: "mcq" | "design", runId: string, generation: number, cause: unknown): Promise<void> {
    if (generation !== this.repository.getState().generation || this.repository.getState().access !== "writable") return;
    const current = this.repository.getState().data;
    const index = current.attempts.findIndex(({ id }) => id === attemptId);
    if (index < 0) return;
    const attempt = clone(current.attempts[index]!);
    const evaluation = attempt[component];
    if (evaluation.status !== "running" || evaluation.runId !== runId) return;
    const error = this.mapError(cause);
    const runIndex = attempt.runs.findIndex((run) => run.id === runId && run.outcome === "running");
    if (runIndex < 0) return;
    attempt[component] = { status: "failed", runId, error } as never;
    attempt.runs[runIndex] = { ...attempt.runs[runIndex]!, endedAt: this.clock.now(), outcome: "failed", error };
    const parsed = AttemptDataSchema.parse(attempt);
    this.repository.stage({ attempts: current.attempts.map((item, i) => i === index ? parsed : item) });
    await this.repository.flush();
  }

  private resolveConfiguration(problemId: string, contentVersion: string): ReviewConfiguration {
    const config = this.getConfig();
    const content = config.content.find((candidate) => candidate.problemId === problemId && candidate.contentVersion === contentVersion);
    if (!content) throw localError("CONTENT_VERSION_UNAVAILABLE", "The saved content version is unavailable.", false);
    return { provider: config.provider, model: config.model, reasoningEffort: config.reasoningEffort, evaluatorVersion: config.evaluatorVersion, promptVersion: config.promptVersion, rubricVersion: content.rubricVersion };
  }

  private getConfigForFailure(attempt: NonNullable<ReturnType<BrowserAttemptRepository["read"]>>): ReviewConfiguration {
    try { return this.resolveConfiguration(attempt.content.problemId, attempt.content.contentVersion); }
    catch { return { provider: "groq", model: "openai/gpt-oss-120b", reasoningEffort: "medium", evaluatorVersion: "design-v1", promptVersion: "review-v1", rubricVersion: "unknown" }; }
  }

  private requireCorrelation(response: { attemptId: string; snapshotId: string; runId: string }, request: { attemptId: string; snapshotId: string; runId: string }) {
    if (response.attemptId !== request.attemptId || response.snapshotId !== request.snapshotId || response.runId !== request.runId) throw localError("INVALID_RESPONSE", "Evaluation response identifiers do not match the active request.");
  }

  private async withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let onAbort!: () => void;
    const interrupted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(localError("REQUEST_INTERRUPTED", "The evaluation request timed out or was interrupted."));
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    try { return await Promise.race([operation(controller.signal), interrupted]); }
    finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      this.controllers.delete(controller);
    }
  }

  private mapError(error: unknown): EvaluationError {
    if (error instanceof ZodError) return localError("INVALID_RESPONSE", "The evaluation service returned an invalid response.");
    const parsed = EvaluationErrorSchema.safeParse(error);
    if (parsed.success) return parsed.data;
    return localError("NETWORK_ERROR", "The evaluation request failed. Check your connection and retry.");
  }

  private async recordUnpersistedRunFailure(attemptId: string, component: "mcq", runId: string, error: EvaluationError): Promise<void> {
    const current = this.repository.getState().data;
    const index = current.attempts.findIndex(({ id }) => id === attemptId);
    if (index < 0) return;
    const attempt = clone(current.attempts[index]!);
    if (!attempt.snapshot || attempt.mcq.status !== "pending") return;
    attempt.mcq = { status: "failed", runId, error };
    attempt.runs.push({ id: runId, snapshotId: attempt.snapshot.id, phase: "mcq", startedAt: this.clock.now(), endedAt: this.clock.now(), outcome: "failed", error });
    this.repository.stage({ attempts: current.attempts.map((item, i) => i === index ? AttemptDataSchema.parse(attempt) : item) });
    await this.repository.flush();
  }

  private async recordUnpersistedDesignRunFailure(
    source: NonNullable<ReturnType<BrowserAttemptRepository["read"]>>,
    runId: string,
    phase: "initial" | "final",
    sessionId: string,
    configuration: ReviewConfiguration,
    credentialMode: CredentialMode,
    finalAnswers: ClarificationAnswer[] | undefined,
    error: EvaluationError,
  ): Promise<void> {
    const current = this.repository.getState().data;
    const index = current.attempts.findIndex(({ id }) => id === source.id);
    if (index < 0) return;
    const attempt = clone(current.attempts[index]!);
    if (!attempt.snapshot) return;
    attempt.reviewSession = attempt.reviewSession
      ? { ...attempt.reviewSession, ...(finalAnswers ? { frozenAnswers: clone(finalAnswers) } : {}) }
      : { id: sessionId, configuration, credentialMode };
    attempt.design = { status: "failed", runId, error };
    attempt.runs.push({ id: runId, snapshotId: attempt.snapshot.id, phase, sessionId, credentialMode, configuration, startedAt: this.clock.now(), endedAt: this.clock.now(), outcome: "failed", error });
    this.repository.stage({ attempts: current.attempts.map((item, i) => i === index ? AttemptDataSchema.parse(attempt) : item) });
    await this.repository.flush();
  }
}
