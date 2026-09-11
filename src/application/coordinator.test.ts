import { describe, expect, it, vi } from "vitest";

import type { ApiSuccess, DesignReviewRequest, McqResult, McqScoreRequest, ReviewOutcome } from "../domain/types";
import { BrowserAttemptRepository, type BrowserStorage } from "../persistence/repository";
import { DefaultEvaluationCoordinator, type EvaluationTransport } from "./coordinator";
import { IDS, NOW, draft, mcqResult, publicConfig, report } from "./test-fixtures";

class MemoryStorage implements BrowserStorage {
  values = new Map<string, string>();
  failSet = false;
  setCount = 0;
  failOnSet: number | null = null;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.setCount++; if (this.failSet || this.failOnSet === this.setCount) throw new Error("quota"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function sequenceIds() {
  let value = 100;
  return { next: () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}` };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function setup(mode: "mcq_only" | "comprehensive", transport: EvaluationTransport, storage = new MemoryStorage()) {
  const ids = sequenceIds();
  const repo = new BrowserAttemptRepository({ storage, writerId: ids.next(), clock: { now: () => NOW }, debounceMs: 1 });
  await repo.hydrateOwned();
  repo.stage({ attempts: [draft(mode)] });
  await repo.flush();
  const coordinator = new DefaultEvaluationCoordinator({
    repository: repo,
    transport,
    clock: { now: () => NOW },
    ids,
    getConfig: () => publicConfig,
    getCredential: () => ({ mode: "platform" }),
    scoringTimeoutMs: 10_000,
    reviewTimeoutMs: 70_000,
  });
  return { repo, coordinator, storage };
}

function success<T>(request: { attemptId: string; snapshotId: string; runId: string }, data: T): ApiSuccess<T> {
  return { requestId: "00000000-0000-4000-8000-000000000090", attemptId: request.attemptId, snapshotId: request.snapshotId, runId: request.runId, data };
}

describe("DefaultEvaluationCoordinator", () => {
  it("keeps both component results when design finishes before MCQ", async () => {
    const score = deferred<ApiSuccess<McqResult>>();
    const review = deferred<ApiSuccess<ReviewOutcome>>();
    let scoreRequest!: McqScoreRequest;
    let reviewRequest!: DesignReviewRequest;
    const transport: EvaluationTransport = {
      score: (request) => { scoreRequest = request; return score.promise; },
      review: (request) => { reviewRequest = request; return review.promise; },
    };
    const { repo, coordinator } = await setup("comprehensive", transport);
    const submitting = coordinator.submit(IDS.attempt, { incompleteSections: ["relationships"], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    await new Promise((resolve) => setTimeout(resolve, 0));

    review.resolve(success(reviewRequest, { kind: "report", report: report() }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    score.resolve(success(scoreRequest, mcqResult()));
    await submitting;

    expect(repo.read(IDS.attempt)).toMatchObject({ mcq: { status: "succeeded" }, design: { status: "succeeded" } });
  });

  it("keeps both component results when MCQ finishes before design", async () => {
    const score = deferred<ApiSuccess<McqResult>>();
    const review = deferred<ApiSuccess<ReviewOutcome>>();
    let scoreRequest!: McqScoreRequest;
    let reviewRequest!: DesignReviewRequest;
    const transport: EvaluationTransport = {
      score: (request) => { scoreRequest = request; return score.promise; },
      review: (request) => { reviewRequest = request; return review.promise; },
    };
    const { repo, coordinator } = await setup("comprehensive", transport);
    const submitting = coordinator.submit(IDS.attempt, { incompleteSections: ["relationships"], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    await new Promise((resolve) => setTimeout(resolve, 0));

    score.resolve(success(scoreRequest, mcqResult()));
    await new Promise((resolve) => setTimeout(resolve, 0));
    review.resolve(success(reviewRequest, { kind: "report", report: report() }));
    await submitting;

    expect(repo.read(IDS.attempt)).toMatchObject({ mcq: { status: "succeeded" }, design: { status: "succeeded" } });
  });

  it("dispatches zero requests when the submitted snapshot cannot be saved", async () => {
    let calls = 0;
    const transport: EvaluationTransport = {
      score: async () => { calls++; throw new Error("unexpected"); },
      review: async () => { calls++; throw new Error("unexpected"); },
    };
    const storage = new MemoryStorage();
    const { repo, coordinator } = await setup("mcq_only", transport, storage);
    storage.failSet = true;

    await coordinator.submit(IDS.attempt, { incompleteSections: [], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });

    expect(calls).toBe(0);
    expect(repo.read(IDS.attempt)?.status).toBe("draft");
  });

  it("retains a provider result in memory when result saving fails and retrySave makes no request", async () => {
    let calls = 0;
    const storage = new MemoryStorage();
    const transport: EvaluationTransport = {
      score: async (request) => { calls++; storage.failSet = true; return success(request, mcqResult()); },
      review: async () => { throw new Error("unexpected"); },
    };
    const { repo, coordinator } = await setup("mcq_only", transport, storage);

    await coordinator.submit(IDS.attempt, { incompleteSections: [], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    expect(repo.read(IDS.attempt)?.mcq.status).toBe("succeeded");
    storage.failSet = false;
    await coordinator.retrySave();

    expect(calls).toBe(1);
    expect(repo.getState().saveStatus).toBe("saved");
  });

  it("persists a platform preflight failure and sends no design request while MCQ still completes", async () => {
    let reviews = 0;
    const transport: EvaluationTransport = {
      score: async (request) => success(request, mcqResult()),
      review: async () => { reviews++; throw new Error("unexpected"); },
    };
    const { repo, coordinator } = await setup("comprehensive", transport);
    publicConfig.platformAvailable = false;
    try {
      await coordinator.submit(IDS.attempt, { incompleteSections: ["relationships"], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    } finally { publicConfig.platformAvailable = true; }

    expect(reviews).toBe(0);
    expect(repo.read(IDS.attempt)).toMatchObject({ mcq: { status: "succeeded" }, design: { status: "failed", error: { code: "PLATFORM_UNAVAILABLE" } } });
  });

  it("sends zero requests when a run record save fails and permits local-save then explicit retry", async () => {
    let calls = 0;
    const transport: EvaluationTransport = {
      score: async (request) => { calls++; return success(request, mcqResult()); },
      review: async () => { throw new Error("unexpected"); },
    };
    const storage = new MemoryStorage();
    const { repo, coordinator } = await setup("mcq_only", transport, storage);
    storage.failOnSet = storage.setCount + 2; // submitted snapshot succeeds; run record fails

    await coordinator.submit(IDS.attempt, { incompleteSections: [], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    expect(calls).toBe(0);
    expect(repo.read(IDS.attempt)?.mcq).toMatchObject({ status: "failed", error: { code: "STORAGE_UNAVAILABLE" } });
    storage.failOnSet = null;
    await coordinator.retrySave();
    await coordinator.retry(IDS.attempt, "mcq");

    expect(calls).toBe(1);
    expect(repo.read(IDS.attempt)?.mcq.status).toBe("succeeded");
  });

  it("saves a frozen submission without dispatch and evaluates it only on explicit action", async () => {
    let calls = 0;
    const { repo, coordinator } = await setup("mcq_only", {
      score: async (request) => { calls++; return success(request, mcqResult()); },
      review: async () => { throw new Error("unexpected"); },
    });
    expect((await coordinator.saveSubmission(IDS.attempt, { incompleteSections: [], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) })).ok).toBe(true);
    expect(repo.read(IDS.attempt)?.status).toBe("submitted");
    expect(calls).toBe(0);
    await Promise.all([coordinator.evaluate(IDS.attempt), coordinator.evaluate(IDS.attempt)]);
    expect(calls).toBe(1);
    expect(repo.read(IDS.attempt)?.mcq.status).toBe("succeeded");
  });

  it("evaluates selected pending components independently", async () => {
    const score = deferred<ApiSuccess<McqResult>>();
    const review = deferred<ApiSuccess<ReviewOutcome>>();
    let scoreRequest!: McqScoreRequest;
    let reviewRequest!: DesignReviewRequest;
    let scoreCalls = 0;
    let reviewCalls = 0;
    const { repo, coordinator } = await setup("comprehensive", {
      score: (request) => { scoreCalls++; scoreRequest = request; return score.promise; },
      review: (request) => { reviewCalls++; reviewRequest = request; return review.promise; },
    });
    expect((await coordinator.saveSubmission(IDS.attempt, {
      incompleteSections: ["relationships"],
      unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`),
    })).ok).toBe(true);

    const scoring = coordinator.evaluate(IDS.attempt, ["mcq"]);
    await vi.waitFor(() => expect(scoreRequest).toBeDefined());
    expect(scoreCalls).toBe(1);
    expect(reviewCalls).toBe(0);
    expect(repo.read(IDS.attempt)).toMatchObject({ mcq: { status: "running" }, design: { status: "pending" } });
    score.resolve(success(scoreRequest, mcqResult()));
    await scoring;

    const reviewing = coordinator.evaluate(IDS.attempt, ["design"]);
    await vi.waitFor(() => expect(reviewRequest).toBeDefined());
    expect(scoreCalls).toBe(1);
    expect(reviewCalls).toBe(1);
    expect(repo.read(IDS.attempt)).toMatchObject({ mcq: { status: "succeeded" }, design: { status: "running" } });
    review.resolve(success(reviewRequest, { kind: "report", report: report() }));
    await reviewing;

    expect(repo.read(IDS.attempt)).toMatchObject({ mcq: { status: "succeeded" }, design: { status: "succeeded" } });
  });

  it("import invalidates a submission even while its initial flush is pending", async () => {
    let calls = 0;
    const { repo, coordinator } = await setup("mcq_only", {
      score: async (request) => { calls++; return success(request, mcqResult()); },
      review: async () => { throw new Error("unexpected"); },
    });
    const saving = coordinator.submit(IDS.attempt, { incompleteSections: [], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    await repo.replace({ attempts: [draft("mcq_only")] });
    await saving;
    expect(calls).toBe(0);
    expect(repo.read(IDS.attempt)?.status).toBe("draft");
  });

  it("ignores late results after import even when the same attempt ID is restored", async () => {
    const pending = deferred<ApiSuccess<McqResult>>();
    let request!: McqScoreRequest;
    const { repo, coordinator } = await setup("mcq_only", {
      score: (value) => { request = value; return pending.promise; },
      review: async () => { throw new Error("unexpected"); },
    });
    const submitting = coordinator.submit(IDS.attempt, { incompleteSections: [], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    await vi.waitFor(() => expect(request).toBeDefined());
    await repo.replace({ attempts: [draft("mcq_only")] });
    pending.resolve(success(request, mcqResult()));
    await submitting;
    expect(repo.read(IDS.attempt)).toMatchObject({ status: "draft", mcq: { status: "pending" } });
  });

  it("rejects correlated reports containing invalid evidence and preserves successful MCQ scoring", async () => {
    const invalid = report();
    invalid.assessment.criteria[0]!.evidence[0]!.quote = "fabricated quote";
    const { repo, coordinator } = await setup("comprehensive", {
      score: async (request) => success(request, mcqResult()),
      review: async (request) => success(request, { kind: "report", report: invalid }),
    });
    await coordinator.submit(IDS.attempt, { incompleteSections: ["relationships"], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    expect(repo.read(IDS.attempt)).toMatchObject({ mcq: { status: "succeeded" }, design: { status: "failed", error: { code: "INVALID_RESPONSE" } } });
  });

  it("updates a retry preflight failure when credential mode changes", async () => {
    const { repo, coordinator } = await setup("comprehensive", {
      score: async (request) => success(request, mcqResult()),
      review: async () => { throw { code: "RATE_LIMITED", message: "Wait.", retryable: true }; },
    });
    await coordinator.submit(IDS.attempt, { incompleteSections: ["relationships"], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    publicConfig.platformAvailable = false;
    try { await coordinator.retry(IDS.attempt, "design"); }
    finally { publicConfig.platformAvailable = true; }
    expect(repo.read(IDS.attempt)?.design).toMatchObject({ status: "failed", error: { code: "PLATFORM_UNAVAILABLE" } });
  });

  it("enforces the scoring deadline even when a transport ignores abort", async () => {
    vi.useFakeTimers();
    try {
      const { repo, coordinator } = await setup("mcq_only", {
        score: () => new Promise(() => {}), review: async () => { throw new Error("unexpected"); },
      });
      const submitting = coordinator.submit(IDS.attempt, { incompleteSections: [], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
      await vi.advanceTimersByTimeAsync(10_100);
      expect(repo.read(IDS.attempt)?.mcq).toMatchObject({ status: "failed", error: { code: "REQUEST_INTERRUPTED" } });
      await submitting;
    } finally { vi.useRealTimers(); }
  });

  it.each(["answered", "skipped"] as const)("freezes %s clarification once and final review cannot request a second round", async (status) => {
    let calls = 0;
    const questionId = "00000000-0000-4000-8000-000000000091";
    const { repo, coordinator } = await setup("comprehensive", {
      score: async (request) => success(request, mcqResult()),
      review: async (request) => {
        calls++;
        return success(request, { kind: "clarification", clarification: {
          id: "00000000-0000-4000-8000-000000000092", sessionId: request.input.sessionId, snapshotId: request.snapshotId,
          configuration: request.input.configuration,
          questions: [{ id: questionId, text: "Who validates moves?", reference: { section: "classes", objectId: IDS.method, field: "contract" } }],
        } });
      },
    });
    await coordinator.submit(IDS.attempt, { incompleteSections: ["relationships"], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    const answers = status === "answered" ? [{ questionId, status, answer: "Game validates moves." }] : [{ questionId, status }];
    await Promise.all([coordinator.completeClarification(IDS.attempt, answers), coordinator.completeClarification(IDS.attempt, answers)]);
    expect(calls).toBe(2);
    expect(repo.read(IDS.attempt)?.reviewSession?.frozenAnswers).toEqual(answers);
    expect(repo.read(IDS.attempt)?.design).toMatchObject({ status: "failed", error: { code: "INVALID_RESPONSE" } });
  });


  it("guards duplicate restarts and starts one replacement review session", async () => {
    let calls = 0;
    const { repo, coordinator } = await setup("comprehensive", {
      score: async (request) => success(request, mcqResult()),
      review: async () => { calls++; throw { code: "RATE_LIMITED", message: "Wait.", retryable: true }; },
    });
    await coordinator.submit(IDS.attempt, { incompleteSections: ["relationships"], unansweredQuestionIds: Array.from({ length: 10 }, (_, i) => `variant:${i}`) });
    const firstSession = repo.read(IDS.attempt)!.reviewSession!.id;
    await Promise.all([coordinator.restartDesignReview(IDS.attempt), coordinator.restartDesignReview(IDS.attempt)]);
    expect(calls).toBe(2);
    expect(repo.read(IDS.attempt)!.reviewSession!.id).not.toBe(firstSession);
    expect(repo.getState().saveStatus).toBe("saved");
  });

});
