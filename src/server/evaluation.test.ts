import { randomUUID } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiSuccessSchema, McqResultSchema, PublicConfigSchema, findIncompleteSections, ReviewOutcomeSchema, DesignReviewRequestSchema } from "../domain/schemas";
import type { ReviewInput, StructuredDesign } from "../domain/types";
import { configurationFor } from "./configuration";
import { CredentialResolver } from "./credentials";
import { GroqDesignEvaluator, trustedPayload, type Completion } from "./design-evaluator";
import { getProblemPackage } from "./content";
import { AdmissionControl, failure, readJson } from "./http";
import { GET } from "../app/api/config/route";
import { POST as score } from "../app/api/mcq/score/route";
import { POST as review } from "../app/api/design/review/route";

const { groqCall, groqOptions } = vi.hoisted(() => ({ groqCall: vi.fn(), groqOptions: vi.fn() }));
vi.mock("groq-sdk", () => ({ default: class { constructor(options: unknown) { groqOptions(options); } chat = { completions: { create: groqCall } }; } }));

const pkg = getProblemPackage("tic-tac-toe", "2.0.0")!;
const design: StructuredDesign = { assumptions: "Local play with atomic rejection.", requirementHandling: [], classes: [], relationships: [], normalScenario: { title: "", steps: [] }, failureScenario: { title: "", steps: [] }, tradeoff: { chosen: "", alternative: "", justification: "" } };
const input = (): ReviewInput => ({ problemId: pkg.problemId, contentVersion: pkg.contentVersion, snapshotId: randomUUID(), sessionId: randomUUID(), phase: "initial", configuration: configurationFor(pkg), design: structuredClone(design), acknowledgedIncompleteSections: findIncompleteSections(design) });
const ref = { section: "assumptions", objectId: null, field: "text", quote: "atomic rejection" };
function wire() { return { kind: "report", questions: [], assessment: { criteria: ["requirements", "responsibilities", "relationships", "behavior", "tradeoffs"].map((criterionId) => ({ criterionId, rating: 2, rationale: "Some behavior is demonstrated.", evidence: [ref] })), strengths: [{ text: "Atomic rejection is explicit.", evidence: [ref] }], findings: [{ id: "f1", criterionId: "behavior", requirementIds: ["ttt.req.legal"], kind: "not_demonstrated", evidence: [ref], judgment: "No method contract.", consequence: "Rejection behavior is ambiguous.", suggestion: "Specify preconditions and unchanged state." }], priorityFindingIds: ["f1"] } }; }
const completion = (body: unknown, finish_reason = "stop"): Completion => ({ choices: [{ finish_reason, message: { content: JSON.stringify(body) } }] });
function adapter(result: Completion = completion(wire())) {
  const resolver = new CredentialResolver({ GROQ_API_KEY: "test-key" });
  const call = vi.fn(async () => result);
  return { call, evaluator: new GroqDesignEvaluator(pkg, resolver.select("platform", "initial"), call, resolver) };
}
const request = (body: unknown, headers: Record<string, string> = {}) => new Request("http://localhost/api/design/review", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const metadata = () => ({ attemptId: randomUUID(), snapshotId: randomUUID(), runId: randomUUID() });
afterEach(() => { vi.unstubAllEnvs(); groqCall.mockReset(); groqOptions.mockReset(); });

describe("strict provider assessment", () => {
  it("makes one call, calculates marks, generates authoritative metadata and validates the envelope", async () => {
    const { evaluator, call } = adapter();
    const result = await evaluator.evaluate(input(), new AbortController().signal);
    expect(ReviewOutcomeSchema.safeParse(result).success).toBe(true);
    expect(result.kind === "report" && result.report.marks).toBe(25);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("sends only trusted requirements/exclusions/rubric and frozen design with strict output", () => {
    const payload = trustedPayload(pkg, input());
    expect(payload).toMatchObject({ model: "openai/gpt-oss-120b", reasoning_effort: "medium", max_completion_tokens: 8192, stream: false, response_format: { type: "json_schema", json_schema: { strict: true } } });
    const content = JSON.parse(payload.messages[1].content as string);
    expect(Object.keys(content).sort()).toEqual(["design", "exclusions", "phase", "requirements", "rubric"]);
    expect(JSON.stringify(payload)).not.toContain(pkg.referenceDesign);
  });
  for (const [name, mutate] of [
    ["invented quote", (w: ReturnType<typeof wire>) => { w.assessment.criteria[0].evidence = [{ ...ref, quote: "not submitted" }]; }],
    ["unknown requirement", (w: ReturnType<typeof wire>) => { w.assessment.findings[0].requirementIds = ["unknown"]; }],
    ["missing criterion", (w: ReturnType<typeof wire>) => { w.assessment.criteria.pop(); }],
    ["fractional rating", (w: ReturnType<typeof wire>) => { w.assessment.criteria[0].rating = 2.5; }],
    ["duplicate criterion", (w: ReturnType<typeof wire>) => { w.assessment.criteria[0].criterionId = "behavior"; }],
    ["unknown priority", (w: ReturnType<typeof wire>) => { w.assessment.priorityFindingIds = ["missing"]; }],
    ["section-only strength", (w: ReturnType<typeof wire>) => { w.assessment.strengths[0].evidence = [{ section: "classes", field: "$section", objectId: null, quote: null as unknown as string }]; }],
    ["unquoted contradiction", (w: ReturnType<typeof wire>) => { w.assessment.findings[0].kind = "contradiction"; w.assessment.findings[0].evidence = [{ ...ref, quote: null as unknown as string }]; }],
  ] as const) it(`rejects ${name} without publishing marks`, async () => {
    const body = wire(); mutate(body);
    const { evaluator, call } = adapter(completion(body));
    await expect(evaluator.evaluate(input(), new AbortController().signal)).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it.each(["length", "content_filter", "tool_calls"])("rejects unfinished output %s", async (reason) => {
    await expect(adapter(completion(wire(), reason)).evaluator.evaluate(input(), new AbortController().signal)).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });
  it("rejects refusals", async () => {
    const output = completion(wire()); output.choices[0].message.refusal = "Refused";
    await expect(adapter(output).evaluator.evaluate(input(), new AbortController().signal)).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
  });
  it("supports one targeted clarification round and final answered/skipped review", async () => {
    const first = input();
    const body = { kind: "clarification", assessment: null, questions: [{ text: "Which state is unchanged on rejection?", reference: ref }] };
    const clarification = await adapter(completion(body)).evaluator.evaluate(first, new AbortController().signal);
    expect(clarification.kind).toBe("clarification");
    if (clarification.kind !== "clarification") return;
    for (const status of ["answered", "skipped"] as const) {
      const final = { ...first, phase: "final" as const, clarification: clarification.clarification, answers: [{ questionId: clarification.clarification.questions[0].id, status, ...(status === "answered" ? { answer: "All game state." } : {}) }] } as ReviewInput;
      expect((await adapter().evaluator.evaluate(final, new AbortController().signal)).kind).toBe("report");
      await expect(adapter(completion(body)).evaluator.evaluate(final, new AbortController().signal)).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
    }
  });
  it("rejects three clarification questions and nonexistent evidence", async () => {
    for (const questions of [Array.from({ length: 3 }, () => ({ text: "Question?", reference: ref })), [{ text: "Question?", reference: { ...ref, field: "unknown" } }]]) {
      await expect(adapter(completion({ kind: "clarification", assessment: null, questions })).evaluator.evaluate(input(), new AbortController().signal)).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
    }
  });
  it("sanitizes provider failures and never automatically calls a fallback", async () => {
    const resolver = new CredentialResolver({ GROQ_API_KEY: "primary-secret", GROQ_FALLBACK_API_KEY: "fallback-secret" });
    const call = vi.fn(async () => { throw { status: 401, message: "primary-secret" }; });
    const evaluator = new GroqDesignEvaluator(pkg, resolver.select("platform", "initial"), call, resolver);
    await expect(evaluator.evaluate(input(), new AbortController().signal)).rejects.toMatchObject({ code: "CREDENTIAL_REJECTED" });
    expect(call).toHaveBeenCalledTimes(1);
    expect(resolver.select("platform", "initial").key).toBe("fallback-secret");
  });
  it("retries transient json_validate_failed generations then maps the exhaustion to a retryable error", async () => {
    const resolver = new CredentialResolver({ GROQ_API_KEY: "primary-secret" });
    const reject = async () => { throw { status: 400, error: { code: "json_validate_failed" }, message: "primary-secret" }; };
    const evaluate = async () => new GroqDesignEvaluator(pkg, resolver.select("platform", "initial"), reject, resolver).evaluate(input(), new AbortController().signal);
    await expect(evaluate()).rejects.toMatchObject({ code: "PROVIDER_GENERATION_FAILED", retryable: true });
    expect(() => resolver.select("platform", "initial")).not.toThrow();
  });
  it("succeeds after a transient json_validate_failed generation", async () => {
    const resolver = new CredentialResolver({ GROQ_API_KEY: "primary-secret" });
    const call = vi.fn().mockRejectedValueOnce({ status: 400, error: { code: "json_validate_failed" }, message: "secret" }).mockResolvedValueOnce(completion(wire()));
    const evaluator = new GroqDesignEvaluator(pkg, resolver.select("platform", "initial"), call, resolver, undefined, 3);
    await expect(evaluator.evaluate(input(), new AbortController().signal)).resolves.toMatchObject({ kind: "report" });
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("does not auto-retry non-generation provider failures", async () => {
    const resolver = new CredentialResolver({ GROQ_API_KEY: "primary-secret" });
    const call = vi.fn(async () => { throw { status: 422, message: "primary-secret" }; });
    await expect(new GroqDesignEvaluator(pkg, resolver.select("platform", "initial"), call, resolver).evaluate(input(), new AbortController().signal)).rejects.toMatchObject({ code: "PROVIDER_REQUEST_REJECTED" });
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe("server-only credential roles and health", () => {
  it("selects phase role then shared then fallback and explicit calibration role", () => {
    const resolver = new CredentialResolver({ GROQ_REVIEW_API_KEY: "initial", GROQ_FINAL_REVIEW_API_KEY: "final", GROQ_API_KEY: "shared", GROQ_FALLBACK_API_KEY: "fallback", GROQ_CALIBRATION_API_KEY: "calibration" });
    expect(resolver.select("platform", "initial").key).toBe("initial");
    expect(resolver.select("platform", "final").key).toBe("final");
    expect(resolver.select("platform", "calibration").key).toBe("calibration");
    resolver.failed(resolver.select("platform", "initial"), { status: 401 });
    expect(resolver.select("platform", "initial").key).toBe("shared");
    resolver.failed(resolver.select("platform", "initial"), { status: 503 });
    expect(resolver.select("platform", "initial").key).toBe("fallback");
  });
  it("keeps learner and platform credentials separate", () => {
    const resolver = new CredentialResolver({ GROQ_API_KEY: "platform" });
    expect(() => resolver.select("user", "initial")).toThrow(/learner provider key/);
    expect(() => resolver.select("platform", "initial", "user")).toThrow(/does not accept/);
    const user = resolver.select("user", "initial", "user");
    resolver.failed(user, { status: 401 });
    expect(() => resolver.select("user", "initial", "user")).toThrow(/Replace the key/);
    expect(resolver.select("platform", "initial").key).toBe("platform");
  });
  it.each(["rate_limit_exceeded", "insufficient_quota"])("honors retry-after and does not cycle organization keys on %s", (code) => {
    let now = 1_000;
    const resolver = new CredentialResolver({ GROQ_API_KEY: "shared", GROQ_FALLBACK_API_KEY: "fallback" }, () => now);
    const error = resolver.failed(resolver.select("platform", "initial"), { status: 429, error: { code }, headers: new Headers({ "retry-after": "120" }) });
    expect(error.retryAfterSeconds).toBe(120);
    expect(() => resolver.select("platform", "final")).toThrow(/quota/);
    now += 120_001;
    expect(resolver.select("platform", "initial").key).toBe("shared");
  });
  it("reports missing credentials and timeout safely", () => {
    expect(() => new CredentialResolver({}).select("platform", "initial")).toThrow(/unavailable/);
    const resolver = new CredentialResolver({ GROQ_API_KEY: "secret" });
    expect(resolver.failed(resolver.select("platform", "initial"), { name: "APIConnectionTimeoutError", message: "secret" })).toMatchObject({ code: "PROVIDER_TIMEOUT", retryable: true });
  });
});

describe("public API boundaries", () => {
  it("publishes a valid correlated review through the real API service and verifies SDK options", async () => {
    vi.stubEnv("GROQ_API_KEY", "route-test-key");
    groqCall.mockResolvedValue(completion(wire()));
    const body = input(); const meta = { ...metadata(), snapshotId: body.snapshotId };
    const response = await review(request({ ...meta, credentialMode: "platform", input: body }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(ApiSuccessSchema(ReviewOutcomeSchema).safeParse(result).success).toBe(true);
    expect(result).toMatchObject({ ...meta, data: { kind: "report", report: { marks: 25 } } });
    expect(groqCall).toHaveBeenCalledTimes(1);
    expect(groqOptions).toHaveBeenCalledWith({ apiKey: "route-test-key", timeout: 60_000, maxRetries: 0 });
    expect(JSON.stringify(result)).not.toContain("route-test-key");
  });
  it("returns validated clarification and final answered/skipped API results", async () => {
    vi.stubEnv("GROQ_API_KEY", "route-test-key");
    groqCall.mockResolvedValue(completion({ kind: "clarification", assessment: null, questions: [{ text: "What state remains unchanged?", reference: ref }] }));
    const body = input();
    const first = await review(request({ ...metadata(), snapshotId: body.snapshotId, credentialMode: "platform", input: body }));
    const clarification = (await first.json()).data.clarification;
    for (const status of ["answered", "skipped"] as const) {
      groqCall.mockResolvedValue(completion(wire()));
      const final = { ...body, phase: "final", clarification, answers: [{ questionId: clarification.questions[0].id, status, ...(status === "answered" ? { answer: "All state remains unchanged." } : {}) }] };
      const response = await review(request({ ...metadata(), snapshotId: body.snapshotId, credentialMode: "platform", input: final }));
      expect(response.status).toBe(200);
      expect((await response.json()).data.kind).toBe("report");
    }
    expect(groqCall).toHaveBeenCalledTimes(3);
  });
  it("provider errors remain sanitized and retries are explicit at the API boundary", async () => {
    vi.stubEnv("GROQ_API_KEY", "route-transient-secret");
    groqCall.mockRejectedValue({ status: 503, message: "route-transient-secret" });
    const body = input();
    const response = await review(request({ ...metadata(), snapshotId: body.snapshotId, credentialMode: "platform", input: body }));
    const result = await response.json();
    expect(response.status).toBe(503);
    expect(result).toMatchObject({ error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(JSON.stringify(result)).not.toContain("route-transient-secret");
    expect(groqCall).toHaveBeenCalledTimes(1);
  });
  it("config is strict, advertises both pinned rubrics and leaks no keys or inventories", async () => {
    vi.stubEnv("GROQ_API_KEY", "secret-platform");
    const response = await GET(); const body = await response.json();
    expect(PublicConfigSchema.safeParse(body).success).toBe(true);
    expect(body.content).toHaveLength(6);
    expect(body.content).toContainEqual({ problemId: "tic-tac-toe", contentVersion: "2.0.0", rubricVersion: "ttt-rubric-v2" });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it.each(["1.0.0", "2.0.0"])("scores pinned %s into the exact correlated envelope", async (version) => {
    const meta = metadata();
    const response = await score(request({ ...meta, problemId: pkg.problemId, contentVersion: version, language: "java", answers: {} }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(ApiSuccessSchema(McqResultSchema).safeParse(body).success).toBe(true);
    expect(body).toMatchObject(meta);
    expect(Object.keys(body).sort()).toEqual(["attemptId", "data", "requestId", "runId", "snapshotId"]);
  });
  it("rejects cross-origin, wrong media and oversized streamed bodies", async () => {
    await expect(readJson(request({}, { Origin: "https://evil.test" }))).rejects.toMatchObject({ code: "ORIGIN_REJECTED" });
    await expect(readJson(request({}, { "Content-Type": "text/plain" }))).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    await expect(readJson(request({ data: "x".repeat(262145) }))).rejects.toMatchObject({ code: "BODY_TOO_LARGE" });
  });
  it("resolves configuration before admission or selecting keys", async () => {
    const body = input(); body.configuration.rubricVersion = "invented";
    const response = await review(request({ ...metadata(), snapshotId: body.snapshotId, credentialMode: "platform", input: body }));
    expect(await response.json()).toMatchObject({ error: { code: "CONFIGURATION_UNAVAILABLE" } });
  });
  it("accepts shape-level partial mappings acknowledgment but verifies trusted missing requirements", async () => {
    const body = input(); body.design.requirementHandling = [{ requirementId: "ttt.req.board", response: "3×3 board" }];
    body.acknowledgedIncompleteSections = [...findIncompleteSections(body.design), "requirementHandling"];
    const envelope = { ...metadata(), snapshotId: body.snapshotId, credentialMode: "user", input: body };
    expect(DesignReviewRequestSchema.safeParse(envelope).success).toBe(true);
    const response = await review(request(envelope));
    expect(await response.json()).toMatchObject({ error: { code: "USER_KEY_REQUIRED" } });
  });
  it("rejects unknown requirements and unnecessary omission acknowledgments before provider dispatch", async () => {
    const body = input(); body.design.requirementHandling = pkg.publicByLanguage.java.requirements.map(({ id }) => ({ requirementId: id, response: "Covered" }));
    const response = await review(request({ ...metadata(), snapshotId: body.snapshotId, credentialMode: "platform", input: body }));
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });
  it("guards duplicate and concurrent requests", () => {
    const admission = new AdmissionControl(1, 1_000, () => 0);
    const release = admission.admit("a");
    expect(() => admission.admit("a")).toThrow(/already running/);
    expect(() => admission.admit("b")).toThrow(/busy/);
    release();
    expect(() => admission.admit("b")).not.toThrow();
  });
  it("uses incoming Host for same-origin when Next reconstructs the bind hostname", async () => {
    expect(await readJson(request({ okay: true }, { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" }))).toEqual({ okay: true });
    await expect(readJson(request({}, { Host: "127.0.0.1:3000", Origin: "http://localhost:3000" }))).rejects.toMatchObject({ code: "ORIGIN_REJECTED" });
  });
  it("bounds unique-ID traffic with a process-wide window and resumes after reset", () => {
    let now = 0;
    const admission = new AdmissionControl(1, 1, () => now, 2, 60_000);
    admission.admit("first")(); admission.admit("second")();
    expect(() => admission.admit("third")).toThrow(/budget/);
    now = 60_000;
    expect(() => admission.admit("third")).not.toThrow();
  });
  it("never publishes raw internal or provider error details", async () => {
    expect(JSON.stringify(await failure(new Error("secret-key and stack trace")).json())).not.toContain("secret-key");
  });
});
